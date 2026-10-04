<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { LessonLine } from '#lib/data/types.js';

	let { lines, onPlay, onStop }: {
		lines: LessonLine[];
		onPlay: (index: number) => void;
		onStop?: () => void;
	} = $props();

	let index = $state(0);
	let recording = $state(false);
	let seconds = $state(0);
	let error = $state('');
	let clips = $state<Record<number, { url: string; seconds: number }>>({});
	let playingMine = $state(false);

	let recorder: MediaRecorder | null = null;
	let timer = 0;

	const current = $derived(lines[index] ?? null);
	const clip = $derived(clips[index] ?? null);

	function goto(next: number) {
		if (next < 0 || next >= lines.length) return;
		if (recording) stopRecord();
		index = next;
	}

	function playOriginal() {
		onStop?.();
		onPlay(index);
	}

	async function startRecord() {
		error = '';
		onStop?.();
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const chunks: Blob[] = [];
			const mediaRecorder = new MediaRecorder(stream);
			recorder = mediaRecorder;

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size) chunks.push(event.data);
			};
			mediaRecorder.onstop = () => {
				const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
				const previous = clips[index];
				if (previous) URL.revokeObjectURL(previous.url);
				clips = { ...clips, [index]: { url: URL.createObjectURL(blob), seconds } };
				for (const track of stream.getTracks()) track.stop();
			};

			mediaRecorder.start();
			recording = true;
			seconds = 0;
			timer = window.setInterval(() => {
				seconds += 1;
			}, 1000);
		} catch {
			error = '拿不到麦克风权限，检查一下浏览器的录音授权。';
		}
	}

	function stopRecord() {
		recorder?.stop();
		recorder = null;
		recording = false;
		clearInterval(timer);
	}

	function playMine() {
		if (!clip) return;
		onStop?.();
		const audio = new Audio(clip.url);
		playingMine = true;
		audio.onended = () => {
			playingMine = false;
		};
		void audio.play();
	}

	onDestroy(() => {
		clearInterval(timer);
		for (const item of Object.values(clips)) URL.revokeObjectURL(item.url);
	});
</script>

<div class="wrap">
	<p class="progress">第 {index + 1} / {lines.length} 句</p>

	{#if current}
		<p class="sentence">{current.en}</p>
		{#if current.zh}<p class="zh">{current.zh}</p>{/if}
	{/if}

	<div class="row">
		<button class="ghost" type="button" onclick={() => goto(index - 1)} disabled={index === 0}>
			上一句
		</button>
		<button class="play" type="button" onclick={playOriginal}>▶ 原音</button>
		<button
			class="ghost"
			type="button"
			onclick={() => goto(index + 1)}
			disabled={index >= lines.length - 1}
		>
			下一句
		</button>
	</div>

	<button
		class="record"
		class:on={recording}
		type="button"
		onclick={() => (recording ? stopRecord() : startRecord())}
	>
		{recording ? `■ 停止录音 ${seconds}s` : '● 跟读录音'}
	</button>

	<button class="mine" type="button" onclick={playMine} disabled={!clip || playingMine}>
		{clip ? `♪ 听我的录音（${clip.seconds}s）` : '还没有录音'}
	</button>

	{#if error}<p class="error">{error}</p>{/if}
	<p class="tip">
		先听原音，再录一遍自己的。录完对比听——注意重音、连读和句尾的升降调。录音只存在本地，不会上传。
	</p>
</div>

<style>
	.wrap {
		padding: 14px 18px 24px;
		overflow-y: auto;
	}

	.progress {
		margin: 0 0 10px;
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.sentence {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.6;
	}

	.zh {
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 0.86rem;
	}

	.row {
		display: flex;
		gap: 8px;
		margin-top: 16px;
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

	.play {
		border: none;
		background: var(--accent);
		color: #fff;
	}

	.row button:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.record,
	.mine {
		width: 100%;
		margin-top: 12px;
		border-radius: var(--radius);
		padding: 13px 0;
		font-size: 0.92rem;
		cursor: pointer;
	}

	.record {
		border: 1px dashed var(--border);
		background: var(--bg-elevated);
		color: var(--text);
	}

	.record.on {
		border-style: solid;
		border-color: #c0392b;
		color: #c0392b;
		background: rgb(192 57 43 / 8%);
	}

	.mine {
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		color: var(--text);
	}

	.mine:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.error {
		margin: 12px 0 0;
		color: #c0392b;
		font-size: 0.82rem;
	}

	.tip {
		margin: 16px 0 0;
		color: var(--text-muted);
		font-size: 0.76rem;
		line-height: 1.6;
	}
</style>
