export type RevealLevel = 0 | 1 | 2;

const WORD = /[A-Za-z][A-Za-z''-]*/g;

/**
 * 背诵提示的遮词：
 * 0 全显示；1 只留首字母（`Last` → `L___`）；2 全部遮掉但保留长度。
 * 标点、空格原样保留，方便靠节奏和长度回忆。
 */
export function maskSentence(text: string, level: RevealLevel): string {
	if (level === 0) return text;
	return text.replace(WORD, (word) => {
		if (level === 2) return '_'.repeat(word.length);
		const rest = word.slice(1).replace(/['-]/g, '');
		return word[0] + '_'.repeat(rest.length);
	});
}

/** 这一句是否已经全部遮住了（用来判断要不要给"显示答案"）。 */
export function isMasked(text: string, level: RevealLevel): boolean {
	return level > 0 && maskSentence(text, level) !== text;
}
