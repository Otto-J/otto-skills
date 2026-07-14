---
name: uniapp-news-weekly
description: Generate plain-language weekly story reports for dcloudio/uni-app across active branches. Use when the user asks what a uni-app developer such as fxy060608 did recently, wants branch-by-branch GitHub activity analysis, or wants to turn uni-app commits into a readable weekly news/report draft.
---

# UniApp News Weekly

## Overview

Use this skill to produce a weekly branch activity report for `dcloudio/uni-app`, especially for `fxy060608`. Treat each active branch as a separate workstream and turn the activity into a readable story about what problem the work is trying to solve.

The bundled script is read-only. It uses `gh api` to list branches, query commits by GitHub-associated author/committer, fetch commit details, and write JSON plus Markdown outputs.

## Workflow

1. Confirm the reporting window.
   - If the user says "recent week" or "最近一周", use the current date as the end date and the previous 7 calendar days as the start date.
   - Use concrete dates in the final answer.

2. Run the script from the current workspace, writing outputs into a user-facing `outputs/` folder when available.

```bash
python3 /Users/otto/.codex/skills/uniapp-news-weekly/scripts/uniapp_news_weekly.py \
  --since YYYY-MM-DD \
  --until YYYY-MM-DD \
  --out-dir outputs
```

3. Read the generated Markdown and JSON summary.
   - Use branch count, active branches, unique commits, top changed areas, and themes as analysis material.
   - Distinguish `author_date` from `committer_date`. A commit authored earlier can still count if it was committed into a branch during the report window.
   - Lead with the human meaning of the work: what problem was being solved, what changed for developers, and why the work matters.

4. When presenting the report, group by workstream:
   - Independent subpackage / mini-program work
   - Vite upgrade or release branch work
   - Main dev branch stabilization
   - Alpha branch landing/sync work

5. Write the final chat response as a short natural-language story.
   - Use Chinese by default when the user writes Chinese.
   - Use one paragraph per workstream. Each paragraph should explain the problem, the direction of the fix, and the likely developer-facing meaning.
   - Keep commit hashes, raw commit titles, detailed counts, and file-path tables in the generated evidence files.
   - Mention exact dates and the broad branch/workstream names only when they help the reader orient.
   - End with one concrete takeaway sentence about the week.

## Script Usage

Defaults:

```bash
python3 /Users/otto/.codex/skills/uniapp-news-weekly/scripts/uniapp_news_weekly.py --out-dir outputs
```

Useful options:

```bash
--owner dcloudio
--repo uni-app
--user fxy060608
--since 2026-06-21
--until 2026-06-28
--branches uni-app-vue3-dev uni-app-vue3-dev-vite8
--out-dir outputs
```

The script writes:

- `uniapp_news_weekly_<user>_<since>_<until>.json`: raw structured data for follow-up analysis
- `uniapp_news_weekly_<user>_<since>_<until>.md`: commit-level Markdown evidence
- `uniapp_news_weekly_<user>_<since>_<until>_summary.md`: concise natural-language weekly draft

## Final Response Style

Default to this shape:

```markdown
这周的主线故事是：...

第一场是...。...

第二场是...。...

第三场是...。...

你可以把这周理解成：...
```

Use friendly product/engineering language. Explain "它在改什么问题" before mentioning implementation details. Keep the answer readable for someone who wants the weekly story rather than a commit audit.

## Interpretation Rules

- Count activity by the latest of `author_date` and `committer_date`, because the user cares about work that was written or pushed/landed in the window.
- Deduplicate commits across branches by SHA, while preserving the branch list for each commit.
- Treat generated build artifacts and lockfile churn as release/build work unless commit messages and changed paths show product logic.
- For recurring weekly reports, keep the final answer short and link the generated summary file.

## Requirements

- `gh` must be installed and able to access GitHub.
- The repository is public, but authenticated `gh` avoids low anonymous rate limits.
- If network access fails and the environment has a `proxy` shell alias, retry the same command through that alias.
