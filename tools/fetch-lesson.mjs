/**
 * 数据管线第一环：把 tangx/New-Concept-English 的一课拉下来，产出我们自己的 lesson.json。
 *
 * tangx 的 LRC 只有英文时间轴（中文字幕是上游站点后来机翻加上去的），
 * 所以这里把英文时间轴当作权威来源，中文作为可选的附加层合并进来。
 *
 * 用法：
 *   node tools/fetch-lesson.mjs --book 2 --lesson 1
 *   node tools/fetch-lesson.mjs --book 2 --lesson 1 --zh https://nce.mleo.site/NCE2/01.A%20Private%20Conversation.lrc
 *
 * 出网需要走本地代理：
 *   $env:HTTPS_PROXY="http://127.0.0.1:6789"; $env:NODE_USE_ENV_PROXY="1"
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'tools', '.cache');
const LESSON_DIR = path.join(ROOT, 'src', 'lib', 'data', 'lessons');
const AUDIO_DIR = path.join(ROOT, 'static', 'audio');

const UPSTREAM = 'tangx/New-Concept-English';
const UPSTREAM_BRANCH = 'main';
const BOOK_DIRS = {
	1: '新概念英语第1册美音（MP3+LRC）',
	2: '新概念英语第2册美音（MP3+LRC）',
	3: '新概念英语第3册美音（MP3+LRC）',
	4: '新概念英语第4册美音（MP3+LRC）'
};

/** 句子结束时间相对下一句起点的预留量。真实边界待强制对齐替换。 */
const SENTENCE_TAIL_GAP = 0.15;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, options = {}) {
	let lastError = 'unknown';
	for (let attempt = 1; attempt <= 6; attempt += 1) {
		try {
			const response = await fetch(url, {
				...options,
				headers: { 'user-agent': 'nce-player-pipeline', ...(options.headers ?? {}) }
			});
			if (response.ok) return response;
			lastError = `HTTP ${response.status}`;
			if (response.status === 404) return null;
		} catch (error) {
			lastError = error.message;
		}
		await sleep(600 * attempt);
	}
	throw new Error(`请求失败 ${url}: ${lastError}`);
}

function parseArgs(argv) {
	const args = { book: 2, lesson: 1, zh: null };
	for (let i = 0; i < argv.length; i += 1) {
		const key = argv[i];
		if (key === '--book') args.book = Number(argv[++i]);
		else if (key === '--lesson') args.lesson = Number(argv[++i]);
		else if (key === '--zh') args.zh = argv[++i];
	}
	return args;
}

/** 拉取上游仓库的完整文件树，并缓存在本地。 */
async function loadTree() {
	const cacheFile = path.join(CACHE_DIR, 'tangx-tree.json');
	if (existsSync(cacheFile)) {
		return JSON.parse(await readFile(cacheFile, 'utf8'));
	}
	const response = await request(
		`https://api.github.com/repos/${UPSTREAM}/git/trees/${UPSTREAM_BRANCH}?recursive=1`
	);
	if (!response) throw new Error('拿不到上游文件树');
	const tree = await response.json();
	await mkdir(CACHE_DIR, { recursive: true });
	await writeFile(cacheFile, JSON.stringify(tree), 'utf8');
	return tree;
}

/** 按 blob API 取文件内容（base64），这条路比 raw.githubusercontent 稳。 */
async function fetchBlob(sha) {
	const response = await request(`https://api.github.com/repos/${UPSTREAM}/git/blobs/${sha}`);
	if (!response) throw new Error(`blob 不存在: ${sha}`);
	const blob = await response.json();
	return Buffer.from(blob.content, 'base64');
}

function findEntry(tree, book, lesson, ext) {
	const dir = BOOK_DIRS[book];
	if (!dir) throw new Error(`不支持的册数: ${book}`);
	const prefix = `${String(lesson).padStart(2, '0')}－`;
	const match = tree.tree.find(
		(node) =>
			node.type === 'blob' &&
			node.path.startsWith(`${dir}/`) &&
			node.path.toLowerCase().endsWith(ext) &&
			path.basename(node.path).startsWith(prefix)
	);
	if (!match) throw new Error(`上游找不到第 ${book} 册第 ${lesson} 课的 ${ext}`);
	return match;
}

