<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { registerSW } from 'virtual:pwa-register';
	import SiteFooter from '#lib/components/SiteFooter.svelte';

	let { children } = $props();

	// Service Worker 自动更新：有新版本就后台装上，下次访问生效
	onMount(() => {
		registerSW({ immediate: true });
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta
		name="description"
		content="新概念英语点读与精听学习站：逐句点读、精确循环、中英对照、离线可用。"
	/>
</svelte:head>

{@render children()}

<SiteFooter />
