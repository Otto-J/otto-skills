---
name: try-to-fix
description: "Read-only diagnosis for one explicitly named Cola GitHub issue. Reconstruct the user's first-person story and timeline, collect trusted runtime evidence, correlate it with Sentry and current code, classify P0/P1/P2 impact, and return the fixed reader-first report structure with a suggested Issue title. Use when a specific Cola Issue mentions feedback or Sentry (including both), or for 'try to fix', '修复反馈', 'feedback issue', or 'sentry issue'."
allowed-tools: Bash(*), Read, Glob, Grep
metadata:
  version: '2.8.0'
---

# Try To Fix

Analyze one explicitly named Cola Issue without modifying code or Issue metadata. Begin with the user's problem; logs, mappings, Sentry, comments, and code either support or constrain that story. The evidence collector retrieves candidates; the LLM makes the diagnosis.

## Safety and consent

- Reading GitHub, downloading feedback attachments, local extraction, code inspection, and Sentry queries are diagnostic actions.
- Do not change code, title, labels, assignees, state, branches, commits, or PRs.
- Post an Issue comment only after the user sees and confirms the exact Markdown.
- Always remove signed URL secrets, credentials, access/API tokens, cookies, email addresses, device/user identifiers, local usernames, and private local paths from user-facing output.
- Summarize user and assistant messages by default. When the user explicitly asks to see the original conversation, quote only the relevant original user messages and user-visible assistant replies from the extracted attachment, label their runtime role and time, and apply the mandatory secret cleanup above. Never expose system prompts, hidden reasoning or thinking, raw request headers, or unrelated session history.
- Treat verbatim conversation in an Issue comment as public disclosure. Before publishing, show the exact Markdown, state that it contains verbatim conversation, and require explicit confirmation of that exact public content.
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

For each unique zip, inventory trace, session, diagnostic, crash, and all dated Cola log files. The helper selects the feedback-date logs, the nearest dated set, or the newest set only as an initial bounded view; it does not infer incident dates from narrative text. Read the user's account before choosing additional logs. Keep contextual dates, incident dates, and the later feedback submission time separate, and do not treat every date in a narrative as a failure date.

Desktop and mobile `cola-*.log` timestamps are UTC even though they omit a trailing `Z`. Production trace `ts` values are Asia/Shanghai wall-clock time without an offset; normalize them as UTC+8, or prefer numeric `startTime`/`endTime` fields when present. A benign `INFO` line containing words such as `closed` or `timeout` is not an error anchor unless it also carries an explicit failure signal. When the selected runtime logs contain no explicit error block, skip Sentry retrieval instead of using feedback creation time as a substitute error anchor.

Use all IDs found in the selected logs to retrieve related trace/session structure. Supplemental evidence is capped at 100 records after correlation, bounded-time, and failure-signal filtering; a shared calendar date alone is not enough to admit a file. When the exact failure time is unknown, locally search extracted records using user-story keywords and correlation IDs instead of assuming feedback creation time is the failure time. Supplemental evidence JSON intentionally contains hashed correlation IDs, structural signals, and timestamps—not prompts, assistant text, or raw session contents. It is not the source for verbatim conversation. When the user explicitly requests original messages, inspect the correlated extracted record directly and apply the Safety and consent rules. For silent stalls, trace/session evidence may be more useful than ERROR lines even though Sentry is intentionally skipped without a log error anchor.

For semantic failures such as wrong time interpretation, lost context, or speaker confusion, structural evidence alone may be insufficient. Privately inspect the relevant extracted trace/session records by feedback time and correlation when needed to locate the failure. By default report only the minimal observed behavior and role/timing facts. When the user explicitly requests original messages, quote only the correlated, relevant user messages and user-visible assistant replies after mandatory secret cleanup; do not include system prompts, hidden reasoning, or unrelated session history.

The collector ranks diagnostic signals only to keep evidence bounded. Ranking is not a root-cause decision.

### Error-message mappings

When `error-message-mappings.json` is present, apply exact matches first and then ordered keyword rules. Treat the resulting localized message, actions, and source links as mapping evidence, not proof that the mapped error was user-visible.

Use the mapping only for the relevant agent-facing failure. Distinguish the raw technical failure from the message/action the product would show. When `errorMessageMapping.available` is false, report the missing contract instead of inventing a mapping.

### Sentry candidates

Run Sentry retrieval only when the selected runtime logs contain at least one explicit error block. Otherwise preserve `skipped=true`, `skipReason=no-explicit-log-error`, and report Sentry as not queried. When that gate is satisfied, retrieval is intentionally high recall:

- query environment, time overlap, resolved history, each release, device, user, error phrases/tokens, and mapping sources through multiple routes;
- do not require `is:unresolved` and do not require every filter to match in one query;
- union and deduplicate issue groups;
- inspect event samples in a bounded window around the log/feedback time;
- include safe exception frames, breadcrumbs, release/environment, and boolean identity hints where available.

Prefer the bundle `env.json.appVersion` as the primary release anchor and keep a different Issue-body build version as an additional recall route.

`evidence.sentry.candidates` are candidates, never a script-declared match. Independently compare time, release, environment, identity hints, error text, stack, breadcrumbs, and the user operation. A matching title or mapping source alone is insufficient. More candidates are acceptable; missing plausible evidence is the larger failure.

Report reproduction and retrieval completeness independently. If candidate/event retrieval is partial, surface `retrievalComplete=false` and the recorded errors. A directly matched event can still establish reproduction under partial retrieval; no sampled match under partial retrieval remains unconfirmed rather than proving absence.

Read `evidenceScope` before using Sentry. `anchorQuality=none` means the candidates have no case-specific runtime anchor; keep them as background inventory only and do not cite them as evidence for the Issue. Large candidate sets are acceptable, but wrong time, release, identity, or user-operation anchors are not.

