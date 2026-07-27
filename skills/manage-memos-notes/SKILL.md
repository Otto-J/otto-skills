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

## 用法

两个脚本，都在本 skill 的 `scripts/` 下：

```bash
SKILL=/Users/otto/.agents/skills/manage-memos-notes/scripts

# 增删改查（单条操作）
node $SKILL/memos.mjs list [--page-size N]      # 列表，默认 50
node $SKILL/memos.mjs get <name>                # 详情 JSON
node $SKILL/memos.mjs create "内容" [--visibility PUBLIC]  # 创建，默认 PRIVATE
node $SKILL/memos.mjs update <name> "新内容"     # 更新
node $SKILL/memos.mjs delete <name>             # 软删除，可回收
node $SKILL/memos.mjs search <关键词>            # 服务端搜索

# 每日同步到 Obsidian（cron 用的就是这个）
node $SKILL/sync-to-ob.mjs [--dry-run]
```

`<name>` 接受 `memos/xxx` 或简写 `xxx`。token 自动从环境变量或 `~/.zshrc` 读取。

### sync-to-ob.mjs 说明

- 拉取远端全部 memo（翻页，**pageSize 固定 100**——服务端 pageSize=200 会返回错误的陈旧快照，已踩过坑）。
- 新 memo 写入 OB vault 的 `03 资料库/Memos同步/<日期> <id>.md`，frontmatter 直接生成 `created_at`/`updated_at` 标准格式。
- 通过 `已处理Memos清单.md` skip list 去重，幂等可重跑；文件被挪走或删除都不会重复同步。
- `--dry-run` 预览不写入。

## 与 Obsidian 联动

每日同步由本 skill 的 `sync-to-ob.mjs` 完成（cron `memos-sync` 每天 10:45 执行），远端 memo 写入 Obsidian vault 的 `03 资料库/Memos同步/` 目录。旧 Python 版 `~/.cola/scripts/memos-sync/sync_memos.py` 已弃用删除。

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
