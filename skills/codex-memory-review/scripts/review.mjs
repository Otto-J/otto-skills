#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import path from 'node:path';

const SCHEMA = 1;
const DEFAULT_STATE = path.join(homedir(), '.cola', 'state', 'codex-memory-review');
const DEFAULT_CODEX = path.join(homedir(), '.codex');
const REDACTED = '[REDACTED]';

function fail(message) { throw new Error(message); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function expand(value) { return value?.startsWith('~/') ? path.join(homedir(), value.slice(2)) : path.resolve(value); }
function parseArgs(argv) {
  const out = { _: [], source: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) out._.push(arg);
    else if (arg === '--dry-run') out.dryRun = true;
    else {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = argv[++i];
      if (value == null || value.startsWith('--')) fail(`${arg} requires a value`);
      if (key === 'source') out.source.push(value); else out[key] = value;
    }
  }
  return out;
}
function validSourceId(id) { return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id); }
function sourceFromArg(value) {
  const at = value.indexOf('=');
  if (at < 1) fail('--source must use sourceId=/path/to/.codex');
  const sourceId = value.slice(0, at);
  if (!validSourceId(sourceId)) fail(`Invalid sourceId: ${sourceId}`);
  return { sourceId, label: sourceId, codexHome: expand(value.slice(at + 1)) };
}
async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
}
function redact(text) {
  return String(text)
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/gi, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, REDACTED)
    .replace(/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*['"]?[^\s,'"}]{6,}/gi, (m) => `${m.split(/[:=]/)[0]}=${REDACTED}`);
}
function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((part) => ['input_text', 'output_text', 'text'].includes(part?.type)).map((part) => part.text || '').join('\n');
}
function extractMessage(row) {
  if (row.type === 'response_item' && row.payload?.type === 'message') {
    const role = row.payload.role;
    const isFinal = role === 'assistant' && row.payload.phase === 'final_answer';
    if (role !== 'user' && !isFinal) return null;
    return { role: role === 'user' ? 'user' : 'assistant', id: row.payload.id, text: contentText(row.payload.content) };
  }
  if (row.type === 'event_msg' && row.payload?.type === 'agent_message' && row.payload.phase === 'final') {
    return { role: 'assistant', id: row.payload.id, text: row.payload.message || '' };
  }
  return null;
}
async function walkJsonl(root) {
  const found = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push(file);
    }
  }
  await walk(root);
  return found.sort();
}
async function indexTitles(codexHome) {
  const map = new Map();
  let raw;
  try { raw = await readFile(path.join(codexHome, 'session_index.jsonl'), 'utf8'); } catch { return map; }
  for (const line of raw.split('\n')) {
    try { const item = JSON.parse(line); if (item.id) map.set(item.id, item.thread_name || ''); } catch {}
  }
  return map;
}
async function scanSource(source, prior, scanEnd, lookbackMs) {
  const titles = await indexTitles(source.codexHome);
  const files = [...await walkJsonl(path.join(source.codexHome, 'sessions')), ...await walkJsonl(path.join(source.codexHome, 'archived_sessions'))];
  const sessions = new Map();
  const seen = new Set();
  const priorKeys = new Set(prior.messageKeys || []);
  const cutoff = new Date(Math.max(0, Date.parse(prior.checktime || 0) - lookbackMs)).getTime();
  let parseErrors = 0;
  for (const file of files) {
    const data = await readFile(file);
    const complete = data.at(-1) === 10 ? data : data.subarray(0, Math.max(0, data.lastIndexOf(10) + 1));
    let sessionId = path.basename(file, '.jsonl');
    let isSubagent = false;
    const rows = [];
    for (const line of complete.toString('utf8').split('\n')) {
      if (!line) continue;
      let row;
      try { row = JSON.parse(line); } catch { parseErrors++; continue; }
      if (row.type === 'session_meta') {
        sessionId = row.payload?.id || row.payload?.session_id || sessionId;
        isSubagent ||= row.payload?.thread_source === 'subagent' || Boolean(row.payload?.source?.subagent);
      }
      rows.push(row);
    }
    if (isSubagent) continue;
    for (const row of rows) {
      const message = extractMessage(row);
      if (!message) continue;
      const timestamp = Date.parse(row.timestamp);
      const baseline = Date.parse(prior.baselineThrough || 0);
      if (!Number.isFinite(timestamp) || timestamp <= cutoff || timestamp > scanEnd.getTime() || (Number.isFinite(baseline) && timestamp <= baseline)) continue;
      const clean = redact(message.text).trim();
      if (!clean) continue;
      const contentHash = hash(JSON.stringify([message.role, clean]));
      const key = message.id ? `id:${message.id}:revision:${contentHash}` : `hash:${hash(JSON.stringify([sessionId, message.role, row.timestamp, clean]))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (priorKeys.has(key)) continue;
      if (!sessions.has(sessionId)) sessions.set(sessionId, { sessionId, title: titles.get(sessionId) || '', messages: [] });
      sessions.get(sessionId).messages.push({ key, timestamp: new Date(timestamp).toISOString(), role: message.role, text: clean });
    }
  }
  for (const session of sessions.values()) session.messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { source, filesScanned: files.length, parseErrors, sessions: [...sessions.values()], discoveredKeys: [...seen].filter((key) => !priorKeys.has(key)) };
}
function shanghaiDate(value) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function bundleMarkdown(results, scanEnd) {
  let md = `# Codex memory review bundle\n\nPrepared: ${scanEnd.toISOString()}\n\n`;
  for (const result of results) {
    md += `## Source: ${result.source.label} (${result.source.sourceId})\n\n`;
    for (const session of result.sessions) {
      const date = shanghaiDate(session.messages[0]?.timestamp || scanEnd);
      md += `### ${date} | ${session.title || '(untitled)'}\n\nSession: \`${session.sessionId}\`\n\n`;
      for (const message of session.messages) md += `**${message.role === 'user' ? 'User' : 'Assistant final'}**\n\n${message.text}\n\n`;
    }
  }
  return md;
}
async function loadSources(stateDir, explicit) {
  if (explicit.length) return explicit.map(sourceFromArg);
  const config = await readJson(path.join(stateDir, 'sources.json'), { schemaVersion: SCHEMA, sources: [] });
  return config.sources.map((source) => ({ ...source, codexHome: expand(source.codexHome) }));
}
async function prepare(args) {
  const stateDir = expand(args.stateDir || DEFAULT_STATE);
  const sources = await loadSources(stateDir, args.source);
  if (!sources.length) fail('No sources configured. Run sources init or pass --source sourceId=/path/to/.codex');
  if (new Set(sources.map((s) => s.sourceId)).size !== sources.length) fail('Duplicate sourceId');
  const scanEnd = args.now ? new Date(args.now) : new Date();
  if (!Number.isFinite(scanEnd.getTime())) fail('Invalid --now timestamp');
  const lookbackMs = Number(args.lookbackHours || 72) * 3600_000;
  const results = [];
  for (const source of sources) {
    const prior = await readJson(path.join(stateDir, 'sources', `${source.sourceId}.json`), { schemaVersion: SCHEMA, sourceId: source.sourceId, messageKeys: [] });
    results.push(await scanSource(source, prior, scanEnd, lookbackMs));
  }
  const summary = { command: 'prepare', dryRun: Boolean(args.dryRun), sourceCount: results.length, sessionCount: results.reduce((n, r) => n + r.sessions.length, 0), messageCount: results.reduce((n, r) => n + r.sessions.reduce((m, s) => m + s.messages.length, 0), 0), parseErrors: results.reduce((n, r) => n + r.parseErrors, 0) };
  if (args.dryRun) return console.log(JSON.stringify(summary));
  const runId = `${scanEnd.toISOString().replace(/[-:.TZ]/g, '')}-${randomUUID().slice(0, 8)}`;
  const runDir = path.join(stateDir, 'pending', runId);
  await mkdir(runDir, { recursive: true });
  const manifest = { schemaVersion: SCHEMA, runId, status: 'pending', preparedAt: new Date().toISOString(), scanEnd: scanEnd.toISOString(), sources: results.map((r) => ({ sourceId: r.source.sourceId, label: r.source.label, codexHome: r.source.codexHome, discoveredKeys: r.discoveredKeys, filesScanned: r.filesScanned, parseErrors: r.parseErrors })) };
  await writeFile(path.join(runDir, 'bundle.md'), bundleMarkdown(results, scanEnd), { mode: 0o600 });
  await atomicJson(path.join(runDir, 'manifest.json'), manifest);
  console.log(JSON.stringify({ ...summary, runId, runDir }));
}
async function finish(args, status) {
  const stateDir = expand(args.stateDir || DEFAULT_STATE);
  if (!args.runId) fail('--run-id is required');
  const file = path.join(stateDir, 'pending', args.runId, 'manifest.json');
  const manifest = await readJson(file, null);
  if (!manifest) fail(`Unknown run: ${args.runId}`);
  if (manifest.status !== 'pending') fail(`Run is already ${manifest.status}`);
  if (status === 'committed') {
    for (const source of manifest.sources) {
      const stateFile = path.join(stateDir, 'sources', `${source.sourceId}.json`);
      const prior = await readJson(stateFile, { schemaVersion: SCHEMA, sourceId: source.sourceId, messageKeys: [] });
      const checktime = new Date(Math.max(Date.parse(prior.checktime || 0) || 0, Date.parse(manifest.scanEnd))).toISOString();
      await atomicJson(stateFile, { ...prior, sourceId: source.sourceId, checktime, messageKeys: [...new Set([...(prior.messageKeys || []), ...source.discoveredKeys])].sort(), lastRunId: manifest.runId });
    }
  }
  manifest.status = status;
  manifest.finishedAt = new Date().toISOString();
  await atomicJson(file, manifest);
  console.log(JSON.stringify({ command: status === 'committed' ? 'commit' : 'abort', runId: manifest.runId, status }));
}
async function sourcesCommand(args) {
  const stateDir = expand(args.stateDir || DEFAULT_STATE);
  const file = path.join(stateDir, 'sources.json');
  const action = args._[1];
  const config = await readJson(file, { schemaVersion: SCHEMA, sources: [] });
  if (action === 'list') return console.log(JSON.stringify(config));
  if (action === 'init') {
    if (!config.sources.length) config.sources.push({ sourceId: args.sourceId || process.env.CODEX_MEMORY_SOURCE_ID || hostname().toLowerCase().replace(/[^a-z0-9._-]/g, '-'), label: args.label || 'This computer', codexHome: expand(args.codexHome || DEFAULT_CODEX) });
  } else if (action === 'add') {
    const sourceId = args.sourceId; if (!sourceId || !validSourceId(sourceId)) fail('Valid --source-id is required');
    if (config.sources.some((s) => s.sourceId === sourceId)) fail(`Source already exists: ${sourceId}`);
    config.sources.push({ sourceId, label: args.label || sourceId, codexHome: expand(args.codexHome || DEFAULT_CODEX) });
    if (args.initialThrough) await setBaseline(stateDir, sourceId, args.initialThrough);
  } else if (action === 'remove') {
    if (!args.sourceId) fail('--source-id is required');
    config.sources = config.sources.filter((s) => s.sourceId !== args.sourceId);
  } else fail('Use sources init|list|add|remove');
  await atomicJson(file, config);
  console.log(JSON.stringify(config));
}
async function setBaseline(stateDir, sourceId, through) {
  if (!sourceId || !validSourceId(sourceId)) fail('Valid --source-id is required');
  const instant = new Date(through);
  if (!Number.isFinite(instant.getTime())) fail('Valid ISO timestamp is required for --through/--initial-through');
  const stateFile = path.join(stateDir, 'sources', `${sourceId}.json`);
  const prior = await readJson(stateFile, { schemaVersion: SCHEMA, sourceId, messageKeys: [] });
  if (prior.checktime && Date.parse(prior.checktime) > instant.getTime()) fail('Baseline cannot move an existing checktime backwards');
  await atomicJson(stateFile, { ...prior, sourceId, checktime: instant.toISOString(), baselineThrough: instant.toISOString(), messageKeys: prior.messageKeys || [] });
}
async function baselineCommand(args) {
  const stateDir = expand(args.stateDir || DEFAULT_STATE);
  await setBaseline(stateDir, args.sourceId, args.through);
  console.log(JSON.stringify({ command: 'baseline', sourceId: args.sourceId, through: new Date(args.through).toISOString() }));
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === 'prepare') await prepare(args);
  else if (command === 'commit') await finish(args, 'committed');
  else if (command === 'abort') await finish(args, 'aborted');
  else if (command === 'sources') await sourcesCommand(args);
  else if (command === 'baseline') await baselineCommand(args);
  else fail('Usage: review.mjs prepare|commit|abort|baseline|sources ...');
}
main().catch((error) => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
