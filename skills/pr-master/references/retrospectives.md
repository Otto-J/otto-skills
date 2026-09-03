# Retrospective cases

These cases record decision patterns, not full conversations or implementation logs. Re-check the live repository and PR before treating any historical detail as current.

## Reversible channel Start/Stop controls

**Context.** A settings-page request appeared to be a Start/Stop button for installed custom channel integrations. The intended behavior was reversible: preserve installation, configuration, and credentials; Stop prevents automatic startup on later app launches; built-in channels and unrelated behavior remain unchanged.

**What established the right boundary.** The runtime already had lifecycle RPCs that persisted `enabled: false` and owned plugin/gateway cleanup. The Desktop change therefore exposed status and actions through the existing Electron bridge instead of implementing a port scanner or process killer.

**What should have happened earlier.** Before coding, the scope card should have said that the apparently small UI change crossed Runtime state, shared protocol, Electron main/preload, renderer presentation, i18n, and focused tests. The final implementation had nine non-i18n files and six locale files; the repository threshold should have been surfaced before the user needed to question the size.

**Review decisions.** Fix feedback that changed the requested persistence contract: saving configuration must preserve a stopped state, and a failed Start must return to a retryable stopped state. Do not automatically expand Stop into a scheduled-delivery kill switch or agent-session refresh; those change product semantics and need an explicit choice. Record rejected concurrency concerns as accepted boundaries, not as invisible omissions.

**Verification lesson.** A UI toggle and a persisted `enabled` flag do not prove that a plugin-owned port was released. For lifecycle work, the strongest acceptance fixture is a custom plugin with a known listener: assert listener present, Stop releases it, Start restores it, and relaunch preserves the configured state.

**General rules.**

1. State the user-visible lifecycle contract and its non-goals before exposing an existing server capability in the UI.
2. Estimate cross-layer scope before implementation, and distinguish required plumbing from repeated translations and tests.
3. Match lifecycle evidence to the resource claim; a display refresh cannot prove service shutdown.
