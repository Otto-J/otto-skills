#!/usr/bin/env node

import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import {
  ensureDir,
  runCommand,
  sha256File,
  ZIP_LIMITS,
} from "./bundle-utils.mjs";
import {
  loadErrorMessageMappings,
  mapErrorEvidence,
} from "./error-message-mapper.mjs";
import { analyzeFeedbackBundle } from "./log-analyzer.mjs";

const DEFAULT_REPO = "marswaveai/cola";
const DEFAULT_ORG = "marswave-t7";
const DEFAULT_DESKTOP_PROJECT = "cola-macos";
const DEFAULT_MOBILE_PROJECT = "cola-mobile";
const DEFAULT_SENTRY_ENVIRONMENT = "production";
const DEFAULT_DOWNLOAD_ROOT = path.join(os.homedir(), "Downloads", "try-to-fix");
const MAX_SENTRY_CANDIDATES_WITH_EVENTS = 60;
const MAX_SENTRY_EVENT_SAMPLES = 5;

const ISSUE_URL_RE = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)(?:[/?#].*)?$/i;
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/gi;
const REPORT_ID_RE = /\*\*Report ID:\*\*\s*`([^`]+)`/i;
const USER_ID_RE = /\*\*User ID:\*\*\s*`([^`]+)`/i;
const CREATED_AT_RE = /\*\*Created at:\*\*\s*([^\n]+)/i;
const DESCRIPTION_RE = /### Description\s+([\s\S]*?)(?:\n---|$)/i;
const EMAIL_RE = /Email:\s*([^\n]+)/i;
const DEVICE_RE = /Device:\s*([^\n]+)/i;
const DEVICE_ID_RE = /(?:\*\*(?:Device\s*ID|device_id):\*\*|(?:Device\s*ID|device_id):)\s*`?([^`\n]+)`?/i;
const VERSION_RE = /Version:\s*([^\n]+)/i;
const PLATFORM_RE = /Platform:\s*([^\n]+)/i;
const FILE_COUNT_RE = /(?:\*\*)?File count:(?:\*\*)?\s*(\d+)/i;

const EMAIL_REDACTION_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TOKEN_REDACTION_RE = /\b(?:ghp|gho|ghu|ghs|ghr|github_pat|sk|xox[baprs]|glpat)-[A-Za-z0-9_=-]{10,}\b/g;
const KEY_VALUE_SECRET_REDACTION_RE = /\b([A-Za-z0-9_.-]*(?:token|secret|password|passwd|pwd|apikey|api_key|authorization)[A-Za-z0-9_.-]*\s*[:=]\s*)([^\s'",;]+)/gi;
const BEARER_SECRET_REDACTION_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi;
const ID_FIELD_REDACTION_RE = /\b((?:device[ _-]*id|user[ _-]*id)\s*[:=]\s*`?)([^`\s,;]+)/gi;
const CORRELATION_FIELD_REDACTION_RE = /\b((?:sessionId|session_id|sessionKey|session_key|promptId|prompt_id|turnId|turn_id|traceId|trace_id|clientMessageId|client_message_id)\s*[:=]\s*["']?)([A-Za-z0-9._:-]+)/gi;
const BARE_CORRELATION_RE = /\b(?:desktop-local-subagent|session|prompt|turn|trace|client-message|message)[-_:][A-Za-z0-9._:-]{6,}\b/gi;
const UUID_REDACTION_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CONVERSATIONAL_FIELD_REDACTION_RE = /\b((?:systemPrompt|userPrompt|promptText|assistantResponse)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\n,;}]+)/gi;
const SENTRY_PRIVATE_QUERY_RE = /\b((?:device_id|user\.id|user):)([^\s]+)/gi;
const SIGNED_URL_SECRET_REDACTION_RE = /([?&](?:X-Goog-[A-Za-z-]*|X-Amz-[A-Za-z-]*|GoogleAccessId|OSSAccessKeyId|AccessKeyId|Signature|Expires|x-oss-[A-Za-z-]*|token|credential)=)[^&#\s)]+/gi;
const HOME_PATH_REDACTION_RE = /\/Users\/[^/\s"')]+/g;
const WINDOWS_USER_PATH_REDACTION_RE = /[A-Z]:\\Users\\[^\\\s"')]+/gi;

export function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    org: DEFAULT_ORG,
    project: DEFAULT_DESKTOP_PROJECT,
    projectOverride: false,
    environment: DEFAULT_SENTRY_ENVIRONMENT,
    environmentOverride: false,
    issue: null,
    issueUrl: null,
    downloadDir: DEFAULT_DOWNLOAD_ROOT,
    userQuestion: "",
    comment: false,
    reportFile: null,
    ci: false,
    outputJson: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    const valueFlags = new Map([
      ["--repo", "repo"],
      ["--issue-url", "issueUrl"],
      ["--download-dir", "downloadDir"],
      ["--org", "org"],
      ["--environment", "environment"],
      ["--project", "project"],
      ["--user-question", "userQuestion"],
      ["--report-file", "reportFile"],
      ["--output-json", "outputJson"],
    ]);

    if (token === "--issue" && next) {
      args.issue = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (valueFlags.has(token) && next) {
      const key = valueFlags.get(token);
      args[key] = next;
      if (token === "--project") args.projectOverride = true;
      if (token === "--environment") args.environmentOverride = true;
      index += 1;
      continue;
    }
    if (token === "--comment") {
      args.comment = true;
      continue;
    }
    if (token === "--ci") {
      args.ci = true;
      continue;
    }
    if (!token.startsWith("-")) {
      if (ISSUE_URL_RE.test(token)) {
        args.issueUrl = token;
        continue;
      }
      if (/^#?\d+$/.test(token)) {
        args.issue = Number.parseInt(token.replace(/^#/, ""), 10);
        continue;
      }
    }
    throw new Error(`未知或缺少值的参数：${token}`);
  }

  return args;
}

async function commandExists(bin) {
  try {
    await runCommand("which", [bin]);
    return true;
  } catch {
    return false;
  }
}

function installHint(bin) {
  if (bin === "gh") return "缺少或无法使用 `gh`。安装后执行 `gh auth login`。";
  if (bin === "sentry-cli") return "缺少或无法使用 `sentry-cli`。安装后配置 `SENTRY_AUTH_TOKEN`。";
  return `缺少全局命令 \`${bin}\``;
}

async function ensureBaseTool(bin, probeArgs) {
  if (!await commandExists(bin)) throw new Error(installHint(bin));
  if (!probeArgs) return;
  try {
    await runCommand(bin, probeArgs);
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message || error);
    throw new Error(`${installHint(bin)}\n${detail}`, { cause: error });
  }
}

