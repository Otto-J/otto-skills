---
name: baby-caring
description: Answer infant and young-child care questions by searching a configured local Chinese parenting-book corpus and returning verified, traceable evidence. Use for questions about feeding, breastfeeding, formula, burping, spit-up, jaundice, sleep, crying, development, symptoms, safety, and routine care when the user wants source-backed answers, original text, PDF page numbers, MOBI chapter locations, page screenshots, original book images, JSON evidence, or RAG-ready citations.
---

# Baby Caring

Use the local corpus as the source of truth for book-backed answers. Separate retrieval, evidence validation, answer synthesis, and source presentation.

## Paths

Resolve the skill root from this file. Important entries:

- `scripts/search.py`: analyze a question, search both books, and produce a verified evidence bundle.
- `scripts/validate_library.py`: validate original-file hashes, indexes, Passage links, and assets.
- `assets/books/`: original books, text indexes, page images, and original illustrations.
- `references/library-setup.md`: configure an external prepared corpus when books are not bundled with the skill.
- `references/data-contract.md`: corpus structure and locator rules.
- `references/answer-policy.md`: answer and citation rules.

## Workflow

1. Preserve the user's wording and identify requested intents such as definition, cause, procedure, timing, risk, or when to seek care.
2. If `assets/books/` is absent, read `references/library-setup.md` and resolve `BABY_CARING_LIBRARY` before searching.
3. Run the deterministic search before drafting an answer:

```bash
python3 <skill-root>/scripts/search.py '<question>' --top-k 8 --output-dir auto
```

4. Read the generated `result.json` and `evidence.md`. Require `validation.status` to be `valid`. Do not open source images by default.
5. If results are weak, run at most two focused reformulations using the core symptom or action and common synonyms. Do not replace a failed corpus search with unsupported model knowledge.
6. Select the smallest set of Passages that directly supports every material claim. Prefer `native_text` over `ocr_text` when both answer the same point.
7. Draft the answer in this order when applicable: direct answer, practical steps, timing/frequency, normal variation, safety boundary.
8. Present the original source location and assets after the answer. Link the generated evidence bundle when one was created.

## Evidence Rules

- Quote only `quote_text`; never reconstruct a quotation from `retrieval_text`.
- Treat `native_text` as original electronic text. Treat `ocr_text` as usable machine-recognized evidence by default, label it clearly, and provide the PDF page image for optional user review.
- Inspect a PDF page image only when OCR is garbled or truncated, a key quantity or medical claim is ambiguous, sources conflict, or the user explicitly requests visual verification.
- For PDF, report both `pdf_page` and `printed_page` when present and provide `page_image`.
- For MOBI, report the heading path and `fragment_id`, and prefer the clickable Markdown reading-copy line emitted by the search result over a raw local HTML anchor. Keep the original HTML locator in `result.json` for audit. Never invent a page number for reflowable content.
- Use `image_refs` for original MOBI illustrations associated with a Passage.
- Keep answer prose distinct from quoted source text. Clearly label synthesis or inference.
- If no Passage directly supports a requested claim, say that the local books did not provide a reliable match.

## Medical Safety

- Treat this corpus as educational reference, not diagnosis.
- For urgent symptoms, retrieve safety or escalation Passages in addition to explanatory material.
- Do not generalize a routine-care technique into emergency treatment. For example, ordinary burping instructions do not apply to choking or breathing difficulty.
- When the user's described condition may be urgent, lead with the action boundary supported by the corpus, then provide background.

## Response Shape

Keep routine answers concise:

1. Answer the question directly.
2. Give actionable steps or distinctions.
3. Add a short safety note when relevant.
4. List each source with book title, exact location, verification type, and a clickable PDF page image or MOBI Markdown reading-copy line.
5. Link `result.json` for machine-readable provenance and `evidence.md` for human review.

For detailed schemas and examples, read `references/data-contract.md` and `references/answer-policy.md` only as needed.
