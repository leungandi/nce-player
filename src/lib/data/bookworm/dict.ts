/** [音标, 释义, 考试标签, 是否核心词] */
export type DictEntry = [phonetic: string, translation: string, tag: string, common: number];

type Dictionary = {
	words: Record<string, DictEntry>;
	lemmas: Record<string, string>;
};

export type DictLookup = {
	word: string;
	entry: DictEntry | null;
	/** 命中原形时，这里是原形词 */
	via?: string;
};

let pending: Promise<Dictionary> | null = null;

/** 书虫的词典 830 KB 左右，按需加载，不进首屏包。 */
function load(): Promise<Dictionary> {
	pending ??= import('./dict.json').then((module) => module.default as unknown as Dictionary);
	return pending;
}

/**
 * 查词。顺序和 NCE 那边一致：
 * 原样 → 缩写回退（it's → it）→ 查原形（buying → buy）。
 */
export async function lookupBookworm(raw: string): Promise<DictLookup> {
	const dict = await load();
	const word = raw.toLowerCase();

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
