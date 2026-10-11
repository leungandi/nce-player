/**
 * 牛津书虫数据管线（只做英文正文）
 *
 * 只读 C:\english 下的原始素材，产物写进本项目，不动素材一个字节。
 *
 * 素材里英文和中文是交替成块的，这里只取英文，中文整块跳过。
 * 章节分隔有四种写法，都要认：
 *   1 Chapter / Chapter 1 / Chapter 1 The Creature in the Shop / 裸数字
 * 故事集这类没有分隔行的，靠「英文块首行像不像标题」来分篇。
 *
 * 产出：
 *   src/lib/data/bookworm/shelf.json          书架
 *   src/lib/data/bookworm/books/<id>.json     一本书：章节 + 英文段落
 *
 * 用法：node tools/bw-extract.mjs
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src', 'lib', 'data', 'bookworm');

const SRC = 'C:/english/牛津书虫系列1-6级 双语pdf+音频';
const TEXT_DIR = path.join(SRC, '牛津书虫文本_分册txt');
const AUDIO_DIRS = [
	path.join(SRC, '牛津书虫第1级上(MP3+文本)'),
	path.join(SRC, '牛津书虫第1级下(MP3+文本)')
];

const cjk = /[\u4e00-\u9fff]/;

/** 第 1 级的英文书名：PDF 文件名里去掉了空格，拆驼峰还原不了，这九本直接写死 */
const KNOWN_TITLES = {
	'1A_01': 'Love or Money',
	'1A_02': 'Mary Queen of Scots',
	'1A_03': 'Under the Moon',
	'1A_04': 'The Witches of Pendle',
	'1A_05': 'The Phantom of the Opera',
	'1A_06': "The Monkey's Paw",
	'1A_07': 'The Elephant Man',
	'1A_08': 'The Coldest Place on Earth',
	'1B_10': 'The Adventures of Tom Sawyer'
};

const FULLWIDTH_TO_ASCII = {
	'，': ',',
	'．': '.',
	'！': '!',
	'？': '?',
	'：': ':',
	'；': ';'
};

function decode(buffer) {
	const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
	if (!utf8.includes('\uFFFD')) return utf8;
	return new TextDecoder('gbk').decode(buffer);
}

