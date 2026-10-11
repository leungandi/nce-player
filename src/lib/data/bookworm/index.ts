import shelfJson from './shelf.json';
import { resolve } from '$app/paths';

/**
 * 书虫的页面都用目录索引形式（`trailingSlash: 'always'`），
 * 因为书架页和 bookworm/ 目录同名，静态托管上会有歧义。
 */
export function shelfUrl(): string {
	return `${resolve('/bookworm')}/`;
}

export function bookUrl(id: string): string {
	return `${resolve('/bookworm/[id]', { id })}/`;
}

export function chapterUrl(id: string, no: number | string): string {
	return `${resolve('/bookworm/[id]/[no]', { id, no: String(no) })}/`;
}

export type ShelfBook = {
	id: string;
	level: string;
	title: string;
	titleZh: string;
	chapters: number;
	hasAudio: boolean;
	audioChapters: number;
	firstChapterTitle: string;
};

export type BookChapter = {
	no: number;
	title: string;
	paras: string[];
	/** 有音频时是相对资源根目录的路径，如 `bookworm/1A_01/1.m4a` */
	audio?: string;
};

export type BookwormBook = {
	id: string;
	level: string;
	title: string;
	titleZh: string;
	hasAudio: boolean;
	chapters: BookChapter[];
};

export const shelf = shelfJson.books as ShelfBook[];

/** 书架按级别分组，顺序固定（1A、1B、2A……） */
export function shelfLevels(): Array<{ level: string; books: ShelfBook[] }> {
	const levels = [...new Set(shelf.map((book) => book.level))].sort();
	return levels.map((level) => ({ level, books: shelf.filter((book) => book.level === level) }));
}

export function getShelfBook(id: string): ShelfBook | null {
	return shelf.find((book) => book.id === id) ?? null;
}

/**
 * 一本书的正文按需加载：一本书一个 JSON，预渲染时只取当前这本，
 * 不会把 49 本书全塞进每个页面的包里。
 */
const modules = import.meta.glob('./books/*.json');

export async function getBook(id: string): Promise<BookwormBook | null> {
	const loader = modules[`./books/${id}.json`];
	if (!loader) return null;
	const module = (await loader()) as { default: BookwormBook };
	return module.default;
}

/** 预测渲染用：全部章节的 (书号, 章号) 组合 */
export async function allChapterEntries(): Promise<Array<{ id: string; no: string }>> {
	const entries: Array<{ id: string; no: string }> = [];
	for (const item of shelf) {
		const book = await getBook(item.id);
		for (const chapter of book?.chapters ?? []) {
			entries.push({ id: item.id, no: String(chapter.no) });
		}
	}
	return entries;
}

/** 同一本书里相邻的章节，用于「上一章 / 下一章」 */
export function neighbours(book: BookwormBook, no: number) {
	const index = book.chapters.findIndex((chapter) => chapter.no === no);
	return {
		prev: index > 0 ? book.chapters[index - 1].no : null,
		next: index >= 0 && index < book.chapters.length - 1 ? book.chapters[index + 1].no : null
	};
}

/** 阅读进度、音频进度各存一处，都按「书 → 章」记 */
export const READ_KEY = (bookId: string) => `nce:bw:read:${bookId}`;
export const AUDIO_KEY = (bookId: string, no: number) => `nce:bw:audio:${bookId}:${no}`;
