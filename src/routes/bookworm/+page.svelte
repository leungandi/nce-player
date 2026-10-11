<script lang="ts">
	import { resolve } from '$app/paths';
	import { bookUrl } from '#lib/data/bookworm/index.js';
	import { clearUnlocked } from '#lib/data/bookworm/gate.js';
	import { onMount } from 'svelte';

	let { data } = $props();

	/** 每本书读到第几章，用来在书卡上标"读到第 N 章" */
	let reading = $state<Record<string, number>>({});

	onMount(() => {
		const found: Record<string, number> = {};
		for (const level of data.levels) {
			for (const book of level.books) {
				try {
					const raw = localStorage.getItem(`nce:bw:read:${book.id}`);
					if (!raw) continue;
					const saved = JSON.parse(raw) as { no?: number };
					if (Number.isFinite(saved?.no)) found[book.id] = saved.no as number;
				} catch {
					// 忽略坏数据
				}
			}
		}
		reading = found;
	});

	const total = $derived(data.levels.reduce((sum, level) => sum + level.books.length, 0));
	const audioCount = $derived(
		data.levels.reduce((sum, level) => sum + level.books.filter((b) => b.hasAudio).length, 0)
	);

	function lock() {
		clearUnlocked();
		location.reload();
	}
</script>

<svelte:head>
	<title>书虫 · 分级阅读</title>
	<meta name="description" content="书虫分级读物，按级别阅读，有音频的可以边听边读。" />
</svelte:head>

<div class="page">
	<header class="head">
		<a class="back" href={resolve('/')}>← 返回</a>
		<div class="title-row">
			<h1>书虫</h1>
			<button class="lock" type="button" onclick={lock}>锁定</button>
		</div>
		<p class="sub">共 {total} 本，其中 {audioCount} 本带音频</p>
	</header>

	{#each data.levels as level (level.level)}
		<section class="level">
			<h2>
				{level.level.slice(0, 1)} 级 {level.level.slice(1) === 'A' ? '上' : '下'}
				<span class="count">{level.books.length} 本</span>
			</h2>
			<div class="grid">
				{#each level.books as book (book.id)}
					<a class="card" href={bookUrl(book.id)}>
						<span class="title">{book.title || book.id}</span>
						{#if book.titleZh}<span class="title-zh">{book.titleZh}</span>{/if}
						<span class="meta">
							{book.chapters} 章
							{#if book.hasAudio}<span class="badge">有声</span>{/if}
							{#if reading[book.id]}<span class="at">读到第 {reading[book.id]} 章</span>{/if}
						</span>
					</a>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 22px 18px 40px;
	}

	.back {
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.84rem;
	}

	.back:hover {
		color: var(--accent);
	}

	.title-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin-top: 12px;
	}

	.head h1 {
		margin: 0;
		font-size: 1.35rem;
	}

	.lock {
		flex: none;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text-muted);
		font: inherit;
		font-size: 0.72rem;
		padding: 3px 10px;
		cursor: pointer;
	}

	.lock:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.sub {
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 0.84rem;
	}

	.level {
		margin-top: 26px;
	}

	.level h2 {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 0 0 10px;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.count {
		font-size: 0.76rem;
		font-weight: 400;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
		gap: 10px;
	}

	.card {
		display: grid;
		gap: 3px;
		padding: 13px 14px;
		min-height: 84px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.card:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow);
	}

	.title {
		font-size: 0.92rem;
		line-height: 1.35;
	}

	.title-zh {
		color: var(--text-muted);
		font-size: 0.76rem;
	}

	.meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 2px;
		color: var(--text-muted);
		font-size: 0.72rem;
	}

	.badge {
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 999px;
		padding: 1px 7px;
	}

	.at {
		font-variant-numeric: tabular-nums;
	}
</style>
