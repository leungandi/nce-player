import type { LessonLine } from '#lib/data/types.js';

/** 播放速度档位。 */
export const SPEEDS = [0.5, 0.6, 0.75, 1, 1.25, 1.5, 2] as const;
export type Speed = (typeof SPEEDS)[number];

/**
 * 循环模式，与参考实现保持同样的五档：
 * off  关闭循环
 * click 单句点读：点一句播一句，播完停在句尾
 * one  单句循环：点一句反复播这一句
 * list 本课循环：整课播完从头再来
 * book 本书循环：播完自动进入下一课
 */
export const LOOP_MODES = ['off', 'click', 'one', 'list', 'book'] as const;
export type LoopMode = (typeof LOOP_MODES)[number];

export const LOOP_LABELS: Record<LoopMode, string> = {
	off: '关闭循环',
	click: '单句点读',
	one: '单句循环',
	list: '本课循环',
	book: '本书循环'
};

/** 中英对照显示方式。 */
export const TRANSLATION_MODES = ['both', 'en', 'zh', 'blur'] as const;
export type TranslationMode = (typeof TRANSLATION_MODES)[number];

export const TRANSLATION_LABELS: Record<TranslationMode, string> = {
	both: '中英对照',
	en: '仅英文',
	zh: '仅中文',
	blur: '模糊中文'
};

/** 单句循环只在这两种模式下生效。 */
export function isSentenceLocked(mode: LoopMode): boolean {
	return mode === 'click' || mode === 'one';
}

/**
 * 二分查找当前句。
 * 落在句间空隙时返回上一句，这样高亮不会在停顿里来回跳。
 */
export function indexByTime(lines: Array<Pick<LessonLine, 'start'>>, time: number): number {
	let low = 0;
	let high = lines.length - 1;
	let found = -1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		if (lines[mid].start <= time) {
			found = mid;
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return found;
}

/** 把索引夹在有效范围内。 */
export function clampIndex(index: number, total: number): number {
	if (total <= 0) return -1;
	return Math.min(Math.max(index, 0), total - 1);
}

/** 在固定档位里取下一项，用于按钮循环切换。 */
export function cycle<T>(list: readonly T[], current: T): T {
	const index = list.indexOf(current);
	return list[(index + 1) % list.length];
}
