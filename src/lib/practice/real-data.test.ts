import { describe, expect, it } from 'vitest';
import lesson from '#lib/data/lessons/nce2-01.json';
import dict from '#lib/data/dict.json';
import { pickCloze, pickMeaning } from './factory.js';
import type { LessonLine } from '#lib/data/types.js';
import type { DictEntry } from '#lib/data/dict.js';

const lines = (lesson as unknown as { lines: LessonLine[] }).lines;
const pool = Object.keys((dict as unknown as { words: Record<string, DictEntry> }).words);

describe('用真实课文数据验证题目生成', () => {
	it('第一册第一课大部分句子都能出完形填空', () => {
		const ok = lines.filter((line) => pickCloze(line, pool) !== null).length;
		expect(ok / lines.length).toBeGreaterThan(0.6);
	});

	it('词典池足够撑起四个选项', () => {
		expect(pool.length).toBeGreaterThan(100);
	});

	it('真实词条能生成词义选择题，且四个选项互不相同', () => {
		const entries = Object.entries(
			(dict as unknown as { words: Record<string, DictEntry> }).words
		).filter(([, entry]) => entry[1]);
		expect(entries.length).toBeGreaterThan(100);

		const [word, entry] = entries[0];
		const meaning = pickMeaning(word, entry, entries);
		expect(meaning).not.toBeNull();
		expect(new Set(meaning!.options).size).toBe(meaning!.options.length);
		expect(meaning!.options).toContain(entry[1]);
	});

	it('挖空后的前后文拼上答案等于原句', () => {
		for (const line of lines.slice(0, 8)) {
			const cloze = pickCloze(line, pool);
			if (!cloze) continue;
			const rebuilt = `${cloze.before}${cloze.answer}${cloze.after}`;
			expect(rebuilt.toLowerCase()).toBe(line.en.toLowerCase());
		}
	});
});
