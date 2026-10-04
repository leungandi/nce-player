/**
 * 词典管线：从 ECDICT 裁出"课文里真正出现的词"，产出 src/lib/data/dict.json。
 *
 * 完整 ECDICT 有 63 MB（340 万词条），不可能塞进页面。
 * 这里先扫一遍课文取出候选词，再流式过滤词典，只保留候选词及其原形。
 *
 * 用法：
 *   node tools/build-dict.mjs
 *
 * 出网需要走本地代理：
 *   $env:HTTPS_PROXY="http://127.0.0.1:6789"; $env:NODE_USE_ENV_PROXY="1"
 */

import { createWriteStream, existsSync, readFileSync, statSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'tools', '.cache');
const LESSON_DIR = path.join(ROOT, 'src', 'lib', 'data', 'lessons');
const OUT_FILE = path.join(ROOT, 'src', 'lib', 'data', 'dict.json');

const ECDICT_CSV = path.join(CACHE_DIR, 'ecdict.csv');
const ECDICT_CSV_URL = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv';
const LEMMA_URL = 'https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt';

/** 释义只保留前两段，单条截断到这个长度，避免词典体积失控。 */
const TRANSLATION_LIMIT = 60;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(url, file) {
	if (existsSync(file) && statSync(file).size > 1000) {
		console.log(`已有缓存: ${path.relative(ROOT, file)}`);
		return;
	}
	console.log(`下载 ${url}`);
	let lastError = 'unknown';
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const stream = createWriteStream(file);
			let received = 0;
			for await (const chunk of response.body) {
				stream.write(chunk);
				received += chunk.length;
				if (received % (10 * 1024 * 1024) < chunk.length) {
					process.stdout.write(`  ${(received / 1048576).toFixed(0)} MB\n`);
				}
			}
			await new Promise((resolve) => stream.end(resolve));
			console.log(`  完成 ${(received / 1048576).toFixed(1)} MB`);
			return;
		} catch (error) {
			lastError = error.message;
			await sleep(800 * attempt);
		}
	}
	throw new Error(`下载失败 ${url}: ${lastError}`);
}

/** 把课文里的英文切成小写单词。 */
function tokenize(text) {
	return (text.toLowerCase().match(/[a-z][a-z''-]*/g) ?? []).map((word) =>
		word.replace(/^'+|'+$/g, '')
	);
}

/** lemma.en.txt：`base/freq -> form1,form2` */
function parseLemmaFile(text) {
	const lemmaOf = new Map();
	const lines = text.split('\n');
	for (const line of lines) {
		if (!line || line.startsWith(';')) continue;
		const [left, right] = line.split('->');
		if (!left || !right) continue;
		const base = left.split('/')[0].trim().toLowerCase();
		if (!base) continue;
		for (const form of right.split(',')) {
			const word = form.trim().toLowerCase();
			if (word && word !== base) lemmaOf.set(word, base);
		}
	}
	return lemmaOf;
}

/** 按 CSV 规则切记录：引号内的换行不算记录结束。 */
function* csvRecords(text) {
	let buffer = '';
	let quoted = false;
	for (const line of text.split('\n')) {
		buffer = buffer ? `${buffer}\n${line}` : line;
		for (const char of line) {
			if (char === '"') quoted = !quoted;
		}
		if (!quoted) {
			yield buffer;
			buffer = '';
		}
	}
	if (buffer) yield buffer;
}

/** 切一行 CSV 的字段，处理双引号包裹与转义。 */
function splitCsvLine(line) {
	const fields = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < line.length; i += 1) {
		const char = line[i];
		if (quoted) {
			if (char === '"') {
				if (line[i + 1] === '"') {
					field += '"';
					i += 1;
				} else {
					quoted = false;
				}
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ',') {
			fields.push(field);
			field = '';
		} else {
			field += char;
		}
	}
	fields.push(field);
	return fields;
}

/** ECDICT 的释义用字面量 `\n` 分段，这里压成一行短释义。 */
function shortenTranslation(raw) {
	if (!raw) return '';
	const parts = raw
		.split('\\n')
		.map((part) => part.trim())
		.filter((part) => part && !part.startsWith('[网络]') && !part.startsWith('['))
		.slice(0, 2);
	const text = parts.join('；');
	return text.length > TRANSLATION_LIMIT ? `${text.slice(0, TRANSLATION_LIMIT)}…` : text;
}

async function main() {
	await download(ECDICT_CSV_URL, ECDICT_CSV);
	const lemmaFile = path.join(CACHE_DIR, 'lemma.en.txt');
	await download(LEMMA_URL, lemmaFile);

	// 1. 课文里出现过哪些词
	const files = (await readdir(LESSON_DIR)).filter((file) => file.endsWith('.json'));
	const seen = new Set();
	for (const file of files) {
		const lesson = JSON.parse(await readFile(path.join(LESSON_DIR, file), 'utf8'));
		for (const line of lesson.lines ?? []) {
			for (const word of tokenize(line.en)) seen.add(word);
		}
	}
	console.log(`课文词汇（去重）: ${seen.size} 个，来自 ${files.length} 课`);

	// 2. 原形映射：候选词 + 它们对应的原形都要收进词典
	const lemmaOf = parseLemmaFile(await readFile(lemmaFile, 'utf8'));
	const wanted = new Set(seen);
	for (const word of seen) {
		const base = lemmaOf.get(word);
		if (base) wanted.add(base);
	}
	console.log(`连同原形共需收录: ${wanted.size} 个词条`);

	// 3. 流式过滤 ECDICT
	const csv = readFileSync(ECDICT_CSV, 'utf8');
	const words = {};
	let scanned = 0;
	for (const record of csvRecords(csv)) {
		scanned += 1;
		if (scanned === 1) continue; // 表头
		const comma = record.indexOf(',');
		if (comma < 0) continue;
		const word = record.slice(0, comma).replace(/^"|"$/g, '').toLowerCase();
		if (!wanted.has(word)) continue;
		const [, phonetic, , translation, , collins, oxford, tag] = splitCsvLine(record);
		words[word] = [
			phonetic ?? '',
			shortenTranslation(translation ?? ''),
			(tag ?? '').split(/\s+/)[0] ?? '',
			Number(oxford) > 0 || Number(collins) > 0 ? 1 : 0
		];
	}

	/**
	 * 4. 原形映射只当兜底用。
	 * ECDICT 的 lemma 表是按词频归并的（was -> wa、they -> he 这种并不可靠），
	 * 所以：本词自己有释义就直接用本词，确实查不到才回退到原形。
	 */
	const lemmas = {};
	for (const word of seen) {
		const direct = words[word];
		if (direct?.[1]) continue;

		const base = lemmaOf.get(word);
		if (base && words[base]?.[1]) {
			lemmas[word] = base;
			delete words[word];
		}
	}

	// 5. 丢掉既没音标也没释义的空壳词条
	for (const word of Object.keys(words)) {
		const entry = words[word];
		if (!entry[0] && !entry[1]) delete words[word];
	}

	await writeFile(
		OUT_FILE,
		`${JSON.stringify({ words, lemmas }, null, '\t')}\n`,
		'utf8'
	);

	const size = statSync(OUT_FILE).size;
	console.log(`\n扫描 ${scanned} 行，收录 ${Object.keys(words).length} 个词条`);
	console.log(`写出 ${path.relative(ROOT, OUT_FILE)}（${(size / 1024).toFixed(0)} KB）`);
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
