---
name: daily-cola-update
description: 汇总 marswaveai/cola 仓库过去一天的 commit。每天上午 10:20 定时触发：git fetch 后列出时间窗内的 commit（含作者、改动统计、PR 号），供生成简要中文日报。当辛宝问"cola 仓库昨天有什么更新/动态"时也可手动使用。
---

# Daily Cola Update

marswaveai/cola 仓库的每日 commit 汇总器。

## 用法

```bash
node /Users/otto/.agents/skills/daily-cola-update/scripts/daily-cola-update.mjs [--hours N] [--all]
```

- 默认统计 `origin/main` 过去 24 小时的非 merge commit。
- `--hours N` 调整时间窗；`--all` 统计所有远端分支。
- 输出 Markdown 清单：每条含短 hash、标题（通常带 PR 号）、作者、时间、改动统计，以及 body 前几行。
- fetch 失败不致命（用本地引用继续，输出里会标注）；仓库不存在时报错并提示 clone 命令。

## 本地克隆

`/Users/otto/mycode/marswave/cola`（remote: github.com/marswaveai/cola，HTTPS，本机已有访问凭证）。

## 汇报约定（cron 用）

拿到清单后按主题/模块归类，每类一两句中文说明，附主要 PR 号；`docs(ci)` 类 bot 自动文档提交合并一句带过，不逐条列；没有新 commit 就直说仓库安静，不硬凑。

## 定时任务

cron `daily-cola-update`：每天 10:20 执行本脚本并生成日报。
