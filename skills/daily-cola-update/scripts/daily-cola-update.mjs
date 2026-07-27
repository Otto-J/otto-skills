#!/usr/bin/env node
/**
 * daily-cola-update.mjs — 汇总 marswaveai/cola 过去 N 小时的 commit
 *
 * 用法：
 *   node daily-cola-update.mjs [--hours 24] [--all]
 *
 * 默认统计 origin/main；--all 统计所有远端分支。
 * 输出 Markdown 清单，供调用方（cron/Cola）做主题归纳和简要说明。
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const REPO = '/Users/otto/mycode/marswave/cola';

const args = process.argv.slice(2);
const hoursIdx = args.indexOf('--hours');
const hours = hoursIdx >= 0 ? Number(args[hoursIdx + 1]) : 24;
const allBranches = args.includes('--all');

if (!Number.isFinite(hours) || hours <= 0) {
  console.error('❌ --hours 必须是正数');
  process.exit(1);
}
if (!existsSync(`${REPO}/.git`)) {
  console.error(`❌ 未找到本地克隆: ${REPO}`);
  console.error('  请先: git clone https://github.com/marswaveai/cola.git ' + REPO);
  process.exit(1);
}

function git(cmd) {
  return execSync(`git ${cmd}`, {
    cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

// 1. fetch（失败不致命，用本地引用继续）
let fetched = true;
try {
  git('fetch origin --prune --quiet');
} catch {
  fetched = false;
}

// 2. 取 commit 列表
const range = allBranches ? '--all' : 'origin/main';
const RS = '\x1e', FS = '\x1f';
const pretty = `--pretty=format:%H${FS}%h${FS}%an${FS}%ad${FS}%s${FS}%b${RS}`;
const raw = git(`log ${range} --since="${hours} hours ago" --no-merges --date=format-local:"%Y-%m-%d %H:%M" "${pretty}"`);

const commits = raw.split(RS)
  .map(r => r.trim())
  .filter(Boolean)
  .map(r => {
    const [full, short, author, date, subject, ...bodyParts] = r.split(FS);
    const body = bodyParts.join(FS).trim();
    let stat = '';
    try {
      stat = git(`show --shortstat --format= ${full}`).split('\n').pop().trim();
    } catch { /* ignore */ }
    return { full, short, author, date, subject, body, stat };
  });

// 3. 输出
const now = new Date();
const since = new Date(now.getTime() - hours * 3600 * 1000);
const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

console.log(`# Cola 仓库 commit 汇总（过去 ${hours} 小时）\n`);
console.log(`- 仓库: ${REPO}（${allBranches ? '所有远端分支' : 'origin/main'}）`);
console.log(`- 窗口: ${fmt(since)} → ${fmt(now)}`);
console.log(`- fetch: ${fetched ? '成功' : '失败（使用本地引用，结果可能滞后）'}`);

if (!commits.length) {
  console.log(`\n**过去 ${hours} 小时没有新 commit。**`);
  process.exit(0);
}

const authors = [...new Set(commits.map(c => c.author))];
console.log(`- 共 ${commits.length} 个 commit，${authors.length} 位作者: ${authors.join(', ')}\n`);

console.log('## Commits\n');
for (const c of commits) {
  console.log(`- \`${c.short}\` ${c.subject}`);
  console.log(`  ${c.author} · ${c.date}${c.stat ? ` · ${c.stat}` : ''}`);
  if (c.body) {
    const bodyLines = c.body.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3);
    for (const l of bodyLines) console.log(`  > ${l}`);
  }
}
