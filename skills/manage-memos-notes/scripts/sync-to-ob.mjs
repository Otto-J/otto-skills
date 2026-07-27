#!/usr/bin/env node
/**
 * sync-to-ob.mjs — Memos (notes.ijust.cc) → Obsidian 每日同步
 *
 * 拉取远端全部 memo，通过 skip list（已处理Memos清单.md）去重，
 * 新 memo 写入 OB vault 的 03 资料库/Memos同步/，同步一条记一条。
 * 幂等，可反复执行。
 *
 * 用法：
 *   node sync-to-ob.mjs            # 全量同步
 *   node sync-to-ob.mjs --dry-run  # 预览不写入
 *
 * 依赖：MEMO_SYNC_KEY 环境变量（~/.zshrc 里配置）
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// ─── 配置 ─────────────────────────────────────────────
const OB_VAULT = existsSync('/Users/otto/mycode/new-start-doc/obsidian-note')
  ? '/Users/otto/mycode/new-start-doc/obsidian-note'
  : '/Users/otto/mynote/obsidian-note';
const SYNC_DIR = path.join(OB_VAULT, '03 资料库/Memos同步');
const SKIP_LIST_PATH = path.join(SYNC_DIR, '已处理Memos清单.md');
const MEMOS_BASE = 'https://notes.ijust.cc';

// ─── token ────────────────────────────────────────────
function getToken() {
  let t = process.env.MEMO_SYNC_KEY || '';
  if (!t) {
    for (const cmd of ['zsh -ic "echo $MEMO_SYNC_KEY"', 'zsh -lic "echo $MEMO_SYNC_KEY"', 'bash -lc "echo $MEMO_SYNC_KEY"']) {
      try {
        t = execSync(cmd, { encoding: 'utf8', timeout: 6000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (t) break;
      } catch { /* try next */ }
    }
  }
  if (!t) {
    // 最后兜底：直接解析 ~/.zshrc
    try {
      const rc = readFileSync(path.join(homedir(), '.zshrc'), 'utf8');
      const m = rc.match(/^\s*export\s+MEMO_SYNC_KEY=["']?([^"'\n]+)["']?/m);
      if (m) t = m[1].trim();
    } catch { /* ignore */ }
  }
  if (!t) {
    console.error('❌ 未找到 MEMO_SYNC_KEY 环境变量！');
    console.error('  请确认 ~/.zshrc 里有: export MEMO_SYNC_KEY=memos_pat_xxx');
    process.exit(1);
  }
  return t;
}

const TOKEN = getToken();
const HEADERS = { 'Authorization': `Bearer ${TOKEN}` };

