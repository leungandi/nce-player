import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// 自定义域名生效前，GitHub Pages 会把站点挂在 /nce-player 子路径下；
// 生效后站点在域名根目录。Actions 里的 configure-pages 会给出正确的 base。
function resolveBase(): '' | `/${string}` {
	const raw = process.env.BASE_PATH ?? '';
	return raw.startsWith('/') ? (raw as `/${string}`) : '';
}

const base = resolveBase();

export default defineConfig({
	plugins: [
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
