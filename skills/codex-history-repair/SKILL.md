---
name: codex-history-repair
description: Repair Codex Desktop/CLI history sidebar or resume list when old chats disappear but rollout JSONL files and ~/.codex/state_*.sqlite still exist. Use this to scan all sessions, normalize provider metadata, rebuild SQLite thread rows, session_index.jsonl, global thread/workspace mappings, archive flags, and backfill state with a backup-first script.
---

# Codex History Repair

Use this skill when Codex history/sidebar/resume list is blank or missing old sessions even though files still exist under `~/.codex/sessions`, `~/.codex/archived_sessions`, `~/.codex/state_*.sqlite`, or `~/.codex/session_index.jsonl`.

## Workflow

1. Run a dry-run first:

```shell
python3 /Users/otto/.agents/skills/codex-history-repair/scripts/repair_codex_history.py --dry-run
```

2. If the target provider is correct, apply:

```shell
python3 /Users/otto/.agents/skills/codex-history-repair/scripts/repair_codex_history.py --apply
```

3. If the app is currently using a custom provider and auto-detection is wrong, force it:

```shell
python3 /Users/otto/.agents/skills/codex-history-repair/scripts/repair_codex_history.py --provider custom --apply
```

4. Verify:

```shell
sqlite3 ~/.codex/state_5.sqlite "select model_provider,count(*) from threads group by model_provider; select archived,count(*) from threads group by archived;"
wc -l ~/.codex/session_index.jsonl
```

## What the Script Fixes

- Rewrites the first `session_meta.payload.model_provider` in every rollout JSONL.
- Rebuilds/upserts `threads` rows in the newest `state_*.sqlite`.
- Sets `archived=0` and clears `archived_at`.
- Rebuilds `session_index.jsonl`.
- Updates `.codex-global-state.json` thread workspace hints, saved workspace roots, project order, and projectless thread ids.
- Resets `backfill_state` so the app-server can rescan with the repaired metadata.
- Creates a timestamped backup under `~/.codex/repair_backups/`.

## Notes

- The provider metadata in rollout files is authoritative during `thread/list`; fixing SQLite alone can be overwritten on restart.
- If SQLite is locked, quit extra Codex windows or wait and rerun the same command. The script uses a timeout but does not kill Codex processes.
- Backups include SQLite files, index/global-state files, and original copies of rollout files that will be changed.
