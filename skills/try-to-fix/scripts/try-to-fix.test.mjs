import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureExtracted, runCommand } from "./bundle-utils.mjs";
import {
  loadErrorMessageMappings,
  mapErrorEvidence,
  resolveErrorMessageMapping,
} from "./error-message-mapper.mjs";
import { analyzeFeedbackBundle } from "./log-analyzer.mjs";
import {
  buildSentryCandidateQueries,
  discoverFeedbackAttachments,
  normalizeIssueComments,
  parseArgs,
  parseFeedbackIssue,
  resolveSentryTarget,
} from "./try-to-fix.mjs";

function temporaryDirectory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("CLI requires an explicit issue and supports evidence/report inputs", () => {
  const args = parseArgs([
    "#1234",
    "--user-question", "这个好像修复过？",
    "--ci", "--output-json", "/tmp/evidence.json",
    "--report-file", "/tmp/report.md",
  ]);
  assert.equal(args.issue, 1234);
  assert.equal(args.userQuestion, "这个好像修复过？");
  assert.equal(args.outputJson, "/tmp/evidence.json");
  assert.equal(args.reportFile, "/tmp/report.md");
  assert.equal("title" in args, false);
  assert.equal("reproPlan" in args, false);
});

test("attachment discovery reads body and comments across trusted hosts", () => {
  const issue = {
    createdAt: "2026-06-18T10:00:00Z",
    body: [
      "**File count:** 2",
      "[cola-logs-2026-06-18.zip](https://cola-feedback.oss-cn-hangzhou.aliyuncs.com/archive?OSSAccessKeyId=key&Signature=sig&Expires=1)",
      "[1.png](https://cola-feedback.oss-cn-hangzhou.aliyuncs.com/image?Signature=sig)",
    ].join("\n"),
    comments: [{
      createdAt: "2026-06-18T11:00:00Z",
      body: "[more.zip](https://github.com/user-attachments/files/123/more.zip)",
    }],
  };

  const result = discoverFeedbackAttachments(issue);
  assert.equal(result.expectedFileCount, 2);
  assert.deepEqual(result.attachments.map((item) => item.kind), ["zip", "image", "zip"]);
  assert.deepEqual(result.attachments.map((item) => item.source), ["body", "body", "comment"]);
});

test("attachment discovery ignores arbitrary markdown download hosts", () => {
  const result = discoverFeedbackAttachments({
    body: [
      "[logs.zip](https://attacker.example/logs.zip)",
      "[logs.zip](http://storage.googleapis.com/bucket/logs.zip)",
    ].join("\n"),
    comments: [],
  });
  assert.equal(result.attachments.length, 0);
});

test("feedback parser keeps attachment count separate from zip count", () => {
  const feedback = parseFeedbackIssue({
    createdAt: "2026-06-18T10:00:00Z",
    body: [
      "### Description", "发送后无响应", "---",
      "Version: 1.2.3", "Platform: mac", "**File count:** 2",
      "[logs.zip](https://storage.googleapis.com/cola/logs.zip)",
      "[screen.png](https://storage.googleapis.com/cola/screen.png)",
    ].join("\n"),
    comments: [],
  });
  assert.equal(feedback.attachments.length, 2);
  assert.equal(feedback.attachments.filter((item) => item.kind === "zip").length, 1);
  assert.equal(feedback.expectedFileCount, 2);
  assert.equal(feedback.createdAt, "2026-06-18T10:00:00Z");
});

test("issue comments redact identities, secrets, and signed URL parameters", () => {
  const [comment] = normalizeIssueComments([{
    author: { login: "maintainer" },
    body: "dev@example.com token=secret-value-123456 device_id=device-1 desktop-local-subagent-05b484c2 https://bucket.oss-cn-hangzhou.aliyuncs.com/a?OSSAccessKeyId=abc&Signature=def&Expires=1 https://github-production-user-asset-6210df.s3.amazonaws.com/a?X-Amz-Signature=ghi",
  }]);
  assert.match(comment.body, /\[redacted-email\]/);
  assert.match(comment.body, /token=\[redacted-secret\]/);
  assert.match(comment.body, /device_id=\[redacted-id\]/);
  assert.doesNotMatch(comment.body, /OSSAccessKeyId=abc/);
  assert.doesNotMatch(comment.body, /Signature=def/);
  assert.doesNotMatch(comment.body, /X-Amz-Signature=ghi/);
  assert.doesNotMatch(comment.body, /desktop-local-subagent-05b484c2/);
});

test("mobile feedback uses cola-mobile release from bundle env", () => {
  const target = resolveSentryTarget({
    feedback: { platform: "android", version: "0.1.0" },
    logAnalysis: { envInfo: { appVersion: "0.1.0+1", buildChannel: "staging" } },
    project: "cola-macos",
  });
  assert.equal(target.project, "cola-mobile");
  assert.equal(target.environment, "staging");
  assert.deepEqual(target.releases, ["cola-mobile@0.1.0+1"]);
});

