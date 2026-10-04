import { asset } from '$app/paths';

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
	return asset(src as Parameters<typeof asset>[0]);
}
