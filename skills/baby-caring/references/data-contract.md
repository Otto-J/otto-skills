# Data Contract

## Corpus hierarchy

```text
Source -> Unit -> Passage -> Chunk
```

- Source: one immutable PDF or MOBI, identified by SHA-256.
- Unit: one PDF page or one MOBI table-of-contents section.
- Passage: the smallest citable paragraph, list item, or heading.
- Chunk: a retrieval window that points back to one or more Passage IDs.

## Book layout

Each directory under `assets/books/` contains:

- `manifest.json`: source metadata, SHA-256, extraction method, and artifact paths.
- `original/`: original PDF or MOBI.
- `book.md`: full reading copy with Markdown headings.
- `book.json` and `units.jsonl`: unit-level structure.
- `passages.jsonl`: exact citable text and locators.
- `chunks.jsonl`: retrieval text and Passage relationships.

PDF books additionally contain `pages/`, `markdown/`, `responses/`, and page metadata. MOBI books additionally contain `source/book.html`, `source/toc.ncx`, and `assets/images/`.

## Locator rules

PDF locator:

```json
{
  "type": "pdf_page",
  "pdf_page": 120,
  "printed_page": "88",
  "citation_granularity": "page"
}
```

MOBI locator:

```json
{
  "type": "reflowable",
  "href": "source/book.html",
  "fragment_id": "filepos415830",
  "dom_path": "body > p:nth-of-type(1330)",
  "text_anchor": {
    "prefix": "...",
    "exact": "...",
    "suffix": "..."
  }
}
```

MOBI is reflowable and does not have stable pages. Cite heading path plus fragment ID.

## Text status

- `native_text` / `native`: text extracted from the original MOBI HTML.
- `ocr_text` / `ocr_unverified`: Qwen OCR output; verify against the page PNG.
- `reviewed_text` / `human_reviewed`: reserved for future human corrections.

## Search result

`scripts/search.py` emits:

- `query_analysis`: normalized query, keywords, intents, and safety sensitivity.
- `retrieval.results`: ranked chunks with their source and Passage records.
- `validation`: text-hash and asset-path checks for returned evidence.
- `answer_contract`: mandatory synthesis constraints.

For MOBI passages, resolved assets also include `reading_markdown`, `reading_markdown_line`, and `reading_markdown_match`. The match is `exact_quote` when the quoted paragraph has a stable line, otherwise `fragment_anchor`. These provide a Codex-clickable reading location; the original `source_html` plus `fragment_id` remains the provenance locator.

When `--output-dir` is used, it writes `result.json`, `evidence.md`, and copies cited page images into `sources/`.
