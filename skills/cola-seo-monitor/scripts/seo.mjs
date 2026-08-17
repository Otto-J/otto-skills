#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const command = argv.shift() ?? "report";
const opts = {};
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
  const [key, inline] = arg.slice(2).split("=", 2);
  opts[key] = inline ?? (argv[i + 1]?.startsWith("--") ? true : argv[++i] ?? true);
}

const site = String(opts.site ?? process.env.COLA_GSC_SITE_URL ?? "sc-domain:cola.app");
const sitemapUrl = String(opts["sitemap-url"] ?? process.env.COLA_SITEMAP_URL ?? "https://cola.app/skills/sitemap.xml");
const robotsUrl = String(opts["robots-url"] ?? process.env.COLA_ROBOTS_URL ?? new URL("/robots.txt", sitemapUrl).href);
const gscPrefix = String(opts["gsc-prefix"] ?? "https://cola.app/skills/");
const gaPrefix = String(opts["ga-prefix"] ?? "/skills/");
const gaPropertyName = String(opts["ga-property-name"] ?? process.env.COLA_GA4_PROPERTY_NAME ?? "Cola");
const seoBaselineStart = String(opts["baseline-start"] ?? process.env.COLA_SEO_BASELINE_START ?? "2026-08-17");
if (!/^\d{4}-\d{2}-\d{2}$/.test(seoBaselineStart)) throw new Error("baseline-start must use YYYY-MM-DD");
let accessToken;

function token() {
  if (accessToken) return accessToken;
  try {
    accessToken = execFileSync("gcloud", ["auth", "application-default", "print-access-token"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("ADC unavailable. Follow references/setup.md; no credential content was read or printed.");
  }
  return accessToken;
}

async function api(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${payload.error?.message ?? response.statusText}`);
  return payload;
}

function todayInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function pacificToday() {
  return todayInTimeZone("America/Los_Angeles");
}

function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function ranges(days) {
  const end = pacificToday();
  const requestedStart = shiftDate(end, 1 - days);
  const baselineStarted = end >= seoBaselineStart;
  const start = baselineStarted && requestedStart < seoBaselineStart ? seoBaselineStart : requestedStart;
  const actualDays = Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86_400_000) + 1;
  return {
    current: { start, end },
    previous: { start: shiftDate(start, -actualDays), end: shiftDate(start, -1) },
    baseline: { start: seoBaselineStart, started: baselineStarted },
  };
}

function pageFilter(prefix) {
  return [{ groupType: "and", filters: [{ dimension: "page", operator: "contains", expression: prefix }] }];
}

function normalizeGsc(payload, dimensions) {
  return {
    metadata: payload.metadata ?? null,
    rows: (payload.rows ?? []).map((row) => ({
      dimensions: Object.fromEntries(dimensions.map((name, index) => [name, row.keys?.[index] ?? null])),
      clicks: row.clicks ?? 0, impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0, position: row.position ?? 0,
    })),
  };
}

async function gscQuery({ start, end, dimensions = [], filter = true, dataState = "all", rowLimit = 1000 }) {
  const payload = await api(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: "POST",
    body: {
      startDate: start, endDate: end, dimensions, type: "web", dataState, rowLimit,
      ...(filter ? { dimensionFilterGroups: pageFilter(gscPrefix) } : {}),
    },
  });
  return normalizeGsc(payload, dimensions);
}

async function gscSitemaps() {
  return api(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/sitemaps`);
}

async function inspectUrl(url) {
  return api("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST", body: { inspectionUrl: url, siteUrl: site, languageCode: "zh-CN" },
  });
}

function decodeXml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

