export type Token = { word: boolean; text: string };

/**
 * 把一句英文切成"单词 / 其他"两种片段，供点词查词典用。
 * 保留字母、撇号（don't）和连字符（well-known）。
 */
export function tokenize(text: string): Token[] {
	const tokens: Token[] = [];
	const pattern = /[A-Za-z][A-Za-z''-]*/g;
	let last = 0;
	for (const match of text.matchAll(pattern)) {
		const at = match.index ?? 0;
		if (at > last) tokens.push({ word: false, text: text.slice(last, at) });
		tokens.push({ word: true, text: match[0] });
		last = at + match[0].length;
	}
	if (last < text.length) tokens.push({ word: false, text: text.slice(last) });
	return tokens;
}

/** 拼回原句，用来验证切词没有丢字符。 */
export function joinTokens(tokens: Token[]): string {
	return tokens.map((token) => token.text).join('');
}
