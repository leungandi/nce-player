<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { formatTime } from '#lib/utils/time.js';

	let { data } = $props();

	const book = $derived(data.book);

	/** 已听过的课：从本地进度读出来，给卡片加个标记 */
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
		<a class="back" href={resolve('/')}>
			<svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
				<path
					d="M12 5l-5 5 5 5"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			全部课本
		</a>
		<h1>{book.name}</h1>
		<p class="sub">
			{book.titleEn} · 共 {book.lessons.length} 课
			{#if learnedCount}<span class="done">已听 {learnedCount} 课</span>{/if}
		</p>
	</header>

	<div class="grid">
		{#each book.lessons as lesson (lesson.id)}
			<a
				class="tile"
				class:learned={progress[lesson.id]}
				href={resolve('/lesson/[id]', { id: lesson.id })}
			>
				<span class="tile-no">{lesson.label ?? String(lesson.no).padStart(2, '0')}</span>
				<span class="tile-title">{lesson.title}</span>
				<span class="tile-at">
					{#if progress[lesson.id]}已听到 {formatTime(progress[lesson.id])}{/if}
				</span>
			</a>
		{/each}
	</div>
</div>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 22px 18px 40px;
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.84rem;
	}

	.back:hover {
		color: var(--accent);
	}

	h1 {
		margin: 12px 0 0;
		font-size: 1.35rem;
	}

	.sub {
		margin: 6px 0 20px;
		color: var(--text-muted);
		font-size: 0.84rem;
	}

	.done {
		margin-left: 10px;
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 999px;
		padding: 2px 9px;
		font-size: 0.74rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 10px;
	}

	.tile {
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 4px;
		min-height: 84px;
		padding: 12px 14px;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		transition:
			border-color 0.15s ease,
			box-shadow 0.15s ease;
	}

	.tile:hover {
		border-color: var(--accent);
		box-shadow: var(--shadow);
	}

	.tile.learned {
		border-left: 3px solid var(--accent);
	}

	.tile-no {
		color: var(--accent);
		font-size: 0.74rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.tile-title {
		font-size: 0.88rem;
		line-height: 1.35;
	}

	.tile-at {
		color: var(--text-muted);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
	}
</style>
