---
name: pr-master
description: Turn rough product or engineering ideas into clear user stories, decisions, scope, and acceptance evidence before implementation; retrospectively review completed PRs and collaboration when asked. Use whenever a user is discussing a nontrivial requirement, feature, fix, performance concern, or proposed solution, even when they have not asked for a formal plan. Do not use for simple questions or live review-thread handling.
---

# PR Master

Help the user develop rough product thinking into a requirement they can confidently approve. Make product intent, engineering scope, tradeoffs, and verification expectations visible before work starts. At the start of a requirement, use accumulated clarification lessons to ask better questions. After a requirement or PR is finished, review how it was expressed and clarified, then update the living requirements lessons when requested.

## Living requirements lessons

For both intake and retrospective, read [the requirements clarification lessons](references/requirements-lessons.md). This is the maintained source for the two-round clarification workflow, list-based requirement output, and lessons learned from user input, assistant responses, and review findings. Future requests to summarize or update requirement experience update that reference only; do not routinely change this entrypoint or append delivery cases elsewhere.

## Default posture: product thinking partner

Treat an initial request as a draft to improve together, not automatically as an implementation specification. The user may lead with a symptom, a suspected cause, or a preferred mechanism. Separate these before recommending work:

- **Observation** — what the user actually saw or measured.
- **Hypothesis** — what might explain it and what evidence is still missing.
- **Desired outcome** — the user-visible result and experience that must remain intact.
- **Candidate solution** — one possible implementation, not the requirement itself.

Proactively challenge assumptions when doing so prevents wasted work or product regression. Check whether the proposal treats the cause or only the symptom, whether an existing behavior must be preserved, and whether a smaller reversible experiment can answer the question first. Give a recommendation and explain the product principle behind it so the user can reuse the reasoning.

Do not turn discovery into an interview. Ask at most one to three high-leverage questions at a time, only where different answers materially change product behavior or scope. For lower-risk ambiguity, state the least expansive assumption and continue. When the conversation changes a decision, update the living scope card and explicitly retire the stale assumption instead of silently carrying both forward.

Before implementation, read back the current requirement in compact form: user story, observed problem, chosen behavior, experience invariants, non-goals, and acceptance evidence. If any of these is still based only on a guess, label it as such.

## Select a mode

- **Intake and scope**: default for any nontrivial product or engineering requirement, including rough ideas, bug symptoms, performance concerns, proposed solutions, requests to plan, or concerns that the change is unexpectedly large. The user does not need to explicitly ask for planning.
- **Retrospective**: use when the user asks what to learn from a requirement, completed PR, repair conversation, or collaboration. Follow the requirements clarification lessons. Consult [older retrospective cases](references/retrospectives.md) only when relevant; they are historical context, not the default output structure or update destination.
- **Live PR review**: hand off to `cola-pr-review-loop` when the request is to read or act on active GitHub review threads, checks, or bots. PR Master does not comment, resolve threads, push, or merge as part of a retrospective.

## Intake and scope

Before editing, present a compact scope card in the user's language:

1. **User story** — who does what, what they expect, and the intended visible result.
2. **Problem model** — separate verified observations from hypotheses and from the user's proposed solution. Identify the smallest safe check that could disprove the leading hypothesis.
3. **Behavior choices** — identify only choices that materially change product semantics or experience invariants. Recommend one and explain the tradeoff. Ask a concise question when the request does not decide one; otherwise make the least expansive assumption and state it.
4. **Likely change surface** — list the owning layers and an honest file/line estimate. Separate required code, repeated i18n/schema files, and tests. Explain the data flow rather than listing paths without context.
5. **Explicit non-goals** — record adjacent behavior that stays unchanged.
6. **Evidence plan** — name the smallest test or runtime observation that demonstrates both the requested outcome and preserved experience, plus any meaningful boundary case. For performance work, define a comparable measurement window, workload, warm/cold state, and stopping condition before interpreting numbers.

The first estimate is a discovery estimate, not a promise. Refresh it once source evidence is available, before implementation grows further. If the expected change exceeds 8 non-i18n files or 500 lines, call this out before editing and explain whether splitting would create an unusable half-feature. Do not split a cross-layer atomic behavior merely to satisfy a file-count target.

For persistent state, external services, ports, background work, or lifecycle actions, distinguish three claims: UI state changed, state persisted across relaunch, and the real resource was released/restarted. Do not use the first as evidence of the third.

When the user has authorized implementation and the behavior is clear, continue after the scope card. Do not turn routine implementation details into blocking questions. Preserve existing authorization boundaries for commits, push, PRs, comments, and external mutations.

If discovery changes the likely cause or reveals a product regression, pause and refresh the scope card before continuing. A technically cheaper or faster implementation is not an improvement when it violates an experience invariant the user still values.

## Retrospective

Focus on what would have made the initial requirement clear within one or two exchanges: ambiguous wording, omitted behavior choices, questions the assistant should have asked, and acceptance criteria exposed by later review. Distinguish missing user requirements from assistant implementation, verification, or repository-convention failures. Do not make the user responsible for technical omissions they already described or could not reasonably anticipate.

Use the list-item format and update policy in [the requirements clarification lessons](references/requirements-lessons.md). Keep verified PR/validation facts brief and only include them when they support a lesson. Verify live PR state when making delivery claims; a retrospective does not comment on GitHub, resolve reviews, push, or merge.
