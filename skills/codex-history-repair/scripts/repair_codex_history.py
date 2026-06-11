#!/usr/bin/env python3
"""Repair Codex history metadata from rollout JSONL files.

This script is intentionally standalone: it only uses Python stdlib.
"""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Repair Codex sidebar/resume history from rollout JSONL files."
    )
    parser.add_argument(
        "--codex-home",
        default=str(Path.home() / ".codex"),
        help="Codex home directory. Default: ~/.codex",
    )
    parser.add_argument(
        "--state-db",
        default=None,
        help="State SQLite path. Default: newest ~/.codex/state_*.sqlite",
    )
    parser.add_argument(
        "--provider",
        default="auto",
        help="Provider to write into rollout/session metadata. Use 'auto' or a value like 'custom'.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes. Without this, the script is a dry run.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write changes. This is the default.",
    )
    parser.add_argument(
        "--skip-rollouts",
        action="store_true",
        help="Do not rewrite rollout JSONL provider metadata.",
    )
    parser.add_argument(
        "--skip-global-state",
        action="store_true",
        help="Do not update .codex-global-state.json.",
    )
    parser.add_argument(
        "--sqlite-timeout",
        type=float,
        default=30.0,
        help="SQLite lock timeout in seconds.",
    )
    return parser.parse_args()


def iso_to_epoch(value: str | None) -> tuple[int, int | None]:
    if not value:
        return 0, None
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    return int(parsed.timestamp()), int(parsed.timestamp() * 1000)


def compact(value: Any, limit: int = 500) -> str:
    return " ".join(str(value or "").split())[:limit]


def text_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value or default
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def title_from_user(message: str, thread_id: str) -> str:
    title = compact(message, 120)
    if title.startswith("/goal "):
        title = title[6:].strip()
    return (title[:80] or thread_id)


def find_state_db(codex_home: Path, explicit: str | None) -> Path | None:
    if explicit:
        return Path(explicit).expanduser()
    candidates = [Path(p) for p in glob.glob(str(codex_home / "state_*.sqlite"))]
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def rollout_paths(codex_home: Path) -> list[Path]:
    paths = glob.glob(str(codex_home / "sessions/**/*.jsonl"), recursive=True)
    paths += glob.glob(str(codex_home / "archived_sessions/*.jsonl"))
    return sorted(Path(p) for p in paths)


def extract_thread(path: Path, codex_home: Path) -> dict[str, Any] | None:
    first_meta: dict[str, Any] | None = None
    first_user = ""
    preview = ""
    last_ts: str | None = None
    tokens = 0
    has_user = 0
    model = None
    reasoning = None
    sandbox = '{"type":"disabled"}'
    approval = "never"

    with path.open(encoding="utf-8") as handle:
        for line in handle:
            try:
                obj = json.loads(line)
            except Exception:
                continue
            if obj.get("timestamp"):
                last_ts = obj.get("timestamp")
            if obj.get("type") == "session_meta" and first_meta is None:
                first_meta = obj.get("payload") or {}

            payload = obj.get("payload") or {}
            if obj.get("type") == "event_msg":
                if payload.get("type") == "user_message":
                    has_user = 1
                    if not first_user:
                        first_user = payload.get("message") or ""
                        preview = first_user
                usage = payload.get("usage") or payload.get("token_usage") or {}
                if isinstance(usage, dict):
                    tokens += sum(v for v in usage.values() if isinstance(v, int))
            elif obj.get("type") == "response_item":
                item = payload.get("item") or {}
                if item.get("type") == "message" and item.get("role") == "user":
                    has_user = 1
                    pieces: list[str] = []
                    for part in item.get("content") or []:
                        if isinstance(part, dict):
                            pieces.append(part.get("text") or part.get("input_text") or "")
                        elif isinstance(part, str):
                            pieces.append(part)
                    message = " ".join(p for p in pieces if p)
                    if message and not first_user:
                        first_user = message
                        preview = message
            elif obj.get("type") == "turn_context":
                model = model or payload.get("model")
                reasoning = reasoning or payload.get("reasoning_effort")
                if payload.get("sandbox_policy") is not None:
                    sandbox = json.dumps(
                        payload.get("sandbox_policy"),
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                approval = payload.get("approval_policy") or approval

    if not first_meta:
        return None

    thread_id = first_meta["id"]
    created_at, created_at_ms = iso_to_epoch(first_meta.get("timestamp"))
    updated_at, updated_at_ms = iso_to_epoch(last_ts or first_meta.get("timestamp"))
    git = first_meta.get("git") or {}

    originator = first_meta.get("originator")
    thread_source = first_meta.get("thread_source")
    if not thread_source and originator == "Codex Desktop":
        thread_source = "user"

    return {
        "id": thread_id,
        "rollout_path": str(path),
        "rel_path": str(path.relative_to(codex_home)),
        "created_at": created_at,
        "updated_at": updated_at,
        "source": text_value(first_meta.get("source"), "unknown"),
        "model_provider": text_value(first_meta.get("model_provider"), ""),
        "cwd": text_value(first_meta.get("cwd"), str(Path.home())),
        "title": title_from_user(first_user, thread_id),
        "sandbox_policy": sandbox,
        "approval_mode": approval,
        "tokens_used": tokens,
        "has_user_event": has_user,
        "archived": 0,
        "archived_at": None,
        "git_sha": git.get("commit_hash"),
        "git_branch": git.get("branch"),
        "git_origin_url": git.get("repository_url"),
        "cli_version": text_value(first_meta.get("cli_version"), ""),
        "first_user_message": compact(first_user, 4000),
        "agent_nickname": None,
        "agent_role": None,
        "memory_mode": "enabled",
        "model": text_value(model) or None,
        "reasoning_effort": text_value(reasoning) or None,
        "agent_path": None,
        "created_at_ms": created_at_ms,
        "updated_at_ms": updated_at_ms,
        "thread_source": text_value(thread_source) or None,
        "preview": compact(preview or first_user, 500),
    }


def choose_provider(threads: list[dict[str, Any]], requested: str) -> str:
    if requested != "auto":
        return requested
    newest = max(threads, key=lambda t: t.get("updated_at_ms") or t.get("updated_at") or 0)
    provider = newest.get("model_provider")
    if provider:
        return str(provider)
    counts: dict[str, int] = {}
    for thread in threads:
        provider = thread.get("model_provider")
        if provider:
            counts[str(provider)] = counts.get(str(provider), 0) + 1
    return max(counts, key=counts.get) if counts else "openai"


def make_backup(codex_home: Path, state_db: Path | None, changed_rollouts: list[Path]) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = codex_home / "repair_backups" / f"{stamp}-history-repair"
    backup.mkdir(parents=True, exist_ok=True)

    for path in [
        codex_home / "session_index.jsonl",
        codex_home / ".codex-global-state.json",
    ]:
        if path.exists():
            shutil.copy2(path, backup / path.name)

    if state_db and state_db.exists():
        for suffix in ["", "-wal", "-shm"]:
            src = Path(str(state_db) + suffix)
            if src.exists():
                shutil.copy2(src, backup / src.name)

    rollout_root = backup / "rollouts"
    for path in changed_rollouts:
        rel = path.relative_to(codex_home)
        dst = rollout_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dst)
    return backup