function getSentryAuthToken() {
  if (process.env.SENTRY_AUTH_TOKEN) return process.env.SENTRY_AUTH_TOKEN;
  try {
    const content = fs.readFileSync(path.join(os.homedir(), ".sentryclirc"), "utf8");
    return /token\s*=\s*(.+)/.exec(content)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

async function checkDependencies() {
  await ensureBaseTool("node");
  await ensureBaseTool("curl");
  await ensureBaseTool("unzip");
  await ensureBaseTool("zipinfo");
  await ensureBaseTool("gh", ["auth", "status"]);
  await ensureBaseTool("sentry-cli", ["info"]);
  const sentryToken = getSentryAuthToken();
  if (!sentryToken) {
    throw new Error("Sentry 鉴权失败：未找到 SENTRY_AUTH_TOKEN 或 ~/.sentryclirc token。候选证据不能降级为空。 ");
  }
  return sentryToken;
}

function parseIssueTarget(args) {
  if (args.issueUrl) {
    const match = ISSUE_URL_RE.exec(args.issueUrl.trim());
    if (!match) throw new Error("无效的 GitHub issue URL");
    return { repo: match[1], issueNumber: Number.parseInt(match[2], 10) };
  }
  if (Number.isInteger(args.issue)) {
    return { repo: args.repo, issueNumber: args.issue };
  }
  throw new Error("请明确传入一个 Issue 编号或 URL；try-to-fix 不再自动选择最旧 Issue。");
}

async function fetchIssueByNumber(repo, issueNumber) {
  const [{ stdout: issueJson }, { stdout: commentsJson }] = await Promise.all([
    runCommand("gh", [
      "issue", "view", String(issueNumber), "--repo", repo,
      "--json", "number,title,body,url,createdAt,updatedAt,state",
    ]),
    runCommand("gh", [
      "api", "--paginate", "--slurp",
      `repos/${repo}/issues/${issueNumber}/comments?per_page=100`,
    ]),
  ]);
  const issue = JSON.parse(issueJson);
  issue.comments = JSON.parse(commentsJson).flat().map((comment) => ({
    author: { login: comment.user?.login || "unknown" },
    body: comment.body || "",
    createdAt: comment.created_at || "",
    url: comment.html_url || "",
  }));
  return issue;
}

function extractOne(regex, text) {
  return regex.exec(text)?.[1]?.trim() || "";
}

function isTrustedAttachmentUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "storage.googleapis.com") return true;
    if (/^(?:[a-z0-9.-]+\.)?oss-[a-z0-9-]+\.aliyuncs\.com$/.test(host)) return true;
    if (host === "github.com" && url.pathname.startsWith("/user-attachments/")) return true;
    if (host.endsWith(".githubusercontent.com")) return true;
    if (host === "github-production-user-asset-6210df.s3.amazonaws.com") return true;
    return false;
  } catch {
    return false;
  }
}

function attachmentFileName(label, value) {
  let dispositionName = "";
  let pathName = "";
  try {
    const url = new URL(value);
    pathName = path.basename(decodeURIComponent(url.pathname));
    const disposition = url.searchParams.get("response-content-disposition") || "";
    dispositionName = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(disposition)?.[1] || "";
  } catch {
    // The trust check reports malformed URLs before this helper is used.
  }
  return [label, dispositionName, pathName].map((item) => String(item || "").trim()).filter(Boolean);
}

function classifyAttachment(label, value) {
  const names = attachmentFileName(label, value).map((name) => name.toLowerCase());
  if (names.some((name) => name.endsWith(".zip"))) return "zip";
  if (names.some((name) => /\.(?:png|jpe?g|gif|webp|heic|bmp)$/.test(name))) return "image";
  return "other";
}

export function discoverFeedbackAttachments(issue) {
  const sources = [
    { source: "body", body: issue?.body || "", createdAt: issue?.createdAt || "" },
    ...(issue?.comments || []).map((comment) => ({
      source: "comment",
      body: comment?.body || "",
      createdAt: comment?.createdAt || "",
    })),
  ];
  const attachments = [];
  const seen = new Set();

  for (const source of sources) {
    MARKDOWN_LINK_RE.lastIndex = 0;
    let match;
    while ((match = MARKDOWN_LINK_RE.exec(source.body)) !== null) {
      const label = match[1]
        .replaceAll("\\[", "[")
        .replaceAll("\\]", "]")
        .replaceAll("\\(", "(")
        .replaceAll("\\)", ")")
        .trim();
      const url = match[2].replace(/&amp;/g, "&");
      if (!isTrustedAttachmentUrl(url) || seen.has(url)) continue;
      seen.add(url);
      attachments.push({
        source: source.source,
        createdAt: source.createdAt,
        label,
        url,
        kind: classifyAttachment(label, url),
      });
    }
  }

  const expectedFileCount = Number.parseInt(extractOne(FILE_COUNT_RE, issue?.body || ""), 10);
  return {
    attachments,
    expectedFileCount: Number.isFinite(expectedFileCount) ? expectedFileCount : null,
  };
}