// ─── API ──────────────────────────────────────────────
// 注意：服务端 pageSize=200 会返回错误的陈旧快照（198 条且无 nextPageToken），
// 实测 199 及以下正常。这里固定用 100，靠 nextPageToken 翻页拿全量。
async function fetchMemos(pageSize = 100) {
  const all = [];
  let pageToken = '';
  while (true) {
    let url = `${MEMOS_BASE}/api/v1/memos?pageSize=${pageSize}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      console.error(`❌ API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    const data = await res.json();
    all.push(...(data.memos || []));
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return all;
}

// ─── Skip List ────────────────────────────────────────
function readSkipList() {
  const names = new Set();
  if (!existsSync(SKIP_LIST_PATH)) return names;
  const re = /\|\s*(memos\/[A-Za-z0-9]+)\s*\|/;
  for (const line of readFileSync(SKIP_LIST_PATH, 'utf8').split('\n')) {
    const m = line.match(re);
    if (m) names.add(m[1]);
  }
  return names;
}

function appendToSkipList(memoName, snippet, targetPath) {
  const today = fmtDate(new Date());
  const rel = path.relative(OB_VAULT, targetPath);
  const clean = (snippet || '').slice(0, 40).replace(/\n/g, ' ').replace(/\|/g, '\\|');
  appendFileSync(SKIP_LIST_PATH, `| ${memoName} | ${clean} | ${today} | ${rel} |\n`);
}

// ─── 格式化 ───────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');

function toCST(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  return isNaN(d) ? null : new Date(d.getTime() + 8 * 3600 * 1000); // UTC → +08:00
}

function fmtDT(d) { // YYYY-MM-DD HH:mm（CST，展示用）
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function fmtISO(d) { // YYYY-MM-DDTHH:mm:ss（CST，frontmatter 用）
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function fmtDate(d) { // 本地日期 YYYY-MM-DD
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getFilename(memo) {
  const shortId = (memo.name || 'unknown').split('/').pop();
  const d = toCST(memo.createTime);
  return `${d ? fmtDT(d).slice(0, 10) : 'unknown'} ${shortId}.md`;
}

function generateMarkdown(memo) {
  const name = memo.name || '';
  const content = memo.content || '';
  const visibility = memo.visibility || '';
  const c = toCST(memo.createTime);
  const u = toCST(memo.updateTime);
  const createDisp = c ? fmtDT(c) : '';
  const updateDisp = u ? fmtDT(u) : '';
  const tags = memo.tags || [];
  const tagStr = tags.length ? tags.join(', ') : '无';

  const attLines = (memo.attachments || []).map(att => {
    const attName = att.filename || att.name || 'unknown';
    return `- [${attName}](${MEMOS_BASE}/file/${att.name || ''})`;
  });
  const attSection = attLines.length ? attLines.join('\n') : '无';

  const now = new Date();
  const synced = `${fmtDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return `---
source: memos
memo_name: "${name}"
visibility: "${visibility}"
tags: [memo${tags.length ? ', ' + tags.join(', ') : ''}]
synced: "${synced}"
created_at: ${c ? fmtISO(c) : ''}
updated_at: ${u ? fmtISO(u) : ''}
---

${content}

---

> 创建时间: ${createDisp} | 更新时间: ${updateDisp} | 可见性: ${visibility} | 标签: ${tagStr}
> 附件: ${attSection}
> 来源: [${MEMOS_BASE}/${name}](${MEMOS_BASE}/${name})
`;
}

// ─── 主流程 ─────────────────────────────────────────
const dryRun = process.argv.includes('--dry-run');

console.log('='.repeat(60));
console.log('Memos (notes.ijust.cc) → Obsidian 同步');
console.log('='.repeat(60));

console.log('\n📋 读取跳过清单...');
const skipNames = readSkipList();
console.log(`  跳过清单: ${skipNames.size} 条`);

console.log('\n📥 拉取 Memos 列表...');
const memos = await fetchMemos();
console.log(`  云端 Memos: ${memos.length} 条`);

const toSync = memos.filter(m => !skipNames.has(m.name));
console.log(`  待同步: ${toSync.length} 条`);
console.log(`  跳过: ${memos.length - toSync.length} 条`);

if (!toSync.length) {
  console.log('\n✅ 全部已同步，无需处理。');
  process.exit(0);
}

if (dryRun) {
  console.log('\n[DRY RUN] 以下 Memos 将被同步:');
  for (const m of toSync.slice(0, 10)) {
    console.log(`  - ${m.name} | ${(m.snippet || '').slice(0, 40)}`);
  }
  if (toSync.length > 10) console.log(`  ... 还有 ${toSync.length - 10} 条`);
  process.exit(0);
}

mkdirSync(SYNC_DIR, { recursive: true });
let synced = 0;
for (const memo of toSync) {
  console.log(`\n🔄 处理: ${memo.name} | ${(memo.snippet || '').slice(0, 40)}`);
  const targetPath = path.join(SYNC_DIR, getFilename(memo));
  writeFileSync(targetPath, generateMarkdown(memo), 'utf8');
  console.log(`  💾 写入: ${path.basename(targetPath)}`);
  appendToSkipList(memo.name, memo.snippet, targetPath);
  synced++;
}

console.log('\n' + '='.repeat(60));
console.log(`✅ 同步完成: ${synced} 条新 Memos`);
console.log(`  已跳过: ${memos.length - toSync.length} 条`);
console.log('='.repeat(60));
