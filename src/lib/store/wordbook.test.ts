import { beforeEach, describe, expect, it } from 'vitest';

// wordbook 依赖 localStorage，测试环境补一个最小的内存实现
class MemoryStorage {
	private map = new Map<string, string>();
	getItem(key: string) {
		return this.map.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.map.set(key, value);
	}
	removeItem(key: string) {
		this.map.delete(key);
	}
	clear() {
		this.map.clear();
	}
}

(globalThis as unknown as { localStorage: Storage }).localStorage =
	new MemoryStorage() as unknown as Storage;

const { add, dueWords, grade, isAdded, previewIntervals, Rating, remove, stats } = await import(
	'./wordbook.js'
);

function addWord(word: string, lesson = 'nce2-01', line = 0) {
	return add({
		w: word,
		phonetic: 'test',
		translation: '测试',
		tag: '',
		lesson,
		line,
		ctx: 'A sample sentence.'
	});
}

beforeEach(() => {
	for (const word of ['complain', 'theatre']) remove(word);
});

describe('wordbook', () => {
	it('加入后能查到，重复加入不会产生两条', () => {
		addWord('complain');
		addWord('complain');
		expect(isAdded('complain')).toBe(true);
		expect(stats().total).toBe(1);
	});

	it('大小写不敏感', () => {
		addWord('Theatre');
		expect(isAdded('theatre')).toBe(true);
	});

	it('新词当天就会到期复习', () => {
		addWord('complain');
		expect(dueWords().map((record) => record.w)).toContain('complain');
	});

	it('评分后到期时间被推后，不再出现在今日队列', () => {
		addWord('complain');
		const updated = grade('complain', Rating.Good);
		expect(updated).not.toBeNull();
		expect(updated!.card.due.getTime()).toBeGreaterThan(Date.now());
		expect(dueWords().map((record) => record.w)).not.toContain('complain');
	});

	it('忘记评分会很快重新出现', () => {
		addWord('complain');
		const updated = grade('complain', Rating.Again);
		// Again 会把到期时间压到很近（分钟级），不会排到几天后
		expect(updated!.card.due.getTime() - Date.now()).toBeLessThan(60 * 60 * 1000);
	});

	it('四个评分各自的间隔都能取到', () => {
		addWord('complain');
		const intervals = previewIntervals('complain');
		expect(intervals).not.toBeNull();
		for (const rating of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
			expect(typeof intervals![rating]).toBe('string');
		}
	});

	it('移除后不再出现在生词本', () => {
		addWord('complain');
		remove('complain');
		expect(isAdded('complain')).toBe(false);
	});
});
