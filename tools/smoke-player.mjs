/**
 * 播放器冒烟测试：用无头浏览器驱动真实页面，验证两条容易回归的行为——
 *   1. 听写 / 背诵 / 跟读里点播放，只播当前这一句，到句尾自动停；
 *   2. 本书循环播完一课，自动切到下一课并接着播。
 *
 * 做法是把 HTMLMediaElement.play 换成探针，并用 rAF 循环读取的 currentTime 做假，
 * 所以不需要真实音频设备，也不需要能连上音频仓库。
 *
 * 前置：先 `npm run build`，再 `node tools/serve-build.mjs`（默认 4174 端口）。
 * 运行：node tools/smoke-player.mjs
 * 非 Windows 或 Edge 装在别处时，用环境变量 EDGE_PATH 指定浏览器路径。
 */
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE =
	process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const PAGE = 'http://127.0.0.1:4174/lesson/nce2-01';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = await mkdtemp(path.join(tmpdir(), 'nce-e2e-'));
const edge = spawn(
	EDGE,
	[
		'--headless=new',
		'--disable-gpu',
		'--no-sandbox',
		'--mute-audio',
		`--remote-debugging-port=${PORT}`,
		`--user-data-dir=${profile}`,
		'about:blank'
	],
	{ stdio: 'ignore' }
);

let ready = false;
for (let i = 0; i < 60 && !ready; i += 1) {
	try {
		const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
		ready = response.ok;
	} catch {
		await sleep(250);
	}
}
if (!ready) {
	console.log('DevTools 没起来');
	edge.kill();
	process.exit(1);
}

const target = await (
	await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })
).json();

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));

let nextId = 1;
const pending = new Map();
const problems = [];

socket.addEventListener('message', (event) => {
	const message = JSON.parse(event.data);
	if (message.id && pending.has(message.id)) {
		pending.get(message.id)(message);
		pending.delete(message.id);
		return;
	}
	if (message.method === 'Runtime.exceptionThrown') {
		const details = message.params.exceptionDetails;
		problems.push('JS 异常: ' + (details.exception?.description ?? details.text));
	}
	if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
		problems.push('console.error: ' + message.params.args.map((a) => a.value ?? a.description).join(' '));
	}
});

function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve) => {
		pending.set(id, resolve);
		socket.send(JSON.stringify({ id, method, params }));
	});
}

async function evaluate(expression) {
	const response = await send('Runtime.evaluate', {
		expression,
		awaitPromise: true,
		returnByValue: true
	});
	const details = response.result?.exceptionDetails;
	if (details) return '表达式报错: ' + (details.exception?.description ?? details.text);
	return response.result?.result?.value;
}

await send('Runtime.enable');
await send('Page.enable');
await sleep(3000);

console.log('=== 1. 页面基本状态 ===');
console.log('  标题      ', await evaluate('document.title'));
console.log('  模式按钮  ', await evaluate(`[...document.querySelectorAll('.seg')].map(b=>b.textContent.trim()).join(' / ')`));

// 给 play() 装探针，记录调用次数与目标位置
await evaluate(`
	window.__plays = [];
	HTMLMediaElement.prototype.play = function () {
		window.__plays.push({ at: Number(this.currentTime.toFixed(2)), src: this.src.split('/').pop() });
		return Promise.resolve();
	};
	true
`);

console.log('\n=== 2. 听写模式：点"播放这一句"应只播一句 ===');
await evaluate(`[...document.querySelectorAll('.seg')].find(b=>b.textContent.includes('听写'))?.click(); true`);
await sleep(400);
console.log('  面板内容  ', String(await evaluate(`document.querySelector('.pane')?.textContent?.trim().slice(0,24) ?? '(空)'`)));
await evaluate(`
  const button = [...document.querySelectorAll('.pane button')].find(b => b.textContent.includes('播放'));
  button?.click();
  true
`);
await sleep(300);
console.log('  play 调用 ', await evaluate('JSON.stringify(window.__plays)'));

console.log('\n=== 2b. 假装播到句尾，应当自动暂停 ===');
await evaluate(`
	const audio = document.querySelector('audio');
	window.__t = 9.77;
	Object.defineProperty(audio, 'currentTime', {
		configurable: true,
		get: () => window.__t,
		set: (value) => { window.__t = value; }
	});
	window.__pausedAt = [];
	const originalPause = audio.pause.bind(audio);
	audio.pause = () => { window.__pausedAt.push(Number(window.__t.toFixed(2))); originalPause(); };
	audio.dispatchEvent(new Event('play'));   // 让 rAF 循环跑起来
	true
`);
await sleep(120);
await evaluate('window.__t = 13.95; true'); // 第一句 end 是 13.912，刚越过一点
await sleep(200);
console.log(
	'  已暂停    ',
	await evaluate('window.__pausedAt.length > 0'),
	'（停在',
	await evaluate('JSON.stringify(window.__pausedAt)'),
	'，句尾是 13.912）'
);

console.log('\n=== 3. 切回精听并打开"本书循环" ===');
await evaluate(`[...document.querySelectorAll('.seg')].find(b=>b.textContent.includes('精听'))?.click(); true`);
await sleep(300);
for (let i = 0; i < 4; i += 1) {
	await evaluate(`document.querySelectorAll('.toolbar button')[0]?.click(); true`);
	await sleep(120);
}
console.log('  循环按钮  ', await evaluate(`document.querySelectorAll('.toolbar button')[0]?.textContent.trim()`));

console.log('\n=== 4. 模拟本课播完，应自动进下一课 ===');
await evaluate(`window.__plays = []; document.querySelector('audio').dispatchEvent(new Event('ended')); true`);
await sleep(2000);
console.log('  地址      ', await evaluate('location.pathname'));
console.log('  待续播标记', await evaluate(`sessionStorage.getItem('nce:autoplay')`));
console.log('  页面标题  ', await evaluate('document.title'));

console.log('\n=== 5. 新课程音频就绪后应自动播放 ===');
await evaluate(`document.querySelector('audio').dispatchEvent(new Event('loadedmetadata')); true`);
await sleep(300);
console.log('  play 调用 ', await evaluate('JSON.stringify(window.__plays)'));
console.log('  标记已清  ', await evaluate(`sessionStorage.getItem('nce:autoplay')`));

console.log('\n=== 6. 运行期报错 ===');
console.log(problems.length ? problems.join('\n') : '  无');

socket.close();
edge.kill();
