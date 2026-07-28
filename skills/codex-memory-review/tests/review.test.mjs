import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const script = path.resolve(import.meta.dirname, '../scripts/review.mjs');
function run(args) { return JSON.parse(execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' })); }
function meta(id) { return JSON.stringify({ timestamp: '2026-07-28T08:00:00.000Z', type: 'session_meta', payload: { id } }); }
function user(id, text, timestamp = '2026-07-28T08:01:00.000Z') { return JSON.stringify({ timestamp, type: 'response_item', payload: { type: 'message', role: 'user', id, content: [{ type: 'input_text', text }] } }); }
function final(id, text) { return JSON.stringify({ timestamp: '2026-07-28T08:02:00.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', phase: 'final_answer', id, content: [{ type: 'output_text', text }] } }); }
async function fixture(root, session, lines, half = '') {
  const dir = path.join(root, 'sessions', '2026', '07', '28');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `rollout-${session}.jsonl`), `${lines.join('\n')}\n${half}`);
}

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-memory-review-'));
  const state = path.join(root, 'state');
  const a = path.join(root, 'a', '.codex');
  const b = path.join(root, 'b', '.codex');
  const session = 'same-session';
  await fixture(a, session, [meta(session), user('shared-message', 'mail me at secret@example.com token sk-abcdefghijklmnop'), final('a-final', 'done')], '{"incomplete":');
  await fixture(b, session, [meta(session), user('shared-message', 'phone 13800138000'), final('b-final', 'other')]);
  run(['sources', 'add', '--state-dir', state, '--source-id', 'laptop-a', '--label', 'Laptop A', '--codex-home', a]);
  run(['sources', 'add', '--state-dir', state, '--source-id', 'laptop-b', '--label', 'Laptop B', '--codex-home', b]);
  return { root, state };
}

test('prepare isolates sources, preserves cross-source copies, redacts, and commit is idempotent', async () => {
  const { state } = await setup();
  const prepared = run(['prepare', '--state-dir', state, '--now', '2026-07-28T09:00:00.000Z']);
  assert.equal(prepared.sourceCount, 2);
  assert.equal(prepared.messageCount, 4);
  assert.equal(prepared.parseErrors, 0, 'EOF partial line is ignored');
  await assert.rejects(readFile(path.join(state, 'sources', 'laptop-a.json')));
  const bundle = await readFile(path.join(prepared.runDir, 'bundle.md'), 'utf8');
  assert.match(bundle, /Source: Laptop A/);
  assert.match(bundle, /Source: Laptop B/);
  assert.equal((bundle.match(/Session: `same-session`/g) || []).length, 2);
  assert.doesNotMatch(bundle, /secret@example\.com|13800138000|sk-abcdefghijklmnop/);
  assert.match(bundle, /\[REDACTED\]/);
  run(['commit', '--state-dir', state, '--run-id', prepared.runId]);
  const aState = JSON.parse(await readFile(path.join(state, 'sources', 'laptop-a.json')));
  const bState = JSON.parse(await readFile(path.join(state, 'sources', 'laptop-b.json')));
  assert.equal(aState.checktime, '2026-07-28T09:00:00.000Z');
  assert.equal(bState.checktime, '2026-07-28T09:00:00.000Z');
  assert.notDeepEqual(aState.messageKeys, bState.messageKeys);
  const repeat = run(['prepare', '--state-dir', state, '--now', '2026-07-28T10:00:00.000Z']);
  assert.equal(repeat.messageCount, 0);
});

test('abort and dry-run never advance checktime', async () => {
  const { state } = await setup();
  const dry = run(['prepare', '--state-dir', state, '--dry-run', '--now', '2026-07-28T09:00:00.000Z']);
  assert.equal(dry.messageCount, 4);
  const prepared = run(['prepare', '--state-dir', state, '--now', '2026-07-28T09:00:00.000Z']);
  run(['abort', '--state-dir', state, '--run-id', prepared.runId]);
  await assert.rejects(readFile(path.join(state, 'sources', 'laptop-a.json')));
});

test('same message id with changed content creates a revision and uses Shanghai bundle dates', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-memory-revision-'));
  const state = path.join(root, 'state');
  const codex = path.join(root, '.codex');
  const timestamp = '2026-07-28T16:01:00.000Z';
  await fixture(codex, 'revision-session', [meta('revision-session'), user('edited-message', 'first version', timestamp)]);
  await fixture(codex, 'fork-session', [meta('fork-session'), user('edited-message', 'first version', timestamp)]);
  run(['sources', 'add', '--state-dir', state, '--source-id', 'current', '--codex-home', codex]);
  const first = run(['prepare', '--state-dir', state, '--now', '2026-07-28T17:00:00.000Z']);
  assert.equal(first.messageCount, 1, 'same content and id in a fork is deduplicated');
  const firstBundle = await readFile(path.join(first.runDir, 'bundle.md'), 'utf8');
  assert.match(firstBundle, /### 2026-07-29 \|/);
  run(['commit', '--state-dir', state, '--run-id', first.runId]);

  await fixture(codex, 'revision-session', [meta('revision-session'), user('edited-message', 'corrected version', timestamp)]);
  const second = run(['prepare', '--state-dir', state, '--now', '2026-07-28T18:00:00.000Z']);
  assert.equal(second.messageCount, 1);
  const secondBundle = await readFile(path.join(second.runDir, 'bundle.md'), 'utf8');
  assert.match(secondBundle, /corrected version/);
  assert.doesNotMatch(secondBundle, /first version/);
  run(['commit', '--state-dir', state, '--run-id', second.runId]);
  const sourceState = JSON.parse(await readFile(path.join(state, 'sources', 'current.json')));
  assert.equal(sourceState.messageKeys.filter((key) => key.startsWith('id:edited-message:revision:')).length, 2);
});

test('baseline suppresses old events without inventing processed keys', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-memory-baseline-'));
  const state = path.join(root, 'state');
  const codex = path.join(root, '.codex');
  await fixture(codex, 'baseline-session', [meta('baseline-session'), user('before', 'old', '2026-07-28T07:47:00.000Z'), user('after', 'new', '2026-07-28T07:49:00.000Z')]);
  run(['sources', 'add', '--state-dir', state, '--source-id', 'current', '--codex-home', codex]);
  run(['baseline', '--state-dir', state, '--source-id', 'current', '--through', '2026-07-28T07:48:00.000Z']);
  const baseline = JSON.parse(await readFile(path.join(state, 'sources', 'current.json')));
  assert.equal(baseline.checktime, '2026-07-28T07:48:00.000Z');
  assert.deepEqual(baseline.messageKeys, []);
  const prepared = run(['prepare', '--state-dir', state, '--now', '2026-07-28T09:00:00.000Z']);
  assert.equal(prepared.messageCount, 1);
  const bundle = await readFile(path.join(prepared.runDir, 'bundle.md'), 'utf8');
  assert.match(bundle, /new/);
  assert.doesNotMatch(bundle, /\bold\b/);
});
