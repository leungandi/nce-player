import { asset } from '$app/paths';

const configured = import.meta.env.VITE_MEDIA_BASE as string | undefined;
/**
 * 音频托管域名。构建时由工作流传入 `VITE_MEDIA_BASE`（见 .github/workflows/deploy.yml），
 * 那才是唯一的事实来源；这里的默认值只是不带环境变量直接跑生产构建时的兜底。
 * 开发环境留空，交给 vite 中间件指向本地资源仓库。
 */
const MEDIA_BASE = (
	configured ?? (import.meta.env.DEV ? '' : 'https://nce-audio.loveyy.net')
).replace(/\/+$/, '');

/**
 * 解析**音频**的地址（资源仓库那份），不要拿它解析站点自带的静态文件，
 * 站点里的图片、图标请用 `$app/paths` 的 `asset()`。
 *
 * 规则：
 * - 外部链接（http/https）原样返回，方便以后把音频挪到独立资源域名
 * - 配了 `VITE_MEDIA_BASE` 就拼资源域名
 * - 没配（开发环境）就回落到站内路径，由 vite 中间件代管
 *
 * asset() 的类型签名只接受构建期已知的静态路径，而我们的路径来自课文数据，
 * 所以这里做一次收窄转换。
 */
export function mediaUrl(src: string): string {
	if (/^https?:\/\//i.test(src)) return src;
	if (MEDIA_BASE) return `${MEDIA_BASE}/${src.replace(/^\/+/, '')}`;
	return asset(src as Parameters<typeof asset>[0]);
}
