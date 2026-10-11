/**
 * 牛津书虫音频转码：把素材 mp3 转成 AAC 单声道 64 kbps，剥掉内嵌封面图。
 *
 * 素材是 128 kbps 立体声、还内嵌一张 169×169 的 jpg（NCE 那边被这张图坑过，
 * 有些解码器会因此报错），所以统一转码。
 *
 * 产出：static/bookworm/<书号>/<章号>.m4a
 *   —— 放 static/ 下是为了本地验证时同源直出；正式托管位置另定。
 *
 * 用法：
 *   node tools/bw-audio.mjs --book 1A_01      # 只转一本
 *   node tools/bw-audio.mjs                   # 转所有带音频的书
 */

import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOK_DIR = path.join(ROOT, 'src', 'lib', 'data', 'bookworm', 'books');
const OUT_DIR = path.join(ROOT, 'static', 'bookworm');

const args = process.argv.slice(2);
const onlyBook = args.includes('--book') ? args[args.indexOf('--book') + 1] : null;

async function transcode(source, target) {
	await run(ffmpegPath, [
		'-y',
		'-loglevel',
		'error',
		'-i',
		source,
		'-vn',
		'-map',
		'0:a:0',
		'-ac',
		'1',
		'-c:a',
		'aac',
		'-b:a',
		'64k',
		target
	]);
}

async function main() {
	const files = (await readdir(BOOK_DIR))
		.filter((file) => file.endsWith('.json'))
		.filter((file) => !onlyBook || file === `${onlyBook}.json`)
		.sort();

	if (!files.length) {
		console.log(`没找到书：${onlyBook ?? '(全部)'}`);
		return;
	}

	let done = 0;
	let skipped = 0;
	let bytes = 0;
	const missing = [];

	for (const file of files) {
		const book = JSON.parse(await readFile(path.join(BOOK_DIR, file), 'utf8'));
		const chaptersWithAudio = book.chapters.filter((chapter) => chapter.sourceAudio);
		if (!chaptersWithAudio.length) continue;

		const bookOut = path.join(OUT_DIR, book.id);
		await mkdir(bookOut, { recursive: true });

		for (const chapter of chaptersWithAudio) {
			const target = path.join(bookOut, `${chapter.no}.m4a`);
			if (existsSync(target) && statSync(target).size > 1024) {
				skipped += 1;
				bytes += statSync(target).size;
				continue;
			}
			if (!existsSync(chapter.sourceAudio)) {
				missing.push(`${book.id}/${chapter.no}`);
				continue;
			}
			await transcode(chapter.sourceAudio, target);
			const size = statSync(target).size;
			bytes += size;
			done += 1;
			console.log(`  ${book.id} 第 ${chapter.no} 章  ${(size / 1024).toFixed(0)} KB`);
		}
	}

	console.log(
		`\n转码完成：新转 ${done} 个，跳过已有 ${skipped} 个，合计 ${(bytes / 1048576).toFixed(1)} MB`
	);
	if (missing.length) console.log(`素材缺失：${missing.join(', ')}`);
	console.log(`输出目录：${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
