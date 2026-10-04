import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const rootDir = import.meta.dirname;

/**
 * 开发期把 /audio 指到本地资源仓库，这样音频不必塞进 static/。
 * 简易静态服务，带 Range 支持（音频拖动进度条要用）。
 */
function mediaServer(): Plugin {
	return {
		name: 'nce-media-server',
		configureServer(server) {
			const dir = path.join(rootDir, 'nce-audio', 'audio');
			server.middlewares.use((req, res, next) => {
				if (!req.url?.startsWith('/audio/')) return next();
				const name = decodeURIComponent(req.url.slice('/audio/'.length).split('?')[0]);
				const file = path.resolve(dir, name);
				if (!file.startsWith(dir) || !existsSync(file)) return next();

				const size = statSync(file).size;
				const type = name.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg';
				res.setHeader('Accept-Ranges', 'bytes');
				res.setHeader('Content-Type', type);

				const match = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
				if (match) {
					const start = match[1] ? Number(match[1]) : 0;
					const end = match[2] ? Number(match[2]) : size - 1;
					res.statusCode = 206;
					res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
					res.setHeader('Content-Length', end - start + 1);
					createReadStream(file, { start, end }).pipe(res);
					return;
				}

				res.setHeader('Content-Length', size);
				createReadStream(file).pipe(res);
			});
		}
	};
}

// 自定义域名生效前，GitHub Pages 会把站点挂在 /nce-player 子路径下；
// 生效后站点在域名根目录。Actions 里的 configure-pages 会给出正确的 base。
function resolveBase(): '' | `/${string}` {
	const raw = process.env.BASE_PATH ?? '';
	return raw.startsWith('/') ? (raw as `/${string}`) : '';
}

const base = resolveBase();

export default defineConfig({
	plugins: [
		mediaServer(),
		VitePWA({
			registerType: 'autoUpdate',
			// SvelteKit 的页面由 adapter 单独产出，注册改在 +layout.svelte 里手动做
			injectRegister: false,
			// 插件默认写 dist/，这里对齐 SvelteKit 的客户端产物目录，adapter 才会带上
			outDir: '.svelte-kit/output/client',
			manifest: {
				name: '新概念英语 · 精听学习站',
				short_name: '新概念英语',
				description: '逐句点读、精确循环、中英对照、离线可用。',
				lang: 'zh-CN',
				display: 'standalone',
				background_color: '#f7f3ee',
				theme_color: '#b2532a',
				icons: [
					{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
					{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
					{
						src: 'icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				// 应用外壳（脚本、样式、图标）预缓存
				globPatterns: ['**/*.{js,css,svg,png,ico,txt,webmanifest}'],
				runtimeCaching: [
					{
						// 页面用 NetworkFirst：在线时拿最新的，断网时回落到缓存
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'NetworkFirst',
						options: {
							cacheName: 'nce-pages',
							networkTimeoutSeconds: 5,
							expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 }
						}
					},
					{
						// 课文音频体积大，听过即缓存
						urlPattern: /\.m4a(\?.*)?$/i,
						handler: 'CacheFirst',
						options: {
							cacheName: 'nce-audio',
							expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 180 },
							cacheableResponse: { statuses: [0, 200] },
							// 音频拖动进度条会发 Range 请求，必须支持
							rangeRequests: true
						}
					}
				]
			}
		}),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			paths: { base },

			// 全站静态预渲染：276 课各自产出一个 HTML，兼顾分享、SEO 与秒开。
			// strict 让"有路由没被预渲染"直接构建失败，避免线上才发现漏页。
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				fallback: undefined,
				precompress: false,
				strict: true
			})
		})
	]
});
