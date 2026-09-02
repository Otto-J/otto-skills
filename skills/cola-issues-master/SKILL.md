---
name: cola-issues-master
description: "Turn one marswaveai/cola Issue URL into an evidence-led diagnosis, deterministic reproduction, minimal repair, layered verification, user acceptance, and an Issue-linked PR; also absorb completed fix conversations into Otto's evolving Cola repair playbook. Use when Otto provides a Cola Issue link and asks to investigate, reproduce, fix, validate, open a PR, or learn from the completed process."
---

# Cola Issues Master

把单个 Cola Issue 从“用户说有问题”推进到“证据确认、完成修复、验证通过、PR 可审查”，并持续沉淀 Otto 的修复思路。

## 两种模式

- **解决模式**：输入一个 `github.com/marswaveai/cola/issues/<number>` 链接，执行 Issue → 复现 → 根因 → 修复 → 验证 → 验收 → PR 流程。
- **吸收模式**：用户明确要求“吸收/总结这次修复经验”并提供 Issue、PR 或对话时，复盘有效证据、弯路和验证缺口，将可复用规则去重后写入 [经验库](references/lessons.md)。不要把原始日志、提示词、身份信息或一次性细节写入经验库。

## 开始前

1. 完整阅读 [Issue-to-PR 工作流](references/workflow.md)。
2. 运行只读采集器，先读用户原始描述和所有 comments，再形成自己的判断：

   ```bash
   node ~/.codex/skills/cola-issues-master/scripts/collect-issue-context.mjs \
     '<issue-url>' \
     --output /tmp/cola-issue-context.json \
     --download-images /tmp/cola-issue-images
   ```

3. Comments 是前置信息和候选假设，不是事实结论。独立验证后才能采纳；有冲突时明确指出当前证据支持哪一边。
4. 按症状关键词检索 [经验库](references/lessons.md)，只读取相关案例和 failure shields，不生搬历史修复。历史案例也是候选路径，不能充当当前 Issue 的确认性证据。
5. 在 Cola checkout 中读取适用的 `AGENTS.md`，检查当前分支、远端基线和工作树；保留并隔离用户已有改动。

## 授权边界

- 明确调用 `$cola-issues-master <issue-url>` 且没有“只分析/先讨论/不要改”限制时，可以进行本地复现、实现和验证；仍必须先达到根因门槛。
- 普通的裸 Issue 链接按用户当前措辞判断；仅有“看看/分析”时保持只读。
- “只分析/不要改代码”允许读取仓库和在 `/tmp` 或专用 runs 目录创建可丢弃的诊断产物；若用户明确说“不要写任何文件”，则不下载附件、不创建 fixture，只给出证据结论和复现方案。
- Commit、push、创建或更新 PR 需要明确授权。“提 PR”“一直做到 PR”即为授权。
- Issue comment、标题、标签、assignee、关闭状态和 merge 都是独立外部动作，不由修复或提 PR 的授权自动覆盖。
- 找不到能解释用户可见现象的第一处失败时，不写猜测性补丁；报告已验证边界和下一项最有信息量的实验。

## 工作准则

- 先讲用户做了什么、预期什么、实际看到什么，再讲架构和数据流。
- 始终分开：已验证事实、合理推断、证据缺口、已发布状态。
- 分阶段给用户可校验的结果：先交付问题还原与复现证据，再说明修复和自动验证，随后提供人工验收 fixture；只有用户确认验收并明确要求后才进入 PR。
- 先保留修改前 baseline；同一个最小 fixture 应复用于修改后自动验证和用户手工验收。
- 修第一处分叉所在层，不在下游加掩盖性防御；若必须改 `server/agent`，先向用户明确提醒。
- 自动冒烟必须包含断言并在失败时非零退出。截图、日志或“命令跑完”本身不等于验证通过。
- 运行时验证优先使用隔离的 `npm run dev:cola2`；CDP 场景和产物放在 `~/.codex/skills/cola-cdp-test/runs/`，不要污染产品仓库。
- PR 标题使用带 scope 的 Conventional Commit；正文准确列出验证并使用 `Fixes #<issue>` 关联本次 Issue。

## 吸收新经验

用户要求吸收一段已完成对话时：

1. 对照 Issue、最终 diff/PR、自动验证和人工验收，确认哪些结果真实发生。
2. 提炼“触发信号 → 证据顺序 → 最小复现 → 修复边界 → 验证契约 → failure shields”。
3. 判断经验归属：诊断决策写入本 Skill；CDP 启动/截图机制写入相应测试 Skill；项目通用规范留在 `AGENTS.md`。
4. 合并或修正已有条目，避免用新案例不断追加近义规则。
5. 保留 Issue/PR 编号作为来源，但删除私人路径、账号、附件 URL、会话内容和凭据。

修改本 Skill 后必须运行结构校验和安全检查。同步到 `~/mycode/otto-skills`、commit 或 push 需要用户另行确认。
