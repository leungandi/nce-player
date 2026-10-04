# 数据格式

站点用到的数据分四块：三份在代码仓库里（由管线产出、随站点构建），一份在独立的音频仓库，外加浏览器的本地存储。

| 数据 | 位置 | 谁产出 | 谁读 |
|---|---|---|---|
| 课文清单 | `src/lib/data/catalog.json` | `tools/build-book.mjs` | 首页、课本目录、路由预渲染 |
| 课文正文 | `src/lib/data/lessons/<id>.json` | `tools/build-book.mjs`、`tools/align-lessons.mjs` | 精听页、练习页 |
| 词典 | `src/lib/data/dict.json` | `tools/build-dict.mjs` | 单词查询、词义练习 |
| 音频 | `nce-audio` 仓库的 `audio/` | `tools/build-book.mjs` | `<audio>` 标签 |
| 学习数据 | 浏览器 localStorage | 前端运行时 | 进度、偏好、生词本 |

类型定义集中在 [`src/lib/data/types.ts`](../src/lib/data/types.ts)，页面与工具都以它为准。

---

## 1. 课文清单 `catalog.json`

体积很小（约 17 KB），随页面一起打包，用来生成路由和列表。

```jsonc
{
  "books": [
    {
      "key": "nce1",                       // 课本标识，也是 URL 里的 key
      "name": "新概念英语 第一册",
      "titleEn": "First Things First",
      "lessons": [
        {
          "id": "nce1-01",                 // 课文唯一标识，也是 URL 里的 id
          "no": 1,                         // 课号
          "title": "Excuse Me",
          "label": "01–02"                 // 可选：一课覆盖多课时显示区间（第一册）
        }
      ]
    }
  ]
}
```

> 第一册一个音频文件覆盖两课，所以课号是 01、03、05……，`label` 用来在界面上显示成 `01–02`。
> 其余三册没有 `label`，界面回落到补零的 `no`。

---

## 2. 课文正文 `lessons/<id>.json`

一课一个文件，文件名就是 `id`。目前共 276 个。

```jsonc
{
  "id": "nce2-01",
  "book": "nce2",
  "title": "A Private Conversation",
  "accent": "us",                    // us | uk（英音预留，暂无数据）
  "audio": {
    "src": "audio/nce2-01.m4a"       // 相对资源仓库根目录的路径
  },
  "translation": "machine",          // none | machine | reviewed
  "alignment": "aligned",            // estimated | aligned
  "lines": [
    {
      "i": 0,                        // 句序，从 0 开始、连续
      "start": 9.77,                 // 这句在音频里的起点（秒）
      "end": 13.912,                 // 终点（秒），已校准到真实语音边界
      "en": "Why did the writer complain to the people behind him?",
      "zh": "作者为什么要向他身后的人抱怨？"   // 可缺省
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `nce<册号>-<两位课号>`，全局唯一 |
| `accent` | `"us" \| "uk"` | 口音。当前全部是美音 |
| `audio.src` | string | 相对资源根目录的路径，**不含域名**；域名由 `VITE_MEDIA_BASE` 拼接 |
| `translation` | `"none" \| "machine" \| "reviewed"` | 译文可信度。目前是上游机翻，标 `machine`；人工校对过才改 `reviewed` |
| `alignment` | `"estimated" \| "aligned"` | 句子边界来源。`estimated` 是估算，`aligned` 是静音检测校准过 |
| `lines[].start` | number | 来自上游时间轴，**没有改动过** |
| `lines[].end` | number | 由静音检测校准；未校准时是"下一句起点 − 0.15 秒" |
| `lines[].zh` | string? | 中文译文，按时间戳与英文行就近匹配（容差 0.5 秒） |

### 数据不变量

管线与校准脚本都保证这几条，写新脚本时可以依赖：

1. `lines` 按 `start` 升序，`i` 与数组下标一致。
2. 每句 `end > start`。
3. 除最后一句外，`lines[i].end <= lines[i+1].start`（不会越过下一句）。
4. 相邻两句之间空出来的就是真实停顿，中位数约 0.9 秒。

### 已定义但当前没有数据的字段

`types.ts` 里还定义了这些，为后续功能预留，目前管线不产出：

- `titleZh`：课文标题的中译
- `lines[].words`：本句涉及的词（词形还原后）
- `words[]`：全课词表，含音标、词性、搭配、考纲标签
- `notes[]`：语法点与用法注释

---

## 3. 词典 `dict.json`

从 63 MB 的 ECDICT 裁出"课文里真正出现过的词"，约 800 KB，前端按需加载（独立 chunk，不进首屏）。

```jsonc
{
  "words": {
    //        音标          释义                        考纲标签  是否核心词
    "complain": ["kəm'plein", "v. 抱怨, 抗议, 控诉", "cet4", 1]
  },
  "lemmas": {
    //  变形 → 原形（仅当变形本身没有释义时才有记录）
    "buying": "buy"
  }
}
```

### 查词顺序

`src/lib/data/dict.ts` 里的 `lookup()` 按这个顺序找：

1. 原样查 `words`（转小写）
2. 缩写回退：`it's` → `it`、`don't` → `do`、`I'm` → `I` 等
3. 查 `lemmas` 拿原形，再查 `words`
4. 都没命中就显示"词典未收录"

