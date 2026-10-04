<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { formatTime } from '#lib/utils/time.js';

	let { data } = $props();

	const book = $derived(data.book);

	/** 已听过的课：从本地进度里读出来，给列表加个进度提示。 */
	let progress = $state<Record<string, number>>({});

	onMount(() => {
		const found: Record<string, number> = {};
		for (const lesson of book.lessons) {
			try {
				const raw = localStorage.getItem(`nce:progress:${lesson.id}`);
				if (!raw) continue;
				const saved = JSON.parse(raw) as { time?: number };
				if (Number.isFinite(saved?.time) && (saved.time as number) > 3) {
					found[lesson.id] = saved.time as number;
				}
			} catch {
				// 忽略坏数据
			}
		}
		progress = found;
	});

	const learnedCount = $derived(Object.keys(progress).length);
</script>

<svelte:head>
	<title>{book.name} · 新概念英语</title>
	<meta
		name="description"
		content="{book.name}（{book.titleEn}）全部课文的逐句点读、精确循环与中英对照。"
	/>
</svelte:head>

<div class="page">
	<header>
		<a class="back" href={resolve('/')}>← 返回</a>
		<h1>{book.name}</h1>
		<p class="sub">
			{book.titleEn} · 共 {book.lessons.length} 课
			{#if learnedCount}<span class="done">已听 {learnedCount} 课</span>{/if}
		</p>
	</header>

	<ol class="list">
		{#each book.lessons as lesson (lesson.id)}
			<li>
				<a href={resolve('/lesson/[id]', { id: lesson.id })}>
					<span class="no">{String(lesson.no).padStart(2, '0')}</span>
					<span class="title">{lesson.title}</span>
					{#if progress[lesson.id]}
						<span class="at">{formatTime(progress[lesson.id])}</span>
					{/if}
				</a>
			</li>
		{/each}
	</ol>
</div>

<style>
	.page {
		max-width: 720px;
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

	.done {
		margin-left: 10px;
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 999px;
		padding: 2px 9px;
		font-size: 0.75rem;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--bg-elevated);
	}

	.list li + li {
		border-top: 1px solid var(--border);
	}

	.list a {
		display: flex;
		align-items: baseline;
		gap: 12px;
		padding: 12px 16px;
		text-decoration: none;
		transition: background 0.12s ease;
	}

	.list a:hover {
		background: var(--bg-sunken);
	}

	.no {
		flex: none;
		width: 2em;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.title {
		flex: 1;
		min-width: 0;
	}

	.at {
		flex: none;
		color: var(--text-muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}
</style>