def rewrite_rollout_provider(path: Path, provider: str) -> bool:
    changed = False
    output: list[str] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            try:
                obj = json.loads(line)
            except Exception:
                output.append(line)
                continue
            if obj.get("type") == "session_meta":
                payload = obj.setdefault("payload", {})
                if payload.get("model_provider") != provider:
                    payload["model_provider"] = provider
                    changed = True
                line = json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"
            output.append(line)
    if changed:
        tmp = path.with_suffix(path.suffix + ".tmp-history-repair")
        tmp.write_text("".join(output), encoding="utf-8")
        os.replace(tmp, path)
    return changed


def update_sqlite(state_db: Path, threads: list[dict[str, Any]], provider: str, timeout: float) -> None:
    con = sqlite3.connect(str(state_db), timeout=timeout)
    try:
        table_cols = {
            row[1] for row in con.execute("pragma table_info(threads)").fetchall()
        }
        desired = [
            "id",
            "rollout_path",
            "created_at",
            "updated_at",
            "source",
            "model_provider",
            "cwd",
            "title",
            "sandbox_policy",
            "approval_mode",
            "tokens_used",
            "has_user_event",
            "archived",
            "archived_at",
            "git_sha",
            "git_branch",
            "git_origin_url",
            "cli_version",
            "first_user_message",
            "agent_nickname",
            "agent_role",
            "memory_mode",
            "model",
            "reasoning_effort",
            "agent_path",
            "created_at_ms",
            "updated_at_ms",
            "thread_source",
            "preview",
        ]
        cols = [c for c in desired if c in table_cols]
        placeholders = ",".join("?" for _ in cols)
        updates = ",".join(f"{c}=excluded.{c}" for c in cols if c != "id")

        con.execute("begin immediate")
        for thread in threads:
            row = dict(thread)
            row["model_provider"] = provider
            con.execute(
                f"insert into threads ({','.join(cols)}) values ({placeholders}) "
                f"on conflict(id) do update set {updates}",
                [row.get(c) for c in cols],
            )
        if "model_provider" in table_cols:
            con.execute("update threads set model_provider=?", (provider,))
        if "archived" in table_cols:
            con.execute("update threads set archived=0")
        if "archived_at" in table_cols:
            con.execute("update threads set archived_at=null")

        backfill_cols = {
            row[1] for row in con.execute("pragma table_info(backfill_state)").fetchall()
        }
        if backfill_cols:
            con.execute("delete from backfill_state")
            values = {"id": 1, "status": "pending", "updated_at": int(time.time())}
            if "last_watermark" in backfill_cols:
                values["last_watermark"] = None
            if "last_success_at" in backfill_cols:
                values["last_success_at"] = None
            insert_cols = [c for c in ["id", "status", "last_watermark", "last_success_at", "updated_at"] if c in backfill_cols]
            con.execute(
                f"insert into backfill_state({','.join(insert_cols)}) values({','.join('?' for _ in insert_cols)})",
                [values.get(c) for c in insert_cols],
            )
        con.commit()
    finally:
        con.close()