export function parseFeedbackIssue(issue) {
  const body = issue?.body || "";
  const discovery = discoverFeedbackAttachments(issue);
  return {
    reportId: extractOne(REPORT_ID_RE, body),
    userId: extractOne(USER_ID_RE, body),
    createdAt: extractOne(CREATED_AT_RE, body) || issue?.createdAt || "",
    description: extractOne(DESCRIPTION_RE, body),
    email: extractOne(EMAIL_RE, body),
    device: extractOne(DEVICE_RE, body),
    deviceId: extractOne(DEVICE_ID_RE, body),
    version: extractOne(VERSION_RE, body),
    platform: extractOne(PLATFORM_RE, body),
    attachments: discovery.attachments,
    expectedFileCount: discovery.expectedFileCount,
  };
}

async function isValidZip(filePath) {
  try {
    await runCommand("unzip", ["-tq", filePath]);
    return fs.statSync(filePath).size <= ZIP_LIMITS.compressedBytes;
  } catch {
    return false;
  }
}

function attachmentSourceKey(attachment) {
  const url = new URL(attachment.url);
  return `${url.hostname}${url.pathname}|${attachment.label}`;
}

function readDownloadMetadata(metadataPath) {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch {
    return null;
  }
}

async function findReusableZip(target, outputDir, allowLegacyFallback) {
  if (await isValidZip(target)) {
    return { path: target, fileName: path.basename(target), reused: true, sha256: await sha256File(target) };
  }
  if (!allowLegacyFallback) return null;
  const candidates = fs.readdirSync(outputDir)
    .filter((name) => name.toLowerCase().endsWith(".zip"))
    .map((name) => path.join(outputDir, name))
    .filter((candidate) => path.resolve(candidate) !== path.resolve(target));
  const valid = [];
  for (const candidate of candidates) {
    if (await isValidZip(candidate)) valid.push(candidate);
  }
  if (valid.length !== 1) return null;
  return {
    path: valid[0],
    fileName: path.basename(valid[0]),
    reused: true,
    sha256: await sha256File(valid[0]),
  };
}

async function downloadAttachment(attachment, outputDir, index, options = {}) {
  ensureDir(outputDir);
  const target = path.join(outputDir, `attachment-${index}.zip`);
  const partial = `${target}.part`;
  const metadataPath = `${target}.source.json`;
  const sourceKey = attachmentSourceKey(attachment);
  const existing = readDownloadMetadata(metadataPath);
  const reusableFallback = await findReusableZip(
    target,
    outputDir,
    Boolean(options.allowLegacyFallback),
  );

  if (existing?.sourceKey === sourceKey && reusableFallback) {
    if (reusableFallback.sha256 === existing.sha256) {
      return { ...reusableFallback, sourceVerified: true, warning: "" };
    }
  }

  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    fs.rmSync(partial, { force: true });
    const curlArgs = [
      "-fL", "--proto", "=https", "--proto-redir", "=https",
      "--connect-timeout", "30", "--max-time", "300",
      "--max-filesize", String(ZIP_LIMITS.compressedBytes),
      "-o", partial, attachment.url,
    ];
    try {
      await runCommand("curl", curlArgs, proxy ? {
        env: { ...process.env, HTTP_PROXY: proxy, HTTPS_PROXY: proxy },
      } : {});
      if (!await isValidZip(partial)) {
        throw new Error("下载结果不是完整、可读取的 zip");
      }
      fs.renameSync(partial, target);
      const sha256 = await sha256File(target);
      fs.writeFileSync(metadataPath, `${JSON.stringify({ sourceKey, sha256 }, null, 2)}\n`, "utf8");
      return {
        path: target,
        fileName: path.basename(target),
        reused: false,
        sha256,
        sourceVerified: true,
        warning: "",
      };
    } catch (error) {
      lastError = error;
      const detail = String(error.stderr || error.stdout || error.message || error);
      if (/requested URL returned error:\s*(?:401|403|404|410)\b/i.test(detail)) break;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }
  fs.rmSync(partial, { force: true });
  const detail = String(lastError?.stderr || lastError?.stdout || lastError?.message || lastError);
  if (reusableFallback) {
    return {
      ...reusableFallback,
      sourceVerified: false,
      warning: `当前附件 URL 下载失败，改用同一 Issue 槽位中已有且通过 zip 校验的文件：${detail}`,
    };
  }
  throw new Error(`下载附件 ${index} 失败（已重试 3 次）：${detail}`);
}

function redactSensitiveText(value) {
  return String(value || "")
    .replace(EMAIL_REDACTION_RE, "[redacted-email]")
    .replace(TOKEN_REDACTION_RE, "[redacted-token]")
    .replace(KEY_VALUE_SECRET_REDACTION_RE, "$1[redacted-secret]")
    .replace(BEARER_SECRET_REDACTION_RE, "$1[redacted-token]")
    .replace(ID_FIELD_REDACTION_RE, "$1[redacted-id]")
    .replace(CORRELATION_FIELD_REDACTION_RE, "$1[redacted-correlation-id]")
    .replace(BARE_CORRELATION_RE, "[redacted-correlation-id]")
    .replace(UUID_REDACTION_RE, "[redacted-uuid]")
    .replace(CONVERSATIONAL_FIELD_REDACTION_RE, "$1[redacted-content]")
    .replace(SENTRY_PRIVATE_QUERY_RE, "$1[redacted-id]")
    .replace(SIGNED_URL_SECRET_REDACTION_RE, "$1[redacted-signed-value]")
    .replace(HOME_PATH_REDACTION_RE, "/Users/[redacted-user]")
    .replace(WINDOWS_USER_PATH_REDACTION_RE, "C:\\Users\\[redacted-user]");
}

