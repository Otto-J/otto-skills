---
name: asr-auralwise
description: >
  Transcribe local audio/video files to text, subtitles, and speaker-diarized transcripts using the AuralWise ASR API.
  Use this skill whenever the user wants to convert audio to text, generate subtitles (SRT), transcribe a recording/meeting/podcast/interview/lecture, identify speakers in audio, or do speech-to-text (ASR). Common triggers: "transcribe this audio", "转写音频", "语音转文字", "生成字幕", "谁在说话/发言人识别", "ASR", "make subtitles", "speech to text", "convert mp3 to text". Handles large local files by auto-compressing before upload, polls until done, and writes results with a README mapping back to the original file.
compatibility: Requires Node.js >= 18 and ffmpeg on PATH. Needs an AuralWise API key (asr_...) configured in ~/.claude/skills/asr-auralwise/.env or ~/mycode/simple-audio2/.env or ASR_AURALWISE_API_KEY env var.
---

# asr-auralwise — AuralWise 语音转写 skill

提供**本地音频路径**即可一条龙完成：自动压缩(超限时) → 提交 → 30s 轮询 → 落盘产物 + README 映射。

## 何时使用

用户给一个本地音频/视频文件（mp3/m4a/wav/mp4…），要转成文字、字幕、或带发言人识别的稿子。本 skill 默认**开启说话人分离**。

## 如何运行

核心脚本：`scripts/asr.mjs`（零依赖，纯 Node 18+）。

```bash
# 一条龙（最常用）
node ~/.claude/skills/asr-auralwise/scripts/asr.mjs ~/Downloads/meeting.mp3

# 带参数
node ~/.claude/skills/asr-auralwise/scripts/asr.mjs ~/Downloads/podcast.mp3 --lang en --max-speakers 4

# 子命令（查询既有任务）
node ~/.claude/skills/asr-auralwise/scripts/asr.mjs status <task_id>
node ~/.claude/skills/asr-auralwise/scripts/asr.mjs result  <task_id>
```

常用选项：`--lang`、`--max-speakers`(默认8)、`--speakers`(固定人数)、`--no-diarize`、`--events`、`--standard`(词级时间戳)、`--hotwords a,b,c`。

## 产物

落盘到 `~/Downloads/asr-auralwise-YYYYMMDD-HHmmss/` 目录，含：

- `<stem>.json` — 原始完整结果
- `<stem>.txt`  — 人类可读文本（带发言人 + 时间戳）
- `<stem>.srt`  — 段级字幕
- `README.md`   — 记录**原始文件路径**、task_id、时长、语言、说话人数等，用于回溯映射

## 鉴权（key 不暴露）

API Key (`asr_...`) 从以下任一处读取，**绝不写入 skill 内容**：

1. 环境变量 `ASR_AURALWISE_API_KEY`
2. `~/.claude/skills/asr-auralwise/.env`（已 .gitignore，从 `.env.example` 复制后填入）
3. `~/mycode/simple-audio2/.env`（旧项目，兼容回退）

若脚本报「未找到 API Key」，按上述任一处配置即可。

## 行为细节

- **自动压缩**：本地文件 >140MB 时（base64 直传上限 200MB），自动调 ffmpeg 压至 16kHz mono 64kbps（音质降，转写无碍）。压缩为临时文件，结束后清理。
- **轮询**：30s 一次，至 `done`/`failed`/`abandoned`。默认超时 30 分钟，可由 `ASR_POLL_TIMEOUT_MS` 调。
- **默认选项**：`enable_asr=true`、`enable_diarize=true`（发言人识别）、`enable_audio_events=false`、`optimize_zh=true`（中文走精简模式，快 10-30x；非中文自动忽略）。
- **task_id 长期有效**：可随时用 `status`/`result` 重查，无需重新转写。

## 注意

- 该 skill 仅做分析与脚本化调用，不修改用户文件。压缩产物为临时文件，原件不动。
- 大文件上传+转写耗时与音频时长正相关（约 17x 实时速度，92 分钟音频约 5 分钟）。长时间任务建议后台运行。