def write_session_index(codex_home: Path, threads: list[dict[str, Any]]) -> None:
    index_path = codex_home / "session_index.jsonl"
    with index_path.open("w", encoding="utf-8") as handle:
        for thread in sorted(threads, key=lambda t: t.get("updated_at_ms") or 0):
            ms = thread.get("updated_at_ms") or thread.get("updated_at", 0) * 1000
            updated = dt.datetime.fromtimestamp(ms / 1000, tz=dt.timezone.utc)
            handle.write(
                json.dumps(
                    {
                        "id": thread["id"],
                        "thread_name": thread["title"],
                        "updated_at": updated.isoformat().replace("+00:00", "Z"),
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n"
            )


def update_global_state(codex_home: Path, threads: list[dict[str, Any]]) -> None:
    path = codex_home / ".codex-global-state.json"
    try:
        state = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except Exception:
        state = {}

    hints = state.get("thread-workspace-root-hints")
    if not isinstance(hints, dict):
        hints = {}
    for thread in threads:
        hints[thread["id"]] = thread["cwd"]
    state["thread-workspace-root-hints"] = hints

    projectless = set(state.get("projectless-thread-ids") or [])
    for thread in threads:
        if thread["cwd"].startswith(str(Path.home() / "Documents/Codex") + "/"):
            projectless.add(thread["id"])
    state["projectless-thread-ids"] = sorted(projectless)

    roots: list[str] = []
    for root in state.get("electron-saved-workspace-roots") or []:
        if root not in roots:
            roots.append(root)
    for thread in sorted(threads, key=lambda t: t.get("updated_at") or 0, reverse=True):
        cwd = thread["cwd"]
        if cwd and not cwd.startswith(str(Path.home() / "Documents/Codex") + "/") and cwd not in roots:
            roots.append(cwd)
    state["electron-saved-workspace-roots"] = roots

    order: list[str] = []
    for root in state.get("project-order") or []:
        if root not in order:
            order.append(root)
    for root in roots:
        if root not in order:
            order.append(root)
    state["project-order"] = order

    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def provider_counts(threads: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for thread in threads:
        provider = str(thread.get("model_provider") or "")
        counts[provider] = counts.get(provider, 0) + 1
    return counts


def main() -> int:
    args = parse_args()
    apply = bool(args.apply and not args.dry_run)
    codex_home = Path(args.codex_home).expanduser()
    state_db = find_state_db(codex_home, args.state_db)
    paths = rollout_paths(codex_home)
    threads = [thread for path in paths if (thread := extract_thread(path, codex_home))]
    if not threads:
        print("No rollout session_meta records found.", file=sys.stderr)
        return 2

    provider = choose_provider(threads, args.provider)
    to_change = [
        Path(thread["rollout_path"])
        for thread in threads
        if thread.get("model_provider") != provider
    ]

    print(
        json.dumps(
            {
                "mode": "apply" if apply else "dry-run",
                "codex_home": str(codex_home),
                "state_db": str(state_db) if state_db else None,
                "rollout_files": len(paths),
                "threads": len(threads),
                "current_provider_counts": provider_counts(threads),
                "target_provider": provider,
                "rollouts_to_rewrite": 0 if args.skip_rollouts else len(to_change),
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if not apply:
        print("Dry run only. Re-run with --apply to write changes.")
        return 0

    backup = make_backup(codex_home, state_db, [] if args.skip_rollouts else to_change)
    changed = 0
    if not args.skip_rollouts:
        for path in to_change:
            if rewrite_rollout_provider(path, provider):
                changed += 1

    rewritten_threads = [thread for path in paths if (thread := extract_thread(path, codex_home))]
    for thread in rewritten_threads:
        thread["model_provider"] = provider

    if state_db:
        update_sqlite(state_db, rewritten_threads, provider, args.sqlite_timeout)
    write_session_index(codex_home, rewritten_threads)
    if not args.skip_global_state:
        update_global_state(codex_home, rewritten_threads)

    print(
        json.dumps(
            {
                "backup": str(backup),
                "changed_rollout_files": changed,
                "threads_written": len(rewritten_threads),
                "provider": provider,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
