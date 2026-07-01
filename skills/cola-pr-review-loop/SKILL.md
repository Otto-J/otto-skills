---
name: cola-pr-review-loop
description: Cola PR review 修复主入口。检查当前 Cola PR 的远程 GitHub feedback，包括 review threads、Codex Review、Cursor Bugbot、cola-actions、安全 review、CI、人工 reviewer，以及 Codex 顶层 reaction 状态；先守住用户原始需求和 PR 范围，逐条判断是否成立、是否扩大范围、是否需要用户确认；允许反驳或请求确认，修复成立且不扩大范围的问题，验证、提交、推送、resolve，然后等待自动 review 和 CI 并循环复查直到当前 PR head 没有待处理 review 问题。用户说“检查当前 PR review”“远程 review 修复”“继续看 PR 问题”“循环修 review”“看 cursor/cola-actions/codex review”“处理 bot review”时使用。
allowed-tools: Bash(gh:*), Bash(git:*), Bash(corepack pnpm:*), Bash(rg:*), Bash(sleep:*), Read, Edit, Write, Glob, Grep, Agent
---

# Cola PR Review Loop

这是 Cola PR review 修复的唯一主入口。它围绕当前 worktree 对应的 GitHub PR 建立闭环：

1. 找到当前分支关联的 PR
2. 读取远程 review threads、reviews、checks 和 bot feedback
3. 读取并区分 Codex 顶层 reaction 状态
4. 筛选当前 head 仍适用的 actionable 问题
5. 逐条判断：修复 / resolve / 反驳 / 需求变更覆盖 / 请求用户确认
6. 修复成立的问题，运行最贴近改动面的验证
7. 提交并推送到 PR 分支
8. resolve 已确认处理的 review threads
9. 等待自动 review 和 CI
10. 复查远程 feedback、reaction 和 checks，直到当前 PR head 没有待处理 review 问题

Review 触发由仓库自动化负责。不要手动评论 `@codex review`。Cursor Review 是可选专项复查；只有用户明确要求 Cursor、或你判断某类 UI/边界风险值得额外检查时，才评论 `@cursor review`。

## 输入

接受以下方式：

- 当前 worktree 内直接说“检查当前 PR review 并修复”
- PR 编号，例如 `1994`
- PR 链接，例如 `https://github.com/marswaveai/cola/pull/1994`
- 用户提到 Cursor Bugbot、Codex Review、Security Review、cola-actions、CI review，也统一使用本 skill

用户没有给 PR 时，优先用当前分支推断：

```bash
gh pr view --json number,title,url,headRefName,headRefOid,baseRefName
```

如果当前分支没有关联 PR，再要求用户给 PR 编号或链接。

## 约束

- 默认处理 `marswaveai/cola`。
- 全程使用 `gh` 读取远程 review，不使用浏览器。
- 遵守当前仓库的 `AGENTS.md` 和用户本轮额外要求。
- 保留用户已有未提交改动。提交前只 stage 本轮修复文件。
- 除非用户明确要求，避免全仓库 format 或扩大无关文件改动。
- 修改 `server/agent` 相关逻辑前先提醒用户风险。
- 每轮改动预计超过 8 个文件或 500 行时，先建议拆分。
- 测试命令统一用 `corepack pnpm ...`。
- 只 resolve 已确认修复、需求变更已覆盖、或明确无效的 review thread。
- 用户已明确拒绝、确认超出当前 PR 范围、或确认由其它 owner/后续 rollout 处理的 review thread，需要先补一条简短说明评论，再 resolve，避免远程 thread 长期悬空。
- Review bot 的建议是输入信号，处理前必须通过“范围闸门”；没有用户确认时，只做保持原始需求不变的最小修复。

## 判断原则

- 先判断 reviewer 或 bot 指出的问题是否成立；只修复当前 PR head 上真实存在、仍适用的问题。
- 允许否决建议。对不成立、过期、重复、与产品目标冲突、或扩大 PR 范围的反馈，归类为反驳、需求变更覆盖、或请求用户确认。
- 以用户原始需求为边界。反馈把小修复扩大成架构一致性、缓存时序、后台同步策略、产品文案承诺、tier/provider 策略或跨子系统重构时，默认拒绝自动实现。
- 对会改变产品语义、用户承诺、安全/隐私策略、数据迁移边界、跨 provider/跨账户数据流，或明显扩大 PR 范围的反馈，先向用户说明取舍并请求确认。
- 当不同 bot 的要求冲突时，把冲突归类为产品/安全策略决策，暂停实现并请求用户确认。
- 可自动修复的反馈通常是实现型缺陷：空指针、状态不同步、权限绕过、缓存过期、校验缺失、测试失败、明显与既定产品目标一致的边界漏洞。
- 常规用户无法稳定复现、只影响内部事件顺序、瞬时缓存、测试构造状态或罕见后台竞态的反馈，优先反驳或请求用户确认。

### 范围闸门

处理 feedback 前先记录本轮原始请求边界：

