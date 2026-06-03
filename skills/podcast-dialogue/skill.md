---
name: podcast-dialogue
description: 将任意文本内容转换为双人播客对话并生成音频。触发场景：(1) 用户明确要求"生成播客"、"转成播客"、"做成对话"、"制作音频节目"、"转换成播客形式"；(2) 用户提供文本内容并要求"用播客形式呈现"、"做成对话音频"；(3) 用户使用 /podcast-dialogue 命令；(4) 用户提供文章、文档、笔记等内容，并表达想要"听"或"音频化"的需求。自动生成面试式口语化对话(询问者+解答者)，调用 tts-generator 生成完整音频，支持从文件、文本或标准输入读取内容。
---

# Podcast Dialogue Generator

将任意文本内容转换为双人播客对话，并生成完整的音频文件。

## 核心特性

- **面试式对话风格**: 口语化自然，像真实面试对话，有科普作用
- **智能对话生成**: 使用 Dashscope API (Qwen) 多轮优化生成高质量对话
- **减少英文术语**: 自动将技术术语转换为中文口语表达
- **自动音色选择**: 从已克隆的音色中自动选择配对音色
- **完整音频输出**: 生成带时间戳的完整播客音频文件
- **SRT 字幕支持**: 自动生成 SRT 字幕文件，方便后期编辑

## 使用方法

### 基本用法

```bash
# 从文件读取内容
/podcast-dialogue --input content.txt --output podcast.mp3

# 直接传入文本
/podcast-dialogue --text "Vue 3 的响应式系统..." --output podcast.mp3

# 从标准输入读取
cat article.txt | /podcast-dialogue --output podcast.mp3
```

### 参数说明

- `--input <file>`: 输入文本文件路径
- `--text <content>`: 直接传入文本内容
- `--output <file>`: 输出音频文件路径（默认: podcast.mp3）
- `--preview`: 仅生成对话脚本，不生成音频

## 对话风格

### 面试式对话
- **场景**: 面试官在面试技术专家，询问他做过的项目
- **特点**: 口语化、自然、有互动感、有科普作用
- **语言**: 少用英文术语，多用中文口语表达

### 询问者 (Interviewer) - 面试官
- 角色定位: 像真实面试官，会追问、质疑、打断
- 对话特点:
  - 追问细节："为什么这样设计？"
  - 质疑方案："为什么不用XX方案？"
  - 要求举例："能举个具体例子吗？"
  - 打断追问："等等——"

### 解答者 (Expert) - 候选人
- 角色定位: 像候选人，讲思考过程和实际落地
- 对话特点:
  - 讲故事："我们当时..."、"后来发现..."
  - 踩坑经历："我们真这么干过，结果..."
  - 具体例子：某个文件怎么组织、某个命令怎么执行
  - 口语化："这个东西"、"那个地方"

## 工作流程

```
用户内容
    ↓
对话生成 (dialogue-generator.mjs)
    ↓
SRT 字幕构建 (srt-builder.mjs)
    ↓
音色自动选择
    ↓
TTS 音频生成 (tts-generator)
    ↓
音频合并
    ↓
完成播客
```

## 输出文件结构

```
output/
├── dialogue.json              # 对话脚本
├── split/
│   ├── interviewer.srt       # 询问者字幕
│   └── expert.srt            # 解答者字幕
├── audio_interviewer/        # 询问者音频片段
├── audio_expert/             # 解答者音频片段
└── final_podcast.mp3         # 最终播客
```

## 依赖要求

- **tts-generator skill**: 用于音频生成
- **至少 2 个克隆音色**: 用于区分两个说话人（建议使用配对音色，如 speaker1 和 speaker2）
- **Dashscope API**: 用于生成对话脚本（需要设置 DASHSCOPE_API_KEY 环境变量）
- **ffmpeg**: 用于音频合并

## 注意事项

1. **API 费用**: 生成对话会调用 Claude API，请注意费用控制
2. **音色准备**: 使用前请确保已克隆至少 2 个音色
3. **内容长度**: 建议单次内容不超过 5000 字，生成时长约 5-15 分钟
4. **音频质量**: 最终音频会标准化到 -14 LUFS

## 示例

### 示例 1: 技术文章转播客

```bash
# 准备内容
echo "Vue 3 的响应式系统基于 Proxy，相比 Vue 2 有更好的性能..." > vue3.txt

# 生成播客
/podcast-dialogue --input vue3.txt --output vue3-podcast.mp3
```

### 示例 2: 预览对话脚本

```bash
# 仅生成对话脚本，不生成音频
/podcast-dialogue --input content.txt --preview
```

## 高级用法

### 自定义音色

默认情况下会自动选择音色，如需手动指定：

```bash
node ~/.claude/skills/podcast-dialogue/scripts/generate-podcast.mjs \
  --input content.txt \
  --interviewer-voice "voice1" \
  --expert-voice "voice2" \
  --output podcast.mp3
```

### 调整对话风格

编辑 `dialogue-generator.mjs` 中的提示词模板，可以调整对话风格：
- 轻松幽默
- 专业严谨
- 教学式（默认）

## 故障排除

### 问题: 音色不足

```
错误: 可用音色少于 2 个
解决: 使用 tts-generator 克隆至少 2 个音色
```

### 问题: TTS 生成失败

```
解决: 使用 retry-failures.js 重试失败的片段
```

### 问题: 音频合并失败

```
解决: 检查 ffmpeg 是否正确安装
```

## 后续优化方向

- [ ] 支持自定义对话风格（轻松/专业/教学）
- [ ] 支持用户手动选择音色
- [ ] 支持添加背景音乐
- [ ] 支持多轮对话（3人以上）
- [ ] 支持从 URL 抓取内容
- [ ] 支持分段处理长内容

## 相关 Skills

- **tts-generator**: 音频生成核心功能
- **parse-tingwu**: 从听悟 JSON 生成播客
