#!/usr/bin/env python3
"""Search the bundled parenting-book corpus and emit verified evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import sys
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
SCHEMA_VERSION = "1.0.0"
QUESTION_PHRASES = (
    "请问",
    "请告诉我",
    "告诉我",
    "什么是",
    "是什么意思",
    "是什么",
    "为什么",
    "怎么做",
    "怎么办",
    "怎么",
    "如何",
    "有哪些",
    "什么情况下",
    "需要看医生",
    "看医生",
    "是否",
    "可以吗",
)
GENERIC_WORDS = {"宝宝", "婴儿", "孩子", "新生儿", "问题", "情况", "需要", "可以", "应该"}
GENERIC_PREFIXES = ("宝宝", "婴儿", "孩子", "新生儿")
DOMAIN_EXPANSIONS = {
    "拍嗝": ("自行打嗝", "吃奶后打嗝", "排出肚子里的气", "将吃下去的空气排出", "吞入一些空气"),
    "黄疸": ("胆红素", "皮肤发黄", "眼白发黄"),
    "吐奶": ("溢奶", "胃食管反流"),
    "呛奶": ("奶液误入呼吸道", "呛咳"),
}


def resolve_books_root() -> Path:
    configured = os.environ.get("BABY_CARING_LIBRARY")
    if not configured:
        return ROOT / "assets" / "books"
    candidate = Path(configured).expanduser().resolve()
    if candidate.name == "books" or any(candidate.glob("*/manifest.json")):
        return candidate
    return candidate / "books"


INTENT_RULES = {
    "definition": ("什么是", "是什么意思", "是什么"),
    "procedure": ("怎么", "如何", "步骤", "办法", "方法"),
    "cause": ("为什么", "原因", "怎么回事"),
    "timing": ("何时", "什么时候", "多久", "几次", "频率"),
    "risk": ("危险", "严重", "风险", "正常吗", "要紧吗"),
    "care_escalation": ("就医", "医生", "医院", "急救", "呼吸困难", "发热", "呕吐"),
}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    return re.sub(r"\s+", " ", value).strip()


def analyze_query(query: str) -> dict[str, Any]:
    normalized = normalize(query)
    cleaned = normalized
    for phrase in QUESTION_PHRASES:
        cleaned = cleaned.replace(phrase, " ")
    cleaned = re.sub(r"[，。！？、；：,.!?;:()（）\[\]【】‘’“”/\\]", " ", cleaned)
    candidates = re.findall(r"[\u4e00-\u9fff]{2,}|[a-z0-9][a-z0-9+.-]{1,}", cleaned)
    keywords: list[str] = []
    for candidate in candidates:
        candidate = candidate.strip("的了呢吗啊呀吧会是要")
        for prefix in GENERIC_PREFIXES:
            if candidate.startswith(prefix) and len(candidate) - len(prefix) >= 2:
                candidate = candidate[len(prefix) :]
                break
        if len(candidate) < 2 or candidate in GENERIC_WORDS:
            continue
        if candidate not in keywords:
            keywords.append(candidate)
    if not keywords:
        keywords = [token for token in re.findall(r"[\u4e00-\u9fff]{2,}", normalized) if token not in GENERIC_WORDS]
    intents = [name for name, markers in INTENT_RULES.items() if any(marker in normalized for marker in markers)]
    if not intents:
        intents = ["general_information"]
    expanded_terms = []
    for keyword in keywords:
        expanded_terms.extend(DOMAIN_EXPANSIONS.get(keyword, ()))
    safety_markers = (
        "呼吸",
        "窒息",
        "呛",
        "发热",
        "高烧",
        "抽搐",
        "出血",
        "急救",
        "昏迷",
        "脱水",
        "就医",
        "医生",
    )
    return {
        "original_query": query,
        "normalized_query": normalized,
        "keywords": keywords,
        "expanded_terms": list(dict.fromkeys(expanded_terms)),
        "intents": intents,
        "safety_sensitive": any(marker in normalized for marker in safety_markers),
    }


def grams(value: str) -> set[str]:
    value = normalize(value)
    chinese = "".join(re.findall(r"[\u4e00-\u9fff]", value))
    result = {chinese[index : index + 2] for index in range(max(0, len(chinese) - 1))}
    result.update(re.findall(r"[a-z0-9][a-z0-9+.-]{1,}", value))
    return result


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def discover_books() -> list[dict[str, Any]]:
    books_root = resolve_books_root()
    books: list[dict[str, Any]] = []
    for manifest_path in sorted(books_root.glob("*/manifest.json")):
        book_dir = manifest_path.parent
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        passages = read_jsonl(book_dir / manifest["artifacts"]["passages"])
        chunks = read_jsonl(book_dir / manifest["artifacts"]["chunks"])
        markdown_value = (
            manifest.get("artifacts", {}).get("full_markdown")
            if manifest.get("source", {}).get("format") in {"mobi", "epub"}
            else None
        )
        markdown_path = book_dir / markdown_value if markdown_value else None
        markdown_line_index: dict[str, list[int]] = {}
        markdown_anchor_index: dict[str, int] = {}
        if markdown_path and markdown_path.is_file():
            for line_number, line in enumerate(markdown_path.read_text(encoding="utf-8").splitlines(), start=1):
                if line:
                    markdown_line_index.setdefault(line, []).append(line_number)
                anchor_match = re.fullmatch(r'<a id="([^"]+)"></a>', line.strip())
                if anchor_match:
                    markdown_anchor_index[anchor_match.group(1)] = line_number
        ordered_anchors = sorted(markdown_anchor_index.items(), key=lambda item: item[1])
        markdown_anchor_end_index = {
            fragment: ordered_anchors[index + 1][1] if index + 1 < len(ordered_anchors) else None
            for index, (fragment, _) in enumerate(ordered_anchors)
        }
        books.append(
            {
                "book_dir": book_dir,
                "manifest": manifest,
                "passages": {item["passage_id"]: item for item in passages},
                "chunks": chunks,
                "markdown_path": markdown_path,
                "markdown_line_index": markdown_line_index,
                "markdown_anchor_index": markdown_anchor_index,
                "markdown_anchor_end_index": markdown_anchor_end_index,
            }
        )
    if not books:
        raise RuntimeError(
            f"No prepared baby-caring corpus found under {books_root}. "
            "Set BABY_CARING_LIBRARY to a directory containing books/<slug>/manifest.json "
            "or to the books directory itself. See references/library-setup.md."
        )
    return books


def query_terms(analysis: dict[str, Any]) -> set[str]:
    terms = grams(analysis["normalized_query"])
    for keyword in analysis["keywords"]:
        terms.add(keyword)
        terms.update(grams(keyword))
    for expanded in analysis["expanded_terms"]:
        terms.add(expanded)
        terms.update(grams(expanded))
    return {term for term in terms if term.strip()}


def score_chunks(books: list[dict[str, Any]], analysis: dict[str, Any]) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for book in books:
        for chunk in book["chunks"]:
            text = normalize(chunk["retrieval_text"])
            heading = normalize(" > ".join(chunk.get("heading_path") or []))
            documents.append({"book": book, "chunk": chunk, "text": text, "heading": heading})

    terms = query_terms(analysis)
    document_frequency = Counter()
    for term in terms:
        document_frequency[term] = sum(1 for document in documents if term in document["text"] or term in document["heading"])

    scored: list[dict[str, Any]] = []
    total = len(documents)
    for document in documents:
        score = 0.0
        matches: list[str] = []
        for term in terms:
            text_count = document["text"].count(term)
            heading_count = document["heading"].count(term)
            if not text_count and not heading_count:
                continue
            matches.append(term)
            idf = math.log((total + 1) / (document_frequency[term] + 1)) + 1.0
            score += idf * (min(text_count, 4) + heading_count * 2.5)
        for keyword in analysis["keywords"]:
            if keyword in document["heading"]:
                score += 28.0
            if keyword in document["text"]:
                score += 16.0 + min(document["text"].count(keyword), 4) * 3.0
        expanded_matches = [term for term in analysis["expanded_terms"] if term in document["text"] or term in document["heading"]]
        for expanded in expanded_matches:
            score += 9.0 + min(document["text"].count(expanded), 3) * 2.0
        keyword_weight = sum(len(keyword) for keyword in analysis["keywords"]) or 1
        matched_weight = sum(len(keyword) for keyword in analysis["keywords"] if keyword in document["text"] or keyword in document["heading"])
        keyword_coverage = matched_weight / keyword_weight
        if "目录" in document["heading"] or "关键词索引" in document["heading"]:
            score *= 0.08
        if score < 18 or (keyword_coverage < 0.45 and not expanded_matches):
            continue
        scored.append(
            {
                **document,
                "score": score,
                "keyword_coverage": round(keyword_coverage, 4),
                "expanded_matches": expanded_matches,
                "matched_terms": sorted(set(matches), key=lambda item: (-len(item), item)),
            }
        )
    scored.sort(key=lambda item: (-item["score"], item["chunk"]["sequence"]))
    return scored


def location_label(passage: dict[str, Any]) -> str:
    locator = passage["locator"]
    if locator["type"] == "pdf_page":
        label = f"PDF 第 {locator['pdf_page']} 页"
        if locator.get("printed_page"):
            label += f" / 书内第 {locator['printed_page']} 页"
        return label
    heading = " > ".join(passage.get("heading_path") or [])
    fragment = locator.get("fragment_id") or "无锚点"
    return f"{heading}；MOBI 位置 {fragment}" if heading else f"MOBI 位置 {fragment}"


def resolve_assets(book: dict[str, Any], passage: dict[str, Any]) -> dict[str, Any]:
    book_dir = book["book_dir"]
    asset = passage.get("asset_ref") or {}
    resolved: dict[str, Any] = {}
    for key in ("source_file", "page_image", "crop_image", "source_html", "rendered_image"):
        value = asset.get(key)
        resolved[key] = str((book_dir / value).resolve()) if value else None
    resolved["image_refs"] = [str((book_dir / value).resolve()) for value in asset.get("image_refs", [])]
    markdown_path = book.get("markdown_path")
    line_numbers = book.get("markdown_line_index", {}).get(passage["quote_text"], [])
    fragment = passage.get("locator", {}).get("fragment_id")
    anchor_line = book.get("markdown_anchor_index", {}).get(fragment)
    anchor_end_line = book.get("markdown_anchor_end_index", {}).get(fragment)
    reading_line = None
    reading_match = None
    if line_numbers:
        reading_line = next(
            (
                line
                for line in line_numbers
                if (not anchor_line or line >= anchor_line) and (not anchor_end_line or line < anchor_end_line)
            ),
            None,
        )
        reading_match = "exact_quote" if reading_line else None
    elif anchor_line:
        reading_line = anchor_line
        reading_match = "fragment_anchor"
    if reading_line is None and anchor_line:
        reading_line = anchor_line
        reading_match = "fragment_anchor"
    resolved["reading_markdown"] = str(markdown_path.resolve()) if markdown_path and markdown_path.is_file() else None
    resolved["reading_markdown_line"] = reading_line
    resolved["reading_markdown_match"] = reading_match
    return resolved


def build_result(query: str, top_k: int) -> dict[str, Any]:
    analysis = analyze_query(query)
    books = discover_books()
    scored = score_chunks(books, analysis)
    selected: list[dict[str, Any]] = []
    binding_errors: list[str] = []
    unit_counts: Counter[str] = Counter()
    for candidate in scored:
        chunk = candidate["chunk"]
        if unit_counts[chunk["unit_id"]] >= 2:
            continue
        passages = []
        candidate_binding_errors: list[str] = []
        substantive_chars = 0
        for passage_id in chunk["passage_ids"][:16]:
            passage = candidate["book"]["passages"].get(passage_id)
            if not passage:
                candidate_binding_errors.append(f"chunk references missing passage: {chunk['chunk_id']} -> {passage_id}")
                continue
            if passage["quote_text"] not in (chunk.get("heading_path") or []):
                substantive_chars += len(passage["quote_text"])
            passages.append(
                {
                    "passage_id": passage_id,
                    "heading_path": passage.get("heading_path") or [],
                    "quote_text": passage["quote_text"],
                    "location_label": location_label(passage),
                    "locator": passage["locator"],
                    "assets": resolve_assets(candidate["book"], passage),
                    "verification": passage["verification"],
                    "text_kind": passage["text_kind"],
                    "text_sha256": passage["text_sha256"],
                }
            )
        if not passages or substantive_chars < 20:
            continue
        manifest = candidate["book"]["manifest"]
        selected.append(
            {
                "rank": len(selected) + 1,
                "score": round(candidate["score"], 4),
                "matched_terms": candidate["matched_terms"],
                "keyword_coverage": candidate["keyword_coverage"],
                "expanded_matches": candidate["expanded_matches"],
                "chunk_id": chunk["chunk_id"],
                "unit_id": chunk["unit_id"],
                "source_id": manifest["source"]["source_id"],
                "title": manifest["source"]["title"],
                "format": manifest["source"]["format"],
                "heading_path": chunk.get("heading_path") or [],
                "retrieval_text": chunk["retrieval_text"],
                "passages": passages,
            }
        )
        binding_errors.extend(candidate_binding_errors)
        unit_counts[chunk["unit_id"]] += 1
        if len(selected) >= top_k:
            break

    missing: list[str] = list(binding_errors)
    checked_assets = 0
    checked_passages = 0
    for result in selected:
        for passage in result["passages"]:
            checked_passages += 1
            if hashlib.sha256(passage["quote_text"].encode("utf-8")).hexdigest() != passage["text_sha256"]:
                missing.append(f"text hash mismatch: {passage['passage_id']}")
            for key in ("source_file", "page_image", "source_html", "rendered_image", "reading_markdown"):
                path = passage["assets"].get(key)
                if path:
                    checked_assets += 1
                    if not Path(path).exists():
                        missing.append(path)
            for path in passage["assets"].get("image_refs", []):
                checked_assets += 1
                if not Path(path).exists():
                    missing.append(path)

    return {
        "schema_version": SCHEMA_VERSION,
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "query_analysis": analysis,
        "retrieval": {
            "algorithm": "lexical-idf-with-heading-and-exact-phrase-boosts",
            "books_root": str(resolve_books_root()),
            "books_searched": len(books),
            "chunks_considered": sum(len(book["chunks"]) for book in books),
            "top_k": top_k,
            "results": selected,
        },
        "validation": {
            "status": "valid" if selected and not missing else "invalid" if missing else "no_results",
            "passages_checked": checked_passages,
            "assets_checked": checked_assets,
            "errors": missing,
        },
        "answer_contract": {
            "use_only_verified_passages": True,
            "quote_verbatim": True,
            "distinguish_native_from_ocr": True,
            "do_not_invent_mobi_pages": True,
            "include_safety_boundary_for_medical_risk": True,
        },
    }


def markdown_report(result: dict[str, Any]) -> str:
    analysis = result["query_analysis"]
    lines = [
        f"# 检索证据：{analysis['original_query']}",
        "",
        f"- 关键词：{', '.join(analysis['keywords']) or '无'}",
        f"- 意图：{', '.join(analysis['intents'])}",
        f"- 安全敏感：{'是' if analysis['safety_sensitive'] else '否'}",
        f"- 验证状态：{result['validation']['status']}",
        "",
    ]
    for item in result["retrieval"]["results"]:
        lines.extend([f"## {item['rank']}. {item['title']}", "", f"检索分数：`{item['score']}`", ""])
        seen_quotes: set[str] = set()
        for passage in item["passages"]:
            quote = passage["quote_text"]
            if quote in seen_quotes:
                continue
            seen_quotes.add(quote)
            lines.extend(
                [
                    f"位置：{passage['location_label']}",
                    f"状态：`{passage['verification']}` / `{passage['text_kind']}`",
                    "",
                    f"> {quote}",
                    "",
                ]
            )
            page_image = passage["assets"].get("page_image")
            source_html = passage["assets"].get("source_html")
            reading_markdown = passage["assets"].get("reading_markdown")
            reading_markdown_line = passage["assets"].get("reading_markdown_line")
            if page_image:
                lines.append(f"原页：[{page_image}]({page_image})")
            if item["format"] == "mobi" and reading_markdown and reading_markdown_line:
                lines.append(f"MOBI 阅读稿：[{reading_markdown}:{reading_markdown_line}]({reading_markdown}:{reading_markdown_line})")
            if source_html:
                fragment = passage["locator"].get("fragment_id")
                lines.append(f"原始 HTML 定位（审计用）：`{source_html}#{fragment}`")
            if passage["assets"].get("image_refs"):
                lines.append("原书图片：" + "、".join(f"`{path}`" for path in passage["assets"]["image_refs"]))
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def safe_slug(query: str) -> str:
    value = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", query, flags=re.UNICODE).strip("-")
    return value[:48] or "query"


def write_bundle(result: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output_dir / "evidence.md").write_text(markdown_report(result), encoding="utf-8")
    source_dir = output_dir / "sources"
    copied: set[str] = set()
    for item in result["retrieval"]["results"]:
        for passage in item["passages"]:
            for key in ("page_image", "rendered_image"):
                value = passage["assets"].get(key)
                if not value or value in copied or not Path(value).is_file():
                    continue
                source_dir.mkdir(exist_ok=True)
                destination = source_dir / f"{item['rank']:02d}-{Path(value).name}"
                shutil.copy2(value, destination)
                copied.add(value)
            for value in passage["assets"].get("image_refs", []):
                if value in copied or not Path(value).is_file():
                    continue
                source_dir.mkdir(exist_ok=True)
                destination = source_dir / f"{item['rank']:02d}-{Path(value).name}"
                shutil.copy2(value, destination)
                copied.add(value)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", help="Natural-language baby-care question")
    parser.add_argument("--top-k", type=int, default=8)
    parser.add_argument("--output-dir", type=Path, help="Write result.json, evidence.md, and cited page images")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON to stdout")
    args = parser.parse_args()
    if args.top_k < 1 or args.top_k > 30:
        parser.error("--top-k must be between 1 and 30")
    try:
        result = build_result(args.query, args.top_k)
    except RuntimeError as error:
        print(f"baby-caring: {error}", file=sys.stderr)
        return 2
    if args.output_dir:
        output_dir = args.output_dir
        if str(output_dir) == "auto":
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            output_dir = ROOT / "runs" / f"{stamp}-{safe_slug(args.query)}"
        write_bundle(result, output_dir)
        print(output_dir.resolve())
    else:
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2 if args.pretty else None)
        print()
    return 0 if result["validation"]["status"] == "valid" else 2


if __name__ == "__main__":
    raise SystemExit(main())
