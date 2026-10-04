<script lang="ts">
	import type { LessonLine } from '#lib/data/types.js';
	import { maskSentence } from '#lib/text/mask.js';
	import type { RevealLevel } from '#lib/text/mask.js';

	let { lines, activeIndex, onPlay }: {
		lines: LessonLine[];
		activeIndex: number;
		onPlay: (index: number) => void;
	} = $props();

	const LEVELS: Array<{ value: RevealLevel; label: string }> = [
		{ value: 0, label: '全显示' },
		{ value: 1, label: '首字母' },
		{ value: 2, label: '全遮住' }
	];

	let level = $state<RevealLevel>(1);
	let revealed = $state<Set<number>>(new Set());

	function toggleReveal(index: number) {
		const next = new Set(revealed);
		if (next.has(index)) next.delete(index);
		else next.add(index);
		revealed = next;
	}

	function resetAll() {
		revealed = new Set();
	}
</script>

<div class="wrap">
	<div class="bar">
		{#each LEVELS as item (item.value)}
			<button
				class="chip"
				class:on={level === item.value}
				type="button"
				onclick={() => {
					level = item.value;
					resetAll();
				}}
			>
				{item.label}
			</button>
		{/each}
		<button class="chip" type="button" onclick={resetAll}>重新遮住</button>
	</div>

	<ol class="list">
		{#each lines as line (line.i)}
			<li>
				<div
					class="line"
					class:active={line.i === activeIndex}
					class:masked={level > 0 && !revealed.has(line.i)}
					role="button"
					tabindex="0"
					onclick={() => {
						onPlay(line.i);
						toggleReveal(line.i);
					}}
					onkeydown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						onPlay(line.i);
						toggleReveal(line.i);
					}}
				>
					<span class="idx">{line.i + 1}</span>
					<span class="en">
						{revealed.has(line.i) ? line.en : maskSentence(line.en, level)}
					</span>
				</div>
			</li>
		{/each}
	</ol>
	<p class="tip">点句子播放并显示原文；提示级别越高越难。</p>
</div>

<style>
	.wrap {
		overflow-y: auto;
		padding: 8px 10px 24px;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 6px 8px 12px;
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

	.chip.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.line {
		display: flex;
		gap: 10px;
		padding: 10px 12px;
		border-radius: var(--radius);
		cursor: pointer;
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
		padding-top: 0.25em;
	}

	.en {
		line-height: 1.6;
	}

	.masked .en {
		color: var(--text-muted);
		letter-spacing: 0.02em;
	}

	.tip {
		margin: 14px 8px 0;
		color: var(--text-muted);
		font-size: 0.76rem;
	}
</style>
