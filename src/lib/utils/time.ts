/** 把秒数格式化成 `m:ss`，与播放器时间显示一致。 */
export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const minutes = Math.floor(total / 60);
	const rest = total % 60;
	return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** 把数值夹在 [min, max] 之间。 */
export function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min;
	if (max < min) return min;
	return Math.min(Math.max(value, min), max);
}
