<script lang="ts">
	import type { LessonLine } from '#lib/data/types.js';
	import { accuracy, diffWords } from '#lib/text/diff.js';
	import type { DiffPart } from '#lib/text/diff.js';

	let { lines, onPlay }: { lines: LessonLine[]; onPlay: (index: number) => void } = $props();

	let index = $state(0);
	let input = $state('');
	let result = $state<DiffPart[] | null>(null);

	const current = $derived(lines[index] ?? null);
	const score = $derived(result ? Math.round(accuracy(result) * 100) : null);

	function play() {
		onPlay(index);
	}

	function check() {
		if (!current) return;
		result = diffWords(current.en, input);
	}

	function goto(next: number) {
		if (next < 0 || next >= lines.length) return;
		index = next;
		input = '';
		result = null;
		onPlay(next);
	}
</script>

<div class="wrap">
	<p class="progress">第 {index + 1} / {lines.length} 句</p>

	<button class="play" type="button" onclick={play}>▶ 播放这一句</button>

	<textarea
		bind:value={input}
		placeholder="把听到的写下来…"
		rows="3"
		spellcheck="false"
		autocapitalize="off"
	></textarea>

	<div class="row">
		<button class="ghost" type="button" onclick={() => goto(index - 1)} disabled={index === 0}>
			上一句
		</button>
		<button class="primary" type="button" onclick={check} disabled={!input.trim()}>提交</button>
		<button
			class="ghost"
			type="button"
			onclick={() => goto(index + 1)}
			disabled={index >= lines.length - 1}
		>
			下一句
		</button>
	</div>

	{#if result && current}
		<section class="result">
			<p class="score" class:good={score === 100}>正确率 {score}%</p>
			<p class="diff">
				{#each result as part, partIndex (partIndex)}
					<span class={part.type}>{part.text}</span>
				{/each}
			</p>
			<p class="answer">原句：{current.en}</p>
		</section>
	{/if}
</div>

<style>
	.wrap {
		padding: 14px 18px 24px;
		overflow-y: auto;
	}

	.progress {
		margin: 0 0 12px;
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.play {
		width: 100%;
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
		border-radius: var(--radius);
		padding: 14px 0;
		font-size: 0.95rem;
		cursor: pointer;
	}

	.play:hover {
		border-color: var(--accent);
	}

	textarea {
		width: 100%;
		margin-top: 12px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text);
		font: inherit;
		line-height: 1.6;
		resize: vertical;
	}

	.row {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}

	.row button {
		flex: 1;
		border-radius: var(--radius);
		padding: 11px 0;
		font-size: 0.88rem;
		cursor: pointer;
	}

	.ghost {
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
	}

	.primary {
		border: none;
		background: var(--accent);
		color: #fff;
	}

	.row button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.result {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--border);
	}

	.score {
		margin: 0 0 10px;
		color: var(--text-muted);
		font-size: 0.82rem;
	}

	.score.good {
		color: var(--accent);
		font-weight: 600;
	}

	.diff {
		margin: 0;
		line-height: 2;
	}

	.diff .same {
		color: var(--text);
	}

	.diff .missing {
		color: #c0392b;
		font-weight: 600;
		background: rgb(192 57 43 / 10%);
		border-radius: 3px;
		padding: 1px 3px;
	}

	.diff .extra {
		color: var(--text-muted);
		text-decoration: line-through;
		background: rgb(200 150 0 / 14%);
		border-radius: 3px;
		padding: 1px 3px;
	}

	.answer {
		margin: 12px 0 0;
		color: var(--text-muted);
		font-size: 0.84rem;
		line-height: 1.6;
	}
</style>