function squeeze(text) {
	return text.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 素材的英文用的是中文标点（`Cambridge，about`），统一换成半角并补空格 */
function normalizeEnglish(text) {
	let out = squeeze(text)
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201c\u201d]/g, '"');

	out = out.replace(/[\uFF0C\uFF0E\uFF01\uFF1F\uFF1A\uFF1B]/g, (mark) => {
		return `${FULLWIDTH_TO_ASCII[mark]} `;
	});
	out = out.replace(/([,.;!?])(?=[A-Za-z'"])/g, '$1 ');
	out = out.replace(/\s+([,.;!?])/g, '$1');
	return out.replace(/\s{2,}/g, ' ').trim();
}

/** 只认英文行：含拉丁字母且不含中日韩字 */
function isEnglish(line) {
	return /[A-Za-z]{2}/.test(line) && !cjk.test(line);
}

/**
 * 章节分隔行的几种写法，返回 { no, title }；不是分隔行返回 null。
 */
function readDelimiter(line) {
	const text = line.trim();
	let match = text.match(/^(\d{1,3})\s*chapter\b\s*(.*)$/i);
	if (match) return { no: Number(match[1]), title: match[2].trim() };
	match = text.match(/^chapter\s*(\d{1,3})\b\s*(.*)$/i);
	if (match) return { no: Number(match[1]), title: match[2].trim() };
	match = text.match(/^(\d{1,3})$/);
	if (match) return { no: Number(match[1]), title: '' };
	return null;
}

/** 英文块首行的「章号 + 章名」，形如 `1 Toby remembers` */
function readHeading(line) {
	const match = squeeze(line).match(/^(\d{1,3})\s*[.、]?\s+([A-Za-z].*)$/);
	if (!match) return null;
	return { no: Number(match[1]), title: match[2].trim() };
}

/** 一行像不像章节标题：短、无句末标点、不是对白 */
function looksLikeHeading(line) {
	const text = squeeze(line);
	if (!text || text.length > 58) return false;
	if (/[.!?。！？:：;；,，]$/.test(text)) return false;
	if (/[\u2018\u2019\u201c\u201d"']/.test(text)) return false;
	if (!/^[A-Z]/.test(text)) return false;
	const words = text.split(/\s+/).length;
	return words >= 2 && words <= 9;
}

/** 有分隔行的文件：分隔行之间是一段内容（英文块或中文块），只留含英文的段 */
function parseByDelimiter(lines) {
	const chapters = [];
	let chapter = null;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;

		const delimiter = readDelimiter(line);
		if (delimiter) {
			chapter = { no: delimiter.no, title: delimiter.title, paras: [] };
			chapters.push(chapter);
			continue;
		}
		if (!chapter) continue;
		if (isEnglish(line)) chapter.paras.push(normalizeEnglish(line));
	}

	const kept = chapters.filter((item) => item.paras.length > 0);
	// 分隔行没带标题时，若正文第一行像标题就提出来当章名
	for (const item of kept) {
		if (!item.title && item.paras.length > 1 && looksLikeHeading(item.paras[0])) {
			item.title = item.paras.shift();
		}
	}
	return kept;
}

/** 没有分隔行的文件：靠英文块的首行判断是否新开一章 */
function parseBlocks(lines) {
	const chapters = [];
	let chapter = null;
	// 中文块之后重新出现的英文，一定是新块的开始
	let previousWasChinese = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;

		if (!isEnglish(line)) {
			previousWasChinese = true;
			continue;
		}

		const blockStart = previousWasChinese || chapter === null;
		previousWasChinese = false;

		const heading = readHeading(line);
		if (heading) {
			chapter = { no: heading.no, title: heading.title, paras: [] };
			chapters.push(chapter);
			continue;
		}

		if (blockStart && looksLikeHeading(line)) {
			chapter = { no: chapters.length + 1, title: normalizeEnglish(line), paras: [] };
			chapters.push(chapter);
			continue;
		}

		if (!chapter) {
			chapter = { no: chapters.length + 1, title: '', paras: [] };
			chapters.push(chapter);
		}
		chapter.paras.push(normalizeEnglish(line));
	}

	return chapters.filter((item) => item.paras.length > 0);
}

/**
 * 章号去重：素材里偶尔会把正文里以数字开头的行误当成新章（比如
 * 「11 I laughed, and then he laughed too.」），于是出现两个第 11 章。
 * 遇到重复就并入已有那一章，既保证唯一，也不丢正文。
 */
function dedupeNumbers(chapters) {
	const byNumber = new Map();
	const result = [];
	for (const chapter of chapters) {
		const existing = byNumber.get(chapter.no);
		if (existing) {
			existing.paras.push(...chapter.paras);
			if (!existing.title && chapter.title) existing.title = chapter.title;
			continue;
		}
		byNumber.set(chapter.no, chapter);
		result.push(chapter);
	}
	return result;
}

async function pathExists(target) {
	try {
		await readdir(target);
		return true;
	} catch {
		return false;
	}
}

/** 扫第 1 级的音频目录：书 → 章号 → mp3 相对路径 */
async function collectAudio() {
	const books = new Map();
	for (const root of AUDIO_DIRS) {
		if (!(await pathExists(root))) continue;
		for (const layer of await readdir(root, { withFileTypes: true })) {
			if (!layer.isDirectory()) continue;
			const layerPath = path.join(root, layer.name);
			const inner = await readdir(layerPath, { withFileTypes: true });
			const hasBooks = inner.some((entry) => /^\d[A-B]_\d\d\./.test(entry.name));
			const nested = inner.find((entry) => entry.isDirectory());
			const base = hasBooks ? layerPath : nested ? path.join(layerPath, nested.name) : layerPath;

			for (const entry of await readdir(base, { withFileTypes: true })) {
				if (!entry.isDirectory() || !/^\d[A-B]_\d\d\./.test(entry.name)) continue;
				const id = entry.name.slice(0, 5);
				const titleZh = entry.name.replace(/^\d[A-B]_\d\d\./, '').trim();
				const bookDir = path.join(base, entry.name);
				const deeper = (await readdir(bookDir, { withFileTypes: true })).filter((e) => e.isDirectory());
				const dir = deeper.length ? path.join(bookDir, deeper[0].name) : bookDir;

				const chapters = new Map();
				for (const file of await readdir(dir)) {
					if (!file.toLowerCase().endsWith('.mp3')) continue;
					const no = Number(file.match(/\d+/)?.[0]);
					if (!Number.isFinite(no)) continue;
					chapters.set(no, path.join(dir, file));
				}
				books.set(id, { id, titleZh, chapters });
			}
		}
	}
	return books;
}

/** `LoveorMoney` → `Love or Money`，拆不出来时返回原名 */
function splitCamel(name) {
	return name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
}

/** 第 1 级的英文书名来自同目录的 PDF 文件名 */
async function collectEnglishTitles() {
	const titles = new Map();
	const walk = async (dir) => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			const match = entry.name.match(/^(\d[A-B]_\d\d)\.([A-Za-z].*?)\s*-?\s*\.pdf$/i);
			if (match && !titles.has(match[1])) titles.set(match[1], splitCamel(match[2]));
		}
	};
	for (const root of AUDIO_DIRS) {
		if (await pathExists(root)) await walk(root);
	}
	return titles;
}

