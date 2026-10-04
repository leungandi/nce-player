/** [音标, 释义, 考试标签, 是否核心词] */
export type DictEntry = [phonetic: string, translation: string, tag: string, common: number];

export type Dictionary = {
	words: Record<string, DictEntry>;
	lemmas: Record<string, string>;
};

export type Lookup = {
	/** 原始的单词（小写） */
	word: string;
	entry: DictEntry | null;
	/** 命中原形时，这里是原形词 */
	via?: string;
};

let pending: Promise<Dictionary> | null = null;

/** 词典 260 KB 左右，按需加载，不进首屏包。 */
export function loadDict(): Promise<Dictionary> {
	pending ??= import('./dict.json').then((module) => module.default as unknown as Dictionary);
	return pending;
}

export async function lookup(raw: string): Promise<Lookup> {
	const dict = await loadDict();
	const word = raw.toLowerCase();

	// 缩写先按原样查，查不到再退到词根（it's → it，don't → do）
	const candidates = [word];
	if (word.endsWith("'s")) candidates.push(word.slice(0, -2));
	if (word.endsWith("n't")) candidates.push(word.slice(0, -3));
	if (word.endsWith("'re")) candidates.push(word.slice(0, -3));
	if (word.endsWith("'ve")) candidates.push(word.slice(0, -3));
	if (word.endsWith("'ll")) candidates.push(word.slice(0, -3));
	if (word.endsWith("'d")) candidates.push(word.slice(0, -2));

	for (const candidate of candidates) {
		const direct = dict.words[candidate];
		if (direct) {
			return candidate === word ? { word, entry: direct } : { word, entry: direct, via: candidate };
		}
		const base = dict.lemmas[candidate];
		if (base && dict.words[base]) {
			return { word, entry: dict.words[base], via: base };
		}
	}

	return { word, entry: null };
}
