/**
 * 本地预览：把 build/ 目录按静态站点服务出来。
 *
 * 比 `npm run preview` 更可靠——vite preview 在重建之后会继续服务旧的文件索引，
 * 新构建出的带哈希资源会 404。这个脚本每次请求都直接读磁盘。
 *
 * 用法：npm run build && node tools/serve-build.mjs [port]
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'build');
const PORT = Number(process.argv[2] ?? 4174);
/** 手机要能访问就绑 0.0.0.0；只想本机看就传 127.0.0.1 */
const HOST = process.argv[3] ?? '0.0.0.0';

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.m4a': 'audio/mp4',
	'.mp3': 'audio/mpeg',
	'.webmanifest': 'application/manifest+json',
	'.txt': 'text/plain; charset=utf-8'
};

createServer((request, response) => {
	let pathname = decodeURIComponent((request.url ?? '/').split('?')[0]);
	if (pathname.endsWith('/')) pathname += 'index.html';

	let file = path.join(BUILD, pathname);
	if (!file.startsWith(BUILD)) {
		response.writeHead(403).end('forbidden');
		return;
	}
	// 先看目录索引，再回落到同名 .html（目录不算命中，否则同名页面会被吃掉）
	if (existsSync(file) && statSync(file).isDirectory()) {
		const index = path.join(file, 'index.html');
		file = existsSync(index) ? index : `${file}.html`;
	} else if (!existsSync(file)) {
		file = `${file}.html`;
	}
	if (!existsSync(file) || statSync(file).isDirectory()) {
		response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
		return;
	}

	response.writeHead(200, {
		'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream'
	});
	createReadStream(file).pipe(response);
}).listen(PORT, HOST, () => {
	console.log(`serving ${BUILD} on http://${HOST}:${PORT}/`);
});
