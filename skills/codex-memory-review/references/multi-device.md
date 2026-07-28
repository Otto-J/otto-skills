# Multiple Device Sources

Each Codex home is an independent source with:

- a stable `sourceId` used in state and evidence
- a human-readable `label`
- a `codexHome` pointing to the current, copied, or mounted `.codex` directory
- its own event checkpoint and processed message-key set

The same session or message may exist on several computers. The collector deduplicates forks and archived copies within one source, but preserves an occurrence from every source. This makes provenance visible and prevents one computer from overwriting another.

## Configure Sources

Initialize the local computer:

```shell
node "$SKILL_DIR/scripts/review.mjs" sources init --source-id desktop --label "Desktop"
```

Add another computer after copying or mounting its `.codex` directory:

```shell
node "$SKILL_DIR/scripts/review.mjs" sources add \
  --source-id laptop \
  --label "Laptop" \
  --codex-home /mounted/laptop/.codex
```

List and remove configuration entries:

```shell
node "$SKILL_DIR/scripts/review.mjs" sources list
node "$SKILL_DIR/scripts/review.mjs" sources remove --source-id laptop
```

A one-off prepare can bypass the config with repeatable explicit sources:

```shell
node "$SKILL_DIR/scripts/review.mjs" prepare \
  --source desktop=/path/to/desktop/.codex \
  --source laptop=/path/to/laptop/.codex
```

Do not put credentials in source config. A Codex home path is sufficient.

## First-Connection Policies

Choose one policy explicitly for a new source.

**Read the last N days:** set an event baseline to `now - N days`, then prepare. For example, compute the ISO timestamp outside the skill and run:

```shell
node "$SKILL_DIR/scripts/review.mjs" baseline --source-id laptop --through 2026-07-21T08:00:00.000Z
```

Events after that instant are eligible. The normal 72-hour lookback still catches late writes after subsequent commits.

**Start at connection time:** use the connection instant as the baseline:

```shell
node "$SKILL_DIR/scripts/review.mjs" sources add \
  --source-id laptop \
  --codex-home /mounted/laptop/.codex \
  --initial-through 2026-07-28T08:00:00.000Z
```

A baseline sets only the source's event watermark and `baselineThrough`; its processed message-key list remains empty. Events at or before the baseline stay excluded even though the rolling lookback scans around later checkpoints. This is deliberate initialization, not a claim that those events were processed.

Keep `sourceId` stable if a mount path changes. Remove and re-add config only when needed; retaining the source state preserves its checkpoint.