> `lemmas` 只收"自己没释义"的变形，因为 ECDICT 的 lemma 表是按词频归并的，
> `was → wa`、`they → he` 这种映射并不可靠。像 `was` 本身就带"be的过去式"的释义，
> 直接用它反而更准。

### 词条为什么是数组

压体积：`[音标, 释义, 考纲标签, 是否核心词]`。
`是否核心词` 来自 ECDICT 的 oxford / collins 星级，1 表示常用词。

---

## 4. 音频

放在独立仓库 `nce-audio` 的 `audio/` 目录，文件名是 `<id>.m4a`（AAC 单声道 64 kbps）。

站点里存的是**相对路径**（`audio/nce2-01.m4a`），拼域名由 `src/lib/data/assetUrl.ts` 负责：

| 环境 | 结果 |
|---|---|
| 开发 | `/audio/nce2-01.m4a`，由 `vite.config.ts` 里的中间件指向本地 `nce-audio/audio` |
| 生产 | 由构建时的 `VITE_MEDIA_BASE` 拼出，见 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) |
| 换 CDN | 设置环境变量 `VITE_MEDIA_BASE`，代码不用改 |

`src` 如果本身就是 `http(s)://` 开头的绝对地址，会原样使用——留给以后把个别音频放到别处。

---

## 5. 本地存储

学习数据全部存在浏览器里，不上传。键名统一以 `nce:` 开头：

| 键 | 内容 | 写入位置 |
|---|---|---|
| `nce:theme` | `"light"` / `"dark"` | `src/app.html`（首屏防闪白）、首页 |
| `nce:loop` | 循环模式 `off` / `click` / `one` / `list` / `book` | 精听页 |
| `nce:translation` | 显示方式 `both` / `en` / `zh` / `blur` | 精听页 |
| `nce:rate` | 播放速度（字符串化的数字） | 精听页 |
| `nce:progress:<lessonId>` | `{"index": 句序, "time": 秒}` | 精听页（播放中节流写入，暂停与离开时再写一次） |
| `nce:last` | 最近打开的课文 id | 精听页写，首页"继续学习"读 |
| `nce:wordbook` | 生词数组，见下 | 生词本 |

### `nce:wordbook` 结构

```jsonc
[
  {
    "w": "complain",
    "base": "complain",          // 可选：命中原形时记录
    "phonetic": "kəm'plein",
    "translation": "v. 抱怨, 抗议, 控诉",
    "tag": "cet4",
    "lesson": "nce2-01",         // 出处，复习时回看上下文
    "line": 0,
    "ctx": "Why did the writer complain to the people behind him?",
    "addedAt": 1759500000000,
    "card": {                    // FSRS 调度状态
      "due": "2026-10-05T02:00:00.000Z",
      "stability": 3.1,
      "difficulty": 5.2,
      "elapsed_days": 0,
      "scheduled_days": 1,
      "reps": 1,
      "lapses": 0,
      "state": 2,
      "last_review": "2026-10-04T02:00:00.000Z"
    }
  }
]
```

`card` 就是 `ts-fsrs` 的 Card 对象，只是把 `due` 与 `last_review` 两个 Date 存成 ISO 字符串，读回来时还原。

> 换设备不会同步——清掉浏览器数据就会丢。跨设备同步需要后端，属于计划里阶段 4 尚未做的部分。

---

## 6. 想改数据时改哪里

| 想做的事 | 改哪里 |
|---|---|
| 换一批课文 | `tools/build-book.mjs` 里的 `BOOKS` 映射与上游地址 |
| 调音频码率 | 同上的 `AUDIO_BITRATE` |
| 改句子边界算法 | `tools/align-lessons.mjs`，改完重跑（幂等，可反复跑） |
| 换词典来源 | `tools/build-dict.mjs` 的 `ECDICT_CSV_URL` |
| 换音频托管位置 | 环境变量 `VITE_MEDIA_BASE`，或 `src/lib/data/assetUrl.ts` 的默认值 |
