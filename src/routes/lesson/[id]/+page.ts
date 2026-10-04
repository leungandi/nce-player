import { error } from '@sveltejs/kit';
import { getLesson, getNeighbours, lessonIds } from '#lib/data/index.js';

/** 让 adapter-static 知道要把哪些课预渲染出来。 */
export function entries() {
	return lessonIds().map((id) => ({ id }));
}

export async function load({ params }) {
	const lesson = await getLesson(params.id);
	if (!lesson) {
		error(404, '没有这一课');
	}
	return { lesson, ...getNeighbours(params.id) };
}