function shortenText(value, maxLength = 500) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}

export function normalizeIssueComments(comments) {
  if (!Array.isArray(comments)) return [];
  return comments.map((comment) => ({
    author: comment?.author?.login || "unknown",
    createdAt: comment?.createdAt || "",
    url: comment?.url || "",
    body: redactSensitiveText(comment?.body || "").trim(),
  })).filter((comment) => comment.body);
}

function normalizePlatform(value) {
  return String(value || "").trim().toLowerCase();
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

export function resolveSentryTarget({ feedback, logAnalysis, project, projectOverride = false }) {
  const platform = normalizePlatform(feedback?.platform);
  const mobile = platform === "android" || platform === "ios";
  const desktop = ["mac", "macos", "windows", "win"].includes(platform);
  const envInfo = logAnalysis?.envInfo || {};
  const version = mobile
    ? firstString(envInfo.appVersion, feedback?.version)
    : firstString(feedback?.version, envInfo.appVersion);
  return {
    project: projectOverride ? project : mobile ? DEFAULT_MOBILE_PROJECT : DEFAULT_DESKTOP_PROJECT,
    environment: mobile ? firstString(envInfo.buildChannel, DEFAULT_SENTRY_ENVIRONMENT) : DEFAULT_SENTRY_ENVIRONMENT,
    releases: version
      ? mobile ? [`cola-mobile@${version}`] : [`cola-server@${version}`, `cola@${version}`]
      : [],
    version,
    platformKind: mobile ? "mobile" : desktop ? "desktop" : "desktop",
    projectOverride: Boolean(projectOverride),
  };
}

function quoteSentryValue(value) {
  const safe = String(value || "").replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
  return safe.includes(" ") ? `"${safe}"` : safe;
}

function stableSentryPhrase(value) {
  return String(value || "")
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\b[0-9a-f]{12,}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function buildSentryCandidateQueries({ environment, deviceId, userId, releases, errorPhrases, mappedErrors, timeWindow }) {
  const routes = [];
  const seen = new Set();
  const add = (reason, query, privateFilters = []) => {
    const normalized = query.trim();
    if (!normalized || seen.has(normalized) || routes.length >= 24) return;
    seen.add(normalized);
    routes.push({ reason, query: normalized, privateFilters });
  };

  if (environment) {
    add("environment-baseline", `environment:${quoteSentryValue(environment)}`);
    add("resolved-environment-history", `is:resolved environment:${quoteSentryValue(environment)}`);
  }
  if (timeWindow) {
    const overlap = `firstSeen:<${timeWindow.end} lastSeen:>${timeWindow.start}`;
    add("time-overlap", overlap);
    add("resolved-time-overlap", `is:resolved ${overlap}`);
  }
  for (const release of releases || []) {
    add("release", `release:${quoteSentryValue(release)}`);
  }
  if (deviceId && String(deviceId).toLowerCase() !== "unknown") {
    add("device", `device_id:${quoteSentryValue(deviceId)}`, ["device_id"]);
    if (environment) {
      add("device-environment", `device_id:${quoteSentryValue(deviceId)} environment:${quoteSentryValue(environment)}`, ["device_id"]);
    }
  }
  if (userId && String(userId).toLowerCase() !== "unknown") {
    add("user", `user.id:${quoteSentryValue(userId)}`, ["user.id"]);
    add("user-fallback", `user:${quoteSentryValue(userId)}`, ["user"]);
  }

  const phrases = [
    ...(errorPhrases || []),
    ...(mappedErrors || []).flatMap((mapping) => [mapping.matchedValue, mapping.rawError]),
  ].map(stableSentryPhrase).filter((phrase) => phrase.length >= 4);
  for (const phrase of [...new Set(phrases)].slice(0, 7)) {
    add("error-phrase", quoteSentryValue(phrase));
  }
  const ignoredTokens = new Set(["error", "failed", "failure", "request", "response", "unknown", "exception"]);
  const tokens = phrases.flatMap((phrase) => phrase.match(/[A-Za-z][A-Za-z0-9_.-]{4,}/g) || [])
    .filter((token) => !ignoredTokens.has(token.toLowerCase()));
  for (const token of [...new Set(tokens)].slice(0, 6)) {
    add("error-token", token);
  }
  return routes;
}

function parseSentryTable(stdout) {
  const rows = stdout.split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean));
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).filter((row) => !row.every((cell) => /^-+$/.test(cell))).map((row) => (
    Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]))
  ));
}

function recordValue(record, keys) {
  const entries = new Map(Object.entries(record || {}).map(([key, value]) => [key.trim().toLowerCase(), value]));
  for (const key of keys) {
    const value = entries.get(key.toLowerCase());
    if (value) return value;
  }
  return "";
}

