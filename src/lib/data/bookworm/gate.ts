/**
 * 书虫入口的密码门。
 *
 * 说明：这是**纯前端**的"挡一下"——密码会打包进 JS，数据本身也是公开的静态文件，
 * 只用来避免孩子随手点进去，不是真正的访问控制。
 */
export const GATE_PASSWORD = '261010';
export const GATE_KEY = 'nce:bw:unlocked';

export function isUnlocked(): boolean {
	try {
		return localStorage.getItem(GATE_KEY) === 'yes';
	} catch {
		return false;
	}
}

export function markUnlocked(): void {
	try {
		localStorage.setItem(GATE_KEY, 'yes');
	} catch {
		// 隐私模式下写不进去，本次会话仍然放行
	}
}

export function clearUnlocked(): void {
	try {
		localStorage.removeItem(GATE_KEY);
	} catch {
		// 忽略
	}
}
