# Interpretation guide

## Report order

1. Give three short conclusion paragraphs: technical/indexing, GSC, then GA4.
2. Show the GSC current/previous raw table.
3. Show the GA4 current/previous raw table, including Google Organic rows.
4. Show only the sitemap URL count, GSC error/warning counts, and URL Inspection
   pass summary. Keep lower-level XML, HTTP, and robots evidence out of the
   default report unless diagnosing a failure.
5. End with no more than three concrete actions.

## Guardrails

- Treat `2026-08-17` as the start of formal Cola SEO optimization. Earlier
  data is historical context only. Do not report SEO growth until both the
  current and comparison periods are entirely after this date.
- Rising impressions with lower CTR can mean Google is testing new pages or queries; inspect page/query rows before calling it a regression.
- A higher numeric average position is worse, but mix changes can move it even when core rankings are stable.
- GSC query rows can omit anonymized or low-volume queries and therefore may not sum to totals.
- GA4 and GSC use different processing windows and attribution. Do not force their counts to match.
- Default GA4 totals, pages, and acquisition are filtered to `/skills/`; do not
  substitute whole-property totals when explaining Skill Hub performance.
- `linkedSearchConsole.available: true` means GA4 returned Search Console
  metrics for `/skills/`, which is practical evidence that the GA-GSC link is active.
- `sitemap` success means Google fetched and parsed the file, not that every URL is indexed.
- A sitemap-level `indexed: 0` does not override URL Inspection. If inspected
  pages pass and report “submitted and indexed,” label the sitemap count as a
  delayed aggregate rather than claiming zero indexed pages.
- When current GSC data is partial, label it preliminary and avoid strong causal claims.
- When the GA previous period has fewer than 10 sessions, show both raw periods
  but label all GA changes `insufficient_baseline` and do not claim growth.
- When the current GA period includes today, label it partial. Do not interpret
  the current day's low value as a decline.
- Flag a page when it contributes at least half of total engagement duration;
  do not use the aggregate engagement trend until the outlier is reviewed.