- 原始请求：
- 预期最小改动面：
- 明确不默认扩大的方向：

每条 feedback 必须回答：

1. 当前 PR head 是否真实存在这个问题？
2. 是否属于原始请求边界？
3. 修复是否新增脚本、workflow、状态机、发布策略、安全策略、迁移、后台同步或跨子系统抽象？
4. 当前团队信任模型、环境保护或人工流程是否已经覆盖这个风险？
5. 是否存在更小的修复、resolve、反驳路径？

第 3 条为是，或第 4 条需要产品/运营判断时，默认请求用户确认或反驳。不要直接实现。

实现型缺陷仍可自动修复：空指针、状态不同步、权限绕过、缓存过期、校验缺失、测试失败、与既定目标一致的边界漏洞。前提是修复不新增策略或流程。

形成决策表后再做一次总改动面检查：如果单条 feedback 都成立，但组合后的修复会明显超过原始请求边界，暂停并请求用户确认。

如果某个修复只是在防护本轮新增方案带来的新风险，先回到根修复，评估是否应该收窄方案。

## Step 1: 读取 PR 状态

确认 GitHub CLI 可用：

```bash
gh auth status
```

读取 PR 基本信息：

```bash
gh pr view <PR> --json number,title,url,state,mergedAt,headRefName,headRefOid,baseRefName,statusCheckRollup,commits,reviews,comments
```

如果 PR 已合并，立即结束 loop，并报告：

- PR 编号、标题、URL
- `state: MERGED`
- `mergedAt`
- head commit
- 本轮没有继续处理 review/CI/mergeability

如果当前 worktree 分支落后远程 head，先同步或说明本地状态。同步前检查本地 dirty 状态：

```bash
git status --short
git fetch origin <headRefName>
```

## Step 2: 读取远程 feedback

用 GraphQL 抓完整 reviews 和 review threads，包含 resolved 状态、文件、行号、作者、评论、commit：

```bash
gh api graphql -f query='
query {
  repository(owner: "marswaveai", name: "cola") {
    pullRequest(number: PR_NUMBER) {
      headRefOid
      reactionGroups {
        content
        users(first: 20) {
          nodes { login }
        }
      }
      reviews(first: 100) {
        nodes {
          author { login }
          state
          body
          submittedAt
          commit { oid }
          url
        }
      }
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 30) {
            nodes {
              author { login }
              body
              createdAt
              commit { oid }
              url
            }
          }
        }
      }
    }
  }
}'
```

补充读取 checks：

```bash
gh pr checks <PR>
```

重点关注：

- unresolved review threads
- Codex Review / OpenAI Codex
- Cursor Bugbot
- cola-actions / github-copilot
- Security Review / CodeQL / Semgrep / security-ai
- CI 失败项和 required checks
- 人工 reviewer 的 unresolved thread
- PR 顶层 reactionGroups，尤其是 `chatgpt-codex-connector[bot]` 添加的 `EYES` / `THUMBS_UP`

## Step 2.5: 判断 Codex 顶层 reaction

Codex Review 的无问题/运行中状态可能出现在 PR 顶层 reaction 上，而不是 review body 或 thread 里。读取 `pullRequest.reactionGroups` 时必须同时读取 reaction 的用户列表，并按作者区分来源：

- `chatgpt-codex-connector[bot]` 添加的 `EYES`：Codex Review 正在运行，暂停结束判断并等待复查。
- `chatgpt-codex-connector[bot]` 添加的 `THUMBS_UP`：Codex Review 已结束且通过；结合当前 head 的 unresolved Codex thread 数量判断是否可结束。
- `chatgpt-codex-connector` review/comment：Codex Review 已结束并留下 review 内容，继续按 review threads 和 review body 判断问题。
- 其他用户或 bot 添加的 `EYES` / `THUMBS_UP`，例如 `cursor`、`cola-actions`、人工账号，只代表该作者自己的 reaction。Cursor 和 cola-actions 按各自 review/comment/check 判断。

示例依据：PR 2752 的顶层 `THUMBS_UP` 由 `chatgpt-codex-connector[bot]` 添加，表示 Codex 通过结束；PR 2745 的顶层 `EYES` 由同一 bot 添加，表示 Codex 仍在运行。PR 1932 的顶层 `EYES` 由人工账号添加，归类为人工 reaction。

## Step 3: 筛选当前待处理问题

筛选规则：

- 只把 `isResolved == false` 的 thread 视为待处理问题。
- 优先关注 `commit.oid == headRefOid` 的评论和 review。
- `commit.oid` 缺失时，结合时间、thread 状态和文件现状判断是否仍适用于当前 head。
- 忽略已解决 thread、过期 commit 的反馈、纯赞同/说明性评论、重复反馈。
- 如果未解决 thread 已经被后续提交明确修复，主动 resolve。
- 如果 thread 的前提已经因用户需求变化失效，可以作为“需求变更覆盖”处理。
- 如果用户已经明确拒绝某条反馈、确认它超出当前 PR 范围、或确认交给其它 owner/后续 rollout 处理，把它作为“用户确认不处理”处理：补充说明评论后 resolve。不要把这类 thread 留在 unresolved 状态。
- `reviews.nodes` 中 `CHANGES_REQUESTED`、`COMMENTED` 且 body 有实质问题的 review 也要检查。

