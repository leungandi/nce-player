import { error } from '@sveltejs/kit';
import { books, getBook } from '#lib/data/index.js';

export function entries() {
	return books.map((book) => ({ key: book.key }));
}

export function load({ params }) {
	const book = getBook(params.key);
	if (!book) {
		error(404, '没有这一册');
	}
	return { book };
}
