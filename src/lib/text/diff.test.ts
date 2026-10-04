import { describe, expect, it } from 'vitest';
import { accuracy, diffWords } from './diff';

describe('diffWords', () => {
	it('完全正确时全是对上的', () => {
		const parts = diffWords('Last week I went to the theatre.', 'Last week I went to the theatre.');
		expect(parts).toEqual([{ type: 'same', text: 'last week i went to the theatre' }]);
		expect(accuracy(parts)).toBe(1);
	});

	it('忽略大小写与标点', () => {
		const parts = diffWords('Last week I went to the theatre.', 'last WEEK i went to the theatre');
		expect(parts.every((part) => part.type === 'same')).toBe(true);
	});

	it('漏词标成 missing', () => {
		const parts = diffWords('I had a very good seat.', 'I had a good seat');
		expect(parts.find((part) => part.type === 'missing')?.text).toBe('very');
	});

	it('多打的词标成 extra', () => {
		const parts = diffWords('I got very angry.', 'I got very very angry');
		expect(parts.find((part) => part.type === 'extra')?.text).toBe('very');
	});

	it('错词会变成一个缺失加一个多余', () => {
		const parts = diffWords('They were talking loudly.', 'They were talking loud');
		expect(parts.some((part) => part.type === 'missing')).toBe(true);
		expect(parts.some((part) => part.type === 'extra')).toBe(true);
	});

	it('正确率按原句词数算，多打的词不扣分', () => {
		const parts = diffWords('I could not hear the actors.', 'I could not hear the actors indeed');
		expect(accuracy(parts)).toBe(1);
	});

	it('完全没写对正确率为 0', () => {
		expect(accuracy(diffWords('I turned round.', 'nothing'))).toBe(0);
	});
});
