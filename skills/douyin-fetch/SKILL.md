---
name: douyin-fetch
description: Use when downloading Douyin (抖音) videos by aweme_id, full URL, short link, or raw share text. Downloads mp3/mp4/cover, extracts structured info (title, keywords, shownotes, chapters, stats) and saves raw API response.
---

# Douyin Fetch

通过 TikHub API 下载抖音视频，提取结构化信息（标题、关键词、shownotes、章节）并保存原始数据。

## 环境配置

在项目目录创建 `.env`：

```
TIKHUB_TOKEN=your_bearer_token_here
```

## 用法

```bash
# aweme_id
bun ~/.claude/skills/douyin-fetch/scripts/fetch.mjs --aweme_id=7584759194394299657

# 完整 URL
bun ~/.claude/skills/douyin-fetch/scripts/fetch.mjs --url="https://www.douyin.com/video/7584759194394299657"

# 短链接
bun ~/.claude/skills/douyin-fetch/scripts/fetch.mjs --url="https://v.douyin.com/PQARjBoqYpo/"

# 抖音分享文案（整段粘贴，自动提取链接）
bun ~/.claude/skills/douyin-fetch/scripts/fetch.mjs --url="8.41 X@M.ws ... https://v.douyin.com/PQARjBoqYpo/ 复制此链接..."

# 强制重新下载
bun ~/.claude/skills/douyin-fetch/scripts/fetch.mjs --aweme_id=xxx --force
```

## 输出结构

运行后在当前目录生成：

```
data/
├── index.json                  # 所有视频索引
└── {aweme_id}/
    ├── raw.json                # TikHub 原始 API 响应
    ├── info.json               # 结构化提取数据
    ├── audio.mp3               # 音频（可用于 ASR）
    ├── video.mp4               # 视频（1080p 优先）
    └── cover.jpeg              # 封面（原始竖版比例）
```

## info.json 字段说明

| 字段 | 说明 |
|------|------|
| `id` | aweme_id |
| `title` | 视频标题 |
| `desc` | 完整描述（含 hashtag） |
| `keywords[]` | hashtag 列表 |
| `shownotes.abstract` | AI 摘要 |
| `shownotes.chapters[]` | 章节列表（含时间戳、要点、详情） |
| `mp3.url` / `mp4.url` | 原始媒体 URL |
| `stats` | 点赞/收藏/评论/分享数 |
| `author` | 作者信息 |

## 去重机制

同一 aweme_id 已存在时自动跳过，`--force` 强制覆盖。

## 后续流程

下载完成后可接 fun-asr 做语音识别：

```bash
bun ~/.claude/skills/fun-asr/scripts/fun-asr-cli.js \
  "$(cat data/{aweme_id}/info.json | bun -e "const d=await Bun.stdin.json();console.log(d.mp3.url)")" \
  data/{aweme_id}/asr
```
