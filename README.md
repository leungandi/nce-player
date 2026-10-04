# 新概念英语 · 精听学习站

逐句点读、精确循环、中英对照、离线可用的新概念英语学习站。

> 站点地址：<https://nce.loveyy.net>（部署中）
> 整体计划见 [PLAN.md](./PLAN.md)。

## 这个项目想解决什么

现成的 NCE 工具站大多是「电子书 + 播放器」：能听，但不产生学习行为。本项目只抓三件事：

1. **句子优先** —— 点读、循环、听写、跟读、背诵全部挂在句子上。
2. **离线优先** —— 地铁上能听，不烧流量。
3. **学习闭环** —— 学过的内容会自己回到你面前。

## 当前进度

阶段 0（骨架与部署）已完成：

- SvelteKit 3 + TypeScript + Vite 8，全站静态预渲染
- 主题系统（跟随系统、可切换、无闪白）
- 单元测试（Vitest）与 GitHub Actions 部署流水线
- 自定义域名与 GitHub Pages 的接入配置

## 开发

```sh
npm install
npm run dev        # 本地开发
npm run check      # 类型检查
npm test           # 单元测试
npm run build      # 产出静态站点到 build/
npm run format     # 格式化
```

## 目录结构

```
src/
├── app.css              # 全局样式与主题变量
├── app.html             # HTML 模板（含防闪白的内联主题脚本）
├── lib/
│   └── utils/           # 纯逻辑工具，配单元测试
└── routes/              # 路由；+layout.ts 里开启全站预渲染
static/
├── CNAME                # 自定义域名
└── robots.txt
tools/                   # 数据管线脚本（拉取、转码、规范化）
```

## 部署

推送到 `main` 后由 GitHub Actions 自动构建并发布到 Pages。

首次接入自定义域名时，**顺序不能反**：

1. DNS 加 `CNAME`：`nce` → `leungandi.github.io`（先不要开 Cloudflare 代理）
2. 等 GitHub 签发 Let's Encrypt 证书，勾上 **Enforce HTTPS**
3. 证书生效后再接入 Cloudflare：云朵点成橙色，SSL/TLS 选 **Full (strict)**

先开 Cloudflare 代理会让 GitHub 的证书签发被挡住，页面会长时间停在「证书未签发」。

## 素材与版权

- 音频与课文素材来自互联网，**本项目仅作个人学习研究使用，不拥有版权**。
- 强烈建议支持正版，购买官方教材与音频。
