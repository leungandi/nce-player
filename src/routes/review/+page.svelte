<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { dueWords, grade, previewIntervals, Rating, stats } from '#lib/store/wordbook.js';
	import type { WordRecord } from '#lib/store/wordbook.js';

	let queue = $state<WordRecord[]>([]);
	let counts = $state({ total: 0, due: 0 });
	let intervals = $state<Record<number, string> | null>(null);
	let lastResult = $state<string | null>(null);
	let ready = $state(false);

	const current = $derived(queue[0] ?? null);

	function refresh() {
		queue = dueWords();
		counts = stats();
		intervals = current ? previewIntervals(current.w) : null;
	}

	onMount(() => {
		refresh();
		ready = true;
	});

	function answer(rating: number) {
		if (!current) return;
		const updated = grade(current.w, rating);
		lastResult = updated ? `${updated.w} 下次 ${intervals?.[rating] ?? ''}后` : null;
		queue = queue.slice(1);
		counts = stats();
		intervals = queue[0] ? previewIntervals(queue[0].w) : null;
	}

	const buttons = [
		{ rating: Rating.Again, label: '忘记' },
		{ rating: Rating.Hard, label: '模糊' },
		{ rating: Rating.Good, label: '认识' },
		{ rating: Rating.Easy, label: '简单' }
	];
</script>

<svelte:head>
	<title>生词复习 · 新概念英语</title>
</svelte:head>

<div class="page">
	<header>
		<a class="back" href={resolve('/')}>← 返回</a>
		<h1>生词复习</h1>
		<p class="sub">
			生词本共 {counts.total} 个词
			{#if counts.due}<span class="due">待复习 {counts.due}</span>{/if}
		</p>
	</header>

	{#if !ready}
		<p class="empty">加载中…</p>
	{:else if current}
		<section class="card">
			<p class="progress">剩余 {queue.length} 个</p>
			<h2>{current.w}</h2>
			{#if current.phonetic}<p class="phonetic">/{current.phonetic}/</p>{/if}
			{#if current.base}<p class="base">原形 {current.base}</p>{/if}
			<p class="trans">{current.translation || '（无释义）'}</p>
			{#if current.ctx}<p class="ctx">{current.ctx}</p>{/if}

			<div class="actions">
				{#each buttons as item (item.rating)}
					<button type="button" onclick={() => answer(item.rating)}>
						<span class="label">{item.label}</span>
						<span class="when">{intervals?.[item.rating] ?? ''}</span>
					</button>
				{/each}
			</div>

			{#if lastResult}<p class="result">{lastResult}</p>{/if}
		</section>
	{:else}
		<section class="card">
			<h2>今天没有要复习的词</h2>
			<p>
				在课文里点任意单词就能加入生词本，复习会按记忆曲线自动排期。
			</p>
			<p class="cta">
				<a href={resolve('/book/[key]', { key: 'nce2' })}>去听第二册 →</a>
			</p>
		</section>
	{/if}
</div>

<style>
	.page {
		max-width: 640px;
		margin: 0 auto;
		padding: 24px 18px 48px;
	}

	.back {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.85rem;
	}

	h1 {
		margin: 10px 0 0;
		font-size: 1.35rem;
	}

	.sub {
		margin: 6px 0 22px;
		color: var(--text-muted);
		font-size: 0.84rem;
	}

	.due {
		margin-left: 10px;
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 999px;
		padding: 2px 9px;
		font-size: 0.75rem;
	}

	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 22px;
	}

	.card h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.progress {
		margin: 0 0 10px;
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	.phonetic {
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 0.86rem;
	}

	.base {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	.trans {
		margin: 12px 0 0;
		line-height: 1.7;
	}

	.ctx {
		margin: 14px 0 0;
		padding-top: 12px;
		border-top: 1px solid var(--border);
		color: var(--text-muted);
		font-size: 0.84rem;
		line-height: 1.6;
	}

	.actions {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		margin-top: 20px;
	}

	.actions button {
		display: flex;
		flex-direction: column;
		gap: 3px;
		align-items: center;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		border-radius: 10px;
		padding: 10px 4px;
		cursor: pointer;
	}

	.actions button:hover {
		border-color: var(--accent);
	}

	.label {
		font-size: 0.86rem;
	}

	.when {
		color: var(--text-muted);
		font-size: 0.68rem;
	}

	.result {
		margin: 14px 0 0;
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.empty,
	.cta {
		margin-top: 12px;
	}

	.cta a {
		color: var(--accent);
		text-decoration: none;
		font-weight: 600;
	}

	@media (max-width: 460px) {
		.actions {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
