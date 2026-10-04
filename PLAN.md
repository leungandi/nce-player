# 自建 NCE 学习站 · 总体计划（v2，待 review）

> 状态：技术选型已定稿（见 §8），剩两个命名问题等你确认。
> 参考项目：[iChochy/NCE](https://github.com/iChochy/NCE)（MIT，仅代码）
> 素材上游：[tangx/New-Concept-English](https://github.com/tangx/New-Concept-English)（无 LICENSE）

---

## 0. 一句话概括

在 iChochy/NCE 的资源约定基础上，做一个**离线可用、每课独立 URL、以句子为单位**的新概念英语学习站。
代码托管在 GitHub，资源独立托管，通过自定义域名访问，部署链路沿用「GitHub Pages + Cloudflare」。

---

## 1. 目标与非目标

### v1 要达成的

1. 打开域名就能听课文，断网也能听已经听过的课。
2. 每一课有独立 URL，可分享、可收藏、浏览器前进后退正常。
3. 句级操作做到比上游更准：点句即播、精确循环、变速不变调、逐句中英对照。
4. 学过的内容有地方沉淀：生词本 + 到期复习。

### 明确不做

- 不做通用内容平台、不做课程市场。
- v1 不做账号体系、不做登录（保留后续接入的位置）。
- 不对外分发版权内容，定位个人学习自用。
- 不做移动端 App（PWA 足够）。

---

## 2. 现状调研结论（均已实测验证）

### 2.1 上游项目事实

| 项目 | 结论 |
|---|---|
| 代码形态 | 纯静态站点，17 个 ES module，无构建、无测试、无类型 |
| 资源约定 | `data.json` → `book.json` → 每课 `unit.mp3` + `unit.lrc` |
| 资源部署 | `nce.mleo.site`、`85.mleo.site`，Cloudflare 反代 GitHub Pages |
| 主站部署 | `nce.ichochy.com` 同样是 **Cloudflare 反代 GitHub Pages**（`server: cloudflare` + `via: 1.1 varnish`） |
| 音频上游 | tangx 仓库：276 课（72+96+60+48），617 MB，配**纯英文** LRC 时间轴 |
| 中文来源 | Gemini 机翻后拼在 `\|` 后面，**时间戳与上游逐条一致** |
| 英音 | 压缩包里只有一个二维码图，**没有音频** |
| 许可 | iChochy 代码 MIT，**内容与音频不覆盖**；tangx 仓库无 LICENSE |

### 2.2 上游代码的具体短板（读源码确认）

| 问题 | 位置 | 影响 |
|---|---|---|
| 无 Service Worker | 全仓库无注册代码 | 装不成离线 PWA |
| 单页 hash 路由 | 只有 `index.html` | 每课无独立 URL，不可分享，SEO 抓不到课文 |
| 句子循环靠 `timeupdate` | `ReadingSystem.#handleSentence` | 33 ms 粒度，移动端易跳字 |
| 句子结束时间取下一句起点 | `LRCParser.getSentenceBoundaries` | 把句间停顿也圈进循环 |
| 无全局快捷键 | 只有歌词行有 Enter/Space | 空格、方向键都不能用 |
| 学习数据只有 `playTime` | `utils/storage.js` | 无生词、无复习、无掌握度 |
| `DEFAULT_BOOK_KEY='YL5A'` 不存在 | `js/config.js` | 靠 fallback 兜住，属于失效配置 |
| 预加载整课 mp3 | `PrefetchService.prefetch` | 不看 `Save-Data`，移动流量浪费 |
| 用 0.3 s 硬偏移校正时间轴 | `CONFIG.PLAYER.TIME_OFFSET` | 说明上游时间戳本身不够准 |
| 文档与代码不符 | `REFACTORING.md` | 提到的 `ResourceLoader.js` / `EventManager.js` / `main.old.js` 都不存在 |

### 2.3 值得继承的设计

- **资源与播放器解耦**：一份资源就是一个可静态托管的目录，换课本只改一条登记记录。
- **LRC 单文件承载双语与时间轴**：一个文件解决两件事。
- **LRU 缓存 + 预取** 的思路本身是对的。

---

## 3. 差异化主线

上游本质是"电子书 + 播放器"，提供材料但不产生学习行为。我们只抓三条：

1. **句子优先（sentence-first）**：所有功能挂在"句子"这个单位上。
2. **离线优先（offline-first）**：能缓存、能断网、省流量。
3. **学习闭环（retention loop）**：学过的东西会自动回到你面前。

---

## 4. 总体架构

```
                    ┌──────────────────────────────┐
   浏览器 ────────▶ │ Cloudflare（CDN + HTTPS + 国内可达）
                    └──────────────┬───────────────┘
                                   │
              ┌────────────────────┴─────────────────────┐
              ▼                                          ▼
   nce.loveyy.net                              nce-audio.loveyy.net
   GitHub Pages（代码仓库产物）                  GitHub Pages（资源仓库）
   每课一个静态 HTML，几百 KB                    lesson.json + 音频
              ▲
              │ 构建（Actions）
   ┌──────────┴───────────┐
   │ nce-player（源码）    │  SvelteKit + TypeScript
   │  └ tools/ 数据管线    │  Node：拉取、转码、规范化
   │  └ pipeline/ 对齐     │  Python + ffmpeg + WhisperX（一次性跑）
   └──────────▲───────────┘
              │ 一次性拉取
   tangx/New-Concept-English
```

### 仓库划分

| 仓库 | 内容 | 是否绑域名 |
|---|---|---|
| `nce-player` | 站点源码、构建、数据管线脚本、Actions 工作流 | 是（`nce.loveyy.net`） |
| `nce-audio` | 规范化后的资源产物（JSON + 音频） | 是（`nce-audio.loveyy.net`） |

先做两个仓库。管线脚本暂放 `nce-player/tools/`，稳定后再考虑拆第三个。

---

## 5. 数据规范（本计划的核心）

### 5.1 为什么不直接用上游 LRC

上游 LRC 只有"句子起点 + 英文"，缺三样必需品：

1. 句子的**结束时间**（循环、听写、跟读都要）。
2. 中文与英文的**可信对齐**（上游是整句拼字符串，翻译错误无法定位）。
3. 句子与**词汇的关联**（生词本、SRS 的输入）。

所以自建 JSON 规范，同时提供 LRC 导入器以便复用现成素材。

### 5.2 资源仓库结构

```
nce-audio/
├── catalog.json                 # 课本登记表（等价上游 data.json）
├── nce1/
│   ├── book.json
│   ├── cover.jpg
│   └── 001/
│       ├── lesson.json          # 句子、翻译、生词、注释
│       └── audio.m4a            # 全课音频（AAC 单声道 64 kbps）
└── nce2/ ...
```

### 5.3 `lesson.json`

```json
{
  "id": "NCE2-01",
  "book": "nce2",
  "title": "A Private Conversation",
  "titleZh": "私人谈话",
  "accent": "us",
  "audio": { "src": "audio.m4a", "duration": 79.4 },
  "lines": [
    {
      "i": 0,
      "start": 9.77,
      "end": 15.10,
      "en": "Why did the writer complain to the people behind him?",
      "zh": "作者为什么要向他身后的人抱怨？",
      "words": ["writer", "complain"]
    }
  ],
  "words": [
    {
      "w": "complain",
      "lemma": "complain",
      "pos": "v.",
      "phonetic": "kəmˈpleɪn",
      "zh": "抱怨；投诉",
      "pattern": "complain to sb about sth",
      "level": "CET4"
    }
  ],
  "notes": [
    { "line": 4, "type": "grammar", "title": "过去进行时", "body": "were sitting 表示当时正在发生……" }
  ]
}
```

关键点：

- `end` 由强制对齐算出（WhisperX），**不再用"下一句起点"**，也不需要上游那种 0.3 s 硬偏移。
- `words` 双向可查：句子 → 词，词 → 出现的句子。
- `notes` 允许为空，后续可从 PDF 教材抽语法点填充。

### 5.4 词汇数据从哪来

用开源词典 **ECDICT**（含音标、释义、词频、考试标签、词形还原）离线裁成精简 JSON，随资源仓库发布。一次性满足三件事：单词释义、`running → run` 的词形还原、按词频自动判定"这篇对你是生词"。

### 5.5 关于句级音频切片

上一轮提过"把音频切成句级切片"，**现在收回**：一整课才 1–2 分钟、600 KB 左右，离线时直接缓存整课文件即可，没必要产生几千个小文件。精确循环用播放层解决（见 §8.2）。

---

## 6. 功能清单：上游有什么，我们怎么做

### 6.1 上游已有，我们保留（功能对位表）

| 上游功能点 | 出处 | 我们的做法 | 阶段 |
|---|---|---|---|
| 课本选择下拉 | `UnitView.renderBooks` | 保留 | 2 |
| 封面 / 书名 / 等级展示 | `UnitView.setBookMeta` | 保留 | 2 |
| 单元列表侧边栏 + 当前项高亮 + 自动滚动 | `UnitView.renderUnits/setActive` | 保留 | 2 |
| 移动端单元下拉 | `#unitSelect` | 保留 | 2 |
| 上一课 / 下一课（边界禁用） | `UnitView.updateNav` | 保留 | 1 |
| 播放 / 暂停 | `AudioController.toggle` | 保留 | 1 |
| 进度条点击 + 拖拽（pointer capture） | `AudioController.#bind` | 保留 | 1 |
| 当前时间 / 总时长 | `formatTime` | 保留 | 1 |
| 倍速 6 档循环切换 | `#cycleSpeed` | 保留，补 0.6 / 0.8 档 | 1 |
| **循环 5 模式**：关 / 单句点读 / 单句循环 / 本课循环 / 本书循环 | `CONFIG.LOOP_MODES` | 保留 5 模式，**修正句尾边界** | 1 |
| **点读**：点句立刻跳转并播放 | `#onLyricActivate` | 保留 | 1 |
| **中英对照 4 模式**：双语 / 仅英 / 仅中 / 模糊 | `TRANSLATION_MODES` | 保留 | 1 |
| 逐句高亮 + 智能自动滚动 | `LyricsView.highlight/#shouldScroll` | 保留 | 1 |
| 每课播放进度记忆 | `utils/storage.js` | 保留，并细化到"上次停在句 N" | 1 |
| 偏好持久化（主题/倍速/循环/中英/课本） | `#restorePreferences` | 保留 | 1 |
| 深色 / 浅色主题（跟随系统） | `ui/theme.js` | 保留 | 1 |
| Toast 轻提示 | `ui/Toast.js` | 保留 | 1 |
| 打赏弹窗（ESC / 点背景关闭） | `ui/modal.js` | 改为"关于 / 致谢"页 | 3 |
| 下一课预加载 | `PrefetchService` | 保留，增加 `Save-Data` 判断 | 2 |
| LRU 缓存（音频 3 / 歌词 3） | `CacheManager` | 保留，升级为 Cache Storage 持久化 | 2 |
| PWA manifest（fullscreen / 图标） | `manifest.webmanifest` | 保留，补 Service Worker | 2 |
| SEO：JSON-LD / OG / Twitter / canonical | `index.html` | **升级为每课静态页面** | 2 |
| 无障碍：歌词行 `role=button` + 键盘可达 | `LyricsView` | 保留，并补全局快捷键 | 1 |
| 响应式布局（桌面侧边栏 / 移动端下拉） | `css/style.css` | 保留 | 1 |
| 加载失败降级与占位提示 | 各处 `setEmpty` | 保留 | 1 |
| 页脚作者 / 反馈 / GitHub 链接 | `index.html` | 保留，指向你自己的仓库 | 1 |

### 6.2 上游没有，我们补上

| 新增能力 | 为什么值得做 | 阶段 |
|---|---|---|
| 每课独立 URL | 分享、收藏、前进后退、SEO，全都要它 | 1 |
| 句级精确边界 | 上游的循环会带进停顿，跟读体验差 | 1 |
| 全局快捷键（空格 / ←→ / ↑↓ / R / T） | 听写和精听都是键盘操作，没有它效率低一半 | 1 |
| 离线播放（Service Worker） | 地铁通勤是主要使用场景 | 2 |
| 锁屏 / 通知栏控制（MediaSession API） | 听力类产品的必备项，上游没有 | 2 |
| 睡眠定时器 | 睡前听课文是高频场景 | 2 |
| 句子收藏 / 标记难点 | 复习的原始输入 | 2 |
| 全站搜索（课文 / 单词） | 想查一句话在哪一课 | 3 |
| 生词本 + SRS 复习（ts-fsrs） | 从"听过"到"记住" | 3 |
| 听写模式（放一句打一句 + diff 高亮） | 听力精度训练的最有效形式 | 3 |
| 背诵模式（全显示 → 首字母 → 全空） | 对应新概念的实际教学方式 | 3 |
| 跟读录音与回放对比 | 先做录音回放，评分放阶段 4 | 3 |
| 分享单句（链接 / 卡片图） | 低成本传播点 | 3 |
| 逐句讲解 / 自动出题 / 发音评分 | AI 增强，见阶段 4 | 4 |

**结论：3 条差异化主线之外，上游 26 个功能点全部保留，另加 14 项新能力。**

---

## 7. 功能分期

### 阶段 0 · 骨架与部署

- SvelteKit + TypeScript 骨架，`static/CNAME` 写好域名。
- GitHub Actions 构建并发布到 Pages。
- Cloudflare 接入，域名可访问。

**验收**：`https://nce.loveyy.net` 能打开一个空壳页面，HTTPS 正常。

### 阶段 1 · 单课跑通（MVP 核心）

- 数据管线第一版：拉 tangx 第 2 册第 1 课 → 转码 → 对齐 → 产出 `lesson.json`。
- 精听页：点读、5 种循环、变速、逐句中英对照、快捷键、进度记忆。
- 每课独立 URL。

**验收**：这一课在手机上能顺畅完成"听 → 点句复听 → 循环跟读 → 看中英"，刷新后回到上次的句子。

### 阶段 2 · 批量化与离线

- 管线跑通全部 276 课，产出完整资源仓库。
- Service Worker 离线，尊重 `Save-Data`。
- 课本 / 单元切换、搜索、锁屏控制、睡眠定时器。

**验收**：飞行模式下能打开任意已缓存课程并正常播放与逐句操作。

### 阶段 3 · 学习闭环

- 生词本（ECDICT 提供释义与音标）、SRS 复习（ts-fsrs）、"今日任务"页。
- 听写、背诵、跟读录音、句子收藏、分享单句。

**验收**：连续用三天，生词自动出现在复习队列，不用手动翻课。

### 阶段 4 · AI 与同步（可选）

- 逐句讲解（基于 `notes` 做 RAG）、自动出题与判分、发音评分。
- 跨设备同步：Spring Boot + PostgreSQL，账号可选，不登录也能完整使用。

---

## 8. 技术选型（已定）

### 8.1 前端：SvelteKit + TypeScript

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **SvelteKit 5**（`adapter-static` 预渲染） | 一套框架同时解决路由、UI 与静态产出 |
| 构建 | Vite | SvelteKit 内建 |
| 语言 | TypeScript | 数据格式字段多，靠类型兜住 |
| 状态 | Svelte 5 runes（`$state` / `$derived`） | 页面状态简单，不需要额外状态库 |
| 样式 | 原生 CSS + CSS 变量 | 延续上游思路，不引 CSS 框架 |
| 图标 | 内联 SVG | 不引图标库 |
| 单元测试 | Vitest | 数据解析、LRC 导入、SRS 调度都值得测 |
| 端到端 | Playwright | 验证"点句能播""断网可用"这类交互 |
| 离线 | `vite-plugin-pwa`（Workbox） | 静态资源 + 音频的缓存策略成熟 |

**为什么是 SvelteKit，而不是 Astro / React / 原生 TS：**

- 要**每课一个静态 HTML**（分享 + SEO + 秒开），又要**一地交互状态**（播放、循环、高亮、进度、离线）。SvelteKit 的 `adapter-static` 预渲染正好一把梭：276 个路由全部产出静态页面，页面里再 hydrate 播放器。
- Astro 也擅长静态内容，但这个站的每一课本质上是"一整个交互式播放器"，用 Astro 等于整页包一个岛，多一层边界却没有收益。
- React 生态最大，但运行时体积和心智负担对这个体量的项目不划算；原生 TS 省了框架，路由和 SEO 却要手搓。
- Svelte 产物小、移动端快，这对一个"地铁上听"的产品是实打实的体验差异。

### 8.2 播放层

- 句子循环改用 `requestAnimationFrame` 轮询 + 提前量补偿，判定粒度从 33 ms 降到 16 ms。
- 跟读、听写等要求高的场景用 Web Audio 的 `AudioBufferSourceNode`，做到采样级循环。
- 变速显式设置 `preservesPitch` 与 Safari 的 `webkitPreservesPitch`。
- 音频编码：AAC-LC 单声道 64 kbps（`.m4a`）。上游是 145 kbps，mleo 那份压到 47 kbps，64 kbps 取中间。

### 8.3 数据管线

| 环节 | 工具 |
|---|---|
| 拉取 | Node 脚本（复用 `tools/inventory-resources.mjs` 的并发与重试骨架） |
| 转码 | ffmpeg |
| 句级对齐 | Python + WhisperX（一次性跑完，产物入库） |
| 词汇 | ECDICT 裁剪 |
| 翻译 | 以上游机翻为初稿 + 校错入口 + 重点课文人工校 |

### 8.4 后端（阶段 4 才需要）

Spring Boot + PostgreSQL，提供可选的账号与同步接口。前端只留一个同步适配层，不登录时全部走本地存储。

---

## 9. 部署与域名

### 9.1 现状（已确认）

- 你已有 `leungandi.github.io` 仓库，CNAME = `loveyy.net`，是 hexo 博客。
- 顶级域名已被博客占用，**新项目必须用子域名**，默认 `nce.loveyy.net`。

### 9.2 配置步骤

1. Pages 设置里填自定义域名，仓库内 `static/CNAME` 内容与之一致。
2. DNS 加一条 `CNAME`：`nce` → `leungandi.github.io`。
3. 等 GitHub 签发 Let's Encrypt 证书后，勾上 **Enforce HTTPS**。
4. **证书签好之后**再接入 Cloudflare：云朵点成橙色，SSL/TLS 选 **Full (strict)**。

> 顺序不能反。先开 Cloudflare 代理会让 GitHub 的证书签发被挡住，页面会长时间停在"证书未签发"。

### 9.3 资源域名

资源仓库同样开 Pages，绑 `nce-audio.loveyy.net`。

已实测：GitHub Pages 对静态文件返回 `access-control-allow-origin: *` 且支持 `accept-ranges: bytes`，跨域加载 `lesson.json` 与音频、拖动进度条都没有问题。

---

## 10. 里程碑与工时估算（单人，粗略）

| 阶段 | 内容 | 估算 | 产出 |
|---|---|---|---|
| 0 | 骨架 + 部署 + 域名 | 0.5–1 天 | 域名可访问 |
| 1 | 单课跑通 MVP | 2–3 天 | 一课完整可用 |
| 2 | 全册管线 + 离线 | 3–5 天 | 276 课 + 断网可用 |
| 3 | 学习闭环 | 5–8 天 | 生词 + SRS + 听写 |
| 4 | AI 与同步（可选） | 3–10 天 | 讲解 / 出题 / 后端 |

**阶段 0–2 合计约 1–1.5 周**，之后就已经是能日常使用的成品。

---

## 11. 风险与对策

| 风险 | 说明 | 对策 |
|---|---|---|
| 版权 | 音频与课文均非我们所有，tangx 仓库无 LICENSE | 个人自用、不公开分发；资源仓库加免责声明；不上广告、不做付费 |
| 国内访问 | `*.github.io` 直连不稳 | Cloudflare 前置（同上游做法），无需备案 |
| 仓库体积 | 617 MB 音频不能进代码仓库 | 资源独立仓库；代码仓库只留几百 KB |
| 流量 | Pages 100 GB/月 软限制 | 音频降到 64 kbps 后单课约 600 KB，个人使用远够 |
| 上游停更 | tangx 仓库 2023 年后无更新 | 素材**一次性拉到自己仓库**，不做热链 |
| 翻译质量 | 上游是机翻，错误已知 | 保留初稿，加报错入口，重点课文人工校对 |
| 对齐成本 | WhisperX 需要跑 276 课 | 一次性任务，本地跑或放 Actions 手动触发 |
| 单点依赖 | 数据格式是我们自定义的 | 提供 LRC 导入器，随时能换素材源 |

---

## 12. 已定决策与待确认

### 我已定的（不再占用你的时间）

| 项 | 决定 |
|---|---|
| 前端框架 | SvelteKit + TypeScript（理由见 §8.1） |
| 定位 | 数据层保持通用（能装任意课本），产品层只做新概念的体验优化 |
| 优先级 | 先把播放与点读循环做到胜过上游，再做学习闭环 |
| 音频口音 | 先做美音，`lesson.json` 预留 `accent` 字段，将来能加英音 |
| 中文翻译 | 以上游机翻为初稿，加校错入口 |
| 账号同步 | v1 纯本地，位置留给阶段 4 |
| 音频规格 | AAC-LC 单声道 64 kbps |

### 只剩两个命名问题

1. 子域名用 `nce.loveyy.net` 吗？
2. 仓库名用 `nce-player` + `nce-audio` 吗？

这两个只要你不反对，我就按默认值开工；改名没有成本。

---

## 附：当前工作区状态

```
C:\NCE\
├── PLAN.md                    ← 本文档
├── _upstream\                 ← 上游项目克隆（仅作参考，不修改）
└── tools\
    ├── inventory-resources.mjs  ← 资源盘点脚本（可复用为管线第一环）
    ├── _yingyin.zip             ← 英音压缩包（实测只有二维码图）
    └── _yingyin\                ← 解压结果，可删
```

> 网络说明：本机出网需要走本地代理，即 `HTTPS_PROXY=http://127.0.0.1:6789` 且 `NODE_USE_ENV_PROXY=1`。
