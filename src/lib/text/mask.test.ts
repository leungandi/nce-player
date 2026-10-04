import { describe, expect, it } from 'vitest';
import { maskSentence } from './mask';

describe('maskSentence', () => {
	it('0 级原样返回', () => {
		expect(maskSentence('Last week I went.', 0)).toBe('Last week I went.');
	});

	it('1 级只留首字母', () => {
		expect(maskSentence('Last week', 1)).toBe('L___ w___');
	});

	it('2 级全部遮住并保留长度', () => {
		expect(maskSentence('Last week', 2)).toBe('____ ____');
	});

	it('标点与空格原样保留', () => {
		expect(maskSentence("'I can't hear a word!'", 2)).toBe("'_ _____ ____ _ ____!'");
		expect(maskSentence('I turned round.', 1)).toBe('I t_____ r____.');
	});

	it('连字符单词的遮罩长度按字母算', () => {
		expect(maskSentence('well-known', 1)).toBe('w________');
		expect(maskSentence('well-known', 2)).toBe('__________');
	});
});
