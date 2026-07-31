#!/usr/bin/env python3
"""Validate bundled books, indexes, mappings, hashes, and source assets."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "assets" / "library" / "catalog.json"


def resolve_books_root() -> Path:
    configured = os.environ.get("BABY_CARING_LIBRARY")
    if not configured:
        return ROOT / "assets" / "books"
    candidate = Path(configured).expanduser().resolve()
    if candidate.name == "books" or any(candidate.glob("*/manifest.json")):
        return candidate
    return candidate / "books"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def required_book_slugs() -> set[str]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return {book["slug"] for book in catalog.get("books", [])}


def validate_book(book_dir: Path) -> dict[str, Any]:
    errors: list[str] = []
    manifest = json.loads((book_dir / "manifest.json").read_text(encoding="utf-8"))
    artifacts = manifest["artifacts"]
    original = book_dir / manifest["source"]["original_file"]
    if not original.is_file():
        errors.append(f"missing original: {original}")
    elif sha256_file(original) != manifest["source"]["sha256"]:
        errors.append(f"original hash mismatch: {original}")

    units = read_jsonl(book_dir / artifacts["units"])
    passages = read_jsonl(book_dir / artifacts["passages"])
    chunks = read_jsonl(book_dir / artifacts["chunks"])
    passage_ids = {item["passage_id"] for item in passages}
    if len(passage_ids) != len(passages):
        errors.append("duplicate passage_id")
    for unit in units:
        for passage_id in unit["passage_ids"]:
            if passage_id not in passage_ids:
                errors.append(f"unit references missing passage: {passage_id}")
    for chunk in chunks:
        for passage_id in chunk["passage_ids"]:
            if passage_id not in passage_ids:
                errors.append(f"chunk references missing passage: {passage_id}")
    checked_assets = 0
    for passage in passages:
        if hashlib.sha256(passage["quote_text"].encode("utf-8")).hexdigest() != passage["text_sha256"]:
            errors.append(f"text hash mismatch: {passage['passage_id']}")
        asset = passage.get("asset_ref") or {}
        for key in ("source_file", "page_image", "source_html", "rendered_image"):
            value = asset.get(key)
            if value:
                checked_assets += 1
                if not (book_dir / value).exists():
                    errors.append(f"missing {key}: {value}")
        for value in asset.get("image_refs", []):
            checked_assets += 1
            if not (book_dir / value).is_file():
                errors.append(f"missing image_ref: {value}")
    return {
        "book": manifest["source"]["title"],
        "format": manifest["source"]["format"],
        "units": len(units),
        "passages": len(passages),
        "chunks": len(chunks),
        "assets_checked": checked_assets,
        "status": "valid" if not errors else "invalid",
        "errors": errors,
    }


def main() -> int:
    books_root = resolve_books_root()
    manifest_paths = sorted(books_root.glob("*/manifest.json"))
    found_slugs = {path.parent.name for path in manifest_paths}
    missing_slugs = sorted(required_book_slugs() - found_slugs)
    results = [validate_book(path.parent) for path in manifest_paths]
    status = "valid" if results and not missing_slugs and all(item["status"] == "valid" for item in results) else "invalid"
    if not results:
        error = "No prepared corpus found. See references/library-setup.md."
    elif missing_slugs:
        error = f"Missing required prepared books: {', '.join(missing_slugs)}"
    else:
        error = None
    payload = {
        "status": status,
        "books_root": str(books_root),
        "books": results,
        "required_books": sorted(required_book_slugs()),
        "missing_books": missing_slugs,
        "error": error,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if status == "valid" else 1


if __name__ == "__main__":
    raise SystemExit(main())
