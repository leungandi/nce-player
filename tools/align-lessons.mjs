/**
 * 句子边界校准（最小改动版）。
 *
 * 只做一件事：把每一课 JSON 里每句的 `end` 从"下一句起点减 0.15 秒"的估算值，
 * 改成这句话真正说完的时刻——用 ffmpeg 的静音检测找出句尾停顿，取停顿开始的瞬间。
 *
 * 不动播放器、不动数据结构，只改 `end` 数值（并标记 alignment）。
 *
 * 用法：
 *   node tools/align-lessons.mjs            # 正式写回
 *   node tools/align-lessons.mjs --dry      # 只看统计，不写文件
 *   node tools/align-lessons.mjs --book 2   # 只处理某一册
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LESSON_DIR = path.join(ROOT, 'src', 'lib', 'data', 'lessons');
const AUDIO_DIR = path.join(ROOT, 'nce-audio', 'audio');

/** 静音判定：低于 -35 dB 且持续 0.3 秒以上。 */
const NOISE = '-35dB';
const MIN_SILENCE = '0.3';
/** 停顿结束点与下一句起点差多少以内，算"这就是那句的句尾停顿"。 */
const MATCH_TOLERANCE = 0.5;
/** 句尾至少留这么长，避免把整句压没。 */
const MIN_SENTENCE = 0.3;
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const bookFilter = args.includes('--book') ? args[args.indexOf('--book') + 1] : null;
const lessonFilter = args.includes('--lesson') ? args[args.indexOf('--lesson') + 1] : null;

/** 跑一次静音检测，返回静音区间列表。 */
async function detectSilence(audioFile) {
	const { stderr } = await run(ffmpegPath, [
		'-hide_banner',
		'-nostats',
		'-i',
		audioFile,
		'-af',
		`silencedetect=noise=${NOISE}:d=${MIN_SILENCE}`,
		'-f',
		'null',
		'-'
	]);

	const intervals = [];
	let pending = null;
	for (const line of stderr.split('\n')) {
		const start = line.match(/silence_start:\s*([\d.]+)/);
		if (start) {
			pending = Number(start[1]);
			continue;
		}
		const end = line.match(/silence_end:\s*([\d.]+)/);
		if (end && pending !== null) {
			intervals.push({ start: pending, end: Number(end[1]) });
			pending = null;
		}
	}
	return intervals;
}

/**
 * 找出"引向下一句"的那段停顿：结束点最接近下一句起点的那一段。
 * 找不到就返回 null，调用方保留原来的估算值。
 */
function findTrailingPause(intervals, fromTime, nextStart) {
	let best = null;
	let bestDistance = Infinity;
	for (const interval of intervals) {
		if (interval.start <= fromTime + MIN_SENTENCE) continue;
		if (interval.start >= nextStart) continue;
		const distance = Math.abs(interval.end - nextStart);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = interval;
		}
	}
	return bestDistance <= MATCH_TOLERANCE ? best : null;
}

/** 末句：取这句话之后的第一段停顿。 */
function findFollowingPause(intervals, fromTime) {
	const after = intervals
		.filter((interval) => interval.start > fromTime + MIN_SENTENCE)
		.sort((a, b) => a.start - b.start);
	return after[0] ?? null;
}

function round(value) {
	return Math.round(value * 1000) / 1000;
}

async function processLesson(file) {
	const id = file.replace(/\.json$/, '');
	const lessonFile = path.join(LESSON_DIR, file);
	const audioFile = path.join(AUDIO_DIR, `${id}.m4a`);

	if (!existsSync(audioFile)) return { id, skipped: 'no-audio' };

	const lesson = JSON.parse(await readFile(lessonFile, 'utf8'));
	const lines = lesson.lines ?? [];
	if (lines.length < 2) return { id, skipped: 'too-few-lines' };

	const intervals = await detectSilence(audioFile);
	if (!intervals.length) return { id, skipped: 'no-silence' };

	let changed = 0;
	let saved = 0;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const next = lines[i + 1];
		const before = line.end;

		let candidate = null;
		if (next) {
			const pause = findTrailingPause(intervals, line.start, next.start);
			if (pause) candidate = pause.start;
		} else {
			const pause = findFollowingPause(intervals, line.start);
			// 末句没有"下一句"可参照：取这句话说完之后第一段停顿的开始点，再留一点尾音
			if (pause) candidate = pause.start + 0.2;
		}

		if (candidate === null) continue;

		const lowerBound = line.start + MIN_SENTENCE;
		const upperBound = next ? next.start : candidate;
		const end = round(Math.min(Math.max(candidate, lowerBound), upperBound));
		if (!Number.isFinite(end)) continue;

		if (Math.abs(end - before) > 0.05) {
			line.end = end;
			changed += 1;
			saved += before - end;
		}
	}

	if (changed && !dryRun) {
		lesson.alignment = 'aligned';
		await writeFile(lessonFile, `${JSON.stringify(lesson, null, '\t')}\n`, 'utf8');
	}

	return { id, lines: lines.length, changed, saved: round(saved) };
}

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

async function main() {
	const files = (await readdir(LESSON_DIR))
		.filter((file) => file.endsWith('.json'))
		.filter((file) => !bookFilter || file.startsWith(`nce${bookFilter}-`))
		.filter((file) => !lessonFilter || file === `${lessonFilter}.json`)
		.sort();

	console.log(`${dryRun ? '[试运行] ' : ''}待处理 ${files.length} 课`);

	let done = 0;
	const results = await mapLimit(files, CONCURRENCY, async (file) => {
		const result = await processLesson(file);
		done += 1;
		if (done % 20 === 0 || done === files.length) {
			process.stdout.write(`  已处理 ${done}/${files.length}\n`);
		}
		return result;
	});

	const ok = results.filter((result) => !result.skipped);
	const adjusted = ok.filter((result) => (result.changed ?? 0) > 0);
	const totalChanged = ok.reduce((sum, result) => sum + (result.changed ?? 0), 0);
	const totalSaved = round(ok.reduce((sum, result) => sum + (result.saved ?? 0), 0));

	console.log(`\n处理成功 ${ok.length} 课，其中 ${adjusted.length} 课有时间调整`);
	console.log(`修正句子 ${totalChanged} 句，裁掉句尾多余静音共 ${totalSaved} 秒`);
	if (dryRun) console.log('（试运行，未写入文件）');

	const skipped = results.filter((result) => result.skipped);
	if (skipped.length) {
		const reasons = {};
		for (const item of skipped) reasons[item.skipped] = (reasons[item.skipped] ?? 0) + 1;
		console.log('跳过:', JSON.stringify(reasons));
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
