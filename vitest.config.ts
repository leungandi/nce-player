import { defineConfig } from 'vitest/config';

// 单元测试只覆盖纯逻辑（数据解析、时间轴、SRS 调度等），
// 因此不引入 SvelteKit 插件，保持测试启动轻快。
export default defineConfig({
	test: {
		include: ['src/**/*.{test,spec}.ts'],
		environment: 'node'
	}
});
