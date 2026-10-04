import { describe, expect, it } from 'vitest';
import { clamp, formatTime } from './time';

describe('formatTime', () => {
	it('把秒数格式化成 m:ss', () => {
		expect(formatTime(0)).toBe('0:00');
		expect(formatTime(9.77)).toBe('0:09');
		expect(formatTime(79.4)).toBe('1:19');
		expect(formatTime(600)).toBe('10:00');
	});

	it('对非法输入返回 0:00 而不是 NaN', () => {
		expect(formatTime(Number.NaN)).toBe('0:00');
		expect(formatTime(-1)).toBe('0:00');
		expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
	});
});

describe('clamp', () => {
	it('夹在区间内', () => {
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(-3, 0, 10)).toBe(0);
		expect(clamp(42, 0, 10)).toBe(10);
	});

	it('非法输入回落到下界', () => {
		expect(clamp(Number.NaN, 2, 10)).toBe(2);
	});
});
