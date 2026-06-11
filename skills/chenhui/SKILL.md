---
name: chenhui
description: Generate concise natural-language daily handoff reports from Git and GitHub activity. Use when the user says 我要开晨会了, 我昨天做了啥, 晨会, chenhui, 日报, asks for yesterday's commits or PRs, completed work, unfinished work, today follow-up items, or asks to merge anything ready before reporting.
---

# Chenhui

## Goal

Produce a direct natural-language work handoff for a daily standup. The output should state what was completed, what remains unfinished, and what needs follow-up today. When the user asks “该合并的做合并”, merge PRs that already satisfy branch policy and report exact blockers for the rest.

## Workflow

1. Resolve the reporting window.
   - Default “昨天” to the user’s local timezone.
   - Use absolute dates in notes when the date matters.
   - For this repo, prefer Asia/Shanghai when local context says so.

2. Inspect repository state.
   - Run `git status --short --branch`.
   - Run `git log --since='<start>' --until='<end>' --author='<user or @me name if known>' --date=iso-local --pretty=format:'%h%x09%ad%x09%s' --all`.
   - Run `git fetch --all --prune` before final merge-state decisions.

3. Inspect GitHub PRs when `gh` is available.
   - Use `gh pr list --author '@me' --state all --search 'created:<start-date>..<end-date>' --json number,title,state,mergedAt,headRefName,baseRefName,url`.
   - Also search by the local author/login if `@me` misses relevant PRs.
   - Treat squash merges by PR status, because `git cherry` can show equivalent commits as unmerged.

4. Merge ready PRs when requested.
   - For each open PR from the reporting set, run `gh pr view <number> --json state,isDraft,mergeable,reviewDecision,statusCheckRollup,headRefOid,url`.
   - Merge only when the PR is open, ready, mergeable, checks are passing or skipped as expected, and review requirements are satisfied.
   - Use the repo’s preferred merge strategy. In Cola, use squash merge with an explicit Conventional Commit subject.
   - If merge is blocked, record the exact blocker: review required, pending checks, failing checks, merge conflicts, draft state, branch policy, or repository auto-merge disabled.

5. Prepare the report.
   - Deduplicate repeated commits that appear across branches.
   - Prefer merged PR titles as the source of truth for completed work.
   - Group related commits into product-level outcomes.
   - Include PR numbers only when they clarify merge status or follow-up.
   - Keep the report natural and concise. Avoid commit-list dumps unless the user asks for raw details.

## Output Shape

Use this structure when the user asks for a ready-to-say summary:

```text
昨天主要完成了……（一段自然语言，按主题组织）

还没完成的是……（说明当前状态和阻塞原因）

今天需要跟进……（列出明确动作）
```

If the user asks for operational detail, add a short status list after the natural-language section:

```text
已合并：#123、#124
待合并：#125，原因：review required
本地验证：tsc 通过；全量测试有既有失败……
```

## Quality Bar

- Lead with the useful answer.
- State completed work as outcomes, not raw commit messages.
- State unfinished work with concrete blockers.
- State today’s follow-up as actions.
- Mention failed local verification only when it affects confidence or merge readiness.
- Avoid broad claims that are unsupported by Git/GitHub state.
