import { asset } from '$app/paths';

const configured = import.meta.env.VITE_MEDIA_BASE as string | undefined;
/** 生产环境默认走独立资源仓库；开发环境留空，交给 vite 中间件。 */
const MEDIA_BASE = (
	configured ?? (import.meta.env.DEV ? '' : 'https://leungandi.github.io/nce-audio')
).replace(/\/+$/, '');

/**
 * 解析音频等静态资源的地址：
 * - 外部链接（http/https）原样返回，方便以后把音频挪到独立资源域名
 * - 站内路径补上 Pages 的 base 前缀
 *
 * asset() 的类型签名只接受构建期已知的静态路径，而我们的路径来自课文数据，
 * 所以这里做一次收窄转换。
 */
export function mediaUrl(src: string): string {
	if (/^https?:\/\//i.test(src)) return src;
	if (MEDIA_BASE) return `${MEDIA_BASE}/${src.replace(/^\/+/, '')}`;
	return asset(src as Parameters<typeof asset>[0]);
}