async function runSentryCli(args) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await runCommand("sentry-cli", args);
    } catch (error) {
      lastError = error;
      const detail = String(error.stderr || error.stdout || error.message || error);
      if (!/HTTP2 framing|timed out|timeout|connection|network/i.test(detail) || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function querySentryIssues({ org, project, query }) {
  const { stdout } = await runSentryCli([
    "issues", "list", "-o", org, "-p", project,
    "--query", query, "--max-rows", "50",
  ]);
  return parseSentryTable(stdout);
}

function computeTimeWindow(value, minutes = 60) {
  const center = new Date(value || "");
  if (Number.isNaN(center.getTime())) return null;
  const delta = minutes * 60 * 1000;
  return {
    center: center.toISOString(),
    start: new Date(center.getTime() - delta).toISOString(),
    end: new Date(center.getTime() + delta).toISOString(),
  };
}

function sentryApiGet(url, token) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        const status = response.statusCode || 0;
        let data;
        try {
          data = JSON.parse(body || "null");
        } catch {
          reject(new Error(`Sentry API 返回了无法解析的响应（HTTP ${status}）`));
          return;
        }
        if (status < 200 || status >= 300) {
          reject(new Error(`Sentry API HTTP ${status}: ${data?.detail || data?.message || "unknown error"}`));
          return;
        }
        resolve({ data, link: response.headers.link || "" });
      });
    });
    request.on("error", (error) => reject(new Error(`Sentry API 请求失败：${error.message}`)));
    request.setTimeout(20_000, () => request.destroy(new Error("Sentry API 请求超时")));
  });
}

function nextPageUrl(linkHeader) {
  for (const part of String(linkHeader || "").split(",")) {
    const match = /<([^>]+)>/.exec(part);
    if (match && /rel="next"/.test(part) && /results="true"/.test(part)) return match[1];
  }
  return null;
}

async function fetchSentryIssueEvents(org, issueId, token, timeWindow) {
  const url = new URL(`https://sentry.io/api/0/organizations/${org}/issues/${issueId}/events/`);
  url.searchParams.set("per_page", "100");
  if (timeWindow) {
    url.searchParams.set("start", timeWindow.start);
    url.searchParams.set("end", timeWindow.end);
  }
  const events = [];
  let next = url.toString();
  for (let page = 0; page < 3 && next; page += 1) {
    const response = await sentryApiGet(next, token);
    if (!Array.isArray(response.data)) throw new Error("Sentry events API 返回格式异常");
    events.push(...response.data);
    next = nextPageUrl(response.link);
  }
  return events;
}

async function fetchSentryEventDetail(org, project, eventId, token) {
  const url = `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/events/${encodeURIComponent(eventId)}/`;
  return (await sentryApiGet(url, token)).data;
}

function eventTag(event, key) {
  return (event?.tags || []).find((tag) => tag.key === key)?.value || "";
}

function eventRelease(event) {
  return eventTag(event, "release") || (typeof event?.release === "string"
    ? event.release
    : firstString(event?.release?.version, event?.release?.shortVersion));
}

function safeExceptionEvidence(detail) {
  const entry = (detail?.entries || []).find((item) => item.type === "exception");
  const values = entry?.data?.values;
  if (!Array.isArray(values)) return [];
  return values.slice(-3).map((value) => ({
    type: redactSensitiveText(value?.type || ""),
    value: shortenText(redactSensitiveText(value?.value || ""), 500),
    mechanism: {
      type: value?.mechanism?.type || "",
      handled: value?.mechanism?.handled ?? null,
    },
    frames: (value?.stacktrace?.frames || []).slice(-6).map((frame) => ({
      function: redactSensitiveText(frame?.function || ""),
      module: redactSensitiveText(frame?.module || ""),
      filename: redactSensitiveText(frame?.filename || ""),
      lineNo: frame?.lineNo || null,
      inApp: frame?.inApp ?? null,
    })),
  }));
}

function safeBreadcrumbEvidence(detail) {
  const entry = (detail?.entries || []).find((item) => item.type === "breadcrumbs");
  const values = entry?.data?.values;
  if (!Array.isArray(values)) return [];
  return values.slice(-15).map((value) => {
    const category = value?.category || "";
    const type = value?.type || "";
    const message = value?.message || "";
    const conversational = /prompt|conversation|chat\.message|llm\.input|user\.input|assistant\.response/i.test(`${category} ${type} ${message}`);
    return {
      timestamp: value?.timestamp || null,
      category,
      type,
      level: value?.level || "",
      message: conversational
        ? "[redacted conversational content]"
        : shortenText(redactSensitiveText(message), 300),
    };
  });
}

