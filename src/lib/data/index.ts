import catalogJson from './catalog.json';
import type { Lesson } from './types';

export type CatalogLesson = { id: string; no: number; title: string };
export type CatalogBook = {
	key: string;
	name: string;
	titleEn?: string;
	lessons: CatalogLesson[];
};

/** 课文清单由数据管线生成（tools/build-book.mjs），体积很小，随页面一起打包。 */
export const books = (catalogJson.books ?? []) as CatalogBook[];

/**
 * 课文正文按需加载：一课一个 JSON，预渲染时只取当前课，
 * 不会把整册课文塞进每个页面的包里。
 */
const lessonModules = import.meta.glob('./lessons/*.json');

export async function getLesson(id: string): Promise<Lesson | null> {
	const loader = lessonModules[`./lessons/${id}.json`];
	if (!loader) return null;
	const module = (await loader()) as { default: Lesson };
	return module.default;
}

export function getBook(key: string): CatalogBook | null {
	return books.find((book) => book.key === key) ?? null;
}

/** 同一册里相邻的课，用于"上一课 / 下一课"。 */
export function getNeighbours(id: string): {
	prev: CatalogLesson | null;
	next: CatalogLesson | null;
} {
	for (const book of books) {
		const index = book.lessons.findIndex((lesson) => lesson.id === id);
		if (index >= 0) {
			return {
				prev: book.lessons[index - 1] ?? null,
				next: book.lessons[index + 1] ?? null
			};
		}
	}
	return { prev: null, next: null };
}

export function lessonIds(): string[] {
	return books.flatMap((book) => book.lessons.map((lesson) => lesson.id));
}