async function sitemapAudit(repeat = 5) {
  const attempts = [];
  let body = "";
  let headers = {};
  for (let i = 0; i < repeat; i += 1) {
    const started = Date.now();
    try {
      const response = await fetch(sitemapUrl, {
        headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8", "User-Agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      attempts.push({ status: response.status, ms: Date.now() - started, bytes: Buffer.byteLength(text) });
      if (!body && response.ok) {
        body = text;
        headers = Object.fromEntries(["content-type", "content-encoding", "cache-control", "x-astro-cache", "via"].map((name) => [name, response.headers.get(name)]));
      }
    } catch (error) {
      attempts.push({ status: 0, ms: Date.now() - started, error: error.cause?.code ?? error.name });
    }
  }
  let wellFormed = false;
  if (body) {
    const dir = mkdtempSync(join(tmpdir(), "cola-seo-"));
    const file = join(dir, "sitemap.xml");
    try {
      writeFileSync(file, body);
      execFileSync("xmllint", ["--noout", file], { stdio: "ignore" });
      wellFormed = true;
    } catch { wellFormed = false; } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  const locations = [...body.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => decodeXml(match[1].trim()));
  return {
    url: sitemapUrl, attempts, headers, wellFormed,
    xmlDeclaration: /^\s*<\?xml\s/i.test(body),
    looksHtml: /<!doctype\s+html|<html[\s>]/i.test(body),
    xmlStylesheet: /<\?xml-stylesheet/i.test(body),
    urlCount: locations.length, uniqueUrlCount: new Set(locations).size,
    allAbsoluteHttps: locations.length > 0 && locations.every((url) => url.startsWith("https://")),
  };
}

function robotsPattern(pattern) {
  const anchored = pattern.endsWith("$");
  const source = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`);
}

function parseRobots(body) {
  const groups = [];
  const sitemaps = [];
  let group = { agents: [], rules: [] };
  const flush = () => {
    if (group.agents.length) groups.push(group);
    group = { agents: [], rules: [] };
  };
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/\s*#.*$/, "").trim();
    if (!line.includes(":")) continue;
    const separator = line.indexOf(":");
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (group.rules.length) flush();
      group.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && group.agents.length) {
      group.rules.push({ type: field, pattern: value });
    } else if (field === "sitemap" && value) {
      sitemaps.push(value);
    }
  }
  flush();
  const rules = groups.filter((item) => item.agents.includes("*")).flatMap((item) => item.rules)
    .filter((rule) => rule.pattern && robotsPattern(rule.pattern).test(gaPrefix));
  rules.sort((left, right) => right.pattern.length - left.pattern.length || (left.type === "allow" ? -1 : 1));
  return { sitemaps, rules, allowsSkills: rules[0]?.type !== "disallow" };
}

async function robotsAudit() {
  try {
    const response = await fetch(robotsUrl, { signal: AbortSignal.timeout(15_000) });
    const body = await response.text();
    const parsed = parseRobots(body);
    return {
      url: robotsUrl,
      status: response.status,
      contentType: response.headers.get("content-type"),
      allowsSkills: response.ok && parsed.allowsSkills,
      sitemaps: parsed.sitemaps,
      skillsSitemapDeclared: parsed.sitemaps.includes(sitemapUrl),
    };
  } catch (error) {
    return { url: robotsUrl, status: 0, allowsSkills: false, error: error.cause?.code ?? error.name };
  }
}

async function gaPropertyId() {
  const supplied = opts["ga-property"] ?? process.env.COLA_GA4_PROPERTY_ID;
  if (supplied) return String(supplied).replace(/^properties\//, "");
  const data = await api("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200");
  const matches = (data.accountSummaries ?? []).flatMap((account) => account.propertySummaries ?? [])
    .filter((property) => property.displayName === gaPropertyName);
  if (matches.length !== 1) throw new Error(`Expected one GA property named ${gaPropertyName}; found ${matches.length}. Pass --ga-property.`);
  return matches[0].property.replace("properties/", "");
}

function normalizeGa(payload) {
  const dimensions = (payload.dimensionHeaders ?? []).map((item) => item.name);
  const metrics = (payload.metricHeaders ?? []).map((item) => item.name);
  return (payload.rows ?? []).map((row) => ({
    dimensions: Object.fromEntries(dimensions.map((name, index) => [name, row.dimensionValues?.[index]?.value ?? null])),
    metrics: Object.fromEntries(metrics.map((name, index) => [name, Number(row.metricValues?.[index]?.value ?? 0)])),
  }));
}

async function gaRun(property, dateRange, dimensions, metrics, filter) {
  const payload = await api(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
    method: "POST",
    body: {
      dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })), limit: "1000",
      ...(filter ? { dimensionFilter: filter } : {}),
    },
  });
  const rows = normalizeGa(payload);
  if (dimensions.includes("date")) rows.sort((left, right) => left.dimensions.date.localeCompare(right.dimensions.date));
  return { rows, metadata: payload.metadata ?? null };
}

const prefixFilter = { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: gaPrefix, caseSensitive: true } } };
const searchPrefixFilter = { filter: { fieldName: "landingPagePlusQueryString", stringFilter: { matchType: "BEGINS_WITH", value: gaPrefix, caseSensitive: true } } };
const organicSourceFilter = { filter: { fieldName: "sessionSourceMedium", stringFilter: { matchType: "EXACT", value: "google / organic", caseSensitive: false } } };
const organicPrefixFilter = { andGroup: { expressions: [prefixFilter, organicSourceFilter] } };
const safe = async (work) => { try { return await work(); } catch (error) { return { error: error.message }; } };

async function snapshot(days) {
  const period = ranges(days);
  const [sitemap, robots, current, previous, daily, pages, queries, hourly, sitemaps] = await Promise.all([
    sitemapAudit(5),
    robotsAudit(),
    gscQuery({ ...period.current, dimensions: [] }),
    gscQuery({ ...period.previous, dimensions: [] }),
    gscQuery({ ...period.current, dimensions: ["date"] }),
    gscQuery({ ...period.current, dimensions: ["page"], rowLimit: 50 }),
    gscQuery({ ...period.current, dimensions: ["query"], rowLimit: 50 }),
    gscQuery({ start: shiftDate(period.current.end, -1), end: period.current.end, dimensions: ["hour"], dataState: "hourly_all" }),
    gscSitemaps(),
  ]);
  const property = await gaPropertyId();
  const overview = ["activeUsers", "newUsers", "sessions", "screenPageViews", "engagedSessions", "eventCount", "userEngagementDuration"];
  const [gaCurrent, gaPrevious, gaDaily, gaPages, gaSources, gaSearch, gaOrganicCurrent, gaOrganicPrevious, gaOrganicDaily] = await Promise.all([
    gaRun(property, period.current, [], overview, prefixFilter),
    gaRun(property, period.previous, [], overview, prefixFilter),
    gaRun(property, period.current, ["date"], overview, prefixFilter),
    gaRun(property, period.current, ["pagePath"], ["screenPageViews", "activeUsers", "eventCount", "userEngagementDuration"], prefixFilter),
    gaRun(property, period.current, ["sessionSourceMedium"], ["sessions", "activeUsers", "engagedSessions"], prefixFilter),
    safe(() => gaRun(property, period.current, ["landingPagePlusQueryString"], ["organicGoogleSearchClicks", "organicGoogleSearchImpressions", "organicGoogleSearchClickThroughRate", "organicGoogleSearchAveragePosition"], searchPrefixFilter)),
    gaRun(property, period.current, [], ["activeUsers", "sessions", "engagedSessions"], organicPrefixFilter),
    gaRun(property, period.previous, [], ["activeUsers", "sessions", "engagedSessions"], organicPrefixFilter),
    gaRun(property, period.current, ["date"], ["activeUsers", "sessions", "engagedSessions"], organicPrefixFilter),
  ]);
  return {
    generatedAt: new Date().toISOString(), period,
    scope: { site, gscPrefix, gaPrefix, gaPropertyName }, sitemap, robots,
    gsc: { current, previous, daily, pages, queries, hourly, sitemaps },
    ga4: {
      current: gaCurrent, previous: gaPrevious, daily: gaDaily,
      pages: gaPages, sources: gaSources, linkedSearchConsole: gaSearch,
      organicCurrent: gaOrganicCurrent, organicPrevious: gaOrganicPrevious, organicDaily: gaOrganicDaily,
    },
  };
}

function compactSnapshot(report, limit = 10) {
  const targetSitemap = (report.gsc.sitemaps.sitemap ?? []).find((item) => item.path === sitemapUrl) ?? null;
  const linkedSearchConsole = report.ga4.linkedSearchConsole.error
    ? { available: false, error: report.ga4.linkedSearchConsole.error }
    : { available: true, rows: report.ga4.linkedSearchConsole.rows.slice(0, limit) };
  return {
    generatedAt: report.generatedAt,
    period: report.period,
    scope: report.scope,
    sitemap: report.sitemap,
    robots: report.robots,
    gsc: {
      current: report.gsc.current.rows[0] ?? null,
      previous: report.gsc.previous.rows[0] ?? null,
      dataFreshness: {
        daily: report.gsc.daily.metadata,
        hourly: report.gsc.hourly.metadata,
      },
      daily: report.gsc.daily.rows,
      topPages: report.gsc.pages.rows.slice(0, limit),
      topQueries: report.gsc.queries.rows.slice(0, limit),
      recentHourly: report.gsc.hourly.rows.slice(-6),
      sitemap: targetSitemap,
    },
    ga4: {
      current: report.ga4.current.rows[0]?.metrics ?? null,
      previous: report.ga4.previous.rows[0]?.metrics ?? null,
      daily: report.ga4.daily.rows,
      organicCurrent: report.ga4.organicCurrent.rows[0]?.metrics ?? null,
      organicPrevious: report.ga4.organicPrevious.rows[0]?.metrics ?? null,
      organicDaily: report.ga4.organicDaily.rows,
      topPages: report.ga4.pages.rows.slice(0, limit),
      topSources: report.ga4.sources.rows.slice(0, limit),
      linkedSearchConsole,
      metadata: report.ga4.current.metadata,
    },
  };
}

function inspectionCandidates(report, limit) {
  const languageRoot = new URL("zh/", gscPrefix).href;
  const details = report.gsc.pages.rows.map((row) => row.dimensions.page)
    .filter((url) => url && url !== gscPrefix && url !== languageRoot);
  return [...new Set([gscPrefix, ...details])].slice(0, limit);
}

async function inspectSample(report, limit = 3) {
  return Promise.all(inspectionCandidates(report, limit).map(async (url) => {
    const payload = await safe(() => inspectUrl(url));
    if (payload.error) return { url, status: "error", error: payload.error };
    const result = payload.inspectionResult?.indexStatusResult ?? {};
    return {
      url,
      status: result.verdict === "PASS" ? "pass" : "watch",
      verdict: result.verdict ?? null,
      coverageState: result.coverageState ?? null,
      pageFetchState: result.pageFetchState ?? null,
      robotsTxtState: result.robotsTxtState ?? null,
      indexingState: result.indexingState ?? null,
      lastCrawlTime: result.lastCrawlTime ?? null,
      canonicalMatch: Boolean(result.userCanonical && result.userCanonical === result.googleCanonical),
      userCanonical: result.userCanonical ?? null,
      googleCanonical: result.googleCanonical ?? null,
      sitemapDetected: (result.sitemap ?? []).includes(sitemapUrl),
    };
  }));
}

function rawTableRow(id, label, current, previous, unit, comparisonStatus = "comparable") {
  const comparable = current != null && previous != null;
  const delta = comparable ? current - previous : null;
  return {
    id, label, current, previous, delta,
    change_rate: !comparable || previous === 0 ? null : delta / previous,
    unit,
    comparison_status: comparisonStatus,
  };
}

function metricRow(row) {
  const dimensions = { ...row.dimensions };
  if (/^\d{8}$/.test(dimensions.date ?? "")) {
    dimensions.date = `${dimensions.date.slice(0, 4)}-${dimensions.date.slice(4, 6)}-${dimensions.date.slice(6, 8)}`;
  }
  return { ...dimensions, ...row.metrics };
}

function gscRow(row) {
  return { ...row.dimensions, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position };
}

function formatValue(value, unit) {
  if (value == null) return "—";
  if (unit === "ratio") return `${(value * 100).toFixed(2)}%`;
  if (unit === "position") return value.toFixed(2);
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function signed(value, digits = 0) {
  const formatted = Number(value).toFixed(digits);
  return `${value > 0 ? "+" : ""}${formatted}`;
}

function formatChange(row) {
  if (row.comparison_status === "baseline_not_started") return "尚未开始";
  if (row.comparison_status === "baseline_accumulating") return "基线建立中";
  if (row.comparison_status === "insufficient_baseline") return "基线不足";
  if (row.unit === "ratio") return `${signed(row.delta * 100, 2)} 个百分点`;
  if (row.unit === "position") return signed(row.delta, 2);
  const rate = row.change_rate == null ? "" : ` (${signed(row.change_rate * 100, 1)}%)`;
  return `${signed(row.delta, 0)}${rate}`;
}

function markdownTable(rows) {
  return [
    "| 指标 | 当前周期 | 上一周期 | 变化 |",
    "|---|---:|---:|---:|",
    ...rows.map((row) => `| ${row.label} | ${formatValue(row.current, row.unit)} | ${formatValue(row.previous, row.unit)} | ${formatChange(row)} |`),
  ].join("\n");
}

function reportPayload(report, inspections, limit = 5) {
  const gscCurrent = report.gsc.current.rows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const gscPrevious = report.gsc.previous.rows[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const gaCurrent = report.ga4.current.rows[0]?.metrics ?? {};
  const gaPrevious = report.ga4.previous.rows[0]?.metrics ?? {};
  const organicCurrent = report.ga4.organicCurrent.rows[0]?.metrics ?? {};
  const organicPrevious = report.ga4.organicPrevious.rows[0]?.metrics ?? {};
  const targetSitemap = (report.gsc.sitemaps.sitemap ?? []).find((item) => item.path === sitemapUrl) ?? null;
  const sitemapSuccesses = report.sitemap.attempts.filter((attempt) => attempt.status === 200).length;
  const inspectionPassed = inspections.filter((item) => item.status === "pass").length;
  const sitemapIndexed = Number(targetSitemap?.contents?.find((item) => item.type === "web")?.indexed ?? 0);
  const sitemapIndexedStatus = sitemapIndexed === 0 && inspectionPassed > 0 ? "stale_or_delayed" : "reported";
  const technicalCritical = sitemapSuccesses === 0 || !report.sitemap.wellFormed
    || !report.robots.allowsSkills || !report.robots.skillsSitemapDeclared
    || Number(targetSitemap?.errors ?? 0) > 0;
  const inspectionWatch = inspections.some((item) => item.status !== "pass");
  const isPartial = Boolean(report.gsc.daily.metadata?.firstIncompleteDate);
  const gaTimeZone = report.ga4.current.metadata?.timeZone ?? "Asia/Hong_Kong";
  const gaCurrentDayPartial = report.period.current.end === todayInTimeZone(gaTimeZone);
  const baselineStarted = report.period.baseline?.started ?? report.period.current.end >= seoBaselineStart;
  const seoComparisonReady = baselineStarted && report.period.previous.start >= seoBaselineStart;
  const gscComparisonStatus = !baselineStarted ? "baseline_not_started"
    : !seoComparisonReady ? "baseline_accumulating" : isPartial ? "partial" : "comparable";
  const gaComparisonStatus = !baselineStarted ? "baseline_not_started"
    : !seoComparisonReady ? "baseline_accumulating"
      : (gaPrevious.sessions ?? 0) < 10 ? "insufficient_baseline" : "comparable";
  const currentValue = (value) => baselineStarted ? value : null;
  const previousValue = (value) => seoComparisonReady ? value : null;

  const gscRows = [
    rawTableRow("clicks", "点击", currentValue(gscCurrent.clicks), previousValue(gscPrevious.clicks), "count", gscComparisonStatus),
    rawTableRow("impressions", "展示", currentValue(gscCurrent.impressions), previousValue(gscPrevious.impressions), "count", gscComparisonStatus),
    rawTableRow("ctr", "CTR", currentValue(gscCurrent.ctr), previousValue(gscPrevious.ctr), "ratio", gscComparisonStatus),
    rawTableRow("position", "平均排名", currentValue(gscCurrent.position), previousValue(gscPrevious.position), "position", gscComparisonStatus),
  ];
  const gaRows = [
    rawTableRow("active_users", "活跃用户", currentValue(gaCurrent.activeUsers ?? 0), previousValue(gaPrevious.activeUsers ?? 0), "count", gaComparisonStatus),
    rawTableRow("new_users", "新用户", currentValue(gaCurrent.newUsers ?? 0), previousValue(gaPrevious.newUsers ?? 0), "count", gaComparisonStatus),
    rawTableRow("sessions", "会话", currentValue(gaCurrent.sessions ?? 0), previousValue(gaPrevious.sessions ?? 0), "count", gaComparisonStatus),
    rawTableRow("page_views", "页面浏览", currentValue(gaCurrent.screenPageViews ?? 0), previousValue(gaPrevious.screenPageViews ?? 0), "count", gaComparisonStatus),
    rawTableRow("engaged_sessions", "互动会话", currentValue(gaCurrent.engagedSessions ?? 0), previousValue(gaPrevious.engagedSessions ?? 0), "count", gaComparisonStatus),
    rawTableRow("events", "事件", currentValue(gaCurrent.eventCount ?? 0), previousValue(gaPrevious.eventCount ?? 0), "count", gaComparisonStatus),
    rawTableRow("engagement_seconds", "互动时长（秒）", currentValue(gaCurrent.userEngagementDuration ?? 0), previousValue(gaPrevious.userEngagementDuration ?? 0), "seconds", gaComparisonStatus),
    rawTableRow("organic_active_users", "Google Organic 用户", currentValue(organicCurrent.activeUsers ?? 0), previousValue(organicPrevious.activeUsers ?? 0), "count", gaComparisonStatus),
    rawTableRow("organic_sessions", "Google Organic 会话", currentValue(organicCurrent.sessions ?? 0), previousValue(organicPrevious.sessions ?? 0), "count", gaComparisonStatus),
    rawTableRow("organic_engaged_sessions", "Google Organic 互动会话", currentValue(organicCurrent.engagedSessions ?? 0), previousValue(organicPrevious.engagedSessions ?? 0), "count", gaComparisonStatus),
  ];

  const rootUrls = new Set([gscPrefix, new URL("zh/", gscPrefix).href]);
  const detailRows = report.gsc.pages.rows.filter((row) => !rootUrls.has(row.dimensions.page));
  const opportunityPages = baselineStarted ? detailRows.filter((row) => row.impressions >= 10 && row.ctr < 0.05).slice(0, 3) : [];
  const engagementTotal = gaCurrent.userEngagementDuration ?? 0;
  const engagementOutlier = baselineStarted
    ? report.ga4.pages.rows.find((row) => engagementTotal > 0 && row.metrics.userEngagementDuration / engagementTotal >= 0.5)
    : null;

  const qualityFlags = [];
  if (!baselineStarted) qualityFlags.push({ code: "seo_baseline_not_started", severity: "info", value: seoBaselineStart });
  else if (!seoComparisonReady) qualityFlags.push({ code: "seo_baseline_accumulating", severity: "info", value: seoBaselineStart });
  if (isPartial) qualityFlags.push({ code: "gsc_recent_data_partial", severity: "info", value: report.gsc.daily.metadata.firstIncompleteDate });
  if (gaCurrentDayPartial) qualityFlags.push({ code: "ga_current_day_partial", severity: "info", value: report.period.current.end });
  if (seoComparisonReady && gaComparisonStatus !== "comparable") qualityFlags.push({ code: "ga_comparison_baseline_insufficient", severity: "info" });
  if (sitemapIndexedStatus !== "reported") qualityFlags.push({ code: "sitemap_indexed_aggregate_delayed", severity: "info", value: sitemapIndexed });
  if (engagementOutlier) qualityFlags.push({
    code: "ga_engagement_outlier", severity: "watch", page: engagementOutlier.dimensions.pagePath,
    share: engagementOutlier.metrics.userEngagementDuration / engagementTotal,
  });

  const overallStatus = technicalCritical ? "critical"
    : inspectionWatch || qualityFlags.some((flag) => flag.severity === "watch")
      || (seoComparisonReady && gscCurrent.ctr < gscPrevious.ctr) ? "watch" : "ok";
  const clickRate = seoComparisonReady && gscPrevious.clicks ? (gscCurrent.clicks - gscPrevious.clicks) / gscPrevious.clicks : null;
  const impressionRate = seoComparisonReady && gscPrevious.impressions ? (gscCurrent.impressions - gscPrevious.impressions) / gscPrevious.impressions : null;
  const gscParagraph = !baselineStarted
    ? `GSC 的 SEO 基线从 ${seoBaselineStart} 开始；当前尚无基线后数据，不与此前周期比较。`
    : !seoComparisonReady
      ? `GSC 自 ${report.period.current.start} 起累计 ${gscCurrent.clicks} 次点击、${gscCurrent.impressions} 次展示；当前处于基线建立期，不与此前数据比较。${isPartial ? "最近数据尚未完全结算。" : ""}`
      : `GSC 当前周期为 ${gscCurrent.clicks} 次点击、${gscCurrent.impressions} 次展示；点击较上一周期${clickRate == null ? "无法比较" : `${clickRate >= 0 ? "增长" : "下降"} ${Math.abs(clickRate * 100).toFixed(1)}%`}，展示${impressionRate == null ? "无法比较" : `${impressionRate >= 0 ? "增长" : "下降"} ${Math.abs(impressionRate * 100).toFixed(1)}%`}。CTR ${(gscCurrent.ctr * 100).toFixed(2)}%，平均排名 ${gscCurrent.position.toFixed(2)}。${isPartial ? "最近数据尚未完全结算。" : ""}`;
  const gaParagraph = !baselineStarted
    ? `GA4 同样从 ${seoBaselineStart} 建立 SEO 基线；当前不采用此前数据判断增长。`
    : `GA4 自 ${report.period.current.start} 起为 ${gaCurrent.activeUsers ?? 0} 名活跃用户、${gaCurrent.sessions ?? 0} 次会话、${gaCurrent.screenPageViews ?? 0} 次浏览；Google Organic 为 ${organicCurrent.activeUsers ?? 0} 名用户、${organicCurrent.sessions ?? 0} 次会话。${!seoComparisonReady ? "当前处于基线建立期，暂不判断增长。" : gaComparisonStatus === "comparable" ? "可与上一周期比较。" : "上一周期基线不足，暂不判断增长。"}${gaCurrentDayPartial ? "当日数据尚未完整。" : ""}${engagementOutlier ? `互动时长受 ${engagementOutlier.dimensions.pagePath} 异常高值影响。` : ""}`;
  const paragraphs = [
    `Sitemap 当前包含 ${report.sitemap.urlCount} 个 URL；GSC 报告 ${targetSitemap?.errors ?? "未知"} 个错误、${targetSitemap?.warnings ?? "未知"} 个警告。索引抽检 ${inspectionPassed}/${inspections.length} 通过。`,
    gscParagraph,
    gaParagraph,
  ];

  const actions = [];
  if (!seoComparisonReady) actions.push({
    priority: actions.length + 1,
    item: `以 ${seoBaselineStart} 为 SEO 基线，本周只积累数据，不与此前周期比较。`,
  });
  if (opportunityPages.length) actions.push({
    priority: actions.length + 1,
    item: `优先检查高展示低 CTR 详情页的标题与描述：${opportunityPages.map((row) => new URL(row.dimensions.page).pathname).join("、")}。`,
  });
  if (seoComparisonReady && gaComparisonStatus !== "comparable") actions.push({ priority: actions.length + 1, item: "继续积累至少一个完整对比周期，再判断 GA4 用户增长。" });
  if (sitemapIndexedStatus !== "reported") actions.push({ priority: actions.length + 1, item: "保留当前 sitemap，无需重复提交；继续以 URL Inspection 和实际展示验证收录。" });
  if (!actions.length) actions.push({ priority: 1, item: "保持当前配置，下一周期复查搜索趋势与索引样本。" });

  const sitemapFacts = {
    public_validation: {
      status: sitemapSuccesses === report.sitemap.attempts.length && report.sitemap.wellFormed ? "ok" : "watch",
      successful_attempts: sitemapSuccesses,
      total_attempts: report.sitemap.attempts.length,
      content_type: report.sitemap.headers["content-type"],
      well_formed: report.sitemap.wellFormed,
      looks_html: report.sitemap.looksHtml,
      url_count: report.sitemap.urlCount,
      unique_url_count: report.sitemap.uniqueUrlCount,
    },
    robots: report.robots,
    gsc_sitemap: targetSitemap ? {
      last_submitted: targetSitemap.lastSubmitted,
      last_downloaded: targetSitemap.lastDownloaded,
      pending: targetSitemap.isPending,
      errors: Number(targetSitemap.errors ?? 0),
      warnings: Number(targetSitemap.warnings ?? 0),
      submitted: Number(targetSitemap.contents?.find((item) => item.type === "web")?.submitted ?? 0),
      indexed: sitemapIndexed,
      indexed_status: sitemapIndexedStatus,
    } : null,
    inspection_sample: inspections,
  };
  const sitemapItemData = {
    url_count: report.sitemap.urlCount,
    errors: Number(targetSitemap?.errors ?? 0),
    warnings: Number(targetSitemap?.warnings ?? 0),
    submitted: Number(targetSitemap?.contents?.find((item) => item.type === "web")?.submitted ?? 0),
    indexed: sitemapIndexed,
    indexed_status: sitemapIndexedStatus,
    inspection_passed: inspectionPassed,
    inspection_total: inspections.length,
  };

  const items = [
    { id: "conclusion", type: "conclusion", title: "基本结论", status: overallStatus, paragraphs },
    { id: "gsc_raw", type: "table", title: "GSC 原始数据", columns: ["label", "current", "previous", "delta", "change_rate"], rows: gscRows },
    { id: "ga4_raw", type: "table", title: "GA4 原始数据", columns: ["label", "current", "previous", "delta", "change_rate"], rows: gaRows },
    { id: "sitemap_indexing", type: "facts", title: "Sitemap 与索引", data: sitemapItemData },
    { id: "actions", type: "actions", title: "下一步举措", items: actions.slice(0, 3) },
  ];

  const markdown = [
    "## 基本结论", "", ...paragraphs, "",
    "## GSC 原始数据", "", markdownTable(gscRows), "",
    "## GA4 原始数据", "", markdownTable(gaRows), "",
    "## Sitemap 与索引", "",
    `- Sitemap：${report.sitemap.urlCount} 个 URL；GSC ${targetSitemap?.errors ?? "未知"} 个错误、${targetSitemap?.warnings ?? "未知"} 个警告。`,
    `- 索引抽检：${inspectionPassed}/${inspections.length} 通过。`, "",
    "## 下一步举措", "", ...actions.slice(0, 3).map((action, index) => `${index + 1}. ${action.item}`), "",
  ].join("\n");

  return {
    report_version: "1.1",
    generated_at: report.generatedAt,
    overall_status: overallStatus,
    meta: {
      current_period: report.period.current,
      previous_period: report.period.previous,
      display_timezone: "Asia/Shanghai",
      gsc_timezone: "America/Los_Angeles",
      ga4_timezone: gaTimeZone,
      seo_baseline_start: seoBaselineStart,
      seo_baseline_status: !baselineStarted ? "not_started" : seoComparisonReady ? "comparable" : "accumulating",
      is_partial: isPartial,
      ga_current_day_partial: gaCurrentDayPartial,
      first_incomplete_date: report.gsc.daily.metadata?.firstIncompleteDate ?? null,
      scope: report.scope,
    },
    items,
    quality_flags: qualityFlags,
    data: {
      sitemap_and_indexing: sitemapFacts,
      gsc: {
        current: gscRow(gscCurrent), previous: gscRow(gscPrevious),
        daily: report.gsc.daily.rows.map(gscRow),
        top_pages: report.gsc.pages.rows.slice(0, limit).map(gscRow),
        top_queries: report.gsc.queries.rows.slice(0, limit).map(gscRow),
      },
      ga4: {
        current: gaCurrent, previous: gaPrevious,
        daily: report.ga4.daily.rows.map(metricRow),
        organic_current: organicCurrent, organic_previous: organicPrevious,
        organic_daily: report.ga4.organicDaily.rows.map(metricRow),
        top_pages: report.ga4.pages.rows.slice(0, limit).map(metricRow),
        top_sources: report.ga4.sources.rows.slice(0, limit).map(metricRow),
        linked_search_console: report.ga4.linkedSearchConsole.error
          ? { available: false, error: report.ga4.linkedSearchConsole.error }
          : { available: true, rows: report.ga4.linkedSearchConsole.rows.slice(0, limit).map(metricRow) },
      },
    },
    markdown,
  };
}

function emit(value) {
  const output = `${JSON.stringify(value, null, 2)}\n`;
  if (opts.out) writeFileSync(String(opts.out), output, { mode: 0o600 });
  else process.stdout.write(output);
}

function emitText(value) {
  const output = value.endsWith("\n") ? value : `${value}\n`;
  if (opts.out) writeFileSync(String(opts.out), output, { mode: 0o600 });
  else process.stdout.write(output);
}

async function main() {
  if (opts.help || command === "help") {
    process.stdout.write("Commands: report [--days 7] [--baseline-start YYYY-MM-DD] [--limit 5] [--inspect-limit 3] [--format json|markdown], snapshot [--days 7] [--limit 10] [--raw], sitemap [--repeat 10], inspect --url URL, auth-check\n");
  } else if (command === "sitemap") {
    emit(await sitemapAudit(Number(opts.repeat ?? 10)));
  } else if (command === "inspect") {
    if (!opts.url) throw new Error("inspect requires --url");
    emit(await inspectUrl(String(opts.url)));
  } else if (command === "auth-check") {
    const property = await gaPropertyId();
    await api(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}`);
    emit({ adc: true, gsc: true, ga4: true, gaPropertyName, propertyResolved: Boolean(property) });
  } else if (command === "snapshot") {
    const report = await snapshot(Number(opts.days ?? 7));
    emit(opts.raw ? report : compactSnapshot(report, Math.max(1, Number(opts.limit ?? 10))));
  } else if (command === "report") {
    const snapshotReport = await snapshot(Number(opts.days ?? 7));
    const inspections = await inspectSample(snapshotReport, Math.max(1, Number(opts["inspect-limit"] ?? 3)));
    const report = reportPayload(snapshotReport, inspections, Math.max(1, Number(opts.limit ?? 5)));
    if (opts.format === "markdown") emitText(report.markdown);
    else emit(report);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`cola-seo-monitor: ${error.message}\n`);
  process.exitCode = 1;
}
