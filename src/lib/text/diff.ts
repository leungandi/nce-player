export type DiffPart = {
	/** same 对上了；missing 漏了；extra 多打了 */
	type: 'same' | 'missing' | 'extra';
	text: string;
};

/** 只取单词，忽略大小写，用于比对。 */
function words(text: string): string[] {
	return (text.match(/[A-Za-z0-9][A-Za-z0-9''-]*/g) ?? []).map((word) => word.toLowerCase());
}

/**
 * 按单词做最长公共子序列对齐，比对听写结果。
 * 标点不参与比对，只看词对不对。
 */
export function diffWords(target: string, input: string): DiffPart[] {
	const a = words(target);
	const b = words(input);
	const rows = a.length + 1;
	const cols = b.length + 1;

	// LCS 长度表
	const table: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			table[i][j] =
				a[i] === b[j]
					? table[i + 1][j + 1] + 1
					: Math.max(table[i + 1][j], table[i][j + 1]);
		}
	}

	const parts: DiffPart[] = [];
	const push = (type: DiffPart['type'], text: string) => {
		const last = parts[parts.length - 1];
		if (last && last.type === type) last.text = `${last.text} ${text}`;
		else parts.push({ type, text });
	};

	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			push('same', a[i]);
			i += 1;
			j += 1;
		} else if (table[i + 1][j] >= table[i][j + 1]) {
			push('missing', a[i]);
			i += 1;
		} else {
			push('extra', b[j]);
			j += 1;
		}
	}
	while (i < a.length) {
		push('missing', a[i]);
		i += 1;
	}
	while (j < b.length) {
		push('extra', b[j]);
		j += 1;
	}

	return parts;
}

/** 听写正确率：对上的词占原句词数的比例。 */
export function accuracy(parts: DiffPart[]): number {
	const total = parts
		.filter((part) => part.type !== 'extra')
		.reduce((sum, part) => sum + part.text.split(' ').length, 0);
	if (!total) return 0;
	const hit = parts
		.filter((part) => part.type === 'same')
		.reduce((sum, part) => sum + part.text.split(' ').length, 0);
	return hit / total;
}
