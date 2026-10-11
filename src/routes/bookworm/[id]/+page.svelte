<script lang="ts">
	import { resolve } from '$app/paths';
	import { chapterUrl, shelfUrl } from '#lib/data/bookworm/index.js';
	import { onMount } from 'svelte';

	let { data } = $props();

	const book = $derived(data.book);
	/** 上次读到第几章（用来给那一章加个标记） */
	let lastChapter = $state<number | null>(null);

	onMount(() => {
		try {
			const raw = localStorage.getItem(`nce:bw:read:${book.id}`);
			if (raw) {
				const saved = JSON.parse(raw) as { no?: number };
				if (Number.isFinite(saved?.no)) lastChapter = saved.no as number;
			}
		} catch {
			// 忽略
		}
	});
</script>

<svelte:head>
	<title>{book.title || book.id} · 书虫</title>
</svelte:head>

<div class="page">
	<header>
		<a class="back" href={shelfUrl()}>← 书架</a>
		<h1>{book.title || book.id}</h1>
		<p class="sub">
			{#if book.titleZh}{book.titleZh} · {/if}
			{book.chapters.length} 章
			{#if book.hasAudio}· 有音频{/if}
		</p>
	</header>

	<ol class="chapters">
		{#each book.chapters as chapter, index (index)}
			<li>
				<a
					class="chapter"
					class:current={chapter.no === lastChapter}
					href={chapterUrl(book.id, chapter.no)}
				>
					<span class="no">{chapter.no}</span>
					<span class="name">{chapter.title || `第 ${chapter.no} 章`}</span>
					<span class="flag">{chapter.audio ? '有声' : ''}</span>
				</a>
			</li>
		{/each}
	</ol>
</div>

<style>
	.page {
		max-width: 720px;
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

	h1 {
		margin: 12px 0 0;
		font-size: 1.3rem;
		line-height: 1.35;
	}

	.sub {
		margin: 6px 0 20px;
		color: var(--text-muted);
		font-size: 0.84rem;
	}

	.chapters {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--bg-elevated);
	}

	.chapters li + li {
		border-top: 1px solid var(--border);
	}

	.chapter {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 12px 16px;
		text-decoration: none;
		color: var(--text);
	}

	.chapter:hover {
		background: var(--bg-sunken);
	}

	.chapter.current {
		border-left: 3px solid var(--accent);
	}

	.no {
		flex: none;
		width: 1.8em;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.name {
		flex: 1;
		min-width: 0;
	}

	.flag {
		flex: none;
		color: var(--accent);
		font-size: 0.72rem;
	}
</style>
