<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { books } from '#lib/data/index.js';
	import { stats } from '#lib/store/wordbook.js';

	type Theme = 'light' | 'dark';
	type Progress = { learned: number; total: number };

	let theme = $state<Theme>('light');
	let dueCount = $state(0);
	let wordCount = $state(0);
	let lastLesson = $state<{ id: string; title: string; book: string } | null>(null);
	let progress = $state<Record<string, Progress>>({});

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

		const wordStats = stats();
		dueCount = wordStats.due;
		wordCount = wordStats.total;

		// 每册学了多少课：按本地进度判断，听到 3 秒以上才算
		const found: Record<string, Progress> = {};
		for (const book of books) {
			let learned = 0;
			for (const lesson of book.lessons) {
				try {
					const raw = localStorage.getItem(`nce:progress:${lesson.id}`);
					if (!raw) continue;
					const saved = JSON.parse(raw) as { time?: number };
					if (Number.isFinite(saved?.time) && (saved.time as number) > 3) learned += 1;
				} catch {
					// 忽略坏数据
				}
			}
			found[book.key] = { learned, total: book.lessons.length };
		}
		progress = found;

		try {
			const last = localStorage.getItem('nce:last');
			if (last) {
				for (const book of books) {
					const lesson = book.lessons.find((item) => item.id === last);
					if (lesson) {
						lastLesson = { id: lesson.id, title: lesson.title, book: book.name };
						break;
					}
				}
			}
		} catch {
			// 忽略
		}
	});

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('nce:theme', theme);
	}
</script>

<svelte:head>
	<title>新概念英语 · 精听学习站</title>
</svelte:head>

<div class="page">
	<header class="hero">
		<div>
			<h1>新概念英语</h1>
			<p class="tagline">点句即播 · 精确循环 · 离线可用</p>
		</div>
		<button class="icon-btn" type="button" onclick={toggleTheme} aria-label="切换主题">
			{#if theme === 'dark'}
				<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<path
						d="M17.5 11.18a7.5 7.5 0 1 1-8.87-7.87 6 6 0 0 0 8.87 7.87Z"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linejoin="round"
					/>
				</svg>
			{:else}
				<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
					<circle cx="10" cy="10" r="3.6" stroke="currentColor" stroke-width="1.6" />
					<path
						d="M10 2.6v1.8M10 15.6v1.8M17.4 10h-1.8M4.4 10H2.6M15.2 15.2l-1.3-1.3M6.1 6.1 4.8 4.8M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
					/>
				</svg>
			{/if}
		</button>
	</header>

	<nav class="actions">
		<a class="action" href={resolve('/review')}>
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<path
					d="M4 5.5A2.5 2.5 0 0 1 6.5 3H16v11.5a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 14.5v-9Z"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linejoin="round"
				/>
				<path d="M8 7h5M8 10.5h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
			</svg>
			<span class="action-main">生词复习</span>
			<span class="action-sub">
				{#if dueCount}
					<b>{dueCount}</b> 个待复习
				{:else if wordCount}
					生词本 {wordCount} 个
				{:else}
					还没有生词
				{/if}
			</span>
		</a>

		<a class="action" href={resolve('/practice')}>
			<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<path
					d="M10 3.5 12 8l4.5.6-3.3 3.1.8 4.5L10 14.1l-4 2.1.8-4.5L3.5 8.6 8 8l2-4.5Z"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
			</svg>
			<span class="action-main">练习</span>
			<span class="action-sub">中译英 · 完形 · 词义</span>
		</a>
	</nav>

	{#if lastLesson}
		<a class="resume" href={resolve('/lesson/[id]', { id: lastLesson.id })}>
			<span class="resume-label">继续学习</span>
			<span class="resume-title">{lastLesson.title}</span>
			<span class="resume-book">{lastLesson.book}</span>
			<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<path
					d="M8 5l5 5-5 5"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</a>
	{/if}

	<h2 class="section">全部课本</h2>
	<div class="books">
		{#each books as book (book.key)}
			{@const info = progress[book.key]}
			<a class="book-card" href={resolve('/book/[key]', { key: book.key })}>
				<span class="book-level">{book.key.replace('nce', '第 ')} 册</span>
				<span class="book-name">{book.titleEn}</span>
				<span class="book-count">{book.lessons.length} 课</span>
				{#if info?.learned}
					<span class="bar" aria-hidden="true">
						<span style="width: {Math.round((info.learned / info.total) * 100)}%"></span>
					</span>
					<span class="book-progress">已学 {info.learned} 课</span>
				{/if}
			</a>
		{/each}
	</div>

</div>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 28px 20px 40px;
	}

	.hero {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}

	h1 {
		margin: 0;
		font-size: 1.7rem;
		letter-spacing: 0.01em;
	}

	.tagline {
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 0.86rem;
	}

	.icon-btn {
		flex: none;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text);
		cursor: pointer;
	}

	.icon-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-bottom: 12px;
	}

	.action {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		align-items: center;
		column-gap: 10px;
		padding: 14px 16px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			transform 0.15s ease;
	}

	.action:hover {
		border-color: var(--accent);
	}

	.action svg {
		grid-row: span 2;
		color: var(--accent);
	}

	.action-main {
		font-size: 0.95rem;
		font-weight: 600;
	}

	.action-sub {
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	.action-sub b {
		color: var(--accent);
	}

	.resume {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-rows: auto auto;
		align-items: center;
		column-gap: 10px;
		padding: 14px 16px;
		margin-bottom: 28px;
		background: var(--accent-soft);
		border: 1px solid transparent;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
	}

	.resume:hover {
		border-color: var(--accent);
	}

	.resume-label {
		grid-column: 1;
		color: var(--accent);
		font-size: 0.74rem;
		font-weight: 600;
	}

	.resume-title {
		grid-column: 2;
		grid-row: 1;
		font-weight: 600;
	}

	.resume-book {
		grid-column: 2;
		grid-row: 2;
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	.resume svg {
		grid-column: 3;
		grid-row: span 2;
		color: var(--accent);
	}

	.section {
		margin: 0 0 12px;
		font-size: 0.86rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.books {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 12px;
	}

	.book-card {
		display: grid;
		gap: 4px;
		padding: 16px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.book-card:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow);
	}

	.book-level {
		color: var(--accent);
		font-size: 0.76rem;
		font-weight: 600;
	}

	.book-name {
		font-size: 0.95rem;
		line-height: 1.4;
	}

	.book-count {
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	.bar {
		display: block;
		height: 4px;
		margin-top: 6px;
		border-radius: 999px;
		background: var(--bg-sunken);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.book-progress {
		color: var(--text-muted);
		font-size: 0.72rem;
	}

	@media (max-width: 520px) {
		.actions {
			grid-template-columns: 1fr;
		}
	}
</style>
