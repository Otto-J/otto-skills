---
name: codex-memory-review
description: >
  Prepare privacy-redacted, incremental Codex conversation bundles for a daily AI memory review, with per-device checkpoints and explicit prepare/commit/abort safety. Use when reviewing recent Codex chats, extracting memory candidates, running a daily conversation review, or managing multi-computer Codex history sources.
---

# Codex Memory Review

Generate review material from one or more Codex homes without modifying them. Keep collection and judgment separate: the script deterministically prepares a redacted bundle, then the AI reviews it, and only a successful report permits checkpoint commit.

## Workflow

Set `SKILL_DIR` to this skill's installed directory. Source code stays in the skill directory; runtime bundles, state, and reports belong under `~/.cola/state/codex-memory-review/`, not `outputs`.

1. Initialize the current computer with a stable source id:

```shell
node "$SKILL_DIR/scripts/review.mjs" sources init --source-id current-mac
```

2. For an existing review history, establish the requested event baseline before the first prepare. For the current computer migration described here:

```shell
node "$SKILL_DIR/scripts/review.mjs" baseline --source-id current-mac --through 2026-07-28T07:48:00.000Z
```

A baseline is an event-time boundary: events at or before it are intentionally excluded. It does not fabricate processed message ids. Use it only when earlier material has already been reviewed or should deliberately be skipped.

3. Validate without creating a pending run:

```shell
node "$SKILL_DIR/scripts/review.mjs" prepare --dry-run
```

4. Prepare a pending bundle:

```shell
node "$SKILL_DIR/scripts/review.mjs" prepare
```

Read the JSON summary. A `messageCount` of `0` means there is nothing new to review. Otherwise review `bundle.md` from the returned `runDir` and write the formal report under `~/.cola/state/codex-memory-review/reports/`.

5. After the report is complete, advance all included source checkpoints atomically per source:

```shell
node "$SKILL_DIR/scripts/review.mjs" commit --run-id RUN_ID
```

If review or report generation fails, preserve the checkpoint and mark the run failed:

```shell
node "$SKILL_DIR/scripts/review.mjs" abort --run-id RUN_ID
```

Never commit merely because prepare succeeded. Do not write directly to a memory bank; wait for the user to approve long-term memory candidates.

## Review Rules

Report only discoveries not already present in prior reports. When there are no candidates, remain silent or emit a short no-new-findings status.

Classify each candidate as one of:

- **Short-term memory**: active work, temporary constraints, near-term intent, or unresolved follow-up.
- **Long-term memory**: durable preferences, recurring constraints, stable responsibilities, or persistent working style.
- **Standalone article**: a coherent insight, investigation, or technical narrative worth developing independently.
- **Possibly unnoticed pattern**: repeated behavior, friction, or decision pattern that may be useful to surface gently.

For every candidate, quote or summarize concrete evidence with source id, session id, and date. State a confidence level and its boundary: explain what is observed and what remains inference. Do not treat stale status, one-off project prompts, system/developer instructions, repository instructions, or agent behavior as a durable user preference.

## Multiple Devices

Read [references/multi-device.md](references/multi-device.md) before adding mounted or copied Codex homes. Source identity is part of every record; do not merge one device's raw occurrence over another's even when session and message ids match.

## Privacy And Safety

The script reads only rollout and session index data. It never reads auth/config for this workflow and never writes under a source `codexHome`. Bundles include only user messages and assistant final answers. Codex-injected wrappers such as environment/browser context, repository instructions, recommended plugin catalogs, expanded skill bodies, system/developer prompts, reasoning, tool schemas/output, and subagent session bodies are excluded. Common credentials, Bearer values, email addresses, and phone numbers are replaced before writing.

Treat the generated bundle as sensitive despite redaction. Do not publish or upload it without explicit user approval.
