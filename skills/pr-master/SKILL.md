---
name: pr-master
description: Clarify product behavior and estimate implementation scope before nontrivial engineering changes; retrospectively review a merged PR when asked. Use for feature or fix requests, scope concerns, and PR process reviews, not simple questions or live review-thread handling.
---

# PR Master

Help the user make product intent, engineering scope, and verification expectations visible before work starts. After a PR is finished, turn evidence from the delivery into a small number of reusable process improvements.

## Select a mode

- **Intake and scope**: use for a nontrivial Cola feature/fix, a request to plan, or a concern that the proposed change is unexpectedly large. Do not use for ordinary questions, translations, or one-step edits.
- **Retrospective**: use when the user asks to review a completed PR, repair conversation, or collaboration process. Read [the retrospective cases](references/retrospectives.md) only in this mode.
- **Live PR review**: hand off to `cola-pr-review-loop` when the request is to read or act on active GitHub review threads, checks, or bots. PR Master does not comment, resolve threads, push, or merge as part of a retrospective.

## Intake and scope

Before editing, present a compact scope card in the user's language:

1. **User story** — who does what, what they expect, and the intended visible result.
2. **Behavior choices** — identify only choices that materially change product semantics. Ask a concise question when the request does not decide one; otherwise make the least expansive assumption and state it.
3. **Likely change surface** — list the owning layers and an honest file/line estimate. Separate required code, repeated i18n/schema files, and tests. Explain the data flow rather than listing paths without context.
4. **Explicit non-goals** — record adjacent behavior that stays unchanged.
5. **Evidence plan** — name the smallest test or runtime observation that demonstrates the requested outcome, plus any meaningful boundary case.

The first estimate is a discovery estimate, not a promise. Refresh it once source evidence is available, before implementation grows further. If the expected change exceeds 8 non-i18n files or 500 lines, call this out before editing and explain whether splitting would create an unusable half-feature. Do not split a cross-layer atomic behavior merely to satisfy a file-count target.

For persistent state, external services, ports, background work, or lifecycle actions, distinguish three claims: UI state changed, state persisted across relaunch, and the real resource was released/restarted. Do not use the first as evidence of the third.

When the user has authorized implementation and the behavior is clear, continue after the scope card. Do not turn routine implementation details into blocking questions. Preserve existing authorization boundaries for commits, push, PRs, comments, and external mutations.

## Retrospective

Stay evidence-led and read-only unless the user explicitly asks to absorb a lesson into this skill. Verify the actual PR state, commits, checks, and review decisions rather than inferring them from local history.

Deliver five short sections:

1. **Delivery facts** — current PR/merge state and verified validation evidence.
2. **Intent versus delivery** — where the original user story was preserved or drifted.
3. **Decision ledger** — material review or scope choices, including consciously accepted risks.
4. **Improvements** — separate what the assistant should proactively do from what can be made easier for the user to decide.
5. **Reusable lesson** — at most three general rules, plus any remaining evidence gap.

Only when the user explicitly says **absorb** or asks to update the skill, add a privacy-safe, de-duplicated lesson to the relevant reference. Do not store raw conversations, account names, local paths, credentials, or one-off command output.
