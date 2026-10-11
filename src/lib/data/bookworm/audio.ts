/**
 * 书虫音频的地址解析。
 *
 * NCE 的音频和书虫的音频放在两个不同的仓库/域名上，所以这里单独一套，
 * 不去共用 `mediaUrl()`（那个是给 NCE 音频用的）。
 *
 * `VITE_BOOKWORM_MEDIA_BASE` 决定音频域名：
 *   生产构建   → 音频仓库的域名（见 .github/workflows/deploy.yml）
 *   开发/本地  → 留空或填 `/`，走同源，音频由 static/bookworm/ 直接提供
 */
const configured = import.meta.env.VITE_BOOKWORM_MEDIA_BASE as string | undefined;
const BASE = (configured ?? (import.meta.env.DEV ? '' : 'https://bookworm-audio.loveyy.net')).replace(
	/\/+$/,
	''
);

export function bookwormAudioUrl(src: string): string {
	if (/^https?:\/\//i.test(src)) return src;
	return `${BASE}/${src.replace(/^\/+/, '')}`;
}
