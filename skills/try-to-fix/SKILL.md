---
name: try-to-fix
description: "Read-only diagnosis for one Cola GitHub issue. Start from the user's reported behavior, collect every trusted feedback attachment, inspect bounded log/trace/session evidence, retrieve high-recall Sentry candidates, apply Cola error-message mappings, and produce a concise evidence-scoped assessment. Use for 'try to fix', '修复反馈', 'feedback issue', or diagnosing a specific Cola issue."
allowed-tools: Bash(*), Read, Glob, Grep
metadata:
  version: '2.3.0'
---

# Try To Fix

Analyze one explicitly named Cola Issue without modifying code or Issue metadata. Begin with the user's problem; logs, mappings, Sentry, comments, and code either support or constrain that story. The evidence collector retrieves candidates; the LLM makes the diagnosis.

## Safety and consent

- Reading GitHub, downloading feedback attachments, local extraction, code inspection, and Sentry queries are diagnostic actions.
- Do not change code, title, labels, assignees, state, branches, commits, or PRs.
- Post an Issue comment only after the user sees and confirms the exact Markdown.
- Keep raw signed URLs, tokens, email addresses, device/user IDs, local usernames, prompts, and session contents out of the response.
- A later request to implement a fix is a separate task and requires explicit approval.

## Input

Require one Issue number or URL. Do not silently select an Issue.

Treat all remaining invocation text as an extra user question. Carry it into evidence and answer it directly. If it asks whether a fix already exists, verify linked PRs/commits against the current checkout before concluding.

The evidence JSON preserves the complete redacted Issue body and every complete redacted comment. A non-Doctor-Mode Issue is still valid input. When it has no runtime bundle or metadata, diagnose from the Issue narrative and current code and keep the missing runtime proof explicit.

## Collect evidence

From the Cola repository root:

```bash
node .agents/skills/try-to-fix/scripts/try-to-fix.mjs \
  --issue 1234 \
  --user-question '这个好像修复过？' \
  --ci \
  --output-json /tmp/try-to-fix-evidence.json
```

An Issue URL may replace `--issue`. Useful optional flags are `--download-dir`, `--repo`, `--org`, `--project`, and `--environment`.

The collector requires authenticated `gh` and `sentry-cli`, plus a usable Sentry API token. Missing Sentry authentication is a hard failure: do not continue with an empty or falsely successful Sentry result.

### Attachment behavior

The collector:

- scans both the Issue body and every comment;
- accepts only HTTPS attachment URLs from the configured Google Cloud Storage, Aliyun OSS, and GitHub attachment hosts;
- compares discovered attachments with `File count` when present;
- downloads every zip, validates it, hashes it, and deduplicates identical archives;
- rejects path traversal, links, excessive entry counts, and excessive compressed or expanded size;
- reuses extracted data only when its recorded hash matches the current zip.

If a signed URL has expired, an already cached zip in the same Issue slot may be used only after zip validation; `sourceVerified=false` keeps that provenance gap explicit. If the count differs or a link is untrusted/unavailable, state that evidence gap. Do not reinterpret a screenshot as a log archive.

### Bundle behavior

For each unique zip, read all Cola logs on the feedback date; otherwise use the nearest dated set. Inventory trace, session, diagnostic, and crash files.

Desktop and mobile `cola-*.log` timestamps are UTC even though they omit a trailing `Z`. Production trace `ts` values are Asia/Shanghai wall-clock time without an offset; normalize them as UTC+8, or prefer numeric `startTime`/`endTime` fields when present. A benign `INFO` line containing words such as `closed` or `timeout` is not an error anchor unless it also carries an explicit failure signal. When no relevant failure is present, use feedback creation time for Sentry retrieval instead of promoting unrelated nearby noise.

Use all IDs found in the selected logs to retrieve related trace/session structure; do not discard them with an arbitrary count cap. When the exact failure time is unknown, locally search extracted records using user-story keywords and correlation IDs instead of assuming feedback creation time is the failure time. Supplemental evidence intentionally contains hashed correlation IDs, structural signals, and timestamps—not prompts, assistant text, or raw session contents. For silent stalls, trace/session evidence may be more useful than ERROR lines.

For semantic failures such as wrong time interpretation, lost context, or speaker confusion, structural evidence alone may be insufficient. Privately inspect the relevant extracted trace/session records by feedback time and correlation when needed to locate the failure, but keep prompts, responses, and session content out of the user-facing answer; report only the minimal observed behavior and role/timing facts.

