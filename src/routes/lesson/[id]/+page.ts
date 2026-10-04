import { error } from '@sveltejs/kit';
import { getLesson, getNeighbours, lessons } from '#lib/data/index.js';

/** 让 adapter-static 知道要把哪些课预渲染出来。 */
export function entries() {
	return lessons.map((lesson) => ({ id: lesson.id }));
}

export function load({ params }) {
	const lesson = getLesson(params.id);
	if (!lesson) {
		error(404, '没有这一课');
	}
	return { lesson, ...getNeighbours(params.id) };
}
