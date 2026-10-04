import { describe, expect, it } from 'vitest';
import { joinTokens, tokenize } from './tokenize';

describe('tokenize', () => {
	it('切出单词并保留标点与空格', () => {
		const tokens = tokenize('Last week I went to the theatre.');
		expect(tokens.filter((token) => token.word).map((token) => token.text)).toEqual([
			'Last',
			'week',
			'I',
			'went',
			'to',
			'the',
			'theatre'
		]);
	});

	it('保留撇号与连字符', () => {
		const words = tokenize("I can't bear well-known things.")
			.filter((token) => token.word)
			.map((token) => token.text);
		expect(words).toEqual(['I', "can't", 'bear', 'well-known', 'things']);
	});

	it('缩写作为一个整体保留，数字不算单词', () => {
		const words = tokenize("'It's none of your business,' he said in 2024.")
			.filter((token) => token.word)
			.map((token) => token.text);
		expect(words).toEqual(["It's", 'none', 'of', 'your', 'business', 'he', 'said', 'in']);
	});

	it('拼回去和原文一致，一个字都不丢', () => {
		const source = "'I can't hear a word!' I said angrily.";
		expect(joinTokens(tokenize(source))).toBe(source);
	});

	it('没有字母时原样返回', () => {
		expect(tokenize('--- 2024 ---')).toEqual([{ word: false, text: '--- 2024 ---' }]);
	});
});