async function main() {
	const audio = await collectAudio();
	const englishTitles = await collectEnglishTitles();
	console.log(`音频目录: ${audio.size} 本    英文书名: ${englishTitles.size} 个`);

	const textFiles = (await readdir(TEXT_DIR)).filter((file) => file.toLowerCase().endsWith('.txt'));
	const books = [];

	for (const file of textFiles) {
		const id = file.match(/^\d[A-B]_\d\d/)?.[0];
		if (!id) {
			console.log(`  跳过（文件名取不出编号）: ${file}`);
			continue;
		}

		const lines = decode(await readFile(path.join(TEXT_DIR, file))).split(/\r?\n/);
		const delimiters = lines.filter((line) => readDelimiter(line) !== null).length;
		// 分隔行够多就按分隔行切，否则按英文块切
		const chapters = dedupeNumbers(
			delimiters >= 3 ? parseByDelimiter(lines) : parseBlocks(lines)
		);

		const fromAudio = audio.get(id);
		for (const chapter of chapters) {
			const source = fromAudio?.chapters.get(chapter.no);
			if (!source) continue;
			// 音频转码后按这个路径存放，站点直接用相对资源根目录的地址引用
			chapter.audio = `bookworm/${id}/${chapter.no}.m4a`;
			chapter.sourceAudio = source;
		}

		books.push({
			id,
			level: id.slice(0, 2),
			title: KNOWN_TITLES[id] ?? englishTitles.get(id) ?? fromAudio?.titleZh ?? '',
			titleZh: fromAudio?.titleZh ?? '',
			hasAudio: chapters.some((chapter) => chapter.audio),
			chapters
		});
	}

	books.sort((a, b) => a.id.localeCompare(b.id));

	await mkdir(path.join(OUT_DIR, 'books'), { recursive: true });
	// 清掉上一轮留下的、不在本次清单里的书 JSON（改了命名规则时会用到）
	const keep = new Set(books.map((book) => `${book.id}.json`));
	for (const file of await readdir(path.join(OUT_DIR, 'books'))) {
		if (file.endsWith('.json') && !keep.has(file)) {
			await rm(path.join(OUT_DIR, 'books', file), { force: true });
		}
	}
	for (const book of books) {
		await writeFile(
			path.join(OUT_DIR, 'books', `${book.id}.json`),
			`${JSON.stringify(book, null, '\t')}\n`,
			'utf8'
		);
	}

	const catalog = {
		books: books.map((book) => ({
			id: book.id,
			level: book.level,
			title: book.title,
			titleZh: book.titleZh,
			chapters: book.chapters.length,
			hasAudio: book.hasAudio,
			audioChapters: book.chapters.filter((chapter) => chapter.audio).length,
			firstChapterTitle: book.chapters[0]?.title ?? ''
		}))
	};
	await writeFile(path.join(OUT_DIR, 'shelf.json'), `${JSON.stringify(catalog, null, '\t')}\n`, 'utf8');

	const chapterCount = books.reduce((sum, book) => sum + book.chapters.length, 0);
	const paraCount = books.reduce(
		(sum, book) => sum + book.chapters.reduce((n, chapter) => n + chapter.paras.length, 0),
		0
	);
	console.log(
		`\n书 ${books.length} 本，章 ${chapterCount} 章，英文段落 ${paraCount} 段；带音频 ${books.filter((b) => b.hasAudio).length} 本`
	);
	console.log(`输出: ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
