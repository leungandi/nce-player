<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { bookwormAudioUrl } from '#lib/data/bookworm/audio.js';
	import { AUDIO_KEY, bookUrl, chapterUrl, READ_KEY } from '#lib/data/bookworm/index.js';
	import { formatTime } from '#lib/utils/time.js';

	let { data } = $props();

	const chapter = $derived(data.chapter);
	const audioSrc = $derived(chapter.audio ? bookwormAudioUrl(chapter.audio) : '');

	let audioEl = $state<HTMLAudioElement | null>(null);
	let playing = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let rate = $state(1);
	let pendingSeek = 0;
	let scroller = $state<HTMLDivElement | null>(null);

	const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25, 1.5];

	/* ---------- 阅读进度：记到"第几章 + 该章内的位置" ---------- */

	function saveRead() {
		if (!scroller) return;
		const ratio = scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight);
		try {
			localStorage.setItem(
				READ_KEY(data.bookId),
				JSON.stringify({ no: chapter.no, ratio: Math.min(1, Math.max(0, ratio)) })
			);
		} catch {
			// 隐私模式下写不进去
		}
	}

	function restoreRead() {
		try {
			const raw = localStorage.getItem(READ_KEY(data.bookId));
			if (!raw || !scroller) return;
			const saved = JSON.parse(raw) as { no?: number; ratio?: number };
			if (saved?.no !== chapter.no || !Number.isFinite(saved?.ratio)) return;
			const max = scroller.scrollHeight - scroller.clientHeight;
			const min = scroller.clientHeight * 0.15;
			scroller.scrollTop = Math.max(min, (saved.ratio as number) * max);
		} catch {
			// 忽略
		}
	}

	/* ---------- 音频 ---------- */

	function saveAudio() {
		if (!audioEl) return;
		try {
			localStorage.setItem(AUDIO_KEY(data.bookId, chapter.no), String(audioEl.currentTime));
		} catch {
			// 忽略
		}
	}

	function restoreAudio() {
		try {
			const raw = localStorage.getItem(AUDIO_KEY(data.bookId, chapter.no));
			const seconds = Number(raw);
			if (Number.isFinite(seconds) && seconds > 3) pendingSeek = seconds;
		} catch {
			// 忽略
		}
	}

	let rafId = 0;
	function startTicking() {
		cancelAnimationFrame(rafId);
		const step = () => {
			if (audioEl) currentTime = audioEl.currentTime;
			rafId = requestAnimationFrame(step);
		};
		rafId = requestAnimationFrame(step);
	}

	function stopTicking() {
		cancelAnimationFrame(rafId);
		rafId = 0;
	}

	function toggle() {
		if (!audioEl) return;
		if (audioEl.paused) void audioEl.play();
		else audioEl.pause();
	}

	function seekBy(delta: number) {
		if (!audioEl) return;
		const max = duration || audioEl.currentTime;
		audioEl.currentTime = Math.min(Math.max(audioEl.currentTime + delta, 0), max);
		currentTime = audioEl.currentTime;
	}

	function setRate(value: number) {
		rate = value;
		if (!audioEl) return;
		const el = audioEl as HTMLAudioElement & { webkitPreservesPitch?: boolean };
		el.preservesPitch = true;
		if ('webkitPreservesPitch' in el) el.webkitPreservesPitch = true;
		el.playbackRate = value;
	}

	function onLoadedMetadata() {
		if (!audioEl) return;
		duration = audioEl.duration || 0;
		audioEl.currentTime = pendingSeek > 0 ? Math.min(pendingSeek, Math.max(0, duration - 0.5)) : 0;
		pendingSeek = 0;
		currentTime = audioEl.currentTime;
		setRate(rate);
	}

	function onEnded() {
		playing = false;
		stopTicking();
		saveAudio();
		// 听完自动进下一章，方便连续听
		if (data.next) {
			void goto(chapterUrl(data.bookId, data.next));
		}
	}

	function goChapter(no: number | null) {
		if (no === null) return;
		void goto(chapterUrl(data.bookId, no));
	}

	onMount(() => {
		restoreAudio();
		restoreRead();
		let tick = 0;
		const onScroll = () => {
			if (tick++ % 20 === 0) saveRead();
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		scroller?.addEventListener('scroll', onScroll, { passive: true });
		document.addEventListener('visibilitychange', saveRead);
		window.addEventListener('pagehide', saveRead);

		return () => {
			saveRead();
			saveAudio();
			window.removeEventListener('scroll', onScroll);
			scroller?.removeEventListener('scroll', onScroll);
			document.removeEventListener('visibilitychange', saveRead);
			window.removeEventListener('pagehide', saveRead);
			stopTicking();
		};
	});
</script>

<svelte:head>
	<title>{chapter.title || `第 ${chapter.no} 章`} · {data.bookTitle}</title>
</svelte:head>

<div class="reader">
	<header class="bar">
		<a class="back" href={bookUrl(data.bookId)}>
			<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<path
					d="M12 5l-5 5 5 5"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			目录
		</a>
		<div class="meta">
			<h1>{chapter.title || `第 ${chapter.no} 章`}</h1>
			<p>{data.bookTitle} · 第 {chapter.no} 章</p>
		</div>
		<nav>
			{#if data.prev}
				<button class="nav" type="button" onclick={() => goChapter(data.prev)} title="上一章">‹</button>
			{/if}
			{#if data.next}
				<button class="nav" type="button" onclick={() => goChapter(data.next)} title="下一章">›</button>
			{/if}
		</nav>
	</header>

	<div class="body" bind:this={scroller}>
		<article>
			{#each chapter.paras as para, index (index)}
				<p>{para}</p>
			{/each}

			{#if data.next}
				<button class="next-chapter" type="button" onclick={() => goChapter(data.next)}>
					下一章 →
				</button>
			{:else}
				<p class="end">— 全书完 —</p>
			{/if}
		</article>
	</div>

	{#if audioSrc}
		<footer class="player">
			<audio
				bind:this={audioEl}
				src={audioSrc}
				preload="metadata"
				onloadedmetadata={onLoadedMetadata}
				onplay={() => {
					playing = true;
					startTicking();
				}}
				onpause={() => {
					playing = false;
					stopTicking();
					saveAudio();
				}}
				onended={onEnded}
			></audio>

			<div class="transport">
				<button class="skip" type="button" onclick={() => seekBy(-15)} aria-label="后退 15 秒" title="后退 15 秒">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<g>
							<path
								d="M12 3.8a8.2 8.2 0 1 0 8.2 8.2"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
							/>
							<path d="M11.4 1.6 6.6 3.9 11.4 6.2Z" fill="currentColor" />
						</g>
						<text x="12" y="15.8" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">
							15
						</text>
					</svg>
				</button>

				<button class="play" type="button" onclick={toggle} aria-label={playing ? '暂停' : '播放'}>
					{playing ? '❚❚' : '▶'}
				</button>

				<button class="skip" type="button" onclick={() => seekBy(15)} aria-label="前进 15 秒" title="前进 15 秒">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<g transform="translate(24,0) scale(-1,1)">
							<path
								d="M12 3.8a8.2 8.2 0 1 0 8.2 8.2"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
							/>
							<path d="M11.4 1.6 6.6 3.9 11.4 6.2Z" fill="currentColor" />
						</g>
						<text x="12" y="15.8" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">
							15
						</text>
					</svg>
				</button>
			</div>

			<div class="timeline">
				<input
					type="range"
					min="0"
					max={duration || 0}
					step="0.5"
					value={currentTime}
					aria-label="播放进度"
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

			<select
				value={rate}
				onchange={(event) => setRate(Number(event.currentTarget.value))}
				aria-label="播放速度"
			>
				{#each SPEEDS as speed (speed)}
					<option value={speed}>{speed}x</option>
				{/each}
			</select>
		</footer>
	{/if}
</div>

<style>
	.reader {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		height: 100dvh;
		max-width: 720px;
		margin: 0 auto;
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 18px 10px;
		border-bottom: 1px solid var(--border);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		flex: none;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.84rem;
	}

	.back:hover {
		color: var(--accent);
	}

	.meta {
		flex: 1;
		min-width: 0;
	}

	.meta h1 {
		margin: 0;
		font-size: 1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta p {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	nav {
		display: flex;
		gap: 6px;
		flex: none;
	}

	.nav {
		width: 32px;
		height: 32px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text-muted);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}

	.nav:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.body {
		overflow-y: auto;
		padding: 0 20px;
		-webkit-overflow-scrolling: touch;
	}

	article {
		padding: 20px 0 48px;
	}

	article p {
		margin: 0 0 1.15em;
		font-size: 1.16rem;
		line-height: 1.9;
		letter-spacing: 0.003em;
	}

	.next-chapter {
		display: block;
		width: 100%;
		margin-top: 28px;
		padding: 14px 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}

	.next-chapter:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.end {
		margin-top: 32px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.84rem;
	}

	.player {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 10px 16px calc(12px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		background: var(--bg-elevated);
	}

	.transport {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.play {
		flex: none;
		width: 42px;
		height: 42px;
		margin: 0 2px;
		border: none;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.timeline {
		flex: 1;
		min-width: 0;
	}

	.timeline input {
		width: 100%;
		accent-color: var(--accent);
	}

	.times {
		display: flex;
		justify-content: space-between;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
	}

	.skip {
		display: grid;
		place-items: center;
		flex: none;
		width: 34px;
		height: 34px;
		border: none;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
	}

	.skip svg {
		width: 22px;
		height: 22px;
	}

	.skip:hover {
		color: var(--accent);
	}

	select {
		flex: none;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: 0.78rem;
		min-height: 38px;
		padding: 6px 10px;
		cursor: pointer;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 560px) {
		.player {
			gap: 6px;
			padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
		}

		article p {
			font-size: 1.12rem;
			line-height: 1.88;
		}
	}
</style>
