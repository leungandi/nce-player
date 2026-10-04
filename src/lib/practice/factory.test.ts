import { describe, expect, it } from 'vitest';
import { gradeTranslation, pickCloze, pickMeaning } from './factory.js';
import type { LessonLine } from '#lib/data/types.js';
import type { DictEntry } from '#lib/data/dict.js';

const line: LessonLine = {
	i: 0,
	start: 0,
	end: 1,
	en: 'Last week I went to the theatre.',
	zh: '上周我去了剧院。'
};

/** 固定序列的伪随机，保证测试可复现 */
function seeded(values: number[]) {
	let index = 0;
	return () => values[index++ % values.length];
}

const pool = ['theatre', 'conversation', 'angrily', 'attention', 'seat', 'actor'];

describe('pickCloze', () => {
	it('挖出实词并给出四个选项，正确答案在里面', () => {
		const cloze = pickCloze(line, pool, seeded([0]), 4);
		expect(cloze).not.toBeNull();
		expect(cloze!.options).toHaveLength(4);
		expect(cloze!.options).toContain(cloze!.answer);
	});

	it('挖掉的部分能拼回原句的词', () => {
		const cloze = pickCloze(line, pool, seeded([0]))!;
		const rebuilt = `${cloze.before}${cloze.answer}${cloze.after}`.toLowerCase();
		expect(rebuilt).toBe(line.en.toLowerCase());
	});

	it('选项里没有重复项', () => {
		const cloze = pickCloze(line, pool, seeded([0, 0.3, 0.7]))!;
		expect(new Set(cloze.options).size).toBe(cloze.options.length);
	});

	it('词库太小时返回 null，调用方可以换句子', () => {
		expect(pickCloze(line, ['theatre'], seeded([0]))).toBeNull();
	});

	it('没有实词的句子返回 null', () => {
		const tiny: LessonLine = { ...line, en: 'I am a boy.' };
		expect(pickCloze(tiny, pool, seeded([0]))).toBeNull();
	});
});

describe('pickMeaning', () => {
	const entry: DictEntry = ['ˈsiːt', 'n. 座位', 'zk', 1];
	const dict: Array<[string, DictEntry]> = [
		['theatre', ['', 'n. 剧院', '', 1]],
		['angrily', ['', 'adv. 愤怒地', '', 0]],
		['attention', ['', 'n. 注意', '', 1]]
	];

	it('给出四个释义，正确答案在里面', () => {
		const meaning = pickMeaning('seat', entry, dict, seeded([0]), 4);
		expect(meaning).not.toBeNull();
		expect(meaning!.options).toHaveLength(4);
		expect(meaning!.options).toContain('n. 座位');
	});

	it('干扰项与正确答案不重复', () => {
		const meaning = pickMeaning('seat', entry, dict, seeded([0, 0.5]));
		expect(new Set(meaning!.options).size).toBe(meaning!.options.length);
	});

	it('没有释义时返回 null', () => {
		expect(pickMeaning('x', ['', '', '', 0], dict, seeded([0]))).toBeNull();
	});
});

describe('gradeTranslation', () => {
	it('完全一致判正确', () => {
		expect(gradeTranslation('I turned round.', 'i turned round').verdict).toBe('correct');
	});

	it('漏一个词判接近', () => {
		const result = gradeTranslation('I had a very good seat.', 'I had a good seat');
		expect(result.verdict).toBe('close');
		expect(result.score).toBeGreaterThan(0.7);
	});

	it('差太多判错误', () => {
		expect(gradeTranslation('I got very angry.', 'hello world').verdict).toBe('wrong');
	});

	it('返回可高亮的比对结果', () => {
		const result = gradeTranslation('I turned round.', 'I turned');
		expect(result.parts.some((part) => part.type === 'missing' && part.text === 'round')).toBe(
			true
		);
	});
});
