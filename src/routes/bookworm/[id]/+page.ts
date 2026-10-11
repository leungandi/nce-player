import { error } from '@sveltejs/kit';
import { getBook, getShelfBook, shelf } from '#lib/data/bookworm/index.js';

export const trailingSlash = 'always';

export function entries() {
	return shelf.map((book) => ({ id: book.id }));
}

export async function load({ params }) {
	const book = await getBook(params.id);
	if (!book) {
		error(404, '没有这本书');
	}
	return { book, info: getShelfBook(params.id) };
}