function sanitizeEvent(event, expected, detail = null) {
  const deviceValue = eventTag(event, "device_id") || eventTag(event, "device.name");
  const userTag = eventTag(event, "user");
  const eventUserId = event?.user?.id || (userTag.startsWith("id:") ? userTag.slice(3) : userTag);
  return {
    eventId: event?.eventID || event?.id || "",
    dateCreated: event?.dateCreated || "",
    title: shortenText(redactSensitiveText(event?.title || event?.message || ""), 500),
    culprit: shortenText(redactSensitiveText(event?.culprit || ""), 300),
    environment: eventTag(event, "environment") || event?.environment || "",
    release: eventRelease(event),
    platform: event?.platform || eventTag(event, "platform") || "",
    identityHints: {
      deviceIdPresent: Boolean(deviceValue),
      deviceIdMatched: Boolean(expected.deviceId && deviceValue === expected.deviceId),
      userIdPresent: Boolean(eventUserId),
      userIdMatched: Boolean(expected.userId && eventUserId === expected.userId),
    },
    exception: detail ? safeExceptionEvidence(detail) : [],
    breadcrumbs: detail ? safeBreadcrumbEvidence(detail) : [],
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function mappingSourceIssueIds(mappedErrors) {
  const results = [];
  for (const mapping of mappedErrors || []) {
    for (const source of mapping.sources || []) {
      const issueId = /\/issues\/(\d+)/.exec(source.url || "")?.[1];
      if (issueId) results.push({ issueId, ruleId: mapping.ruleId });
    }
  }
  return results;
}

function mappingSourcePriority(candidate) {
  return candidate.sourceReasons.some((reason) => reason.startsWith("mapping-source")) ? 100 : 0;
}

async function collectSentryCandidates({
  org,
  project,
  environment,
  deviceId,
  userId,
  releases,
  errorPhrases,
  mappedErrors,
  createdAt,
  errorTime,
  token,
}) {
  const timeWindow = computeTimeWindow(errorTime || createdAt, 60);
  const queryRoutes = buildSentryCandidateQueries({
    environment, deviceId, userId, releases, errorPhrases, mappedErrors, timeWindow,
  });
  if (queryRoutes.length === 0) {
    throw new Error("没有足够信息构造 Sentry 候选查询；至少需要环境、版本、身份线索或错误短语之一。");
  }

  const queryResults = await mapWithConcurrency(queryRoutes, 3, async (route) => {
    try {
      return { route, rows: await querySentryIssues({ org, project, query: route.query }), error: "" };
    } catch (error) {
      return { route, rows: [], error: String(error.stderr || error.stdout || error.message || error) };
    }
  });
  if (queryResults.every((result) => result.error)) {
    throw new Error(`所有 Sentry 候选查询均失败：${shortenText(queryResults[0].error, 500)}`);
  }

  const candidates = new Map();
  for (const result of queryResults) {
    for (const row of result.rows) {
      const issueId = recordValue(row, ["Issue ID", "ID", "Issue", "id"]);
      if (!issueId) continue;
      const current = candidates.get(issueId) || {
        issueId,
        shortId: recordValue(row, ["Short ID", "short id"]),
        title: recordValue(row, ["Title", "title"]),
        status: recordValue(row, ["Status", "status"]),
        level: recordValue(row, ["Level", "level"]),
        firstSeen: recordValue(row, ["First seen", "first seen"]),
        lastSeen: recordValue(row, ["Last seen", "last seen"]),
        sourceReasons: [],
      };
      if (!current.sourceReasons.includes(result.route.reason)) current.sourceReasons.push(result.route.reason);
      candidates.set(issueId, current);
    }
  }
  for (const source of mappingSourceIssueIds(mappedErrors)) {
    const current = candidates.get(source.issueId) || {
      issueId: source.issueId,
      shortId: "",
      title: "",
      status: "",
      level: "",
      firstSeen: "",
      lastSeen: "",
      sourceReasons: [],
    };
    const reason = `mapping-source:${source.ruleId}`;
    if (!current.sourceReasons.includes(reason)) current.sourceReasons.push(reason);
    candidates.set(source.issueId, current);
  }

  const ranked = [...candidates.values()].toSorted((left, right) => {
    return mappingSourcePriority(right) - mappingSourcePriority(left)
      || right.sourceReasons.length - left.sourceReasons.length
      || String(right.lastSeen).localeCompare(String(left.lastSeen));
  });
  const sampled = ranked.slice(0, MAX_SENTRY_CANDIDATES_WITH_EVENTS);
  const errors = queryResults.filter((result) => result.error).map((result) => ({
    reason: result.route.reason,
    error: shortenText(redactSensitiveText(result.error), 500),
  }));

  await mapWithConcurrency(sampled, 4, async (candidate, candidateIndex) => {
    try {
      const events = await fetchSentryIssueEvents(org, candidate.issueId, token, timeWindow);
      const center = new Date(timeWindow?.center || "").getTime();
      const selectedEvents = events.toSorted((left, right) => {
        if (Number.isNaN(center)) return 0;
        const leftTime = new Date(left.dateCreated || "").getTime();
        const rightTime = new Date(right.dateCreated || "").getTime();
        return Math.abs(leftTime - center) - Math.abs(rightTime - center);
      }).slice(0, MAX_SENTRY_EVENT_SAMPLES);
      let detail = null;
      const firstEventId = selectedEvents[0]?.eventID || selectedEvents[0]?.id;
      if (candidateIndex < 20 && firstEventId) {
        try {
          detail = await fetchSentryEventDetail(org, project, firstEventId, token);
        } catch (error) {
          errors.push({
            reason: `event-detail:${candidate.issueId}`,
            error: shortenText(redactSensitiveText(error.message), 500),
          });
        }
      }
      candidate.eventCountInWindow = events.length;
      candidate.eventSamples = selectedEvents.map((event, index) => sanitizeEvent(
        event,
        { deviceId, userId },
        index === 0 ? detail : null,
      ));
    } catch (error) {
      candidate.eventCountInWindow = null;
      candidate.eventSamples = [];
      errors.push({
        reason: `issue-events:${candidate.issueId}`,
        error: shortenText(redactSensitiveText(error.message), 500),
      });
    }
  });

  return {
    project,
    environment,
    releases,
    timeWindow,
    retrievalComplete: errors.length === 0 && sampled.length === ranked.length,
    candidateCount: ranked.length,
    eventCheckedCandidateCount: sampled.length,
    candidateQueries: queryResults.map((result) => ({
      reason: result.route.reason,
      privateFilters: result.route.privateFilters,
      returned: result.rows.length,
      succeeded: !result.error,
    })),
    candidates: ranked.map((candidate) => ({
      ...candidate,
      title: redactSensitiveText(candidate.title),
      eventCountInWindow: candidate.eventCountInWindow ?? null,
      eventSamples: candidate.eventSamples || [],
      url: `https://${org}.sentry.io/issues/${candidate.issueId}`,
    })),
    errors,
  };
}

function mergeLogAnalyses(analyses, feedback) {
  if (analyses.length === 0) {
    return {
      envInfo: {}, selectedLogs: [], inventory: {}, errorBlocks: [], rawErrorLog: "",
      userPath: "未发现可分析的 zip 日志附件。", errorPhrases: [], errorTime: null,
      correlations: [], supplementalEvidence: [], status: "未发现可分析的 zip 日志附件。",
    };
  }
  const inventory = {};
  for (const analysis of analyses) {
    for (const [key, count] of Object.entries(analysis.inventory || {})) {
      inventory[key] = (inventory[key] || 0) + count;
    }
  }
  const target = new Date(feedback.createdAt || "").getTime();
  const withTimes = analyses.filter((analysis) => analysis.errorTime);
  const primary = withTimes.toSorted((left, right) => {
    if (Number.isNaN(target)) return 0;
    return Math.abs(new Date(left.errorTime).getTime() - target)
      - Math.abs(new Date(right.errorTime).getTime() - target);
  })[0] || analyses[0];
  return {
    envInfo: analyses.find((analysis) => Object.keys(analysis.envInfo || {}).length > 0)?.envInfo || {},
    selectedLogs: analyses.flatMap((analysis, index) => (
      (analysis.selectedLogs || []).map((log) => ({ bundle: analysis.attachmentIndex || index + 1, ...log }))
    )),
    inventory,
    errorBlocks: analyses.flatMap((analysis, index) => (
      (analysis.errorBlocks || []).map((block) => ({ bundle: analysis.attachmentIndex || index + 1, ...block }))
    )),
    rawErrorLog: analyses.map((analysis) => analysis.rawErrorLog).filter(Boolean).join("\n\n"),
    userPath: primary.userPath,
    errorPhrases: [...new Set(analyses.flatMap((analysis) => analysis.errorPhrases || []))],
    errorTime: primary.errorTime || null,
    correlations: analyses.flatMap((analysis, index) => (
      (analysis.correlations || []).map((item) => ({ bundle: analysis.attachmentIndex || index + 1, ...item }))
    )),
    supplementalEvidence: analyses.flatMap((analysis, index) => (
      (analysis.supplementalEvidence || []).map((item) => ({ bundle: analysis.attachmentIndex || index + 1, ...item }))
    )),
    status: analyses.map((analysis, index) => `附件 ${analysis.attachmentIndex || index + 1}: ${analysis.status}`).join(" "),
  };
}

function safeLogAnalysis(analysis) {
  return {
    inventory: analysis.inventory || {},
    selectedLogs: analysis.selectedLogs || [],
    errorTime: analysis.errorTime || null,
    errorBlocks: (analysis.errorBlocks || []).map((block) => ({
      bundle: block.bundle,
      logRelativePath: block.logRelativePath,
      logKind: block.logKind,
      timestampIso: block.timestampIso,
      source: block.source,
      primaryLine: redactSensitiveText(block.primaryLine),
      lines: (block.lines || []).map(redactSensitiveText),
    })),
    rawErrorLog: redactSensitiveText(analysis.rawErrorLog),
    userPath: redactSensitiveText(analysis.userPath),
    errorPhrases: (analysis.errorPhrases || []).map(redactSensitiveText),
    correlations: analysis.correlations || [],
    supplementalEvidence: analysis.supplementalEvidence || [],
    status: redactSensitiveText(analysis.status),
  };
}

function buildEvidence({
  issue,
  repo,
  feedback,
  downloads,
  analyses,
  logAnalysis,
  mappingConfig,
  mappedErrors,
  sentry,
  userQuestion,
  timing,
}) {
  return {
    contract: {
      version: 2,
      sentryCandidatesRequireLlmValidation: true,
      fixedReportStructureRequired: false,
    },
    issue: {
      number: issue.number,
      url: issue.url || `https://github.com/${repo}/issues/${issue.number}`,
      title: redactSensitiveText(issue.title),
      createdAt: issue.createdAt || "",
      state: issue.state || "",
      comments: normalizeIssueComments(issue.comments).map((comment) => ({
        ...comment,
        body: shortenText(comment.body, 2000),
      })),
    },
    feedback: {
      reportIdPresent: Boolean(feedback.reportId),
      platform: feedback.platform || "",
      version: feedback.version || "",
      description: redactSensitiveText(feedback.description),
      emailPresent: Boolean(feedback.email),
      identityHintsPresent: Boolean(feedback.deviceId || feedback.device || feedback.userId),
      expectedFileCount: feedback.expectedFileCount,
    },
    attachments: {
      discoveredCount: feedback.attachments.length,
      zipCount: feedback.attachments.filter((attachment) => attachment.kind === "zip").length,
      expectedCountMatches: feedback.expectedFileCount === null
        ? null
        : feedback.expectedFileCount === feedback.attachments.length,
      items: feedback.attachments.map((attachment, index) => ({
        index: index + 1,
        label: redactSensitiveText(attachment.label),
        kind: attachment.kind,
        source: attachment.source,
        createdAt: attachment.createdAt,
      })),
    downloads: downloads.map((download) => ({
        index: download.index,
        fileName: download.fileName || "",
        sha256: download.sha256 || "",
        reused: Boolean(download.reused),
        sourceVerified: download.sourceVerified !== false,
        warning: download.warning ? shortenText(redactSensitiveText(download.warning), 500) : "",
        duplicateOf: download.duplicateOf || null,
        failed: Boolean(download.failed),
        error: download.failed ? shortenText(redactSensitiveText(download.error), 500) : "",
      })),
    },
    bundles: analyses.map((analysis, index) => ({
      index: index + 1,
      attachmentIndex: analysis.attachmentIndex || index + 1,
      sha256: analysis.bundleSha256
        || downloads.find((download) => download.index === analysis.attachmentIndex)?.sha256
        || "",
      reusedExtracted: Boolean(analysis.reusedExtracted),
      ...safeLogAnalysis(analysis),
    })),
    logAnalysis: safeLogAnalysis(logAnalysis),
    errorMessageMapping: {
      available: mappingConfig.available,
      configPath: mappingConfig.configPath,
      unavailableReason: mappingConfig.available ? "" : mappingConfig.reason,
      mappedErrors: mappedErrors.map((mapping) => ({
        ...mapping,
        rawError: redactSensitiveText(mapping.rawError),
      })),
    },
    sentry,
    userRequest: { question: redactSensitiveText(userQuestion) },
    timing,
  };
}

async function postIssueComment(repo, issueNumber, body) {
  await runCommand("gh", ["issue", "comment", String(issueNumber), "--repo", repo, "--body", body]);
}

async function confirmIssueReply() {
  if (!process.stdin.isTTY) return false;
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question("\n确认把以上 Markdown 原样发布到 GitHub issue？输入 y/yes 发布：");
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    terminal.close();
  }
}

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  if (args.ci !== Boolean(args.outputJson)) {
    throw new Error("--ci 与 --output-json <path> 必须一起使用");
  }
  if (args.comment && !args.reportFile) {
    throw new Error("--comment 必须配合 --report-file <markdown>；脚本不再生成固定结构报告。");
  }
  const approvedReport = args.comment
    ? fs.readFileSync(path.resolve(args.reportFile), "utf8").trim()
    : "";
  if (args.comment && !approvedReport) throw new Error("--report-file 不能为空");
  const target = parseIssueTarget(args);
  const timing = { fetchIssueMs: 0, downloadMs: 0, analyzeLogMs: 0, sentryMs: 0, totalMs: 0 };
  const sentryToken = await checkDependencies();

  let mark = Date.now();
  const issue = await fetchIssueByNumber(target.repo, target.issueNumber);
  timing.fetchIssueMs = Date.now() - mark;
  const feedback = parseFeedbackIssue(issue);
  const issueDir = path.join(path.resolve(args.downloadDir), String(issue.number));
  ensureDir(issueDir);

  mark = Date.now();
  const zipAttachments = feedback.attachments.filter((attachment) => attachment.kind === "zip");
  const downloads = [];
  const firstByHash = new Map();
  for (let index = 0; index < zipAttachments.length; index += 1) {
    try {
      const download = await downloadAttachment(zipAttachments[index], issueDir, index + 1, {
        allowLegacyFallback: zipAttachments.length === 1,
      });
      const duplicateOf = firstByHash.get(download.sha256) || null;
      if (!duplicateOf) firstByHash.set(download.sha256, index + 1);
      downloads.push({ index: index + 1, ...download, duplicateOf, failed: false, error: "" });
    } catch (error) {
      downloads.push({
        index: index + 1,
        fileName: "",
        path: "",
        sha256: "",
        reused: false,
        sourceVerified: false,
        warning: "",
        duplicateOf: null,
        failed: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  timing.downloadMs = Date.now() - mark;

  mark = Date.now();
  const analyses = [];
  for (const download of downloads.filter((item) => !item.failed && !item.duplicateOf)) {
    const analysis = await analyzeFeedbackBundle({
      zipPath: download.path,
      workspaceDir: path.join(issueDir, `attachment-${download.index}.extracted`),
      feedback,
    });
    analysis.attachmentIndex = download.index;
    analyses.push(analysis);
  }
  const logAnalysis = mergeLogAnalyses(analyses, feedback);
  timing.analyzeLogMs = Date.now() - mark;

  const mappingConfig = await loadErrorMessageMappings();
  const mappedErrors = mapErrorEvidence([
    ...logAnalysis.errorPhrases,
    ...logAnalysis.errorBlocks.map((block) => block.primaryLine),
    feedback.description,
  ], mappingConfig);

  mark = Date.now();
  const sentryTarget = resolveSentryTarget({
    feedback,
    logAnalysis,
    project: args.project,
    projectOverride: args.projectOverride,
  });
  const sentry = await collectSentryCandidates({
    org: args.org,
    project: sentryTarget.project,
    environment: args.environmentOverride ? args.environment : sentryTarget.environment,
    deviceId: feedback.deviceId || feedback.device,
    userId: feedback.userId,
    releases: sentryTarget.releases,
    errorPhrases: logAnalysis.errorPhrases,
    mappedErrors,
    createdAt: feedback.createdAt,
    errorTime: logAnalysis.errorTime,
    token: sentryToken,
  });
  timing.sentryMs = Date.now() - mark;
  timing.totalMs = Date.now() - startedAt;

  const evidence = buildEvidence({
    issue,
    repo: target.repo,
    feedback,
    downloads,
    analyses,
    logAnalysis,
    mappingConfig,
    mappedErrors,
    sentry,
    userQuestion: args.userQuestion,
    timing,
  });

  if (args.ci) {
    const outputPath = path.resolve(args.outputJson);
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`outputJson=${outputPath}\n`);
  } else if (!args.comment) {
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  }

  if (args.comment) {
    process.stdout.write(`\n--- 待发布报告 ---\n${approvedReport}\n`);
    if (await confirmIssueReply()) {
      await postIssueComment(target.repo, issue.number, approvedReport);
      process.stdout.write("已发布 GitHub issue 评论。\n");
    } else {
      process.stdout.write("已跳过 GitHub issue 评论发布。\n");
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