/** 解析 LRC：`[mm:ss.xx]文本`，`|` 右侧视为中文。 */
function parseLrc(text) {
	const lines = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const match = line.match(/^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)$/);
		if (!match) continue;
		const minutes = Number(match[1]);
		const seconds = Number(match[2]);
		if (seconds >= 60) continue;
		const fraction = Number(`0.${match[3]}`);
		const start = Math.round((minutes * 60 + seconds + fraction) * 1000) / 1000;
		const body = match[4].trim();
		if (!body) continue;
		const [en = '', zh = ''] = body.split('|').map((part) => part.trim());
		if (!en) continue;
		lines.push({ start, en, zh });
	}
	return lines.sort((a, b) => a.start - b.start);
}

/** 用中文来源补齐翻译：按时间戳就近匹配，容差 0.5 秒。 */
function mergeTranslations(englishLines, chineseLines) {
	if (!chineseLines.length) return englishLines;
	return englishLines.map((line) => {
		const hit = chineseLines.find((candidate) => Math.abs(candidate.start - line.start) <= 0.5);
		return hit?.zh ? { ...line, zh: hit.zh } : line;
	});
}

function buildLesson({ book, lesson, title, lines, hasTranslation }) {
	const id = `nce${book}-${String(lesson).padStart(2, '0')}`;
	const enriched = lines.map((line, index) => {
		const next = lines[index + 1];
		const end =
			index < lines.length - 1
				? Math.max(line.start + 0.3, Number((next.start - SENTENCE_TAIL_GAP).toFixed(3)))
				: Number((line.start + 4).toFixed(3));
		return {
			i: index,
			start: line.start,
			end,
			en: line.en,
			...(line.zh ? { zh: line.zh } : {})
		};
	});

	return {
		id,
		book: `nce${book}`,
		title,
		accent: 'us',
		audio: { src: `audio/${id}.mp3` },
		translation: hasTranslation ? 'machine' : 'none',
		// TODO(阶段 2)：用 WhisperX 强制对齐替换上面的估算，并把 end 校准到真实语音边界。
		alignment: 'estimated',
		lines: enriched
	};
}

function titleFromFilename(name) {
	return name
		.replace(/^\d+\s*[－\-.]\s*/, '')
		.replace(/\.(lrc|mp3)$/i, '')
		.trim();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const tree = await loadTree();

	const lrcEntry = findEntry(tree, args.book, args.lesson, '.lrc');
	const mp3Entry = findEntry(tree, args.book, args.lesson, '.mp3');

	console.log(`上游 LRC: ${lrcEntry.path}`);
	console.log(`上游 MP3: ${mp3Entry.path}`);

	const [lrcBuffer, mp3Buffer] = await Promise.all([
		fetchBlob(lrcEntry.sha),
		fetchBlob(mp3Entry.sha)
	]);

	let lines = parseLrc(lrcBuffer.toString('utf8'));
	let hasTranslation = false;

	if (args.zh) {
		const response = await request(args.zh);
		if (response) {
			const chineseLines = parseLrc(await response.text());
			lines = mergeTranslations(lines, chineseLines);
			hasTranslation = lines.some((line) => line.zh);
			console.log(`中文来源: ${args.zh}（合并 ${chineseLines.length} 行）`);
		}
	}

	const lesson = buildLesson({
		book: args.book,
		lesson: args.lesson,
		title: titleFromFilename(path.basename(lrcEntry.path)),
		lines,
		hasTranslation
	});

	await mkdir(LESSON_DIR, { recursive: true });
	await mkdir(AUDIO_DIR, { recursive: true });

	const lessonFile = path.join(LESSON_DIR, `${lesson.id}.json`);
	const audioFile = path.join(AUDIO_DIR, `${lesson.id}.mp3`);
	await writeFile(lessonFile, `${JSON.stringify(lesson, null, '\t')}\n`, 'utf8');
	await writeFile(audioFile, mp3Buffer);

	console.log(`\n句子数: ${lesson.lines.length}  含翻译: ${hasTranslation}`);
	console.log(`写出: ${path.relative(ROOT, lessonFile)}`);
	console.log(`写出: ${path.relative(ROOT, audioFile)} (${(mp3Buffer.length / 1024).toFixed(0)} KB)`);
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