## Step 4: 形成决策表

把当前待处理问题压缩成最小修复列表。动手前输出：

```markdown
| Thread | 来源 | 文件 | 问题 | 决策 | 是否扩大范围 | 是否需要用户确认 | 判断依据 |
|---|---|---|---|---|---|---|---|
```

决策类型：

- 修复
- resolve：已由当前代码覆盖
- 反驳：反馈不成立或过度设计
- 需求变更覆盖
- 用户确认不处理
- 请求用户确认

如果任一行需要用户确认、扩大范围、改变策略边界，或总改动面超过原始请求边界，停止实现，等待用户回复。不要先实现再解释。

如果用户已经在当前对话中明确拒绝某条 feedback、确认它超出当前 PR 范围、或确认由其它 owner/后续 rollout 处理，决策表中标为“用户确认不处理”。随后对该 thread 评论说明拒绝/转交原因，再 resolve。

## Step 5: 修复

修复原则：

- 最小闭环，避免顺手重构。
- 搜索同类调用点，避免只修评论行。
- 涉及 scope、IPC、持久化、agent lifecycle 时补一条针对性测试。
- 文档或配置里有旧开关、旧命令、旧行为描述时同步更新。
- 不运行全仓库 format；需要 lint 时对 touched files 使用现有局部命令。
- 如果一个改动会影响同类位置，主动搜全仓库做一致性检查。

常用命令：

```bash
rg -n "<symbol>" .
git diff -- <file>
git diff --check
corepack pnpm vitest <target-test-files>
corepack pnpm exec oxfmt --check <touched-files>
corepack pnpm exec oxlint <touched-files>
```

## Step 6: 验证、提交、推送

提交前检查范围：

```bash
git status --short
git diff --stat
git diff --check
```

只 stage 本轮修复文件：

```bash
git add <files>
git diff --cached --stat
git commit -m "fix(scope): concise English message"
git push origin HEAD:<headRefName>
```

提交信息使用仓库要求的 Conventional Commits，英文。

## Step 7: Resolve Threads

推送后重新读取 PR head。对已处理的 thread 执行 resolve：

```bash
gh api graphql \
  -f query='mutation($threadId: ID!) { resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } } }' \
  -f threadId="THREAD_ID"
```

只 resolve 以下情况：

- 代码已修复并推送。
- 测试或代码阅读证明反馈不成立。
- 用户需求变化使原反馈不再适用，且当前代码已按新需求实现。
- 用户已明确拒绝该反馈、确认它超出当前 PR 范围、或确认由其它 owner/后续 rollout 处理；resolve 前必须补一条说明评论，说明当前 PR 的边界和后续 owner/处理路径。

## Step 8: 等待自动 Review

仓库自动化会跟进 Codex Review。不要手动评论 `@codex review`。

Cursor Review 只在以下情况下触发：

- 用户明确要求 `@cursor review`、Cursor Bugbot、Cursor Review。
- 当前修复高度依赖 UI 展示、交互状态或边界状态，且你判断 Cursor 的额外检查有价值。

触发 Cursor Review：

```bash
gh pr comment <PR> --body "@cursor review"
```

## Step 9: 循环复查

推送、resolve 后立即复查一次：

```bash
gh api graphql ...
gh pr checks <PR>
```

如果 review bot 或 CI 仍在运行，等待 5 分钟再查：

```bash
sleep 300
```

循环条件：

- 有新的 unresolved actionable review thread：回到 Step 4。
- Step 4 已暂停等待用户确认：结束本轮 loop 并报告暂停原因，不进入 sleep 等待。
- PR 顶层存在 `chatgpt-codex-connector[bot]` 的 `EYES`：Codex Review 仍在运行，等待后复查。
- 有失败 check 且失败项与本 PR 或本轮修复有关：展开日志并处理。
- 当前 head unresolved actionable review thread 数量为 0，checks 全部通过或只有无关 skipped 项，且 Codex 顶层 reaction 已从 `EYES` 变为 `THUMBS_UP` 或当前 head 已有 Codex review 结果：结束。
- PR `state` 为 `MERGED`：结束。

## 输出要求

过程更新保持短句：

- `PR 1994 当前 head c58c0580，发现 3 个未解决 review threads。`
- `判定：2 个成立并修复，1 个过期并 resolve。`
- `判定：discussion_r123 涉及产品语义变化，暂停等待确认。`
- `已提交并推送 abc1234，等待自动 review 并开始复查。`

结束时说明：

- PR 编号和 head commit
- 修复了哪些 review 问题
- 哪些建议被否决或标记需求变更覆盖
- 运行了哪些验证
- 是否还有未提交的用户改动
- unresolved review thread 数量
- Codex 顶层 reaction 状态，以及该 reaction 的作者
