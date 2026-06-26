#!/usr/bin/env node
// asr-auralwise —— AuralWise 语音转写一条龙
// 零依赖，纯 Node 18+。提供本地音频路径即可：自动压缩(超限)→提交→30s轮询→落盘+README。
//
// 用法:
//   node asr.mjs <audio_path> [--lang zh] [--max-speakers 8] [--events] [--no-diarize]
//   node asr.mjs status <task_id>
//   node asr.mjs result  <task_id>

import { readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { argv, env, exit } from "node:process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ─── 配置 ────────────────────────────────────────────────────────────────
const BASE_URL = env.AURALWISE_BASE_URL || "https://api.auralwise.cn/v1";
const POLL_INTERVAL_MS = Number(env.ASR_POLL_INTERVAL_MS) || 30_000; // 30s 轮询
const POLL_TIMEOUT_MS = Number(env.ASR_POLL_TIMEOUT_MS) || 30 * 60 * 1000; // 30 分钟
const COMPRESS_THRESHOLD = 140 * 1024 * 1024; // base64 后约 187MB < 200MB 上限
const OUT_ROOT = env.ASR_OUT_ROOT || join(homedir(), "Downloads");

// ─── 鉴权：key 不入代码、不入 skill 内容，多源加载 ────────────────────────
function parseEnv(text) {
  const o = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    o[m[1]] = v;
  }
  return o;
}

function loadKey() {
  if (env.ASR_AURALWISE_API_KEY) return env.ASR_AURALWISE_API_KEY;
  const candidates = [
    join(__dirname, "..", ".env"),
    join(homedir(), "mycode/simple-audio2/.env"),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const e = parseEnv(readFileSync(p, "utf8"));
    if (e.ASR_AURALWISE_API_KEY) return e.ASR_AURALWISE_API_KEY;
    if (e.AURALWISE_API_KEY) return e.AURALWISE_API_KEY;
  }
  return "";
}

// ─── HTTP ────────────────────────────────────────────────────────────────
function makeApi(key) {
  return async function api(path, { method = "GET", body, query } = {}) {
    const url = new URL(path, BASE_URL + "/");
    if (query) for (const [k, v] of Object.entries(query))
      if (v != null) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: { "X-API-Key": key, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = data?.error || text || res.statusText;
      const hint = res.status === 404 ? "（核对 task id，或用 `list` 子命令查看）" : "";
      throw new Error(`HTTP ${res.status} @ ${method} ${path}: ${msg} ${hint}`);
    }
    return data;
  };
}

// ─── 压缩：超 base64 限时自动降到 16kHz mono（音质可降，转写无碍）─────────
async function maybeCompress(filePath) {
  const st = await stat(filePath);
  const origSize = st.size;
  if (origSize <= COMPRESS_THRESHOLD)
    return { path: filePath, compressed: false, origSize, compSize: origSize };
  console.log(`⚡ 文件 ${mb(origSize)}MB 超 base64 直传限(${mb(COMPRESS_THRESHOLD)}MB)，自动压缩…`);
  const tmp = join(tmpdir(), `asr-comp-${Date.now()}.mp3`);
  const tryRun = (br) => execFileSync(
    "ffmpeg", ["-y", "-i", filePath, "-ac", "1", "-ar", "16000", "-b:a", br, "-map_metadata", "-1", tmp],
    { stdio: "ignore" }
  );
  tryRun("64k");
  let compSize = (await stat(tmp)).size;
  if (compSize > COMPRESS_THRESHOLD) { tryRun("32k"); compSize = (await stat(tmp)).size; }
  console.log(`✓ 压缩完成 ${mb(origSize)}MB → ${mb(compSize)}MB`);
  return { path: tmp, compressed: true, origSize, compSize, tmp };
}

// ─── 提交 ────────────────────────────────────────────────────────────────
async function submitTask(api, filePath, options) {
  const buf = await readFile(filePath);
  const body = {
    audio_base64: buf.toString("base64"),
    audio_filename: basename(filePath),
    options,
  };
  console.log(`→ 提交任务: ${body.audio_filename} (${mb(buf.length)}MB)`);
  const task = await api("tasks", { method: "POST", body });
  console.log(`✓ 任务已创建 id=${task.id}`);
  return task;
}

// ─── 轮询：30s 一次，至终态 ──────────────────────────────────────────────
async function pollUntilDone(api, taskId) {
  const start = Date.now();
  let last;
  while (true) {
    last = await api(`tasks/${taskId}`);
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`… [${elapsed}s] 状态: ${last.status}`);
    if (["done", "failed", "abandoned"].includes(last.status)) break;
    if (Date.now() - start > POLL_TIMEOUT_MS)
      throw new Error(`轮询超时（${Math.round(POLL_TIMEOUT_MS / 60000)}min）`);
    await sleep(POLL_INTERVAL_MS);
  }
  if (last.status !== "done")
    throw new Error(`任务未完成: ${last.status} ${last.error_message || ""}`);
  return last;
}

