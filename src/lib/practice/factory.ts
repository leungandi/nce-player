import type { LessonLine } from '#lib/data/types.js';
import type { DictEntry } from '#lib/data/dict.js';
import { accuracy, diffWords } from '#lib/text/diff.js';
import type { DiffPart } from '#lib/text/diff.js';
import { tokenize } from '#lib/text/tokenize.js';

export type Random = () => number;

/** 太短或太常见的词不适合挖空。 */
const STOPWORDS = new Set([
	'a',
	'an',
	'the',
	'and',
	'or',
	'but',
	'of',
	'to',
	'in',
	'on',
	'at',
	'for',
	'with',
	'is',
	'was',
	'were',
	'are',
	'am',
	'be',
	'been',
	'it',
	'its',
	'this',
	'that',
	'these',
	'those',
	'i',
	'you',
	'he',
	'she',
	'we',
	'they',
	'my',
	'your',
	'his',
	'her',
	'their',
	'as',
	'by',
	'from',
	'not',
	'no',
	'so',
	'if',
	'then',
	'than',
	'there',
	'here',
	'when',
	'where',
	'what',
	'who',
	'how',
	'why'
]);

function pick<T>(items: T[], random: Random): T {
	return items[Math.floor(random() * items.length)];
}

function shuffle<T>(items: T[], random: Random): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

export type Cloze = {
	line: LessonLine;
	before: string;
	answer: string;
	after: string;
	options: string[];
};

/**
 * 完形填空：从句子中挑一个实词挖掉，干扰项取同册其它词。
 * 抽不出合适的词（句子太短、没有实词）时返回 null，调用方换一句。
 */
export function pickCloze(
	line: LessonLine,
	pool: string[],
	random: Random = Math.random,
	optionCount = 4
): Cloze | null {
	const tokens = tokenize(line.en);
	const candidates = tokens
		.map((token, index) => ({ token, index }))
		.filter(
			({ token }) =>
				token.word && token.text.length >= 4 && !STOPWORDS.has(token.text.toLowerCase())
		);
	if (!candidates.length) return null;

	const chosen = pick(candidates, random);
	const answer = chosen.token.text.toLowerCase();

	const poolWords = Array.from(
		new Set(
			pool
				.map((word) => word.toLowerCase())
				.filter((word) => word !== answer && !STOPWORDS.has(word) && word.length >= 3)
		)
	);
	if (poolWords.length < optionCount - 1) return null;

	const distractors = shuffle(poolWords, random).slice(0, optionCount - 1);
	const options = shuffle([answer, ...distractors], random);

	const before = tokens
		.slice(0, chosen.index)
		.map((token) => token.text)
		.join('');
	const after = tokens
		.slice(chosen.index + 1)
		.map((token) => token.text)
		.join('');

	return { line, before, answer, after, options };
}

export type Meaning = {
	word: string;
	phonetic: string;
	options: string[];
	answer: string;
};

/** 词义选择：给英文选中文释义，干扰项取同册其它词的释义。 */
export function pickMeaning(
	word: string,
	entry: DictEntry,
	pool: Array<[string, DictEntry]>,
	random: Random = Math.random,
	optionCount = 4
): Meaning | null {
	const answer = entry[1];
	if (!answer) return null;

	const distractors = Array.from(
		new Set(
			pool
				.filter(
					([other, otherEntry]) =>
						other !== word && otherEntry[1] && otherEntry[1] !== answer
				)
				.map(([, otherEntry]) => otherEntry[1])
		)
	);
	if (distractors.length < optionCount - 1) return null;

	const options = shuffle(
		[answer, ...shuffle(distractors, random).slice(0, optionCount - 1)],
		random
	);
	return { word, phonetic: entry[0], options, answer };
}

export type Verdict = 'correct' | 'close' | 'wrong';

export type TranslationResult = {
	score: number;
	verdict: Verdict;
	parts: DiffPart[];
};

/**
 * 中译英判分：按词对齐算正确率。
 * 全对给 correct，八成以上算 close（再看一眼），其余算 wrong。
 */
export function gradeTranslation(target: string, input: string): TranslationResult {
	const parts = diffWords(target, input);
	const score = accuracy(parts);
	const verdict: Verdict = score >= 0.999 ? 'correct' : score >= 0.8 ? 'close' : 'wrong';
	return { score, verdict, parts };
}
