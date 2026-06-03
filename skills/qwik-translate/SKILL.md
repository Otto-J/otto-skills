---
name: qwik-translate
description: Qwik 文档批量并行翻译工具。扫描 origin/docs 分支变更，使用多个 qwik-translation-worker agent 并行翻译文件，自动跟踪进度。
license: MIT
---

# Qwik 文档批量翻译

## 快速开始

```bash
# 扫描待翻译文件
npm run translate:scan

# 开始翻译（默认 3 个并行 worker）
npm run translate:start

# 查看状态
npm run translate:status

# 重置任务
npm run translate:reset

# 测试模式（只翻译前 2 个文件）
MAX_FILES=2 npm run translate:start

# 自定义并行数
WORKERS=5 npm run translate:start
```

## 工作流程

1. **扫描阶段** (`translate:scan`)
   - 对比 `origin/docs...HEAD`
   - 识别新增(A)、修改(M)、删除(D)的 `.mdx` 文件
   - 生成任务列表到 `scripts/.translation-tasks.json`

2. **翻译阶段** (`translate:start`)
   - 加载待处理任务
   - 使用 Task tool 并行启动多个 `qwik-translation-worker` agent
   - 每个 worker 处理一个文件
   - 自动跟踪进度到 `scripts/.translation-done.json`

3. **进度跟踪**
   - 已完成的文件会被记录，下次运行自动跳过
   - 支持中断后继续翻译

## Agent 架构

```
主进程 (translate-cli.js)
    │
    ├── 并行启动多个 qwik-translation-worker agents
    │       │
    │       ├── Worker 1 → 处理文件 A → 内部用 tiny-async-pool 批量翻译段落
    │       ├── Worker 2 → 处理文件 B → 内部用 tiny-async-pool 批量翻译段落
    │       └── Worker 3 → 处理文件 C → 内部用 tiny-async-pool 批量翻译段落
```

## 翻译规则

- 语气平静、客观、专业
- 使用「你」而非「您」
- 保留专有名词（Qwik、React、Vue、Astro 等）
- 代码块保持完整，不拆分
- 技术术语首次出现加英文注释
- 不翻译 import 语句

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MAX_FILES` | 0 | 只处理前 N 个文件（测试用，0 表示全部） |
| `WORKERS` | 3 | 并行 worker 数 |
| `TRANSLATE_CONCURRENCY` | 10 | 每个 worker 内部段落并发数 |
| `DASHSCOPE_API_KEY` | - | 通义千问 API Key |

## 文件结构

```
scripts/
├── translate-cli.js        # 主入口，扫描任务、启动 agents
├── translate-subagent.js   # 独立进程翻译单文件（可选方案）
├── translate-utils.js      # MDX 解析、diff 处理工具函数
├── .translation-tasks.json # 任务列表
└── .translation-done.json  # 完成记录
```
