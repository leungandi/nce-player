import type { Lesson } from './types';
import nce201 from './lessons/nce2-01.json';

/**
 * 课文数据随站点一起构建，因此每一课都能预渲染成静态 HTML（可分享、可被搜索）。
 * JSON 体积很小（一课几 KB），音频另放，不进代码仓库。
 *
 * TODO(阶段 2)：这份清单由数据管线自动生成，目前是手工维护。
 */
export const lessons: Lesson[] = [nce201 as unknown as Lesson];

export function getLesson(id: string): Lesson | null {
	return lessons.find((lesson) => lesson.id === id) ?? null;
}

/** 同一册里相邻的课，用于"上一课 / 下一课"。 */
export function getNeighbours(id: string): { prev: Lesson | null; next: Lesson | null } {
	const index = lessons.findIndex((lesson) => lesson.id === id);
	if (index < 0) return { prev: null, next: null };
	return {
		prev: lessons[index - 1] ?? null,
		next: lessons[index + 1] ?? null
	};
}
