import { describe, expect, it } from 'vitest';
import {
	clampIndex,
	cycle,
	indexByTime,
	isSentenceLocked,
	LOOP_MODES,
	SPEEDS
} from './playback';

const lines = [
	{ start: 9.77, end: 15.76 },
	{ start: 15.91, end: 19.24 },
	{ start: 19.39, end: 21.92 }
];

describe('indexByTime', () => {
	it('落在句子区间内返回该句', () => {
		expect(indexByTime(lines, 10)).toBe(0);
		expect(indexByTime(lines, 16)).toBe(1);
		expect(indexByTime(lines, 21)).toBe(2);
	});

	it('落在句间停顿里返回上一句，而不是下一句', () => {
		expect(indexByTime(lines, 19.3)).toBe(1);
	});

	it('早于第一句返回 -1，晚于最后一句返回最后一句', () => {
		expect(indexByTime(lines, 1)).toBe(-1);
		expect(indexByTime(lines, 999)).toBe(2);
	});

	it('空数组不炸', () => {
		expect(indexByTime([], 5)).toBe(-1);
	});
});

describe('clampIndex', () => {
	it('夹在范围内', () => {
		expect(clampIndex(-3, 5)).toBe(0);
		expect(clampIndex(9, 5)).toBe(4);
		expect(clampIndex(2, 5)).toBe(2);
	});

	it('空列表返回 -1', () => {
		expect(clampIndex(0, 0)).toBe(-1);
	});
});

describe('cycle', () => {
	it('在档位里循环', () => {
		expect(cycle(SPEEDS, 1)).toBe(1.25);
		expect(cycle(SPEEDS, 2)).toBe(0.5);
		expect(cycle(LOOP_MODES, 'book')).toBe('off');
	});
});

describe('isSentenceLocked', () => {
	it('只有点读和单句循环会锁定句子', () => {
		expect(isSentenceLocked('click')).toBe(true);
		expect(isSentenceLocked('one')).toBe(true);
		expect(isSentenceLocked('list')).toBe(false);
		expect(isSentenceLocked('off')).toBe(false);
		expect(isSentenceLocked('book')).toBe(false);
	});
});
