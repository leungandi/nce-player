<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta
		name="description"
		content="新概念英语点读与精听学习站：逐句点读、精确循环、中英对照、离线可用。"
	/>
</svelte:head>

{@render children()}