test("desktop feedback keeps paired releases", () => {
  const target = resolveSentryTarget({
    feedback: { platform: "mac", version: "1.0.9" },
    logAnalysis: { envInfo: { appVersion: "0.1.0+1" } },
    project: "cola-macos",
  });
  assert.equal(target.project, "cola-macos");
  assert.deepEqual(target.releases, ["cola-server@1.0.9", "cola@1.0.9"]);
});

test("Sentry candidate retrieval uses several recall routes without unresolved gating", () => {
  const routes = buildSentryCandidateQueries({
    environment: "production",
    deviceId: "device-1",
    userId: "user-1",
    releases: ["cola@1.2.3", "cola-server@1.2.3"],
    errorPhrases: ["Server connection lost"],
    mappedErrors: [{ matchedValue: "rate limit", rawError: "rate limit exceeded" }],
    timeWindow: {
      start: "2026-06-22T15:52:00.000Z",
      end: "2026-06-22T17:52:00.000Z",
    },
  });
  assert.ok(routes.some((route) => route.reason === "environment-baseline"));
  assert.ok(routes.some((route) => route.reason === "device"));
  assert.ok(routes.some((route) => route.reason === "user"));
  assert.ok(routes.some((route) => route.reason === "release"));
  assert.ok(routes.some((route) => route.reason === "error-phrase"));
  assert.ok(routes.some((route) => route.reason === "error-token"));
  assert.ok(routes.some((route) => route.reason === "time-overlap"));
  assert.ok(routes.some((route) => route.reason === "resolved-environment-history"));
  assert.equal(routes.some((route) => route.query.includes("is:unresolved")), false);
});

test("error mapping prefers exact rules and then ordered keyword rules", () => {
  const config = {
    available: true,
    rules: [
      {
        id: "first",
        exact: ["exact failure"],
        keywords: ["overlap"],
        messages: { "zh-CN": "第一条", en: "first" },
        actions: ["retry"],
        sources: [],
      },
      {
        id: "second",
        exact: [],
        keywords: ["overlap", "quota"],
        messages: { "zh-CN": "第二条" },
        actions: ["open_plan_settings"],
        sources: [],
      },
    ],
  };
  assert.equal(resolveErrorMessageMapping("EXACT FAILURE", config)?.ruleId, "first");
  assert.equal(resolveErrorMessageMapping("an overlap happened", config)?.ruleId, "first");
  assert.equal(resolveErrorMessageMapping("quota exceeded", config)?.ruleId, "second");
  assert.deepEqual(mapErrorEvidence(["quota exceeded", "quota exceeded"], config).map((item) => item.ruleId), ["second"]);
});

