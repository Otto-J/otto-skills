---
name: manage-memos-notes
description: |
  管理 Memos (notes.ijust.cc) 备忘笔记的增删改查。

  **当以下情况时使用此 Skill**：
  (1) 用户要创建备忘：「记一条 memo」「发到 memos」「存个备忘」
  (2) 用户要查看/搜索备忘：「看看 memos」「搜一下 memo」「最近的备忘」
  (3) 用户要修改备忘：「改一下那条 memo」「更新备忘内容」
  (4) 用户要删除备忘：「删掉那条 memo」「这条没用了」
  (5) 随机漫步中遇到 source: memos 的笔记，用户要求删除时，需先删远端再删本地镜像
metadata:
  category: productivity
  requires:
    env: [MEMO_SYNC_KEY]
  baseUrl: https://notes.ijust.cc
---

# Manage Memos Notes

管理自建 Memos 实例 (https://notes.ijust.cc) 上的备忘笔记，支持增删改查。

## 环境要求

- 环境变量 `MEMO_SYNC_KEY`（格式 `memos_pat_xxx`），通常在 `~/.zshrc` 中 export。
- 脚本会自动 fallback 到 `zsh -ic` 读取，无需手动 source。

## CLI 脚本

所有操作通过一个 mjs 脚本完成：

```bash
node /Users/otto/.agents/skills/manage-memos-notes/scripts/memos.mjs <command> [args]
```

### 命令一览

| 命令 | 用法 | 说明 |
|------|------|------|
| `list` | `list [--page-size N] [--page-token T]` | 列出备忘，默认 50 条 |
| `get` | `get <name>` | 查看单条备忘完整 JSON |
| `create` | `create <content> [--visibility V]` | 创建备忘，默认 PRIVATE |
| `update` | `update <name> <content> [--visibility V]` | 更新备忘内容 |
| `delete` | `delete <name>` | 软删除备忘（可从 Memos 回收站恢复） |
| `search` | `search <keyword> [--page-size N]` | 按内容关键词搜索 |

`<name>` 接受 `memos/xxx` 或简写 `xxx`。

### 示例

```bash
# 列出最近 10 条
node scripts/memos.mjs list --page-size 10

# 创建一条私密备忘
node scripts/memos.mjs create "明天记得交房租"

# 搜索包含"租房"的备忘
node scripts/memos.mjs search 租房

# 查看某条备忘详情
node scripts/memos.mjs get memos/FVBUBoe7X8RTAcoETCkWuv

# 更新内容
node scripts/memos.mjs update memos/FVBUBoe7X8RTAcoETCkWuv "房租已交"

# 软删除
node scripts/memos.mjs delete memos/FVBUBoe7X8RTAcoETCkWuv
```

## 与 Obsidian 联动

Memos 同步脚本 (`~/.cola/scripts/memos-sync/sync_memos.py`) 每天会把远端 memo 拉取到 Obsidian vault 的 `03 资料库/Memos同步/` 目录。

**删除联动规则**：当用户要求删除一条 memo 且本地存在对应 Obsidian 镜像时：
1. 先用本 skill 软删除远端 memo。
2. 用常规 list 确认该 memo 已不在列表中（软删除后详情接口仍可能返回，不视为失败）。
3. 再用 Obsidian CLI 将本地镜像移入 vault 废纸篓：
   `obsidian vault=obsidian-note delete path='03 资料库/Memos同步/<文件名>.md'`
4. 报告时明确区分：远端为软删除，本地为 Obsidian 废纸篓，两边均保留恢复余地。

## 注意事项

- 删除是**软删除**，Memos 后台回收站可恢复，不会物理销毁。
- `create` 默认 `visibility=PRIVATE`，如需公开传 `--visibility PUBLIC`。
- 搜索使用 Memos API 的 `filter` 参数做服务端过滤，大库下比本地 grep 高效。
- 所有输出为 JSON（get）或摘要表格（list/search），方便脚本化消费。