The collector ranks diagnostic signals only to keep evidence bounded. Ranking is not a root-cause decision.

### Error-message mappings

When `error-message-mappings.json` is present, apply exact matches first and then ordered keyword rules. Treat the resulting localized message, actions, and source links as mapping evidence, not proof that the mapped error was user-visible.

Use the mapping only for the relevant agent-facing failure. Distinguish the raw technical failure from the message/action the product would show. When `errorMessageMapping.available` is false, report the missing contract instead of inventing a mapping.

### Sentry candidates

Sentry retrieval is intentionally high recall:

- query environment, time overlap, resolved history, each release, device, user, error phrases/tokens, and mapping sources through multiple routes;
- do not require `is:unresolved` and do not require every filter to match in one query;
- union and deduplicate issue groups;
- inspect event samples in a bounded window around the log/feedback time;
- include safe exception frames, breadcrumbs, release/environment, and boolean identity hints where available.

Prefer the bundle `env.json.appVersion` as the primary release anchor and keep a different Issue-body build version as an additional recall route.

`evidence.sentry.candidates` are candidates, never a script-declared match. Independently compare time, release, environment, identity hints, error text, stack, breadcrumbs, and the user operation. A matching title or mapping source alone is insufficient. More candidates are acceptable; missing plausible evidence is the larger failure.

If candidate/event retrieval is partial, surface `retrievalComplete=false` and the recorded errors. Do not turn “no sampled event” into proof that no Sentry event exists.

Read `evidenceScope` before using Sentry. `anchorQuality=none` means the candidates have no case-specific runtime anchor; keep them as background inventory only and do not cite them as evidence for the Issue. Large candidate sets are acceptable, but wrong time, release, identity, or user-operation anchors are not.

## Diagnose

Read the entire evidence JSON, including the full Issue body and every Issue comment. Inspect current code or linked changes when necessary to answer the user’s question or locate the failure boundary.

First reconstruct the user-visible operation and failure from the Issue narrative. Treat a log or Sentry event as relevant only if it can explain that operation and outcome. Do not let a high-scoring generic error replace the problem the user actually reported.

### Root-cause gate

Before naming a root cause, answer these three questions:

1. **What exactly misbehaved?** Identify the specific user-visible object or action. Do not substitute a nearby status, timer, warning, or error merely because it appeared at the same time.
2. **Did the underlying data repeat or change?** Compare the relevant protocol events and persisted session/trace entries. For duplicated, flickering, or re-animated UI, distinguish repeated source data from a single item being projected or mounted repeatedly.
3. **Can the proposed cause reproduce the visible effect?** Trace the smallest relevant state transition through projection/store/rendering code, and replay a minimal before/after state when practical. A plausible code path or matching interval is not enough by itself.

Feedback attachments may preserve only final state and contain less streaming detail than local production logs. That is an acceptable evidence limit. Do not require access to the reporter's local profile; if the transition cannot be proved from the bundle and current code, report the narrowest proven boundary and keep the root cause unconfirmed.

Call a root cause **confirmed** only when runtime evidence or a deterministic state/code reproduction connects the proposed trigger to the reported effect. Otherwise label it as a likely cause or state that the root cause is not yet confirmed.

Keep these judgments separate:

- User side: what the user did, what they visibly experienced, and the practical impact.
- Technical side: the first relevant failure, downstream effects, correlated trace/session structure, applicable error mapping, and Sentry evidence.
- Conclusion: the smallest evidence-backed explanation, confidence, and what remains unknown.

Do not promote a downstream cascade, a timing coincidence, or an event count into a proven root cause. Attribute historical claims from comments and say when current evidence conflicts with them.

## Response contract

Lead with a short conclusion. Cover the user-side story and technical-side finding, but choose headings and order to fit the case; there is no fixed document template.

Prefer a compact answer. Include raw log snippets, Mermaid, manual reproduction, suggested titles, or implementation detail only when they materially help or the user requested them. Avoid overwhelming the conclusion with internals.

Always make the evidence boundary clear:

- what is directly observed;
- what is inferred by comparing sources;
- what is still unknown or only partially retrieved.

## Publish an approved report

After the user confirms exact Markdown, save that Markdown to a local file and run:

```bash
node .agents/skills/try-to-fix/scripts/try-to-fix.mjs \
  --issue 1234 \
  --report-file /tmp/try-to-fix-report.md \
  --comment
```

The script prints the file and asks for `y/yes` before posting it unchanged. Non-interactive runs do not publish. Never use `--comment` as part of diagnosis or CI evidence collection.
