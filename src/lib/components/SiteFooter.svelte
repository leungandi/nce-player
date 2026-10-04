<footer class="site-foot" id="site-footer">
	<div class="inner">
		<p class="line">
			<span class="tag">素材来源</span>时间轴来自
			<a href="https://github.com/tangx/New-Concept-English" target="_blank" rel="noopener noreferrer"
				>tangx/New-Concept-English</a
			>，词汇释义来自
			<a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noopener noreferrer"
				>ECDICT</a
			>。
		</p>

		<p class="line">
			<span class="tag">版权说明</span>本站为非商业的个人学习项目，<strong>不拥有相关内容版权</strong>；请支持正版，购买官方教材与音频。
		</p>

		<p class="links">
			<a href="https://github.com/leungandi/nce-player" target="_blank" rel="noopener noreferrer"
				>项目源码</a
			>
			<span aria-hidden="true">·</span>
			<a href="https://github.com/leungandi/nce-audio" target="_blank" rel="noopener noreferrer"
				>音频资源</a
			>
			<span aria-hidden="true">·</span>
			<a href="https://github.com/leungandi/nce-player/issues" target="_blank" rel="noopener noreferrer"
				>反馈纠错</a
			>
		</p>
	</div>
</footer>

<style>
	.site-foot {
		border-top: 1px solid var(--border);
		margin-top: 32px;
		padding: 16px 20px calc(22px + env(safe-area-inset-bottom));
		color: var(--text-muted);
		font-size: 0.74rem;
		line-height: 1.7;
	}

	.inner {
		max-width: 760px;
		margin: 0 auto;
	}

	.line {
		margin: 0 0 6px;
	}

	.line strong {
		color: var(--text);
	}

	.tag {
		display: inline-block;
		margin-right: 6px;
		padding: 1px 7px;
		border-radius: 4px;
		background: var(--bg-sunken);
		font-size: 0.7rem;
	}

	a {
		color: var(--text-muted);
		text-decoration-color: var(--border);
		text-underline-offset: 2px;
	}

	a:hover {
		color: var(--accent);
		text-decoration-color: currentColor;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 10px 0 0;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
</style>