// ─── 格式化 ──────────────────────────────────────────────────────────────
function fmtSrt(sec) {
  const s = Number(sec) || 0;
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  const ms = String(Math.round((s % 1) * 1000)).padStart(3, "0");
  return `${hh}:${mm}:${ss},${ms}`;
}
function fmtClock(sec) {
  const s = Number(sec) || 0;
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return `${mm}:${ss}`;
}
function toReadable(r) {
  const L = [];
  L.push(`# AuralWise 转写`);
  L.push(`时长: ${(r.audio_duration || 0).toFixed(1)}s | 语言: ${r.language || "?"} (${(r.language_probability || 0).toFixed(2)}) | 说话人: ${r.num_speakers ?? "-"}`);
  L.push("");
  for (const seg of r.segments || []) {
    L.push(`${fmtClock(seg.start)}→${fmtClock(seg.end)} [${seg.speaker || "-"}]`);
    L.push(`  ${(seg.text || "").trim()}`);
    L.push("");
  }
  if (r.audio_events?.length) {
    L.push("── 声音事件 ──");
    for (const ev of r.audio_events)
      L.push(`${fmtClock(ev.start)}→${fmtClock(ev.end)}  ${ev.class} (${(ev.confidence || 0).toFixed(2)})`);
  }
  return L.join("\n") + "\n";
}
function toSrt(r) {
  return (r.segments || []).map((seg, i) =>
    `${i + 1}\n${fmtSrt(seg.start)} --> ${fmtSrt(seg.end)}\n${(seg.speaker ? `[${seg.speaker}] ` : "")}${(seg.text || "").trim()}\n`
  ).join("\n");
}

// ─── 产物：~/Downloads/asr-auralwise-YYYYMMDD-HHmmss/ ─────────────────────
function stamp() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function buildReadme({ origPath, origSize, comp, taskId, options, result, startedAt, finishedAt }) {
  const spk = {};
  for (const s of result.segments || []) { const k = s.speaker || "?"; spk[k] = (spk[k] || 0) + 1; }
  const submitLine = comp.compressed
    ? `压缩后直传 (${mb(comp.origSize)}MB → ${mb(comp.compSize)}MB)`
    : "原文件直传";
  const tmpLine = comp.compressed ? `- 压缩临时文件: ${comp.tmp}` : "（无）";
  const costSec = Math.round((new Date(finishedAt) - new Date(startedAt)) / 1000);
  return [
    "# ASR 转写记录 (AuralWise)",
    "",
    "## 原始文件映射",
    `- 原始路径: ${origPath}`,
    `- 原始大小: ${mb(origSize)}MB`,
    `- 提交方式: ${submitLine}`,
    `- 压缩临时文件: ${tmpLine}`,
    "",
    "## 任务",
    `- task_id: ${taskId}`,
    `- 提交时间: ${startedAt}`,
    `- 完成时间: ${finishedAt}`,
    `- 服务端耗时: ${costSec}s`,
    "",
    "## 转写结果",
    `- 时长: ${(result.audio_duration || 0).toFixed(1)}s`,
    `- 语言: ${result.language || "?"} (置信度 ${(result.language_probability || 0).toFixed(2)})`,
    `- 说话人数: ${result.num_speakers ?? "-"}`,
    `- 各说话人段数: ${JSON.stringify(spk)}`,
    `- 总段数: ${(result.segments || []).length}`,
    "",
    "## 选项",
    "```json",
    JSON.stringify(options, null, 2),
    "```",
    "",
    "## 产物文件",
    "- `*.json` —— 原始完整结果",
    "- `*.txt`  —— 人类可读文本（带说话人 + 时间戳）",
    "- `*.srt`  —— 段级字幕",
    "",
    "## 重查",
    "```bash",
    `node ${join(__dirname, "asr.mjs")} status ${taskId}`,
    `node ${join(__dirname, "asr.mjs")} result  ${taskId}`,
    "```",
    "",
  ].join("\n");
}

async function writeOutputs({ origPath, origSize, comp, taskId, options, result, startedAt, finishedAt }) {
  const dir = join(OUT_ROOT, `asr-auralwise-${stamp()}`);
  await mkdir(dir, { recursive: true });
  const stem = basename(origPath, extname(origPath));
  await writeFile(join(dir, `${stem}.json`), JSON.stringify(result, null, 2), "utf8");
  await writeFile(join(dir, `${stem}.txt`), toReadable(result), "utf8");
  await writeFile(join(dir, `${stem}.srt`), toSrt(result), "utf8");
  await writeFile(join(dir, "README.md"), buildReadme({ origPath, origSize, comp, taskId, options, result, startedAt, finishedAt }), "utf8");
  return dir;
}

// ─── 工具 ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (b) => (Number(b) / 1024 / 1024).toFixed(1);

// ─── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(args) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) opts[key] = true;
      else { opts[key] = next; i++; }
    } else positional.push(a);
  }
  return { opts, positional };
}

