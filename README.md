# 新概念英语 · 精听学习站

一个自用的《新概念英语》在线学习站：逐句点读、精确循环、中英对照、练习与生词复习，可安装成 App 离线使用。

**在线地址**：<https://nce.loveyy.net/>

## 文档

| 文档 | 内容 |
|---|---|
| 本文件 | 功能、技术栈、目录结构、怎么跑、怎么部署 |
| [数据格式](docs/data-format.md) | 课文、清单、词典、本地存储的字段与不变量 |
| [开发计划与实施记录](docs/PLAN.md) | 立项时的调研与方案对比，以及每阶段实际做了什么、和计划差在哪 |

看代码建议的顺序：本文件的「工程结构」→ `docs/data-format.md` → 具体页面。

---

## 功能

**精听**

- 逐句点读：点任意一句立即跳转播放
- 五种循环：关闭 / 单句点读 / 单句循环 / 本课循环 / 本书循环
- 七档变速（0.5x–2x），显式开启变调补偿，Safari 上不会变成快放录音带
- 中英对照四种显示：双语 / 仅英文 / 仅中文 / 模糊中文
- 句子结束时间由静音检测校准到真实语音边界，循环不带多余空白
- 键盘快捷键：空格播放、`←→` 上下句、`↑↓` ±5 秒、`R` 重播、`L` 循环、`T` 显示方式
- 进度记忆（精确到秒）、锁屏与通知栏控制、睡眠定时器

**练习**（课文页顶部切换）

- 听写：播放后手写，词级比对，标出漏词与多写的词并给出正确率
- 背诵：三档提示（全显示 / 首字母 / 全遮住），点击播放并揭示原文
- 跟读录音：录下自己的朗读与原音对比，录音只留在本地

**词汇**

- 课文里每个单词可点，弹出音标、释义、考试标签与所在句子
- 生词本 + FSRS 记忆曲线调度，复习时四个按钮各自显示下次间隔
- 练习页：中译英、完形填空、词义选择，优先从听过的课文里抽题

**其他**

- PWA 离线：应用外壳预缓存，页面 NetworkFirst、音频 CacheFirst（支持拖动进度条）
- 全站静态预渲染，283 个页面各自独立 URL，可分享、可被搜索

---

## 技术栈

| 用途 | 选型 |
|---|---|
| 框架 | SvelteKit 3 + TypeScript |
| 构建 | Vite 8 |
| 渲染 | `@sveltejs/adapter-static` 全站预渲染 |
| 离线 | `vite-plugin-pwa` + Workbox（含 Range 请求支持） |
| 复习调度 | `ts-fsrs` |
| 词典 | ECDICT（离线裁剪） |
| 音频处理 | ffmpeg（`ffmpeg-static`，仅管线用） |
| 测试 | Vitest |

---

## 快速开始

需要 Node 20+（CI 用 24）。

```sh
npm install

npm run dev        # 开发服务器 http://127.0.0.1:5173
npm run check      # 类型检查
npm test           # 单元测试
npm run build      # 产出静态站点到 build/
npm run format     # 格式化
```

**本地预览生产构建**用自带的静态服务器：

```sh
npm run build
node tools/serve-build.mjs      # http://127.0.0.1:4174
```

> 不要用 `npm run preview`：`vite preview` 在重新构建后会继续服务旧的文件索引，
> 新生成的带哈希资源会 404，看到的页面是没有样式的。

有一份**播放器冒烟测试**，用无头浏览器驱动真实页面，覆盖单元测试够不到的行为
（听写只播一句、本书循环自动续播、切课后播放位置归零）：

```sh
npm run build
node tools/serve-build.mjs        # 另开一个终端
node tools/smoke-player.mjs
```

它会临时把 `HTMLMediaElement.play` 换成探针、并伪造 `currentTime`，所以不需要声卡，
也不需要连得上音频仓库。Edge 不在默认路径时用环境变量 `EDGE_PATH` 指定。

**手机上看开发服务器**：`npm run dev -- --host`，然后用电脑的局域网 IP 访问
（`127.0.0.1` 在手机上指向手机自己）。

**本地要有音频**：把资源仓库克隆到项目根目录，开发服务器会通过中间件把 `/audio` 指过去。

```sh
git clone https://github.com/leungandi/nce-audio.git nce-audio
```

---

## 工程结构

