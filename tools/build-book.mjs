/**
 * 数据管线：把 tangx/New-Concept-English 的一整册课文拉下来，产出
 *   1) 课文 JSON  → src/lib/data/lessons/<id>.json（随站点构建，用于预渲染）
 *   2) 音频        → 独立资源仓库目录（默认 ../nce-audio/audio，或 --audio-out）
 *   3) 课文清单    → src/lib/data/catalog.json
 *
 * 音频转成 AAC 单声道 64 kbps：语音内容够用，体积约为上游原始 mp3 的三分之一。
 *
 * 用法：
 *   node tools/build-book.mjs --book 2
 *   node tools/build-book.mjs --book 2 --from 1 --to 10 --force
 *
 * 出网需要走本地代理：
 *   $env:HTTPS_PROXY="http://127.0.0.1:6789"; $env:NODE_USE_ENV_PROXY="1"
 */

import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'tools', '.cache');
const LESSON_DIR = path.join(ROOT, 'src', 'lib', 'data', 'lessons');
const CATALOG_FILE = path.join(ROOT, 'src', 'lib', 'data', 'catalog.json');

const UPSTREAM = 'tangx/New-Concept-English';
const UPSTREAM_BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${UPSTREAM}/${UPSTREAM_BRANCH}/`;
const ZH_BASE = 'https://nce.mleo.site';

const AUDIO_BITRATE = '64k';
const CONCURRENCY = 3;

/** 句子结束时间相对下一句起点的预留量，等强制对齐替换。 */
const SENTENCE_TAIL_GAP = 0.15;

const BOOKS = {
	1: { dir: '新概念英语第1册美音（MP3+LRC）', name: '新概念英语 第一册', titleEn: 'First Things First' },
	2: { dir: '新概念英语第2册美音（MP3+LRC）', name: '新概念英语 第二册', titleEn: 'Practice and Progress' },
	3: { dir: '新概念英语第3册美音（MP3+LRC）', name: '新概念英语 第三册', titleEn: 'Developing Skills' },
	4: { dir: '新概念英语第4册美音（MP3+LRC）', name: '新概念英语 第四册', titleEn: 'Fluency in English' }
};

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
		await sleep(500 * attempt);
	}
	throw new Error(`请求失败 ${url}: ${lastError}`);
}

function encodePath(url) {
	return url
		.split('/')
		.map((segment, index) => (index < 3 ? segment : encodeURIComponent(segment)))
		.join('/');
}

function parseArgs(argv) {
	const args = { book: 2, from: 1, to: Infinity, force: false, audioOut: null };
	for (let i = 0; i < argv.length; i += 1) {
		const key = argv[i];
		if (key === '--book') args.book = Number(argv[++i]);
		else if (key === '--from') args.from = Number(argv[++i]);
		else if (key === '--to') args.to = Number(argv[++i]);
		else if (key === '--audio-out') args.audioOut = argv[++i];
		else if (key === '--force') args.force = true;
	}
	return args;
}

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

/** 中文来源：上游站点的机翻 LRC，按课号匹配文件名。 */
async function loadChineseIndex(book) {
	const response = await request(`${ZH_BASE}/NCE${book}/book.json`);
	if (!response) return new Map();
	const data = await response.json();
	const map = new Map();
	for (const unit of data.units ?? []) {
		const match = String(unit.filename ?? '').match(/^(\d+)/);
		if (match) map.set(Number(match[1]), unit.filename);
	}
	return map;
}

function parseLrc(text) {
	const lines = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const match = line.match(/^\[(\d{1,2}):(\d{2})\.(\d{2,3})\](.*)$/);
		if (!match) continue;
		const seconds = Number(match[2]);
		if (seconds >= 60) continue;
		const start = Math.round((Number(match[1]) * 60 + seconds + Number(`0.${match[3]}`)) * 1000) / 1000;
		const body = match[4].trim();
		if (!body) continue;
		const [en = '', zh = ''] = body.split('|').map((part) => part.trim());
		if (!en) continue;
		lines.push({ start, en, zh });
	}
	return lines.sort((a, b) => a.start - b.start);
}

function mergeTranslations(englishLines, chineseLines) {
	if (!chineseLines.length) return englishLines;
	return englishLines.map((line) => {
		const hit = chineseLines.find((candidate) => Math.abs(candidate.start - line.start) <= 0.5);
		return hit?.zh ? { ...line, zh: hit.zh } : line;
	});
}

function titleFromFilename(name) {
	return name
		.replace(/^\d+\s*[－\-.]\s*/, '')
		.replace(/\.(lrc|mp3)$/i, '')
		.trim();
}

function buildLesson({ book, lessonNo, title, lines, hasTranslation }) {
	const id = `nce${book}-${String(lessonNo).padStart(2, '0')}`;
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
		audio: { src: `audio/${id}.m4a` },
		translation: hasTranslation ? 'machine' : 'none',
		alignment: 'estimated',
		lines: enriched
	};
}

/** 受控并发。 */
async function mapLimit(items, limit, worker) {
	const results = new Array(items.length);
	let cursor = 0;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await worker(items[index], index);
		}
	});
	await Promise.all(runners);
	return results;
}

async function resolveAudioDir(explicit) {
	if (explicit) return path.resolve(ROOT, explicit);
	const repoDir = path.join(ROOT, 'nce-audio', 'audio');
	if (existsSync(path.join(ROOT, 'nce-audio'))) return repoDir;
	return path.join(ROOT, 'media', 'audio');
}

/** 清掉早期放进 static/audio 的 mp3（已改为独立资源仓库 + m4a）。 */
async function removeLegacyMp3(...dirs) {
	let removed = 0;
	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		for (const file of await readdir(dir)) {
			if (!file.endsWith('.mp3')) continue;
			await rm(path.join(dir, file), { force: true });
			removed += 1;
		}
	}
	return removed;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const book = BOOKS[args.book];
	if (!book) throw new Error(`不支持的册数: ${args.book}`);

	const audioDir = await resolveAudioDir(args.audioOut);
	await mkdir(LESSON_DIR, { recursive: true });
	await mkdir(audioDir, { recursive: true });

	console.log(`册数: 第 ${args.book} 册`);
	console.log(`课号: ${args.from} – ${args.to === Infinity ? '末尾' : args.to}`);
	console.log(`音频输出: ${path.relative(ROOT, audioDir)}`);

	const tree = await loadTree();
	const zhIndex = await loadChineseIndex(args.book);

	// 从上游文件树里找出这一册的所有 LRC，按课号排序
	const entries = tree.tree
		.filter(
			(node) =>
				node.type === 'blob' &&
				node.path.startsWith(`${book.dir}/`) &&
				node.path.toLowerCase().endsWith('.lrc')
		)
		.map((node) => {
			const filename = path.basename(node.path);
			const no = Number((filename.match(/^(\d+)/) ?? [])[1]);
			return { node, filename, no, title: titleFromFilename(filename) };
		})
		.filter((entry) => Number.isFinite(entry.no))
		.sort((a, b) => a.no - b.no);

	const selected = entries.filter((entry) => entry.no >= args.from && entry.no <= args.to);
	console.log(`待处理: ${selected.length} 课（上游共 ${entries.length} 课）\n`);

	const catalogLessons = [];
	let done = 0;

	await mapLimit(selected, CONCURRENCY, async (entry) => {
		const id = `nce${args.book}-${String(entry.no).padStart(2, '0')}`;
		const lessonFile = path.join(LESSON_DIR, `${id}.json`);
		const audioFile = path.join(audioDir, `${id}.m4a`);

		catalogLessons.push({ id, no: entry.no, title: entry.title });

		// 只认"课文和音频都在、且音频非空"的成果，避免把上次失败留下的空文件当成已完成
		const audioReady = existsSync(audioFile) && statSync(audioFile).size > 1024;
		if (!args.force && existsSync(lessonFile) && audioReady) {
			done += 1;
			console.log(`[${done}/${selected.length}] ${id} 已存在，跳过`);
			return;
		}

		// 1. 英文时间轴
		const lrcResponse = await request(encodePath(RAW_BASE + entry.node.path));
		if (!lrcResponse) throw new Error(`${id}: 拿不到上游 LRC`);
		let lines = parseLrc(await lrcResponse.text());

		// 2. 中文翻译（可选）
		const zhFilename = zhIndex.get(entry.no);
		if (zhFilename) {
			const zhResponse = await request(
				encodePath(`${ZH_BASE}/NCE${args.book}/${zhFilename}.lrc`)
			);
			if (zhResponse) lines = mergeTranslations(lines, parseLrc(await zhResponse.text()));
		}

		const lesson = buildLesson({
			book: args.book,
			lessonNo: entry.no,
			title: entry.title,
			lines,
			hasTranslation: lines.some((line) => line.zh)
		});

		// 3. 音频：下载原始 mp3，转码成 AAC 单声道 64 kbps
		const mp3Path = entry.node.path.replace(/\.lrc$/i, '.mp3');
		const mp3Response = await request(encodePath(RAW_BASE + mp3Path));
		if (!mp3Response) throw new Error(`${id}: 拿不到上游 MP3`);
		const tempFile = path.join(audioDir, `${id}.src.mp3`);
		await writeFile(tempFile, Buffer.from(await mp3Response.arrayBuffer()));
		await run(ffmpegPath, [
			'-y',
			'-loglevel',
			'error',
			'-i',
			tempFile,
			// 上游 mp3 里嵌了封面图（mjpeg），m4a 容器装不下，只要音轨
			'-vn',
			'-map',
			'0:a:0',
			'-ac',
			'1',
			'-c:a',
			'aac',
			'-b:a',
			AUDIO_BITRATE,
			audioFile
		]);
		await rm(tempFile, { force: true });

		await writeFile(lessonFile, `${JSON.stringify(lesson, null, '\t')}\n`, 'utf8');

		done += 1;
		const size = (await readFile(audioFile)).length;
		console.log(
			`[${done}/${selected.length}] ${id}  ${lesson.lines.length} 句  ${(size / 1024).toFixed(0)} KB`
		);
	});

	catalogLessons.sort((a, b) => a.no - b.no);

	const catalog = {
		books: [
			{
				key: `nce${args.book}`,
				name: book.name,
				titleEn: book.titleEn,
				lessons: catalogLessons
			}
		]
	};

	// 保留其它册的清单，只更新当前册
	if (existsSync(CATALOG_FILE)) {
		const existing = JSON.parse(await readFile(CATALOG_FILE, 'utf8'));
		const others = (existing.books ?? []).filter((item) => item.key !== catalog.books[0].key);
		catalog.books = [...others, ...catalog.books].sort((a, b) => a.key.localeCompare(b.key));
	}
	await writeFile(CATALOG_FILE, `${JSON.stringify(catalog, null, '\t')}\n`, 'utf8');

	const removed = await removeLegacyMp3(audioDir, path.join(ROOT, 'static', 'audio'));
	if (removed) console.log(`\n清理旧格式 mp3: ${removed} 个`);

	console.log(`\n课文清单: ${path.relative(ROOT, CATALOG_FILE)}`);
	console.log(`完成 ${done} 课。`);
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
