import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import type { Card } from 'ts-fsrs';

const STORAGE_KEY = 'nce:wordbook';

/** 调度器开着模糊，避免每天的复习量过于机械。 */
const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export type WordRecord = {
	/** 小写原词 */
	w: string;
	/** 命中原形时的原形词 */
	base?: string;
	phonetic: string;
	translation: string;
	tag: string;
	/** 出处：课文 id 与句子序号，用于复习时回看上下文 */
	lesson: string;
	line: number;
	/** 所在句子原文 */
	ctx: string;
	addedAt: number;
	card: Card;
};

type StoredRecord = Omit<WordRecord, 'card'> & {
	card: Omit<Card, 'due' | 'last_review'> & { due: string; last_review?: string };
};

function revive(record: StoredRecord): WordRecord {
	return {
		...record,
		card: {
			...record.card,
			due: new Date(record.card.due),
			last_review: record.card.last_review ? new Date(record.card.last_review) : undefined
		}
	};
}

export function loadAll(): WordRecord[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as StoredRecord[];
		return parsed.map(revive);
	} catch {
		return [];
	}
}

function saveAll(records: WordRecord[]) {
	try {
		const data: StoredRecord[] = records.map((record) => ({
			...record,
			card: {
				...record.card,
				due: record.card.due.toISOString(),
				last_review: record.card.last_review?.toISOString()
			}
		}));
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// 隐私模式下写不进去，忽略
	}
}

export function isAdded(word: string): boolean {
	const target = word.toLowerCase();
	return loadAll().some((record) => record.w === target);
}

export function addedSet(): Set<string> {
	return new Set(loadAll().map((record) => record.w));
}

export function add(input: {
	w: string;
	base?: string;
	phonetic: string;
	translation: string;
	tag: string;
	lesson: string;
	line: number;
	ctx: string;
}): WordRecord {
	const records = loadAll().filter((record) => record.w !== input.w.toLowerCase());
	const record: WordRecord = {
		...input,
		w: input.w.toLowerCase(),
		addedAt: Date.now(),
		card: createEmptyCard(new Date())
	};
	records.push(record);
	saveAll(records);
	return record;
}

export function remove(word: string) {
	const target = word.toLowerCase();
	saveAll(loadAll().filter((record) => record.w !== target));
}

/** 到期待复习的词，最早的排前面。 */
export function dueWords(now = new Date()): WordRecord[] {
	return loadAll()
		.filter((record) => record.card.due.getTime() <= now.getTime())
		.sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
}

export function grade(word: string, rating: Rating): WordRecord | null {
	const records = loadAll();
	const index = records.findIndex((record) => record.w === word.toLowerCase());
	if (index < 0) return null;

	const now = new Date();
	const result = scheduler.repeat(records[index].card, now) as unknown as Record<
		number,
		{ card: Card }
	>;
	const next = result[rating].card;
	records[index] = { ...records[index], card: next };
	saveAll(records);
	return records[index];
}

export function stats(now = new Date()) {
	const records = loadAll();
	const due = records.filter((record) => record.card.due.getTime() <= now.getTime()).length;
	return { total: records.length, due };
}

function humanize(ms: number): string {
	const minutes = Math.round(ms / 60000);
	if (minutes < 60) return `${Math.max(1, minutes)} 分钟`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} 小时`;
	const days = Math.round(hours / 24);
	if (days < 31) return `${days} 天`;
	const months = Math.round(days / 30);
	return months < 12 ? `${months} 个月` : `${(months / 12).toFixed(1)} 年`;
}

/** 四个评分各自会把下次复习排到多久之后，给按钮做提示。 */
export function previewIntervals(word: string): Record<number, string> | null {
	const record = loadAll().find((item) => item.w === word.toLowerCase());
	if (!record) return null;
	const now = new Date();
	const result = scheduler.repeat(record.card, now) as unknown as Record<
		number,
		{ card: Card }
	>;
	const out: Record<number, string> = {};
	for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
		out[rating] = humanize(result[rating].card.due.getTime() - now.getTime());
	}
	return out;
}

export { Rating };
