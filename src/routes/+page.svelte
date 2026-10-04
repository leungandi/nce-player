<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'light' | 'dark';

	let theme = $state<Theme>('light');

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
	});

	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		localStorage.setItem('nce:theme', theme);
	}

	const roadmap = [
		{ stage: '阶段 0', title: '骨架与部署', state: '进行中' },
		{ stage: '阶段 1', title: '单课跑通：点读、循环、中英对照', state: '待开始' },
		{ stage: '阶段 2', title: '全册管线与离线播放', state: '待开始' },
		{ stage: '阶段 3', title: '生词本、SRS 复习、听写与背诵', state: '待开始' },
		{ stage: '阶段 4', title: '逐句讲解、自动出题、跨设备同步', state: '待开始' }
	];
</script>

<svelte:head>
	<title>新概念英语 · 精听学习站</title>
</svelte:head>

<div class="page">
	<header class="head">
		<div>
			<h1>新概念英语</h1>
			<p class="sub">逐句点读 · 精确循环 · 中英对照 · 离线可用</p>
		</div>
		<button class="theme" type="button" onclick={toggleTheme} aria-label="切换主题">
			{theme === 'dark' ? '☾' : '☀'}
		</button>
	</header>

	<main>
		<section class="card">
			<h2>正在建设中</h2>
			<p>
				站点骨架已经搭好：静态预渲染、部署链路、测试框架都已就位。
				接下来先跑通一课的完整链路——点句即播、句级精确循环、变速、逐句中英对照。
			</p>
		</section>

		<section class="card">
			<h2>路线图</h2>
			<ol class="roadmap">
				{#each roadmap as item (item.stage)}
					<li class:current={item.state === '进行中'}>
						<span class="stage">{item.stage}</span>
						<span class="title">{item.title}</span>
						<span class="state">{item.state}</span>
					</li>
				{/each}
			</ol>
		</section>
	</main>

	<footer class="foot">
		<a href="https://github.com/leungandi/nce-player" rel="noopener noreferrer">GitHub</a>
	</footer>
</div>

<style>
	.page {
		max-width: 780px;
		margin: 0 auto;
		padding: 32px 20px 48px;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 28px;
	}

	h1 {
		margin: 0;
		font-size: 1.75rem;
		letter-spacing: 0.01em;
	}

	.sub {
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.theme {
		flex: none;
		width: 40px;
		height: 40px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text);
		font-size: 1rem;
		cursor: pointer;
		transition: border-color 0.15s ease;
	}

	.theme:hover {
		border-color: var(--accent);
	}

	.card {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow);
		padding: 20px 22px;
		margin-bottom: 18px;
	}

	h2 {
		margin: 0 0 10px;
		font-size: 1rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.card p {
		margin: 0;
		line-height: 1.7;
	}

	.roadmap {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.roadmap li {
		display: grid;
		grid-template-columns: 4.5rem 1fr auto;
		align-items: baseline;
		gap: 10px;
		padding: 10px 0;
		border-top: 1px solid var(--border);
	}

	.roadmap li:first-child {
		border-top: none;
	}

	.stage {
		color: var(--text-muted);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}

	.state {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.roadmap li.current .title {
		font-weight: 600;
	}

	.roadmap li.current .state {
		color: var(--accent);
		background: var(--accent-soft);
		border-radius: 999px;
		padding: 2px 10px;
	}

	.foot {
		margin-top: 28px;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.foot a {
		color: var(--text-muted);
	}

	@media (max-width: 520px) {
		.roadmap li {
			grid-template-columns: 4.5rem 1fr;
		}

		.state {
			grid-column: 2;
		}
	}
</style>
