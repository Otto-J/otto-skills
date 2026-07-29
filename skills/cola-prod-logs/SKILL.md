---
name: cola-prod-logs
description: Diagnose recent Cola production/local-profile behavior from ~/.cola/logs using a user's approximate time and fuzzy original input. Use this whenever the user says what they recently typed or said to Cola and asks what happened, why Cola responded that way, which tool failed, or to inspect prod logs. Also trigger for `/cola-prod-logs ...`, “刚才我说了…”, “看看 ~/.cola/logs”, and partial or ASR-imperfect prompt text. Default to read-only investigation.
compatibility: Requires Node.js and read access to the Cola profile logs.
---

# Cola production log diagnosis

Locate one recent Cola turn from fuzzy user evidence, reconstruct its execution chain, and explain the cause with raw evidence. Treat `~/.cola` as the production/local profile; accept `--data-dir` when the user names another profile.

## Inputs

Extract these clues from the request:

- Original input or a distinctive fragment. Preserve the user's wording, including ASR mistakes.
- Approximate local time. Convert “刚才” to the last 180 minutes by default; use a wider window when the conversation implies it.
- Optional profile, channel, or surface such as desktop, WeChat, cron, or dev2.

One text fragment is enough. Do not require a `promptId`.

## Workflow

1. Run the bundled locator:

```bash
node /Users/otto/.agents/skills/cola-prod-logs/scripts/inspect-cola-turn.mjs \
  --text '在 zshrc 里' \
  --since-minutes 180
```

Useful forms:

```bash
# Around a local clock time, with a ±30 minute window
node /Users/otto/.agents/skills/cola-prod-logs/scripts/inspect-cola-turn.mjs \
  --text '用户记得的一小段话' \
  --around '2026-07-12 09:58' \
  --window-minutes 30

# Another Cola profile
node /Users/otto/.agents/skills/cola-prod-logs/scripts/inspect-cola-turn.mjs \
  --text '原始信息' \
  --data-dir /Users/otto/.cola-dev2 \
  --since-minutes 240
```

2. Prefer the newest high-confidence match. When several matches remain, compare timestamp, scope, and surrounding prompt text. Ask the user only when two candidates remain equally plausible.
3. Use the returned `promptId` to correlate the main log with the matching `full_run` trace. Read only the matched trace line or narrow excerpts; trace files can be very large.
4. Reconstruct this sequence:
   - user input and local time
   - prompt ID, scope, provider, and model when available
   - assistant tool calls in order
   - tool results, exit codes, and exact error messages
   - process narration such as `mutter`
   - fallback or workaround
   - final visible answer
5. If needed, inspect the narrow source path responsible for an observed runtime choice. Keep diagnosis read-only unless the user explicitly asks for a fix.

## Evidence rules

- Separate observed facts from interpretation.
- Quote short error lines and exact commands only when they explain the cause.
- Treat the model's narration as a claim until a preceding tool result supports it.
- Explain scope precisely. A failed `set -e` subprocess means that tool call exited; it does not imply the app, terminal, or configuration crashed.
- Main Cola log timestamps may be UTC while trace timestamps and user language use Asia/Shanghai. The locator normalizes this when `--around` is supplied.
- If the main log lacks a prompt ID, use trace `startTime`, session key, and input text as the correlation key and say that the prompt ID was unavailable.

## Privacy and safety

The locator is read-only. It scans log files and prints compact, redacted excerpts.

- Never print API keys, tokens, cookies, authorization headers, passwords, private keys, or complete environment-variable values.
- Do not dump full trace records, full prompts, unrelated session history, or private note content.
- Keep file writes, configuration changes, process restarts, and remote actions outside this workflow until the user authorizes a fix.

## Report format

Lead with the verified cause, then give compact evidence:

```markdown
结论：<直接原因和实际影响>。

定位：
- 用户输入：`...`
- 时间：YYYY-MM-DD HH:mm:ss（Asia/Shanghai）
- promptId：`...`
- 模型：provider/model

执行链路：
1. <tool/command>
2. <short raw error>
3. <fallback and result>

判断：
- 已证实：<facts>
- 原提示准确度：<accurate / overstated / unsupported>
- 实际影响：<scope>

本次只读检查，没有修改代码或配置。
```

End with one concrete recommendation. Avoid proposing code changes when the user requested diagnosis only.

## Example

Input:

```text
/cola-prod-logs 刚才我说了：在 zshrc 里，你看看怎么回事
```

Expected locator call:

```bash
node /Users/otto/.agents/skills/cola-prod-logs/scripts/inspect-cola-turn.mjs \
  --text '在 zshrc 里' \
  --since-minutes 180
```

Expected reasoning: find the matching desktop prompt, correlate its Bash calls and tool failure, verify any narration against the raw error, and describe the exact impact without exposing configuration values.
