# Report contract v1.1

Use `report` for human responses and webhook payloads:

`node scripts/seo.mjs report --days 7 --limit 5 --inspect-limit 3`

## Top-level fields

- `report_version`: contract version. Consumers must branch on major changes.
- `generated_at`: UTC ISO-8601 timestamp.
- `overall_status`: `ok`, `watch`, or `critical`.
- `meta`: periods, time zones, scope, and partial-data flags.
- `items`: ordered presentation blocks.
- `quality_flags`: interpretation limits and detected outliers.
- `data`: normalized raw GSC, GA4, sitemap, robots, and inspection rows.
- `markdown`: concise human report rendered from the same numeric values.

## Ordered items

The array order is stable:

1. `conclusion`: up to three evidence-backed paragraphs.
2. `gsc_raw`: current and previous clicks, impressions, CTR, and position.
3. `ga4_raw`: all `/skills/` and Google Organic raw metrics.
4. `sitemap_indexing`: concise URL count, GSC error/warning counts, and index
   inspection summary.
5. `actions`: no more than three prioritized actions.

Table values remain numeric. Ratios use `0..1`; durations use seconds; dates use
`YYYY-MM-DD`; timestamps use ISO-8601. Presentation code performs formatting.
`meta.seo_baseline_start` records the formal optimization start date and
`meta.seo_baseline_status` is `not_started`, `accumulating`, or `comparable`.
While accumulating, item-table previous values, deltas, and rates are `null`;
historical diagnostic rows may remain under `data` but must not drive conclusions.
Detailed public fetch, XML, robots, and per-URL inspection evidence remains under
`data.sitemap_and_indexing`; it is not repeated in the default human report.

## Status meanings

- `ok`: public fetch, robots, sitemap, and sampled index checks are healthy and
  no material watch condition is present.
- `watch`: the system works, but partial data, low CTR, indexing samples, or a
  data-quality outlier requires observation.
- `critical`: sitemap cannot be fetched, XML is malformed, `/skills/` is blocked,
  the sitemap is absent from robots, or GSC reports sitemap errors.

## Quality flags

- `gsc_recent_data_partial`
- `ga_current_day_partial`
- `seo_baseline_not_started`
- `seo_baseline_accumulating`
- `ga_comparison_baseline_insufficient`
- `sitemap_indexed_aggregate_delayed`
- `ga_engagement_outlier`

Do not suppress raw values when a flag exists. Suppress only unsupported trend
claims. URL Inspection samples are evidence about checked URLs, not an overall
index-coverage percentage.

## Webhook safety

Never include access tokens, OAuth client IDs or secrets, ADC paths, GA property
IDs, or credential contents. The payload may include public URLs and the logical
property display name only.
