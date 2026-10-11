import { error } from '@sveltejs/kit';
import { allChapterEntries, getBook, neighbours } from '#lib/data/bookworm/index.js';

export const trailingSlash = 'always';

export function entries() {
	return allChapterEntries();
}

export async function load({ params }) {
	const book = await getBook(params.id);
	const no = Number(params.no);
	const chapter = book?.chapters.find((item) => item.no === no);
	if (!book || !chapter) {
		error(404, '没有这一章');
	}
	return {
		bookId: book.id,
		bookTitle: book.title || book.id,
		chapter,
		...neighbours(book, no)
	};
}
