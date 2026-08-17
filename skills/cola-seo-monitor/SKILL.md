---
name: cola-seo-monitor
description: Inspect and explain Cola SEO using live Google Search Console, GA4, sitemap, robots, HTTP, XML, and URL Inspection evidence, with concise human and webhook-ready reports. Use when the user asks how Cola SEO is performing, whether /skills/ or a detail page is indexed, why a sitemap cannot be fetched, what changed over a date range, or whether search traffic and engagement improved.
---

# Cola SEO Monitor

Use the bundled Node CLI first. Keep routine checks read-only and use browser UI only for one-time authorization or reports not exposed by Google APIs.

## Workflow

1. For “SEO 怎么样了” or a webhook payload, run:
   `node scripts/seo.mjs report --days 7 --limit 5 --inspect-limit 3`
   The JSON contains ordered `items[]`, raw data, quality flags, and concise
   Markdown. Use `--format markdown` for human-only output.
2. Keep the report order fixed: basic conclusion, GSC raw table, GA4 raw table,
   sitemap/index facts, then at most three actions. Do not add speculative prose.
   Cola's formal SEO baseline starts on `2026-08-17`. Before two complete
   post-baseline periods exist, label the report `baseline_accumulating`, hide
   prior-period changes, and do not attribute historical movement to SEO work.
3. For a public-only sitemap diagnosis, run:
   `node scripts/seo.mjs sitemap --repeat 10`
4. For complete diagnostic data, run:
   `node scripts/seo.mjs snapshot --days 7 --raw`
5. For one page, run:
   `node scripts/seo.mjs inspect --url https://cola.app/skills/<slug>/`
6. If authentication fails, read `references/setup.md` and complete only the missing setup step.
7. Interpret the JSON using `references/interpretation.md`. For webhook work,
   follow `references/report-contract.md`.

## Evidence rules

- Lead with the conclusion, then distinguish verified evidence, inference, and unknowns.
- Compare with the immediately preceding equal period only when both periods
  start on or after `2026-08-17`. State when GSC recent/hourly rows are partial.
- Treat GSC as search/index evidence and GA4 as behavior evidence. Never label all GA traffic as SEO traffic.
- For sitemap failures, separate XML validity, HTTP reachability, repeated TLS/fetch stability, GSC's stored fetch result, and production logs.
- A browser-rendered XML tree is not HTML. Check `Content-Type`, XML declaration, well-formedness, and actual HTML tags.
- Do not call sitemap coverage complete without stating its URL count and current visibility policy.
- Keep conclusions to three short evidence-backed paragraphs and actions to
  three numbered items. Treat `quality_flags` as limits on interpretation.

## Safety

- Use ADC with read-only scopes. Never print access tokens, OAuth client secrets, or credential file contents.
- Do not store credentials or GA property identifiers in this skill. Resolve the GA property by display name or accept `--ga-property`/`COLA_GA4_PROPERTY_ID` at runtime.
- Do not submit/delete sitemaps, request indexing, change GA/GSC links, or enable write scopes without explicit user approval.
- Do not persist report output unless the user asks or passes `--out`.

## CLI defaults

- GSC property: `sc-domain:cola.app`
- SEO page prefix: `https://cola.app/skills/`
- Sitemap: `https://cola.app/skills/sitemap.xml`
- GA property display name: `Cola`
- Formal SEO baseline: `2026-08-17`

Override with CLI flags or `COLA_GSC_SITE_URL`, `COLA_SITEMAP_URL`, `COLA_GA4_PROPERTY_ID`, and `COLA_GA4_PROPERTY_NAME`.
Override the reporting baseline with `--baseline-start` or
`COLA_SEO_BASELINE_START` only when the user explicitly changes the SEO start date.
