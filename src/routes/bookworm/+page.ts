import { shelfLevels } from '#lib/data/bookworm/index.js';

// 书架页和 bookworm/ 目录同名，静态托管上会有歧义，统一用目录索引的形式
export const trailingSlash = 'always';

export function load() {
	return { levels: shelfLevels() };
}