test("error mapping loader reads the JSON contract and preserves source evidence", async () => {
  const root = temporaryDirectory("try-to-fix-mapping-");
  try {
    const configPath = path.join(root, "apps", "desktop", "src", "renderer", "config", "error-message-mappings.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      rules: [{
        id: "rate-limit",
        keywords: ["rate limit"],
        messages: { "zh-CN": "请求过于频繁" },
        actions: ["retry"],
        sources: [{ url: "https://marswave-t7.sentry.io/issues/123456/", observed: 7 }],
      }],
    }));
    const config = await loadErrorMessageMappings({ repoRoot: root });
    const mapping = resolveErrorMessageMapping("rate limit exceeded", config);
    assert.equal(config.available, true);
    assert.equal(config.configPath, "apps/desktop/src/renderer/config/error-message-mappings.json");
    assert.equal(mapping.userMessage, "请求过于频繁");
    assert.equal(mapping.sources[0].observed, 7);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("log analysis reads all same-date logs and prefers the feedback platform first", async () => {
  const root = temporaryDirectory("try-to-fix-mixed-log-");
  try {
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    fs.writeFileSync(path.join(root, "logs", "cola-2026-06-22.log"), "[2026-06-22 16:52:09.421] [ERROR] Desktop error\n");
    fs.writeFileSync(path.join(root, "logs", "cola-mobile-2026-06-22.log"), "[2026-06-22 16:52:09.421] [FATAL] Mobile error\n");
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: "2026-06-22T16:51:58.124Z", platform: "android" },
    });
    assert.equal(analysis.selectedLogs.length, 2);
    assert.equal(analysis.selectedLogs[0].kind, "mobile");
    assert.equal(analysis.inventory.mainLogs, 2);
    assert.match(analysis.status, /完整读取 2 个/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("trace and session evidence is selected by hashed correlation without exposing content", async () => {
  const root = temporaryDirectory("try-to-fix-correlated-");
  try {
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    fs.mkdirSync(path.join(root, "sessions"), { recursive: true });
    fs.writeFileSync(path.join(root, "logs", "cola-2026-06-22.log"), [
      "[2026-06-22 16:47:18.532] [INFO] [agent] prompt start sessionId=session-secret-1 text=private prompt",
      "[2026-06-22 16:52:09.421] [ERROR] request timeout sessionId=session-secret-1",
    ].join("\n"));
    fs.writeFileSync(path.join(root, "logs", "trace-session-secret-1.jsonl"), [
      '{"type":"tool_start","sessionId":"session-secret-1"}',
      '{"type":"error","sessionId":"session-secret-1","message":"private trace detail"}',
    ].join("\n"));
    fs.writeFileSync(path.join(root, "sessions", "session-secret-1.json"), '{"sessionId":"session-secret-1","role":"assistant","content":"private session content"}');
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: "2026-06-22T16:52:00Z", platform: "mac" },
    });
    assert.equal(analysis.inventory.traces, 1);
    assert.equal(analysis.inventory.sessions, 1);
    assert.ok(analysis.supplementalEvidence.some((item) => item.kind === "trace"));
    assert.ok(analysis.supplementalEvidence.some((item) => item.kind === "session"));
    const serialized = JSON.stringify(analysis.supplementalEvidence);
    assert.doesNotMatch(serialized, /session-secret-1/);
    assert.doesNotMatch(serialized, /private trace detail|private session content/);
    assert.doesNotMatch(analysis.rawErrorLog, /private prompt/);
    assert.match(analysis.userPath, /内容已省略/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("silent stalls use trace timestamps when the main log has no correlation id", async () => {
  const root = temporaryDirectory("try-to-fix-time-trace-");
  try {
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    fs.writeFileSync(path.join(root, "logs", "cola-2026-06-22.log"), "[2026-06-22 16:47:18.532] [INFO] request accepted\n");
    fs.writeFileSync(path.join(root, "logs", "trace-private-name.jsonl"), '{"ts":"2026-06-22T16:51:30.000Z","type":"system_prompt","systemPrompt":"private"}\n');
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: "2026-06-22T16:52:00Z", platform: "mac" },
    });
    assert.equal(analysis.inventory.traces, 1);
    assert.equal(analysis.supplementalEvidence.length, 1);
    assert.equal(analysis.supplementalEvidence[0].selectedBy, "time-window");
    assert.doesNotMatch(JSON.stringify(analysis.supplementalEvidence), /private-name|systemPrompt|private/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("silent stalls still pull correlated session structure without an ERROR line", async () => {
  const root = temporaryDirectory("try-to-fix-silent-stall-");
  try {
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    fs.mkdirSync(path.join(root, "sessions"), { recursive: true });
    fs.writeFileSync(path.join(root, "logs", "cola-2026-06-22.log"), "[2026-06-22 16:47:18.532] [INFO] prompt start sessionId=session-quiet-1\n");
    fs.writeFileSync(path.join(root, "sessions", "quiet.jsonl"), '{"type":"tool_start","sessionId":"session-quiet-1"}\n');
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: "2026-06-22T16:52:00Z", platform: "mac" },
    });
    assert.equal(analysis.errorBlocks.length, 0);
    assert.equal(analysis.supplementalEvidence.length, 1);
    assert.equal(analysis.supplementalEvidence[0].selectedBy, "correlation");
    assert.ok(analysis.supplementalEvidence[0].signals.includes("tool_start"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("errorTime follows the event nearest feedback time instead of diagnostic score", async () => {
  const root = temporaryDirectory("try-to-fix-error-time-");
  try {
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    fs.writeFileSync(path.join(root, "logs", "cola-mobile-2026-06-22.log"), [
      "[2026-06-22 12:00:00.000] [ERROR] Server connection lost",
      "[2026-06-22 16:51:59.000] [ERROR] request timeout",
    ].join("\n"));
    const analysis = await analyzeFeedbackBundle({
      zipPath: root,
      feedback: { createdAt: "2026-06-22T16:52:00Z", platform: "android" },
    });
    assert.equal(analysis.errorTime, "2026-06-22T16:51:59.000Z");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("extraction cache is reused only for the same zip hash", async () => {
  const root = temporaryDirectory("try-to-fix-zip-cache-");
  try {
    const source = path.join(root, "source");
    const extractRoot = path.join(root, "extracted");
    const zipPath = path.join(root, "bundle.zip");
    fs.mkdirSync(path.join(source, "logs"), { recursive: true });
    const logPath = path.join(source, "logs", "cola-2026-06-22.log");
    fs.writeFileSync(logPath, "first\n");
    await runCommand("zip", ["-qr", zipPath, "logs"], { cwd: source });
    const first = await ensureExtracted(zipPath, extractRoot, "");
    const second = await ensureExtracted(zipPath, extractRoot, "");
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(first.sha256, second.sha256);

    fs.writeFileSync(logPath, "second\n");
    fs.rmSync(zipPath);
    await runCommand("zip", ["-qr", zipPath, "logs"], { cwd: source });
    const third = await ensureExtracted(zipPath, extractRoot, "");
    assert.equal(third.reused, false);
    assert.notEqual(third.sha256, first.sha256);
    assert.equal(fs.readFileSync(path.join(extractRoot, "logs", "cola-2026-06-22.log"), "utf8"), "second\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