```
.
├── src/
│   ├── app.html                   HTML 模板（含防深色闪白的内联主题脚本）
│   ├── app.css                    全局样式与主题变量
│   ├── vite-env.d.ts              Vite / PWA 的类型引用
│   ├── lib/
│   │   ├── components/            通用组件（页脚）
│   │   ├── data/                  课文数据层
│   │   │   ├── lessons/*.json     276 篇课文（管线产出）
│   │   │   ├── catalog.json       课本与课程清单（管线产出）
│   │   │   ├── dict.json          裁剪后的词典（管线产出）
│   │   │   ├── index.ts           清单读取、按需加载课文
│   │   │   ├── dict.ts            词典加载与查词（含缩写回退）
│   │   │   ├── assetUrl.ts        媒体地址解析（本地 / 独立资源域名）
│   │   │   └── types.ts           Lesson / Book 等数据结构
│   │   ├── lesson/                三种练习模式组件
│   │   │   ├── Dictation.svelte   听写
│   │   │   ├── Recitation.svelte  背诵
│   │   │   └── Shadowing.svelte   跟读录音
│   │   ├── player/playback.ts     播放常量与纯逻辑（附单测）
│   │   ├── practice/factory.ts    出题与判分（附单测与真实数据测试）
│   │   ├── store/wordbook.ts      生词本存储 + FSRS 调度
│   │   ├── text/                  切词 tokenize / 遮词 mask / 词级 diff
│   │   └── utils/time.ts          时间格式化
│   └── routes/                    页面（SvelteKit 文件路由）
│       ├── +layout.svelte         全站布局：样式、页脚、Service Worker 注册
│       ├── +layout.ts             开启全站预渲染
│       ├── +page.svelte           首页：复习/练习入口、继续学习、课本网格
│       ├── book/[key]/            课本目录（课程卡片网格）
│       ├── lesson/[id]/           精听页（四种模式、播放控制、单词查询）
│       ├── review/                生词复习
│       └── practice/              练习（中译英 / 完形填空 / 词义选择）
├── tools/                         数据管线与本地工具（不参与站点构建）
│   ├── build-book.mjs             拉取整册课文：下载、转码、生成 JSON
│   ├── build-dict.mjs             从 ECDICT 裁出课文里出现的词
│   ├── align-lessons.mjs          用 ffmpeg 静音检测校准句子结束时间
│   ├── serve-build.mjs            本地预览 build/ 的静态服务器
│   └── inventory-resources.mjs    上游资源盘点
├── static/                        原样复制的静态文件
│   ├── CNAME                      自定义域名
│   ├── robots.txt
│   └── icons/                     192 / 512 应用图标
└── .github/workflows/deploy.yml   构建并发布到 GitHub Pages
```

---

## 数据管线

课文不进版本库的"素材"，而是由管线生成。三个脚本各管一段：

### 1. 拉课文 `tools/build-book.mjs`

从上游 `tangx/New-Concept-English` 拉取整册音频与英文时间轴，
合并参考站点的中文翻译，音频转成 AAC 单声道 64 kbps，产出课文 JSON 与清单。

```sh
node tools/build-book.mjs --book 2              # 整册
node tools/build-book.mjs --book 2 --from 1 --to 10
node tools/build-book.mjs --book 2 --force      # 忽略已有产物重建
```

| 参数 | 说明 |
|---|---|
| `--book` | 册号 1–4 |
| `--from` / `--to` | 只处理课号区间 |
| `--force` | 已存在的也重新生成 |
| `--audio-out` | 音频输出目录，默认 `nce-audio/audio`（不存在则用 `media/audio`） |

产出：`src/lib/data/lessons/<id>.json`、`src/lib/data/catalog.json`、音频文件。

### 2. 裁词典 `tools/build-dict.mjs`

完整 ECDICT 有 63 MB、340 万词条，跑一遍只为留下课文里真正出现的词。

```sh
node tools/build-dict.mjs
```

产出 `src/lib/data/dict.json`（约 800 KB，覆盖四册共 7 500 多个词）。

### 3. 校准句子边界 `tools/align-lessons.mjs`

音频里的句子起止时间由上游时间轴给出，但**结束时间**是估算的。
这个脚本用 ffmpeg 的静音检测找出每句话真正说完的瞬间，把 `end` 校准过去。

