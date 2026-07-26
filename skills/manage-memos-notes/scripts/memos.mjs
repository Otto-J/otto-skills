#!/usr/bin/env node
/**
 * manage-memos-notes — Memos (notes.ijust.cc) CRUD CLI
 *
 * Usage:
 *   node memos.mjs list   [--page-size N] [--page-token TOKEN]
 *   node memos.mjs get    <name>
 *   node memos.mjs create <content> [--visibility PRIVATE|PUBLIC|PROTECTED]
 *   node memos.mjs update <name> <content> [--visibility PRIVATE|PUBLIC|PROTECTED]
 *   node memos.mjs delete <name>
 *   node memos.mjs search <keyword> [--page-size N]
 *
 * Env: MEMO_SYNC_KEY (required). Falls back to `zsh -ic echo` if not in env.
 */

import { execSync } from 'node:child_process';

const BASE = 'https://notes.ijust.cc';

// ─── token ────────────────────────────────────────────
function getToken() {
  let t = process.env.MEMO_SYNC_KEY || '';
  if (!t) {
    try {
      t = execSync('zsh -ic "echo $MEMO_SYNC_KEY"', {
        encoding: 'utf8', timeout: 6000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch { /* ignore */ }
  }
  if (!t) {
    console.error('❌ MEMO_SYNC_KEY not found. Set it in ~/.zshrc: export MEMO_SYNC_KEY=memos_pat_xxx');
    process.exit(1);
  }
  return t;
}

const TOKEN = getToken();
const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

// ─── helpers ──────────────────────────────────────────
function normalizeName(raw) {
  if (!raw) return raw;
  return raw.startsWith('memos/') ? raw : `memos/${raw}`;
}

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: HEADERS };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    console.error(`❌ ${method} ${path} → ${res.status}`);
    console.error(typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data, null, 2));
    process.exit(1);
  }
  return data;
}

function printMemo(m) {
  console.log(JSON.stringify({
    name: m.name,
    state: m.state,
    visibility: m.visibility,
    createTime: m.createTime,
    updateTime: m.updateTime,
    content: m.content,
    tags: m.tags || [],
    pinned: m.pinned || false,
    hasLink: m.property?.hasLink || false,
    hasTaskList: m.property?.hasTaskList || false,
  }, null, 2));
}

// ─── commands ─────────────────────────────────────────
async function cmdList(args) {
  const pageSize = argVal(args, '--page-size') || '50';
  const pageToken = argVal(args, '--page-token') || '';
  let url = `/api/v1/memos?pageSize=${pageSize}`;
  if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
  const data = await api('GET', url);
  const memos = data.memos || [];
  console.log(`📋 ${memos.length} memos`);
  if (data.nextPageToken) console.log(`   nextPageToken: ${data.nextPageToken}`);
  for (const m of memos) {
    const snippet = (m.content || '').replace(/\n/g, ' ').slice(0, 80);
    console.log(`  ${m.name}  [${m.visibility}]  ${m.createTime?.slice(0, 10)}  ${snippet}`);
  }
}

async function cmdGet(args) {
  const name = normalizeName(args[0]);
  if (!name) { console.error('Usage: memos.mjs get <name>'); process.exit(1); }
  const m = await api('GET', `/api/v1/${name}`);
  printMemo(m);
}

async function cmdCreate(args) {
  const content = args[0];
  if (!content) { console.error('Usage: memos.mjs create <content> [--visibility V]'); process.exit(1); }
  const visibility = argVal(args, '--visibility') || 'PRIVATE';
  const m = await api('POST', '/api/v1/memos', { content, visibility });
  console.log('✅ created');
  printMemo(m);
}

async function cmdUpdate(args) {
  const name = normalizeName(args[0]);
  const content = args[1];
  if (!name || content === undefined) {
    console.error('Usage: memos.mjs update <name> <content> [--visibility V]');
    process.exit(1);
  }
  const body = { content };
  const vis = argVal(args, '--visibility');
  if (vis) body.visibility = vis;
  // Memos PATCH requires updateMask
  const mask = ['content'];
  if (vis) mask.push('visibility');
  const m = await api('PATCH', `/api/v1/${name}?updateMask=${mask.join(',')}`, body);
  console.log('✅ updated');
  printMemo(m);
}

async function cmdDelete(args) {
  const name = normalizeName(args[0]);
  if (!name) { console.error('Usage: memos.mjs delete <name>'); process.exit(1); }
  await api('DELETE', `/api/v1/${name}`);
  console.log(`✅ deleted (soft) → ${name}`);
}

async function cmdSearch(args) {
  const keyword = args[0];
  if (!keyword) { console.error('Usage: memos.mjs search <keyword>'); process.exit(1); }
  const pageSize = argVal(args, '--page-size') || '200';
  // Memos API v1 supports filter param
  const filter = `content.contains("${keyword.replace(/"/g, '\\"')}")`;
  const data = await api('GET', `/api/v1/memos?pageSize=${pageSize}&filter=${encodeURIComponent(filter)}`);
  const memos = data.memos || [];
  console.log(`🔍 "${keyword}" → ${memos.length} results`);
  for (const m of memos) {
    const snippet = (m.content || '').replace(/\n/g, ' ').slice(0, 100);
    console.log(`  ${m.name}  [${m.visibility}]  ${m.createTime?.slice(0, 10)}  ${snippet}`);
  }
}

// ─── arg parsing ──────────────────────────────────────
function argVal(args, flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

// ─── main ─────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const commands = {
  list: cmdList,
  get: cmdGet,
  create: cmdCreate,
  update: cmdUpdate,
  delete: cmdDelete,
  search: cmdSearch,
};

if (!cmd || !commands[cmd]) {
  console.log(`Memos CLI — ${BASE}

Commands:
  list    [--page-size N] [--page-token T]   List memos
  get     <name>                              Get one memo (full JSON)
  create  <content> [--visibility V]          Create a memo
  update  <name> <content> [--visibility V]   Update a memo
  delete  <name>                              Soft-delete a memo
  search  <keyword> [--page-size N]           Search by content

<name> accepts "memos/xxx" or just "xxx".
Env: MEMO_SYNC_KEY (required)`);
  process.exit(cmd ? 1 : 0);
}

commands[cmd](rest).catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
