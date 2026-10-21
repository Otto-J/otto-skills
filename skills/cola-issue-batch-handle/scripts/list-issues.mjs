import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const repo = 'marswaveai/cola';
const dayMs = 86_400_000;

function parseDate(value, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new Error('Use YYYY-MM-DD or an ISO datetime with timezone.');
  }
  const dateOnly = value.length === 10;
  const result = new Date(dateOnly ? `${value}T${end ? '23:59:59.999' : '00:00:00'}+08:00` : value);
  if (!Number.isFinite(+result) || (dateOnly && new Date(+result + 8 * 3_600_000).toISOString().slice(0, 10) !== value)) {
    throw new Error('Invalid date.');
  }
  return result;
}

export function parseOptions(args, now = new Date()) {
  const options = { latest: false, unassigned: false, state: 'all' };
  let mode;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--latest') options.latest = true;
    else if (arg === '--unassigned') options.unassigned = true;
    else if (['--today', '--yesterday', '--days'].includes(arg)) {
      if (mode) throw new Error('Choose one relative time window.');
      mode = arg;
      if (arg === '--days') {
        options.days = Number(args[++index]);
        if (!Number.isInteger(options.days) || options.days < 1) throw new Error('Days must be a positive integer.');
      }
    } else if (['--since', '--until', '--state'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing option value.');
      options[arg.slice(2)] = value;
    } else throw new Error('Unknown option. Use --help.');
  }
  if (!['all', 'open', 'closed'].includes(options.state)) throw new Error('Invalid state.');
  if (mode && (options.since || options.until)) throw new Error('Do not combine relative and explicit windows.');
  const today = new Date(+now + 8 * 3_600_000).toISOString().slice(0, 10);
  const midnight = parseDate(today);
  const since = options.since ? parseDate(options.since)
    : mode === '--days' ? new Date(+now - options.days * dayMs)
    : mode === '--yesterday' ? new Date(+midnight - dayMs) : midnight;
  const until = options.until ? parseDate(options.until, true)
    : mode === '--yesterday' ? new Date(+midnight - 1) : now;
  if (+since > +until) throw new Error('Since must not exceed until.');
  return { ...options, since, until };
}

async function api(path) {
  const { stdout } = await execFileAsync('gh', ['api', path], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

export async function listIssues(options, read = api) {
  const issues = new Map();
  for (let page = 1; ; page++) {
    const rows = await read(`repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}`);
    if (!Array.isArray(rows)) throw new Error('Unexpected response.');
    let reachedBoundary = false;
    for (const row of rows) {
      const created = new Date(row.created_at);
      if (!Number.isFinite(+created)) throw new Error('Missing creation date.');
      if (+created < +options.since) { reachedBoundary = true; break; }
      if (row.pull_request || +created > +options.until) continue;
      if (options.state !== 'all' && row.state !== options.state) continue;
      if (options.unassigned && row.assignees?.length) continue;
      issues.set(row.number, { number: row.number, url: row.html_url, title: row.title,
        state: row.state, createdAt: row.created_at, updatedAt: row.updated_at,
        assignees: (row.assignees ?? []).map((user) => user.login),
        labels: (row.labels ?? []).map((label) => typeof label === 'string' ? label : label.name) });
    }
    if (reachedBoundary || rows.length < 100) break;
  }
  const result = [...issues.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return options.latest ? result.slice(0, 1) : result;
}

async function selfTest() {
  const now = new Date('2026-10-21T12:00:00Z');
  const today = parseOptions([], now);
  assert.equal(today.since.toISOString(), '2026-10-20T16:00:00.000Z');
  const yesterday = parseOptions(['--yesterday'], now);
  assert.equal(yesterday.until.toISOString(), '2026-10-20T15:59:59.999Z');
  assert.equal(parseOptions(['--days', '3'], now).since.toISOString(), '2026-10-18T12:00:00.000Z');
  assert.equal(parseOptions(['--since', '2026-10-20', '--until', '2026-10-21'], now).until.toISOString(), '2026-10-21T15:59:59.999Z');
  for (const args of [['--since', '2026-02-30'], ['--days', '0'], ['--today', '--since', '2026-10-20'], ['--state', 'bad'], ['--since', '2026-10-22']]) {
    assert.throws(() => parseOptions(args, now));
  }
  const row = (number, extra = {}) => ({ number, created_at: now.toISOString(), state: 'open', assignees: [], ...extra });
  const pages = [Array.from({ length: 100 }, (_, index) => row(index + 1, { pull_request: {} })),
    [row(101, { state: 'closed' }), row(102, { assignees: [{ login: 'owner' }] }), row(103), row(104, { created_at: today.since.toISOString() }), row(105, { created_at: '2026-10-19T00:00:00Z' })]];
  const calls = [];
  const result = await listIssues(parseOptions(['--state', 'open', '--unassigned'], now), async (path) => {
    calls.push(path); return pages[calls.length - 1];
  });
  assert.deepEqual(result.map((issue) => issue.number), [103, 104]);
  assert.equal(calls.length, 2);
  assert.deepEqual((await listIssues(today, async () => [row(1, { state: 'closed' })])).map((issue) => issue.state), ['closed']);
  assert.equal((await listIssues({ ...today, latest: true }, async () => [row(1), row(2)])).length, 1);
  assert.deepEqual(await listIssues(today, async () => []), []);
  await assert.rejects(listIssues(today, async () => { throw new Error('network'); }));
  process.stdout.write('Self-test passed: Beijing windows, validation, pagination, filters, PR exclusion, empty results, and failures.\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') return selfTest();
  if (args.includes('--help')) {
    process.stdout.write('Usage: node list-issues.mjs [--today|--yesterday|--days N|--since DATE --until DATE] [--latest] [--state all|open|closed] [--unassigned]\nDates use Asia/Shanghai; default: today, all states and assignees. --days is a rolling window.\n');
    return;
  }
  const options = parseOptions(args);
  const issues = await listIssues(options);
  process.stdout.write(`${JSON.stringify({ repo, timezone: 'Asia/Shanghai', since: options.since,
    until: options.until, complete: true, selection: options.latest ? 'latest' : 'all', count: issues.length, issues }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write('Issue listing failed; check arguments (--help), gh authentication, access, and network. No complete result was produced.\n');
    process.exitCode = 1;
  });
}