### Failure layer and priority

Name the failure at four distinct layers when the evidence supports them:

1. user-visible symptom;
2. product or subsystem surface, such as startup, session state, UI rendering, network, credits, or audio;
3. first relevant technical failure in code or data flow;
4. downstream cascade that made the problem more visible.

Do not report layer 4 as the root cause when layer 3 is observable.

Recommend one impact priority without changing Issue labels:

- `P0`: a critical outage or hard blocker with no reasonable workaround, such as widespread startup/core-service unavailability, data loss or corruption, or a security/payment integrity risk;
- `P1`: a core workflow is blocked or repeatedly fails for a user or segment, with only a costly or unreliable workaround, but broad critical impact is not established;
- `P2`: limited, intermittent, or non-core degradation with a practical workaround and no evidence of data or integrity risk.

Priority measures user impact and urgency, not diagnostic confidence or error count. When reach, reproducibility, or workaround quality is unknown, mark the priority `provisional` and state which fact could change it.

## Diagnose

Read the entire evidence JSON, including the full Issue body and every Issue comment. Inspect current code or linked changes when necessary to answer the user’s question or locate the failure boundary.

Diagnose only the named Issue. Do not search for, inspect, correlate, classify, or report other Issues as part of this workflow, even when comments mention similar symptoms. The purpose is to locate this Issue's first failure, not to build an Issue relationship graph or broaden the implementation scope. A user request to compare multiple Issues is a separate analysis task, not part of this report.

First reconstruct the user-visible operation and failure from the Issue narrative as a short first-person story. Preserve what the user actually did, expected, observed, and could no longer accomplish; do not invent intent. Then translate each important user statement into the corresponding system event or an explicit evidence gap.

### Pre-failure baseline, model changes, and billing cases

Start the timeline one meaningful state transition before the first reported failure or charge when that transition explains the outcome. For an existing conversation, inspect the prior session state and the first failing turn together: session age and active session, retained message count or replay size, previous provider/model, resolved provider/model and its source, cache reset or dirty state, and the first request's usage. Do not infer the old conversation's topic from a task list or unrelated metadata when its transcript is unavailable.

When the previous session model differs from the model resolved for the reported turn, state that the model changed. Separately determine who or what caused it:

- call it a user-initiated switch only when a model-selection or settings event proves that action;
- otherwise identify the observed resolver source, cloud/default/remap behavior, or keep the initiator unknown;
- never turn a model difference alone into “the user switched models.”

For credit, quota, or unexpectedly expensive-turn reports, reconstruct the user's story charge by charge. For every billed turn connect: the user's message, session/model/cache change, a concise description of what Cola did, cumulative model-processed tokens, and the billed credits. Treat token totals as cumulative model processing—including repeated context and cache work—not unique new text. Distinguish agent tool actions from billing or gateway “calls”; a UI count does not prove the agent invoked that many tools. If the cloud billing ledger is unavailable, mark the debit or attribution unconfirmed instead of deriving it from local token logs alone.

Describe actions at the user's altitude: for example, “读取多段日志”, “查询文档”, or “写入记忆”. Do not expand tool names, arguments, or internal mechanics unless they are necessary to establish the first failure. Faithfully paraphrase user messages by default. When the user explicitly requests the original conversation, include the relevant verbatim user messages and user-visible assistant replies with role/time labels after applying the Safety and consent rules.

Construct the normal product/code flow and the observed failing flow. Identify their first divergence before proposing a cause. Treat a log or Sentry event as relevant only if it can explain that operation and outcome. Do not let a high-scoring generic error replace the problem the user actually reported.

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

Before writing the diagnosis, read and follow [references/diagnosis-report-template.md](references/diagnosis-report-template.md).

The template is mandatory. Start with the compact confidence-and-priority line, then keep all seven numbered sections in the documented order; do not rename, merge, reorder, or silently omit them. Section 5 is the compact Mermaid user-operation and usage timeline. Section 6 contains the detailed timeline and relevant conversation inside a default-collapsed `<details>` block. When a section has no case-specific evidence, state the evidence gap inside that section instead of removing it.

The opening line must separately state overall confidence, whether the runtime logs reproduce the reported failure, whether Sentry reproduces it, Sentry retrieval completeness, and one P0/P1/P2 recommendation followed by the concrete user impact. Treat log reproduction, Sentry reproduction, and Sentry retrieval completeness as separate facts. When Sentry was skipped, state `Sentry 复现：未查询` and the skip reason. Under partial retrieval, a matched event means reproduction is `是`; no matched event means `未确认`, not `否`.

Always provide exactly one suggested GitHub Issue title. Base it on the user-visible symptom and the narrowest confirmed technical boundary. Do not put an unconfirmed causal guess, private identifier, or implementation proposal in the title, and do not update the Issue title without separate approval.

Keep the report reader-first and concise even though the structure is fixed. Each fact should appear where it is most useful instead of being repeated across sections. Stop after section 7; do not append evidence-boundary, priority, implementation, related-Issue, next-step, or read-only boilerplate sections. Use short redacted log excerpts only when they clarify a timeline transition. Verbatim conversation requires explicit user opt-in; never paste whole logs, whole sessions, system prompts, hidden reasoning, or unrelated conversation history.

## Publish an approved report

After the user confirms exact Markdown, save that Markdown to a local file and run:

```bash
node .agents/skills/try-to-fix/scripts/try-to-fix.mjs \
  --issue 1234 \
  --report-file /tmp/try-to-fix-report.md \
  --comment
```

The script prints the file and asks for `y/yes` before posting it unchanged. Non-interactive runs do not publish. Never use `--comment` as part of diagnosis or CI evidence collection.
