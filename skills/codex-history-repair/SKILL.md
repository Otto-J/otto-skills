---
name: codex-history-repair
description: Repair Codex Desktop/CLI history sidebar or resume list when old chats disappear but rollout JSONL files and ~/.codex/state_*.sqlite still exist. Use this to scan all sessions, normalize provider metadata, rebuild SQLite thread rows, session_index.jsonl, global thread/workspace mappings, archive flags, and backfill state with a backup-first script.
---

# Codex History Repair

Use this skill when Codex history/sidebar/resume list is blank or missing old sessions even though files still exist under `~/.codex/sessions`, `~/.codex/archived_sessions`, `~/.codex/state_*.sqlite`, or `~/.codex/session_index.jsonl`.

## Workflow

Set `SKILL_DIR` to the installed skill directory first. The skill may live under `~/.agents/skills`, `~/.codex/skills`, or a local repo such as `/Users/otto/mycode/otto-skills/skills`.

```shell
SKILL_DIR=/Users/otto/mycode/otto-skills/skills/codex-history-repair
```

1. Run a dry-run first:

```shell
python3 "$SKILL_DIR/scripts/repair_codex_history.py" --dry-run
```

2. Inspect only the summary counts from dry-run:

- `current_provider_counts`
- `target_provider`
- `rollouts_to_rewrite`
- `threads`

3. If the target provider matches the currently active Codex provider, apply:

```shell
python3 "$SKILL_DIR/scripts/repair_codex_history.py" --apply
```

4. If auto-detection chooses the wrong provider, force the provider name seen in the active/newest session:

```shell
python3 "$SKILL_DIR/scripts/repair_codex_history.py" --provider openai1 --apply
```

5. Verify:

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
- Provider names are user- and install-specific. Do not hardcode `openai`, `openai1`, `custom`, or any other value unless dry-run picked the wrong target and the active provider is known.
- The correct provider is usually the provider on the newest active session, because the app filters history by the currently active provider.
- If history disappears after a provider rename, rewrite all old rollout `session_meta.payload.model_provider` values and SQLite `threads.model_provider` to the active provider.
- If SQLite is locked, quit extra Codex windows or wait and rerun the same command. The script uses a timeout but does not kill Codex processes.
- Backups include SQLite files, index/global-state files, and original copies of rollout files that will be changed.

## Privacy Rules

History repair touches highly sensitive files. Keep terminal output and final reports limited to operational metadata:

- OK: counts, provider names, database paths, backup paths, changed file counts, verification totals.
- Avoid: full `session_index.jsonl` lines, chat titles, first user messages, prompts, rollout contents, workspace-specific task names, auth/config contents.
- When verifying index rebuilds, use `wc -l` and aggregate checks. Do not print `head`, `tail`, or sampled rows unless the user explicitly asks.
- When checking rollout metadata, report totals such as `rollout_files`, `session_meta_found`, and `bad_provider`. Do not print file paths for bad rows unless needed to repair a specific failure.

## Validation Checklist

After apply, confirm all of these:

```shell
sqlite3 ~/.codex/state_5.sqlite "select model_provider,count(*) from threads group by model_provider; select archived,count(*) from threads group by archived; select count(*) from threads; select * from backfill_state;"
wc -l ~/.codex/session_index.jsonl
python3 - <<'PY'
import json, pathlib
home = pathlib.Path.home() / ".codex"
paths = list((home / "sessions").rglob("rollout-*.jsonl")) + list((home / "archived_sessions").rglob("rollout-*.jsonl"))
providers = {}
missing = 0
for path in paths:
    provider = None
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if obj.get("type") == "session_meta":
                provider = (obj.get("payload") or {}).get("model_provider")
                break
    if provider is None:
        missing += 1
    else:
        providers[provider] = providers.get(provider, 0) + 1
print(json.dumps({"rollout_files": len(paths), "session_meta_missing": missing, "provider_counts": providers}, ensure_ascii=False, indent=2))
PY
```
