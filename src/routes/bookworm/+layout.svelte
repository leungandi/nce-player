<script lang="ts">
	import { onMount } from 'svelte';
	import { clearUnlocked, GATE_PASSWORD, isUnlocked, markUnlocked } from '#lib/data/bookworm/gate.js';

	let { children } = $props();

	let unlocked = $state(false);
	let ready = $state(false);
	let input = $state('');
	let error = $state('');

	onMount(() => {
		unlocked = isUnlocked();
		ready = true;
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		if (input.trim() === GATE_PASSWORD) {
			unlocked = true;
			error = '';
			input = '';
			markUnlocked();
		} else {
			error = '密码不对，再试一次';
			input = '';
		}
	}

</script>

{#if !ready}
	<div class="gate"><p class="hint">加载中…</p></div>
{:else if unlocked}
	{@render children()}
{:else}
	<div class="gate">
		<form onsubmit={submit}>
			<h1>书虫</h1>
			<p class="hint">请输入密码</p>
			<input
				type="password"
				bind:value={input}
				inputmode="numeric"
				autocomplete="off"
				aria-label="密码"
				placeholder="密码"
			/>
			{#if error}<p class="error">{error}</p>{/if}
			<button type="submit">进入</button>
		</form>
	</div>
{/if}

<style>
	.gate {
		display: grid;
		place-items: center;
		min-height: 100dvh;
		padding: 24px;
	}

	.gate form {
		display: grid;
		gap: 10px;
		width: min(100%, 300px);
		text-align: center;
	}

	.gate h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.86rem;
	}

	input {
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-elevated);
		color: var(--text);
		font: inherit;
		font-size: 1.1rem;
		text-align: center;
		letter-spacing: 0.2em;
	}

	input:focus {
		outline: none;
		border-color: var(--accent);
	}

	button[type='submit'] {
		padding: 12px 0;
		border: none;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		font: inherit;
		font-size: 0.95rem;
		cursor: pointer;
	}

	.error {
		margin: 0;
		color: #c0392b;
		font-size: 0.82rem;
	}

</style>
