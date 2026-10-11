/**
 * 把音频批量传到 Cloudflare R2（S3 兼容接口，自带 SigV4 签名，不依赖任何 npm 包）。
 *
 * 需要四个环境变量，都在 Cloudflare 后台能拿到：
 *   R2_ACCOUNT_ID        账号 ID（R2 概览页右侧）
 *   R2_ACCESS_KEY_ID     R2 → Manage API tokens 里创建的令牌
 *   R2_SECRET_ACCESS_KEY 同上
 *   R2_BUCKET            桶名，比如 nce-media
 *
 * 用法：
 *   node tools/r2-upload.mjs                      # 默认传 static/bookworm → 桶内 bookworm/
 *   node tools/r2-upload.mjs --dry                # 只列出要传什么、传多少
 *   node tools/r2-upload.mjs --prune              # 顺带删掉桶里多余的旧文件
 *
 * 已存在且大小一致的对象会跳过，重复跑不会重传。
 */

import { createHash, createHmac } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const prune = args.includes('--prune');
const localDir = path.join(ROOT, args.includes('--dir') ? args[args.indexOf('--dir') + 1] : 'static/bookworm');
const prefix = args.includes('--prefix') ? args[args.indexOf('--prefix') + 1] : 'bookworm';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;

if (!dryRun && (!accountId || !accessKeyId || !secretAccessKey || !bucket)) {
	console.error('缺少环境变量：R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET');
	process.exit(1);
}

const HOST = `${accountId}.r2.cloudflarestorage.com`;
const REGION = 'auto';
const SERVICE = 's3';

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

/** 逐段编码对象键：路径分隔符保留，其余按 RFC3986 编码 */
function encodeKey(key) {
	return key
		.split('/')
		.map((part) =>
			encodeURIComponent(part).replace(
				/[!'()*]/g,
				(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
			)
		)
		.join('/');
}

function signingKey(day) {
	return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), REGION), SERVICE), 'aws4_request');
}

async function request(method, key, body) {
	const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
	const day = amzDate.slice(0, 8);
	const payloadHash = body ? sha256Hex(body) : sha256Hex('');
	const canonicalUri = `/${bucket}/${encodeKey(key)}`;

	const headers = {
		host: HOST,
		'x-amz-content-sha256': payloadHash,
		'x-amz-date': amzDate
	};
	if (body) headers['content-length'] = String(body.length);

	const signedHeaders = Object.keys(headers).sort();
	const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers[name]}\n`).join('');
	const canonicalRequest = [
		method,
		canonicalUri,
		'',
		canonicalHeaders,
		signedHeaders.join(';'),
		payloadHash
	].join('\n');

	const scope = `${day}/${REGION}/${SERVICE}/aws4_request`;
	const stringToSign = [
		'AWS4-HMAC-SHA256',
		amzDate,
		scope,
		sha256Hex(canonicalRequest)
	].join('\n');

	const signature = createHmac('sha256', signingKey(day)).update(stringToSign).digest('hex');

	return fetch(`https://${HOST}${canonicalUri}`, {
		method,
		headers: {
			...headers,
			authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`
		},
		body
	});
}

async function walk(dir, base = dir, out = []) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) await walk(full, base, out);
		else out.push({ full, rel: path.relative(base, full).replace(/\\/g, '/') });
	}
	return out;
}

async function mapLimit(items, limit, worker) {
	let cursor = 0;
	const results = new Array(items.length);
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (cursor < items.length) {
				const index = cursor++;
				results[index] = await worker(items[index], index);
			}
		})
	);
	return results;
}

async function main() {
	let files;
	try {
		files = await walk(localDir);
	} catch (error) {
		console.error(`读不到目录 ${localDir}：${error.message}`);
		process.exit(1);
	}

	console.log(`待上传 ${files.length} 个文件，来源 ${path.relative(ROOT, localDir)}，目标 ${prefix}/`);

	if (dryRun) {
		let bytes = 0;
		for (const file of files) {
			const info = await stat(file.full);
			bytes += info.size;
		}
		console.log(`合计 ${(bytes / 1048576).toFixed(1)} MB（试运行，未上传）`);
		return;
	}

	let uploaded = 0;
	let skipped = 0;
	let sent = 0;
	const failures = [];

	await mapLimit(files, 4, async (file) => {
		const key = `${prefix}/${file.rel}`;
		const info = await stat(file.full);

		const head = await request('HEAD', key);
		if (head.ok && Number(head.headers.get('content-length')) === info.size) {
			skipped += 1;
			return;
		}

		const body = await readFile(file.full);
		const response = await request('PUT', key, body);
		if (!response.ok) {
			failures.push(`${key} → ${response.status} ${(await response.text()).slice(0, 120)}`);
			return;
		}
		uploaded += 1;
		sent += info.size;
		if (uploaded % 10 === 0) {
			console.log(`  已上传 ${uploaded} 个（${(sent / 1048576).toFixed(1)} MB）`);
		}
	});

	console.log(`\n上传完成：新传 ${uploaded} 个（${(sent / 1048576).toFixed(1)} MB），跳过已存在 ${skipped} 个`);
	if (failures.length) {
		console.log(`失败 ${failures.length} 个：`);
		for (const failure of failures.slice(0, 10)) console.log('  ' + failure);
		process.exitCode = 1;
	}
	if (prune) console.log('（--prune 暂未实现，桶里多余的对象请手动清理）');
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