function defaultOptions(opts) {
  const o = {
    enable_asr: true,
    enable_diarize: true,            // 默认开启说话人识别
    enable_audio_events: false,
    optimize_zh: true,
    max_speakers: 8,                 // 自动检测，上限 8
  };
  if (opts.lang) o.asr_language = opts.lang;
  if (opts["no-diarize"]) o.enable_diarize = false;
  if (opts.events) o.enable_audio_events = true;
  if (opts.standard) o.optimize_zh = false;
  if (opts["max-speakers"]) o.max_speakers = Number(opts["max-speakers"]);
  if (opts.speakers) { o.num_speakers = Number(opts.speakers); o.enable_diarize = true; }
  if (opts.hotwords) o.hotwords = String(opts.hotwords).split(",").map((s) => s.trim()).filter(Boolean);
  return o;
}

const HELP = `asr-auralwise —— AuralWise 语音转写一条龙

用法:
  node asr.mjs <audio_path> [options]   一条龙（默认，推荐）
  node asr.mjs status <task_id>          查询任务状态
  node asr.mjs result  <task_id>         获取任务结果(JSON)
  node asr.mjs list [--status=done]      列出任务

选项:
  --lang <code>       语言(zh/en/ja/...)，留空自动检测
  --max-speakers <n>  说话人自动检测上限，默认 8
  --speakers <n>      固定说话人数（指定则不再自动检测）
  --no-diarize        关闭说话人分离（默认开）
  --events            开启声音事件检测（默认关）
  --standard          关闭中文精简模式，启用词级时间戳
  --hotwords a,b,c    热词

行为:
  - 文件超 140MB 自动 ffmpeg 压缩至 16kHz mono（音质降，转写无碍）
  - 30s 轮询一次至完成
  - 产物落 ~/Downloads/asr-auralwise-YYYYMMDD-HHmmss/，含 json/txt/srt/README.md
  - README.md 记录原始文件路径，便于回溯映射
  - API Key 从 环境变量/skill 目录 .env/旧项目 .env 读取，不落代码

示例:
  node ${join(__dirname, "asr.mjs")} ~/Downloads/meeting.mp3
  node ${join(__dirname, "asr.mjs")} ~/Downloads/podcast.mp3 --lang en --max-speakers 4
`;

const fail = (m) => { console.error(`✗ ${m}`); exit(1); };

async function main() {
  const { opts, positional } = parseArgs(argv.slice(2));
  const cmd = positional[0];

  if (!cmd || cmd === "help" || opts.help) { console.log(HELP); return; }

  const key = loadKey();
  if (!key) {
    console.error("✗ 未找到 API Key。请于以下任一处配置 ASR_AURALWISE_API_KEY（或 AURALWISE_API_KEY）：");
    console.error(`  1. 环境变量 ASR_AURALWISE_API_KEY`);
    console.error(`  2. ${join(__dirname, "..", ".env")}`);
    console.error(`  3. ${join(homedir(), "mycode/simple-audio2/.env")}`);
    return exit(1);
  }
  const api = makeApi(key);

  if (cmd === "status") {
    const id = positional[1]; if (!id) return fail("需 task_id");
    console.log(JSON.stringify(await api(`tasks/${id}`), null, 2));
  } else if (cmd === "result") {
    const id = positional[1]; if (!id) return fail("需 task_id");
    console.log(JSON.stringify(await api(`tasks/${id}/result`), null, 2));
  } else if (cmd === "list") {
    console.log(JSON.stringify(await api("tasks", { query: { status: opts.status, page: opts.page || 1, page_size: opts["page-size"] || 20 } }), null, 2));
  } else {
    // 默认：一条龙
    const audioPath = cmd;
    if (!audioPath) return fail("需提供本地音频路径，例: node asr.mjs /path/to/a.mp3");
    if (!existsSync(audioPath)) return fail(`文件不存在: ${audioPath}`);
    const options = defaultOptions(opts);
    const origSize = (await stat(audioPath)).size;
    const startedAt = new Date().toISOString();
    const comp = await maybeCompress(audioPath);
    try {
      const task = await submitTask(api, comp.path, options);
      await pollUntilDone(api, task.id);
      const result = await api(`tasks/${task.id}/result`);
      const finishedAt = new Date().toISOString();
      const dir = await writeOutputs({ origPath: audioPath, origSize, comp, taskId: task.id, options, result, startedAt, finishedAt });
      console.log(`\n✓ 转写完成，产物目录: ${dir}`);
      console.log(`  时长 ${(result.audio_duration || 0).toFixed(0)}s | 语言 ${result.language || "?"} | 说话人 ${result.num_speakers ?? "-"} | 段数 ${(result.segments || []).length}`);
    } finally {
      if (comp.compressed && comp.tmp && existsSync(comp.tmp)) await rm(comp.tmp, { force: true });
    }
  }
}

main().catch((e) => { console.error(`✗ ${e.message}`); exit(1); });
