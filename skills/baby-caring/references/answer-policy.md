# Answer Policy

## Source selection

1. Start with the highest-ranked direct match.
2. Use adjacent Passages when a heading, explanation, and procedure form one logical answer.
3. Prefer independent confirmation from the second book when it adds useful detail or a safety boundary.
4. Do not cite a table of contents or keyword index as substantive evidence.

## Writing

- Answer in the user's language.
- Put the useful conclusion before citation mechanics.
- Paraphrase for the answer, but keep quoted source excerpts exact.
- Distinguish related concepts that the books distinguish, such as burping versus hiccups.
- Preserve quantities, units, age ranges, and timing exactly.
- Avoid expanding narrow source guidance into universal medical advice.
- Use OCR text directly by default while labeling it `ocr_unverified`. Open the page image only for garbled or truncated OCR, ambiguous key quantities or medical claims, source conflicts, or an explicit visual-verification request.

## Citation display

For each source show:

- Book title.
- Heading path or PDF/printed page.
- `native` or `ocr_unverified` status.
- Short exact quote when useful.
- For PDF, a clickable local path to the page image; the image is review evidence and does not need to be opened before every answer.
- For MOBI, a clickable `book.md` reading-copy path with an exact line number. Keep the HTML fragment locator in JSON for audit instead of relying on it as the primary user link.
- Passage IDs in JSON output; they need not clutter a short conversational answer.

## No-result handling

State that the bundled books did not yield a reliable direct answer. Suggest a narrower term, age, symptom, or context. Browse external medical sources only when the user requests it or when the task explicitly changes from local-book retrieval to current medical research.