```sh
node tools/align-lessons.mjs              # 全部
node tools/align-lessons.mjs --dry        # 只看统计不写文件
node tools/align-lessons.mjs --book 2     # 只处理某一册
node tools/align-lessons.mjs --lesson nce2-01
```

脚本是幂等的，重复跑不会越改越偏。

> 三个脚本都要访问外网。如果所在网络需要代理，给 Node 设置 `HTTPS_PROXY`
> 并开启 `NODE_USE_ENV_PROXY=1`（Node 24 起支持）。

---

## 数据结构

一篇课文一个 JSON，字段如下：

```jsonc
{
  "id": "nce2-01",
  "book": "nce2",
  "title": "A Private Conversation",
  "accent": "us",                       // 口音，预留给将来的英音
  "audio": { "src": "audio/nce2-01.m4a" },
  "translation": "machine",             // none | machine | reviewed
  "alignment": "aligned",               // estimated 估算 | aligned 静音检测校准
  "lines": [
    {
      "i": 0,
      "start": 9.77,                    // 这句在音频里的起止时间（秒）
      "end": 13.912,
      "en": "Why did the writer complain to the people behind him?",
      "zh": "作者为什么要向他身后的人抱怨？"
    }
  ]
}
```

`catalog.json` 是课本与课程清单（id、课号、标题），页面靠它生成路由与列表。
预渲染的页面清单来自 `src/routes/lesson/[id]/+page.ts` 里的 `entries()`。

---

## 部署

推送到 `main` 触发 GitHub Actions：安装依赖 → 类型检查 → 单元测试 → 构建 → 发布到 Pages。

用两个仓库：

| 仓库 | 内容 | Pages 模式 |
|---|---|---|
| `nce-player` | 源码与课文 JSON（约 2 MB） | GitHub Actions |
| `nce-audio` | 276 个音频（约 283 MB） | Deploy from a branch |

音频地址由环境变量 `VITE_MEDIA_BASE` 决定（具体值见
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）：生产构建时指向音频仓库的域名，
开发环境留空、改由 Vite 中间件指向本地 `nce-audio/audio`。想换 CDN 只改这一处。

站点的子路径由 GitHub 决定：没绑自定义域名时是 `/nce-player/`，绑了就是域名根目录。
工作流用 `actions/configure-pages` 输出的 `base_path` 传给构建，两种情况都能正确生成资源链接。

两个域名都套了 Cloudflare 代理，SSL/TLS 模式 **Full (strict)**。有三点值得记下来：

1. **音频需要单独加缓存规则** —— Cloudflare 默认只缓存 `.js`/`.css`/图片那批扩展名，`.m4a` 不在名单里，
   不加规则的话音频每次都回源。
2. **`/.well-known/acme-challenge/*` 要绕过缓存** —— GitHub 每 90 天用这个路径续证书，被缓存挡住会续期失败。
3. **HTML 与 `version.json` 保持不缓存是对的** —— 否则发版后访客会看到旧页面、检测不到新版本。

---

## 几个设计决定

- **课文 JSON 进代码仓库，音频不进。** 一课 JSON 只有几 KB，放进仓库才能预渲染成静态页面；
  音频一课时 1 MB 以上，276 课接近 300 MB，单独放一个仓库，clone 代码只要几秒。
- **全站预渲染。** 每课一个独立 URL，可分享、可被搜索；页面里的课文是静态 HTML，不依赖 JS 才能看到。
- **句子边界用静音检测而不是语音识别。** 不需要 PyTorch，ffmpeg 就够了，276 课几分钟跑完，效果足够好。
- **循环判断用 `requestAnimationFrame`。** `timeupdate` 每秒只触发约 4 次，句尾会叠进下一句开头。

---

## 版权

本项目是个人学习项目，非商业用途，**不拥有课文、音频等内容的版权**。

- 时间轴来自 [tangx/New-Concept-English](https://github.com/tangx/New-Concept-English)
- 词汇释义来自 [ECDICT](https://github.com/skywind3000/ECDICT)

《新概念英语》的教材、课文与录音版权归原作者及出版方所有，请支持正版，购买官方教材与音频。

## 许可证

本仓库的**代码**采用 [MIT 许可证](./LICENSE)，可自由使用、修改、分发。

> 注意：MIT 只覆盖代码，**不覆盖课文文本、音频、中文翻译等内容**
> ——那些内容的版权归原作者与出版方所有，见上一节。
