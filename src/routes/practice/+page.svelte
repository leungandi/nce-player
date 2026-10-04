<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { books, getLesson } from '#lib/data/index.js';
	import { loadDict } from '#lib/data/dict.js';
	import type { DictEntry } from '#lib/data/dict.js';
	import { loadAll } from '#lib/store/wordbook.js';
	import { gradeTranslation, pickCloze, pickMeaning } from '#lib/practice/factory.js';
	import type { Cloze, Meaning, TranslationResult } from '#lib/practice/factory.js';
	import type { LessonLine } from '#lib/data/types.js';

	type Kind = 'translation' | 'cloze' | 'meaning';

	const KINDS: Array<{ value: Kind; label: string }> = [
		{ value: 'translation', label: '中译英' },
		{ value: 'cloze', label: '完形填空' },
		{ value: 'meaning', label: '词义选择' }
	];

	type Question =
		| { kind: 'translation'; zh: string; en: string; lesson: string }
		| { kind: 'cloze'; data: Cloze }
		| { kind: 'meaning'; data: Meaning };

	let kind = $state<Kind>('translation');
	let question = $state<Question | null>(null);
	let input = $state('');
	let chosen = $state<string | null>(null);
	let result = $state<TranslationResult | null>(null);
	let message = $state('');
	let stats = $state({ right: 0, total: 0 });
	let ready = $state(false);

	const allLessonIds = books.flatMap((book) => book.lessons.map((lesson) => lesson.id));
	/** 优先从"听过的课"里抽题；一课都没听过时才用全部课文 */
	let pool = $state<string[]>([]);

	const scopeLabel = $derived(
		pool.length
			? `题目从你听过的 ${pool.length} 课里抽`
			: `题目从四册共 ${allLessonIds.length} 课里随机抽`
	);

	/** 读本地进度，找出听过的课（听到 3 秒以上）。 */
	function learnedLessons(): string[] {
		const learned: string[] = [];
		for (const id of allLessonIds) {
			try {
				const raw = localStorage.getItem(`nce:progress:${id}`);
				if (!raw) continue;
				const saved = JSON.parse(raw) as { time?: number };
				if (Number.isFinite(saved?.time) && (saved.time as number) > 3) learned.push(id);
			} catch {
				// 忽略坏数据
			}
		}
		return learned;
	}

	function pickRandom<T>(items: T[]): T {
		return items[Math.floor(Math.random() * items.length)];
	}

	/** 随机取一句课文；`needZh` 用于中译英，必须带译文。 */
	async function randomLine(needZh: boolean) {
		const source = pool.length ? pool : allLessonIds;
		for (let attempt = 0; attempt < 60; attempt += 1) {
			const lesson = await getLesson(pickRandom(source));
			if (!lesson) continue;
			const line = pickRandom(lesson.lines) as LessonLine | undefined;
			if (!line) continue;
			if (needZh && !line.zh) continue;
			if (line.en.length < 18) continue;
			return { lesson, line };
		}
		return null;
	}

	async function buildQuestion(): Promise<Question | null> {
		if (kind === 'translation') {
			const found = await randomLine(true);
			if (!found) return null;
			return {
				kind: 'translation',
				zh: found.line.zh ?? '',
				en: found.line.en,
				lesson: found.lesson.id
			};
		}

		const dict = await loadDict();
		// 干扰项词库：整册词汇
		const vocabPool = Object.keys(dict.words);

		if (kind === 'cloze') {
			for (let attempt = 0; attempt < 40; attempt += 1) {
				const found = await randomLine(false);
				if (!found) continue;
				const cloze = pickCloze(found.line, vocabPool);
				if (cloze) return { kind: 'cloze', data: cloze };
			}
			return null;
		}

		const records = loadAll().filter((record) => record.translation);
		if (!records.length) return null;
		const record = pickRandom(records);
		const entry = dict.words[record.w] ?? (record.base ? dict.words[record.base] : undefined);
		if (!entry) return null;
		const pool2 = Object.entries(dict.words) as Array<[string, DictEntry]>;
		const meaning = pickMeaning(record.w, entry, pool2);
		return meaning ? { kind: 'meaning', data: meaning } : null;
	}

	async function next() {
		message = '';
		chosen = null;
		input = '';
		result = null;
		const built = await buildQuestion();
		question = built;
		if (!built) {
			message =
				kind === 'meaning'
					? '生词本还是空的。先去课文里点几个词加进来，再来做词义练习。'
					: '暂时抽不出合适的题目，稍后再试。';
		}
	}

	function switchKind(value: Kind) {
		kind = value;
		void next();
	}

	function submitTranslation() {
		if (question?.kind !== 'translation' || !input.trim()) return;
		const graded = gradeTranslation(question.en, input);
		result = graded;
		stats = {
			right: stats.right + (graded.verdict === 'correct' ? 1 : 0),
			total: stats.total + 1
		};
	}

	function choose(option: string) {
		if (chosen || !question) return;
		chosen = option;
		const isRight =
			question.kind === 'cloze'
				? option === question.data.answer
				: question.kind === 'meaning'
					? option === question.data.answer
					: false;
		stats = { right: stats.right + (isRight ? 1 : 0), total: stats.total + 1 };
	}

	onMount(() => {
		pool = learnedLessons();
		ready = true;
		void next();
	});
</script>

<svelte:head>
	<title>练习 · 新概念英语</title>
</svelte:head>

