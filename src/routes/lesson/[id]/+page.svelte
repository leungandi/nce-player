<script lang="ts">
	import { resolve } from '$app/paths';
	import { mediaUrl } from '#lib/data/assetUrl.js';
	import { lookup } from '#lib/data/dict.js';
	import type { Lookup } from '#lib/data/dict.js';
	import { add as addWord, addedSet, remove as removeWord } from '#lib/store/wordbook.js';
	import { tokenize } from '#lib/text/tokenize.js';
	import Dictation from '#lib/lesson/Dictation.svelte';
	import Recitation from '#lib/lesson/Recitation.svelte';
	import Shadowing from '#lib/lesson/Shadowing.svelte';
	import {
		clampIndex,
		cycle,
		indexByTime,
		isSentenceLocked,
		LOOP_LABELS,
		LOOP_MODES,
		SPEEDS,
		TRANSLATION_LABELS,
		TRANSLATION_MODES
	} from '#lib/player/playback.js';
	import type { LoopMode, TranslationMode } from '#lib/player/playback.js';
	import { formatTime } from '#lib/utils/time.js';
	import { onMount } from 'svelte';

	let { data } = $props();

	const lesson = $derived(data.lesson);
	const lines = $derived(lesson.lines);
	const audioSrc = $derived(mediaUrl(lesson.audio.src));
	const progressKey = $derived(`nce:progress:${lesson.id}`);

	let audioEl = $state<HTMLAudioElement | null>(null);
	let scroller = $state<HTMLElement | null>(null);
	let lineEls = $state<HTMLElement[]>([]);

	let currentTime = $state(0);
	let duration = $state(0);
	let playing = $state(false);
	let seeking = $state(false);
	let lockedIndex = $state(-1);
	let loopMode = $state<LoopMode>('off');
	let translation = $state<TranslationMode>('both');
	let rate = $state(1);
	/** 睡眠定时器：0 表示关闭 */
	let sleepMinutes = $state(0);
	let sleepDeadline = $state(0);
	let sleepLeft = $state(0);
	let pendingSeek = 0;

	type Mode = 'listen' | 'dictation' | 'recite' | 'shadow';
	const MODES: Array<{ value: Mode; label: string }> = [
		{ value: 'listen', label: '精听' },
		{ value: 'dictation', label: '听写' },
		{ value: 'recite', label: '背诵' },
		{ value: 'shadow', label: '跟读' }
	];
	let mode = $state<Mode>('listen');

	function pauseAudio() {
		audioEl?.pause();
	}

	const tokenized = $derived(lines.map((line) => tokenize(line.en)));

	let activeWord = $state<Lookup | null>(null);
	let activeToken = $state('');
	let activeLine = $state(-1);
	let looking = $state(false);
	let wordSet = $state<Set<string>>(new Set());

	async function openWord(raw: string, lineIndex: number) {
		activeToken = raw;
		activeLine = lineIndex;
		looking = true;
		try {
			activeWord = await lookup(raw);
		} finally {
			looking = false;
		}
	}

	function closeWord() {
		activeWord = null;
		activeToken = '';
		activeLine = -1;
	}

	function toggleWord() {
		if (!activeWord) return;
		const key = activeWord.word;
		if (wordSet.has(key)) {
			removeWord(key);
		} else {
			addWord({
				w: key,
				base: activeWord.via,
				phonetic: activeWord.entry?.[0] ?? '',
				translation: activeWord.entry?.[1] ?? '',
				tag: activeWord.entry?.[2] ?? '',
				lesson: lesson.id,
				line: activeLine,
				ctx: lines[activeLine]?.en ?? ''
			});
		}
		wordSet = addedSet();
	}

	const SLEEP_OPTIONS: number[] = [0, 5, 10, 15, 20, 30, 45, 60];

	const sleepLabel = $derived(
		sleepMinutes > 0 ? `剩余 ${formatTime(Math.ceil(sleepLeft / 1000))}` : '关闭'
	);

	/** 锁定模式下高亮锁定的那句，否则按播放时间走。 */
	const activeIndex = $derived(
		isSentenceLocked(loopMode) && lockedIndex >= 0 ? lockedIndex : indexByTime(lines, currentTime)
	);

	/* ---------- 播放控制 ---------- */

	let rafId = 0;

	function startTicking() {
		cancelAnimationFrame(rafId);
		const step = () => {
			if (audioEl && !seeking) {
				currentTime = audioEl.currentTime;
			}
			enforceSentenceLoop();
			checkSleepTimer();
			syncPositionState();
			rafId = requestAnimationFrame(step);
		};
		rafId = requestAnimationFrame(step);
	}

	/** 睡眠定时器到点就暂停，并把定时器复位。 */
	function checkSleepTimer() {
		if (!sleepDeadline) return;
		const left = sleepDeadline - Date.now();
		sleepLeft = Math.max(0, left);
		if (left <= 0) {
			sleepDeadline = 0;
			sleepMinutes = 0;
			sleepLeft = 0;
			audioEl?.pause();
			if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
		}
	}

	function setSleep(minutes: number) {
		sleepMinutes = minutes;
		sleepDeadline = minutes > 0 ? Date.now() + minutes * 60_000 : 0;
		sleepLeft = minutes > 0 ? minutes * 60_000 : 0;
	}

	function cycleSleep() {
		setSleep(cycle(SLEEP_OPTIONS, sleepMinutes));
	}

	function stopTicking() {
		cancelAnimationFrame(rafId);
		rafId = 0;
	}

	/**
	 * 句级循环。用 requestAnimationFrame 每帧判断，比 timeupdate（约 4 次/秒）
	 * 精确得多；参考实现用 timeupdate，所以句尾容易叠进下一句的开头。
	 */
	function enforceSentenceLoop() {
		if (!audioEl) return;
		const locked = isSentenceLocked(loopMode) ? lockedIndex : -1;
		if (locked < 0) return;
		const line = lines[locked];
		if (audioEl.currentTime >= line.end) {
			audioEl.currentTime = line.start;
			currentTime = line.start;
			if (loopMode === 'click') audioEl.pause();
		}
	}

	function activateLine(index: number) {
		if (!audioEl) return;
		const target = clampIndex(index, lines.length);
		if (target < 0) return;
		lockedIndex = isSentenceLocked(loopMode) ? target : -1;
		audioEl.currentTime = lines[target].start;
		currentTime = lines[target].start;
		void audioEl.play();
	}

	function togglePlay() {
		if (!audioEl) return;
		if (audioEl.paused) void audioEl.play();
		else audioEl.pause();
	}

	function seekBy(delta: number) {
		if (!audioEl) return;
		const max = duration > 0 ? duration : audioEl.currentTime;
		audioEl.currentTime = Math.min(Math.max(audioEl.currentTime + delta, 0), max);
		currentTime = audioEl.currentTime;
	}

	function setLoop(mode: LoopMode) {
		const at = activeIndex;
		loopMode = mode;
		lockedIndex = isSentenceLocked(mode) && at >= 0 ? at : -1;
		if (audioEl) audioEl.loop = mode === 'list';
		persist('nce:loop', mode);
	}

	function setTranslation(mode: TranslationMode) {
		translation = mode;
		persist('nce:translation', mode);
	}

	function setRate(value: number) {
		rate = value;
		applyRate();
		persist('nce:rate', String(value));
	}

	/** Safari 需要显式打开变调补偿，否则变速会变成"快放录音带"。 */
	function applyRate() {
		if (!audioEl) return;
		const el = audioEl as HTMLAudioElement & { webkitPreservesPitch?: boolean };
		el.preservesPitch = true;
		if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true;
		el.playbackRate = rate;
	}

	/* ---------- 进度与偏好持久化 ---------- */

	function persist(key: string, value: string) {
		try {
			localStorage.setItem(key, value);
		} catch {
			// 隐私模式下写不进去，忽略
		}
	}

	function saveProgress() {
		if (!audioEl) return;
		persist(progressKey, JSON.stringify({ index: activeIndex, time: audioEl.currentTime }));
	}

	function restoreProgress() {
		try {
			const raw = localStorage.getItem(progressKey);
			if (raw) {
				const saved = JSON.parse(raw) as { time?: number };
				if (Number.isFinite(saved?.time)) pendingSeek = saved.time as number;
			}

			const storedLoop = localStorage.getItem('nce:loop');
			if (storedLoop && (LOOP_MODES as readonly string[]).includes(storedLoop)) {
				loopMode = storedLoop as LoopMode;
			}
			const storedTranslation = localStorage.getItem('nce:translation');
			if (storedTranslation && (TRANSLATION_MODES as readonly string[]).includes(storedTranslation)) {
				translation = storedTranslation as TranslationMode;
			}
			const storedRate = Number(localStorage.getItem('nce:rate'));
			if ((SPEEDS as readonly number[]).includes(storedRate)) {
				rate = storedRate;
			}
		} catch {
			// 读不到就用默认值
		}
	}

	/* ---------- 自动滚动 ---------- */

	function ensureVisible(index: number) {
		const el = lineEls[index];
		if (!el || !scroller) return;
		const box = scroller.getBoundingClientRect();
		const rect = el.getBoundingClientRect();
		const pad = box.height * 0.2;
		if (rect.top < box.top + pad || rect.bottom > box.bottom - pad) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	$effect(() => {
		const index = activeIndex;
		if (index >= 0) ensureVisible(index);
	});

	/* ---------- 音频事件 ---------- */

	function onLoadedMetadata() {
		if (!audioEl) return;
		duration = audioEl.duration || 0;
		if (pendingSeek > 0) {
			audioEl.currentTime = Math.min(pendingSeek, Math.max(0, duration - 0.2));
			pendingSeek = 0;
		}
		currentTime = audioEl.currentTime;
		applyRate();
	}

	function onPlay() {
		playing = true;
		startTicking();
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
	}

	function onPause() {
		playing = false;
		stopTicking();
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
		saveProgress();
	}

	function onEnded() {
		playing = false;
		stopTicking();
		saveProgress();
		if (loopMode === 'book') {
			if (data.next) goToLesson(data.next.id);
			else activateLine(0);
		}
	}

	function goToLesson(id: string) {
		location.href = resolve('/lesson/[id]', { id });
	}

	/**
	 * 锁屏 / 通知栏控制。上一句下一句映射到 seekbackward/seekforward，
	 * 上下课映射到 previoustrack/nexttrack。
	 */
	function setupMediaSession() {
		if (!('mediaSession' in navigator)) return;
		const prev = data.prev;
		const next = data.next;
		navigator.mediaSession.metadata = new MediaMetadata({
			title: lesson.title,
			artist: `${lesson.book.toUpperCase()} · 新概念英语`,
			album: '精听学习站',
			artwork: [{ src: mediaUrl('icons/icon-512.png'), sizes: '512x512', type: 'image/png' }]
		});
		navigator.mediaSession.setActionHandler('play', () => void audioEl?.play());
		navigator.mediaSession.setActionHandler('pause', () => audioEl?.pause());
		navigator.mediaSession.setActionHandler('seekbackward', () => activateLine(activeIndex - 1));
		navigator.mediaSession.setActionHandler('seekforward', () => activateLine(activeIndex + 1));
		navigator.mediaSession.setActionHandler(
			'previoustrack',
			prev ? () => goToLesson(prev.id) : null
		);
		navigator.mediaSession.setActionHandler(
			'nexttrack',
			next ? () => goToLesson(next.id) : null
		);
	}

	let lastPositionSecond = -1;
	function syncPositionState() {
		if (!('mediaSession' in navigator) || !duration) return;
		const second = Math.floor(currentTime);
		if (second === lastPositionSecond) return;
		lastPositionSecond = second;
		try {
			navigator.mediaSession.setPositionState({
				duration,
				position: Math.min(currentTime, duration),
				playbackRate: rate
			});
		} catch {
			// 某些浏览器在状态不合法时会抛错，忽略
		}
	}

	/* ---------- 快捷键 ---------- */

	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

		switch (event.key) {
			case ' ':
				event.preventDefault();
				togglePlay();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				activateLine((activeIndex >= 0 ? activeIndex : 0) - 1);
				break;
			case 'ArrowRight':
				event.preventDefault();
				activateLine((activeIndex >= 0 ? activeIndex : 0) + 1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				seekBy(5);
				break;
			case 'ArrowDown':
				event.preventDefault();
				seekBy(-5);
				break;
			case 'r':
			case 'R':
				activateLine(activeIndex >= 0 ? activeIndex : 0);
				break;
			case 'l':
			case 'L':
				setLoop(cycle(LOOP_MODES, loopMode));
				break;
			case 't':
			case 'T':
				setTranslation(cycle(TRANSLATION_MODES, translation));
				break;
			default:
				break;
		}
	}

	onMount(() => {
		restoreProgress();
		applyRate();
		setupMediaSession();
		wordSet = addedSet();
		if (audioEl) audioEl.loop = loopMode === 'list';

		window.addEventListener('keydown', onKeydown);
		document.addEventListener('visibilitychange', saveProgress);
		window.addEventListener('pagehide', saveProgress);

		return () => {
			saveProgress();
			window.removeEventListener('keydown', onKeydown);
			document.removeEventListener('visibilitychange', saveProgress);
			window.removeEventListener('pagehide', saveProgress);
			stopTicking();
		};
	});
</script>

<svelte:head>
	<title>{lesson.title} · 新概念英语</title>
	<meta
		name="description"
		content="{lesson.title}：《新概念英语》逐句点读、精确循环、中英对照，支持变速与离线播放。"
	/>
</svelte:head>

<div class="stage">
	<header class="bar">
		<a class="back" href={resolve('/book/[key]', { key: lesson.book })}>← 目录</a>
		<div class="meta">
			<h1>{lesson.title}</h1>
			<p>{lesson.book.toUpperCase()} · 第 {lesson.id.split('-')[1]} 课 · {lines.length} 句</p>
		</div>
		<nav class="nav">
			{#if data.prev}
				<a href={resolve('/lesson/[id]', { id: data.prev.id })}>上一课</a>
			{/if}
			{#if data.next}
				<a href={resolve('/lesson/[id]', { id: data.next.id })}>下一课</a>
			{/if}
		</nav>
	</header>

	<section class="controls" aria-label="播放控制">
		<audio
			bind:this={audioEl}
			src={audioSrc}
			preload="metadata"
			onloadedmetadata={onLoadedMetadata}
			onplay={onPlay}
			onpause={onPause}
			onended={onEnded}
		></audio>

		<div class="row">
			<button class="play" type="button" onclick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
				{playing ? '❚❚' : '▶'}
			</button>

			<div class="timeline">
				<input
					class="seek"
					type="range"
					min="0"
					max={duration || 0}
					step="0.01"
					value={currentTime}
					aria-label="播放进度"
					onpointerdown={() => (seeking = true)}
					onpointerup={() => (seeking = false)}
					oninput={(event) => {
						if (!audioEl) return;
						audioEl.currentTime = Number(event.currentTarget.value);
						currentTime = audioEl.currentTime;
					}}
				/>
				<div class="times">
					<span>{formatTime(currentTime)}</span>
					<span>{formatTime(duration)}</span>
				</div>
			</div>
		</div>

		<div class="row wrap">
			{#each MODES as item (item.value)}
				<button
					class="chip"
					class:on={mode === item.value}
					type="button"
					onclick={() => (mode = item.value)}
				>
					{item.label}
				</button>
			{/each}
		</div>

		{#if mode === 'listen'}
		<div class="row wrap">
			<button class="chip" type="button" onclick={() => setLoop(cycle(LOOP_MODES, loopMode))}>
				循环：{LOOP_LABELS[loopMode]}
			</button>

			<button
				class="chip"
				type="button"
				onclick={() => setTranslation(cycle(TRANSLATION_MODES, translation))}
			>
				显示：{TRANSLATION_LABELS[translation]}
			</button>

			<label class="chip select">
				速度
				<select
					value={rate}
					onchange={(event) => setRate(Number(event.currentTarget.value))}
					aria-label="播放速度"
				>
					{#each SPEEDS as speed (speed)}
						<option value={speed}>{speed}x</option>
					{/each}
				</select>
			</label>

			<button
				class="chip"
				class:armed={sleepMinutes > 0}
				type="button"
				onclick={cycleSleep}
				title="到点自动暂停"
			>
				睡眠：{sleepLabel}
			</button>
		</div>
		{/if}
	</section>

	{#if mode === 'listen'}
	<main class="lines" bind:this={scroller} data-translation={translation}>
		<ul>
			{#each lines as line (line.i)}
				<li>
					<div
						bind:this={lineEls[line.i]}
						class="line"
						class:active={line.i === activeIndex}
						role="button"
						tabindex="0"
						aria-label="播放第 {line.i + 1} 句"
						onclick={() => activateLine(line.i)}
						onkeydown={(event) => {
							if (event.key !== 'Enter' && event.key !== ' ') return;
							event.preventDefault();
							activateLine(line.i);
						}}
					>
						<span class="idx">{line.i + 1}</span>
						<span class="text">
							<span class="en">
								{#each tokenized[line.i] as token, tokenIndex (tokenIndex)}
									{#if token.word}
										<button
											class="word"
											class:added={wordSet.has(token.text.toLowerCase())}
											type="button"
											onclick={(event) => {
												event.stopPropagation();
												openWord(token.text, line.i);
											}}
										>
											{token.text}
										</button>
									{:else}{token.text}{/if}
								{/each}
							</span>
							{#if line.zh}
								<span class="zh">{line.zh}</span>
							{/if}
						</span>
					</div>
				</li>
			{/each}
		</ul>
	</main>
	{:else if mode === 'dictation'}
		<main class="pane"><Dictation {lines} onPlay={activateLine} /></main>
	{:else if mode === 'recite'}
		<main class="pane"><Recitation {lines} {activeIndex} onPlay={activateLine} /></main>
	{:else}
		<main class="pane">
			<Shadowing {lines} onPlay={activateLine} onStop={pauseAudio} />
		</main>
	{/if}

	{#if activeWord}
		<div class="word-panel" role="dialog" aria-label="单词释义">
			<header>
				<strong>{activeToken}</strong>
				{#if activeWord.via}<span class="via">原形 {activeWord.via}</span>{/if}
				<button class="close" type="button" onclick={closeWord} aria-label="关闭">×</button>
			</header>
			{#if looking}
				<p class="trans">查询中…</p>
			{:else if activeWord.entry}
				{#if activeWord.entry[0]}<p class="phonetic">/{activeWord.entry[0]}/</p>{/if}
				<p class="trans">{activeWord.entry[1]}</p>
				{#if activeWord.entry[2]}<span class="tag">{activeWord.entry[2].toUpperCase()}</span>{/if}
			{:else}
				<p class="trans">词典未收录这个词</p>
			{/if}
			{#if activeLine >= 0 && lines[activeLine]}
				<p class="ctx">{lines[activeLine].en}</p>
			{/if}
			<button class="primary" type="button" onclick={toggleWord}>
				{wordSet.has(activeWord.word) ? '移出生词本' : '加入生词本'}
			</button>
		</div>
	{/if}

	<footer class="hints">
		<span><kbd>空格</kbd> 播放</span>
		<span><kbd>←</kbd><kbd>→</kbd> 上一句 / 下一句</span>
		<span><kbd>↑</kbd><kbd>↓</kbd> ±5 秒</span>
		<span><kbd>R</kbd> 重播本句</span>
		<span><kbd>L</kbd> 循环模式</span>
		<span><kbd>T</kbd> 显示方式</span>
	</footer>
</div>

<style>
	.stage {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		height: 100dvh;
		max-width: 780px;
		margin: 0 auto;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 18px 8px;
	}

	.back {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.88rem;
		white-space: nowrap;
	}

	.meta {
		flex: 1;
		min-width: 0;
	}

	.nav {
		display: flex;
		flex: none;
		gap: 10px;
	}

	.nav a {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.8rem;
		white-space: nowrap;
	}

	.nav a:hover {
		color: var(--accent);
	}

	.meta h1 {
		margin: 0;
		font-size: 1.05rem;
	}

	.meta p {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.controls {
		padding: 6px 18px 12px;
		border-bottom: 1px solid var(--border);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.row.wrap {
		flex-wrap: wrap;
		margin-top: 10px;
		gap: 8px;
	}

	.play {
		flex: none;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.95rem;
		cursor: pointer;
	}

	.timeline {
		flex: 1;
		min-width: 0;
	}

	.seek {
		width: 100%;
		accent-color: var(--accent);
	}

	.times {
		display: flex;
		justify-content: space-between;
		color: var(--text-muted);
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
	}

	.chip {
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
		border-radius: 999px;
		padding: 6px 12px;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.chip:hover {
		border-color: var(--accent);
	}

	.chip.armed {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-soft);
	}

	.chip.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.chip.select {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.chip select {
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.lines {
		overflow-y: auto;
		padding: 6px 10px 24px;
		scroll-behavior: smooth;
	}

	.pane {
		overflow-y: auto;
		min-height: 0;
	}

	.lines ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.line {
		display: flex;
		gap: 10px;
		width: 100%;
		text-align: left;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		padding: 10px 12px;
		border-radius: var(--radius);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.line:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.line:hover {
		background: var(--bg-sunken);
	}

	.line.active {
		background: var(--accent-soft);
	}

	.idx {
		flex: none;
		width: 1.6em;
		color: var(--text-muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		padding-top: 0.25em;
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}

	.en {
		line-height: 1.55;
	}

	.zh {
		color: var(--text-muted);
		font-size: 0.86rem;
		line-height: 1.5;
	}

	.line.active .en {
		font-weight: 600;
	}

	.word {
		display: inline;
		border: none;
		background: transparent;
		color: inherit;
		font: inherit;
		padding: 0;
		margin: 0;
		cursor: pointer;
		border-radius: 3px;
	}

	.word:hover {
		background: var(--accent);
		color: #fff;
	}

	.word.added {
		box-shadow: inset 0 -1px 0 0 var(--accent);
	}

	/* 单词释义面板：桌面居中靠下，移动端贴底 */
	.word-panel {
		position: fixed;
		left: 50%;
		bottom: 0;
		transform: translateX(-50%);
		width: min(100%, 780px);
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-bottom: none;
		border-radius: var(--radius) var(--radius) 0 0;
		box-shadow: 0 -6px 24px rgb(0 0 0 / 14%);
		padding: 14px 18px calc(16px + env(safe-area-inset-bottom));
		z-index: 20;
	}

	.word-panel header {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}

	.word-panel strong {
		font-size: 1.1rem;
	}

	.word-panel .via {
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	.word-panel .close {
		margin-left: auto;
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
	}

	.word-panel .phonetic {
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 0.84rem;
	}

	.word-panel .trans {
		margin: 6px 0 0;
		line-height: 1.6;
	}

	.word-panel .tag {
		display: inline-block;
		margin-top: 8px;
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 999px;
		padding: 2px 9px;
		font-size: 0.7rem;
	}

	.word-panel .ctx {
		margin: 10px 0 0;
		padding-top: 10px;
		border-top: 1px solid var(--border);
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.5;
	}

	.word-panel .primary {
		margin-top: 12px;
		width: 100%;
		border: none;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		padding: 9px 0;
		font-size: 0.9rem;
		cursor: pointer;
	}

	/* 中英对照的四种显示方式 */
	.lines[data-translation='en'] .zh {
		display: none;
	}

	.lines[data-translation='zh'] .en {
		display: none;
	}

	.lines[data-translation='blur'] .zh {
		filter: blur(4px);
		transition: filter 0.15s ease;
	}

	.lines[data-translation='blur'] .line:hover .zh,
	.lines[data-translation='blur'] .line:focus-visible .zh {
		filter: blur(0);
	}

	.hints {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		padding: 8px 18px calc(10px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		color: var(--text-muted);
		font-size: 0.72rem;
	}

	kbd {
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 4px;
		background: var(--bg-elevated);
		font-family: inherit;
		font-size: 0.7rem;
	}

	@media (max-width: 520px) {
		.hints {
			gap: 8px;
			font-size: 0.68rem;
		}
	}
</style>
