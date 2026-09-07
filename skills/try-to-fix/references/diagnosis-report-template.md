# Diagnosis Report Template

Use this exact structure for every user-facing diagnosis. Replace every placeholder with case-specific content. Do not rename, merge, reorder, or omit any numbered section. When evidence is unavailable, keep the section and state the gap explicitly. Stop after section 6. Do not repeat the same evidence in multiple sections unless it is necessary to understand the first failure.

Original user messages and user-visible assistant replies are primary evidence. Include the complete relevant conversation needed to establish what the user meant and what happened, with role and time labels. Never include system prompts, hidden reasoning or thinking, credentials, access/API tokens, cookies, or signed URL secrets.

## 置顶：置信度与优先级

Write one compact line before the numbered report:

`Confidence high / medium / low｜日志复现：是 / 否 / 部分｜Sentry 复现：是 / 否 / 未确认 / 未查询｜Sentry 检索：完整 / 部分 / 未查询｜优先级 P0 / P1 / P2 [具体用户影响]`

- `日志复现` means the attached runtime logs directly preserve the reported failure transition, not merely a nearby error.
- `Sentry 复现` means a case-matched Sentry event independently preserves the same user operation and failure. A generic or merely simultaneous event is not a reproduction.
- For Feedback Issues whose runtime logs contain no explicit error block, use `Sentry 复现：未查询｜Sentry 检索：未查询` and state `no-explicit-log-error` in the relevant evidence explanation. For a source `[sentry]` Issue, the exact referenced group or event is a valid retrieval anchor without an attached log; mark unavailable Feedback-only fields as not applicable instead of treating them as a reason to skip Sentry.
- If `retrievalComplete=false` but a case-matched event exists, use `Sentry 复现：是｜Sentry 检索：部分`.
- If `retrievalComplete=false` and no case-matched event was retrieved, use `Sentry 复现：未确认｜Sentry 检索：部分`; partial retrieval cannot prove absence.
- Use `Sentry 复现：否` only when retrieval completed and the retrieved evidence contains no case-matched event.
- Put only the blocked user outcome inside the priority brackets. Keep confidence and priority independent.

## 1. 一句话结论

In two or three sentences, state what the user encountered, the first evidence-backed technical failure, and the practical impact. Confidence and priority already appear above; do not repeat them here. Do not lead with an internal exception name that the user cannot place in context.

For a model, billing, quota, or retry incident, this conclusion must name the model before the first charge or failure, any observed model-selection event, and the model and outcome after the switch. If trusted pricing evidence shows that a model expected to be free was classified as paid, say that first; describe the resulting charge or quota rejection as its consequence. Keep any missing pricing or ledger proof explicit.

## 2. 建议标题

Provide exactly one proposed GitHub Issue title in a single line.

- Preserve the user-visible symptom.
- Add the narrowest confirmed product or technical boundary only when it improves triage.
- Exclude unconfirmed causes, private identifiers, implementation proposals, and priority labels.
- If the existing title is already optimal, explicitly recommend retaining it and repeat the exact title.
- This is a suggestion only. Do not update Issue metadata without separate approval.

## 3. 用户故事：如果我是这个用户

Write a short first-person account using only observed facts:

> 我在 `[场景]` 做了 `[操作]`。我原本预期 `[预期]`，但实际看到 `[现象]`。这让我无法 `[实际影响]`。

If intent or impact is unknown, say so instead of completing the story speculatively.

## 4. 用户说法与表现

| 用户说/做了什么        | 用户看到的表现               | 系统记录                         | 证据关系                         |
| ---------------------- | ---------------------------- | -------------------------------- | -------------------------------- |
| `[用户原话或忠实转述]` | `[用户实际看到或没有看到的]` | `[产品事件、状态变化或错误]`     | `直接对应 / 下游表现 / 尚未证实` |

This table keeps the user's operation and visible outcome together, then adds only the system record needed to validate that observation. Never treat the user's causal guess as a technical fact.
Keep only the rows needed to connect the reported symptom to the first failure; normally no more than three.

## 5. 用户操作与消耗时间轴

Normalize time zones before comparing events. Use one compact Markdown table that follows each user operation through the first divergence and final outcome.

| 时间 | 用户操作或系统阶段 | 模型 | 耗时 | Token / 缓存 / Cost | 结果 |
|---|---|---|---:|---|---|
| `[精确时间或范围]` | `[用户输入、重试、切换或后台阶段]` | `[配置模型 / 响应模型]` | `[精确值或 -]` | `输入 xk / 输出 yk / 缓存 zk / Cost c` | `[事件或用户可见结果]` |

- Keep the table scan-friendly. Group adjacent model calls only when they belong to the same user-visible phase; do not hide a retry, model change, background task, charge boundary, or first failure inside an aggregate.
- Name background or extracted subtasks by what they did, not by an internal implementation label.
- Every relevant user turn or retry must show the configured/resolved model and the provider-reported response model when available, plus tool count, input Token, output Token, cache Token, `Cost`, and the important event. Use `k` units for Token values. Read these fields from `logAnalysis.usagePhases`; when a field is unavailable, write `-` instead of inferring it.
- `Cost` is the runtime usage field, not Credits or plan balance. If it is unavailable, write `Cost -`; never convert it to Credits without cloud-ledger evidence.
- For credit, quota, or unexpectedly expensive-turn reports, include the fields above for every relevant phase even when some values are `-`. For other reports, show them whenever the attachment contains relevant usage evidence.
- Begin one state transition before the first charge or failure when the previous session/model/cache state explains the outcome.
- Show the model before the switch, the selection/settings event, and the model after the switch as separate nodes. Do not hide a switch inside an aggregate. Without a selection/settings event, do not say the user switched models.
- Show preparation, compaction, retry, or background work separately when it continues using the old model after the main model changed.
- A `-` means the structured extractor did not supply the field. If a relevant correlated Session, Trace, or main log exists, inspect it before publishing; do not turn an extraction gap into a claim that the model is unknown.
- For stalls or cancellations, list every nearby prompt as a separate row using `logAnalysis.turnLifecycles`. Match the reported text to its own start and terminal events before attaching usage. Show an exact duration when both endpoints exist; if the attachment ends while the turn is still running, write `截至附件采集已等待 ...，终态未捕获`.

## 6. 真实对话与详细时间线

Put the complete detailed timeline inside a default-collapsed disclosure block so the main report stays compact. Emit the following tags as raw Markdown/HTML; do not wrap them in a fenced code block:

<details>
  <summary>展开查看真实对话与详细时间线</summary>

[timeline content]

</details>

Inside the disclosure block:

- Use list items rather than a table. Each relevant user turn or retry should connect its time range, user message, user-visible Agent reply or action, configured/resolved model, provider-reported response model, tool count, input/output/cache Token, Cost, and event. An entire multi-call turn may be grouped, but never group across a model switch or retry. Use `-` for genuinely unavailable usage fields and never infer them.
- Select phases because they match the reported operation through time, correlation, or behavior. Recency alone is not relevance.
- Include every phase needed to reconcile the usage story even when this exceeds six items; remove unrelated events first.
- `消耗 Token` includes repeated context and cache processing; it is not the amount of unique new text.
- Keep action descriptions short and user-facing. Do not list raw tool names, arguments, or internal call mechanics.
- Quote the relevant original user messages and user-visible assistant replies with runtime role/time labels. Include enough preceding conversation to resolve references such as “这几个”, “刚才”, or “那次”; do not replace that context with a generic summary.
- Do not invent an Agent reply for a tool-call-only step. Describe that step as an action; quote assistant text only when the runtime record contains a user-visible assistant message.