<div class="page">
	<header>
		<a class="back" href={resolve('/')}>← 返回</a>
		<h1>练习</h1>
		<p class="sub">
			{#if stats.total}
				答对 {stats.right} / {stats.total}
			{:else}
				{scopeLabel}
			{/if}
		</p>
	</header>

	<div class="kinds">
		{#each KINDS as item (item.value)}
			<button
				class="chip"
				class:on={kind === item.value}
				type="button"
				onclick={() => switchKind(item.value)}
			>
				{item.label}
			</button>
		{/each}
	</div>

	{#if !ready}
		<p class="empty">加载中…</p>
	{:else if message && !question}
		<section class="card">
			<p>{message}</p>
			<p class="cta"><a href={resolve('/')}>去听课文 →</a></p>
		</section>
	{:else if question?.kind === 'translation'}
		<section class="card">
			<p class="prompt-label">把下面这句翻译成英文</p>
			<p class="prompt">{question.zh}</p>
			<textarea
				bind:value={input}
				rows="3"
				placeholder="用英文写出这句话…"
				spellcheck="false"
				autocapitalize="off"
				disabled={!!result}
			></textarea>

			{#if result}
				<p class="score" class:good={result.verdict === 'correct'}>
					{result.verdict === 'correct' ? '完全正确' : result.verdict === 'close' ? '接近了' : '再想想'}
					· 正确率 {Math.round(result.score * 100)}%
				</p>
				<p class="diff">
					{#each result.parts as part, index (index)}
						<span class={part.type}>{part.text}</span>
					{/each}
				</p>
				<p class="answer">原句：{question.en}</p>
				<button class="primary" type="button" onclick={next}>下一题</button>
			{:else}
				<button class="primary" type="button" onclick={submitTranslation} disabled={!input.trim()}>
					提交
				</button>
			{/if}
		</section>
	{:else if question?.kind === 'cloze'}
		<section class="card">
			<p class="prompt-label">选出合适的词补全句子</p>
			<p class="cloze">
				{question.data.before}<span class="blank">{chosen ?? '______'}</span>{question.data.after}
			</p>
			<div class="options">
				{#each question.data.options as option (option)}
					<button
						class="option"
						class:right={chosen && option === question.data.answer}
						class:wrong={chosen === option && option !== question.data.answer}
						type="button"
						onclick={() => choose(option)}
						disabled={!!chosen}
					>
						{option}
					</button>
				{/each}
			</div>
			{#if chosen}
				<p class="answer">原句：{question.data.before}{question.data.answer}{question.data.after}</p>
				{#if question.data.line.zh}<p class="answer">译文：{question.data.line.zh}</p>{/if}
				<button class="primary" type="button" onclick={next}>下一题</button>
			{/if}
		</section>
	{:else if question?.kind === 'meaning'}
		<section class="card">
			<p class="prompt-label">选出正确的释义</p>
			<p class="word">{question.data.word}</p>
			{#if question.data.phonetic}<p class="phonetic">/{question.data.phonetic}/</p>{/if}
			<div class="options">
				{#each question.data.options as option (option)}
					<button
						class="option"
						class:right={chosen && option === question.data.answer}
						class:wrong={chosen === option && option !== question.data.answer}
						type="button"
						onclick={() => choose(option)}
						disabled={!!chosen}
					>
						{option}
					</button>
				{/each}
			</div>
			{#if chosen}<button class="primary" type="button" onclick={next}>下一题</button>{/if}
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
		margin: 6px 0 18px;
		color: var(--text-muted);
		font-size: 0.84rem;
	}

	.kinds {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 16px;
	}

	.chip {
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
		border-radius: 999px;
		padding: 6px 14px;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.chip.on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 20px;
	}

	.prompt-label {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.prompt {
		margin: 10px 0 0;
		font-size: 1.1rem;
		line-height: 1.7;
	}

	.word {
		margin: 10px 0 0;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.phonetic {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 0.86rem;
	}

	.cloze {
		margin: 14px 0 0;
		font-size: 1.05rem;
		line-height: 1.9;
	}

	.blank {
		display: inline-block;
		min-width: 4em;
		border-bottom: 2px solid var(--accent);
		color: var(--accent);
		text-align: center;
	}

	textarea {
		width: 100%;
		margin-top: 14px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		line-height: 1.6;
		resize: vertical;
	}

	.options {
		display: grid;
		gap: 8px;
		margin-top: 14px;
	}

	.option {
		text-align: left;
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		border-radius: var(--radius);
		padding: 11px 14px;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.option:hover:not(:disabled) {
		border-color: var(--accent);
	}

	.option.right {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.option.wrong {
		border-color: #c0392b;
		color: #c0392b;
		text-decoration: line-through;
	}

	.primary {
		width: 100%;
		margin-top: 14px;
		border: none;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		padding: 11px 0;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.primary:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.score {
		margin: 14px 0 0;
		font-size: 0.86rem;
		color: var(--text-muted);
	}

	.score.good {
		color: var(--accent);
		font-weight: 600;
	}

	.diff {
		margin: 10px 0 0;
		line-height: 2;
	}

	.diff :global(.same) {
		color: var(--text);
	}

	.diff :global(.missing) {
		color: #c0392b;
		font-weight: 600;
		background: rgb(192 57 43 / 10%);
		border-radius: 3px;
		padding: 1px 3px;
	}

	.diff :global(.extra) {
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

	.empty {
		color: var(--text-muted);
	}

	.cta a {
		color: var(--accent);
		text-decoration: none;
		font-weight: 600;
	}
</style>
