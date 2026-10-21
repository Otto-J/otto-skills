import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const repo = 'marswaveai/cola';

export function parseIssues(inputs) {
  const numbers = inputs.flatMap((input) => input.split(/[\s,，]+/)).filter(Boolean).map((input) => {
    const match = /^(?:#)?([1-9]\d*)$/.exec(input)
      ?? /^https:\/\/github\.com\/marswaveai\/cola\/issues\/([1-9]\d*)\/?(?:[?#].*)?$/.exec(input);
    if (!match || !Number.isSafeInteger(Number(match[1]))) {
      throw new Error('Expected a positive Issue ID or marswaveai/cola GitHub Issue URL.');
    }
    return Number(match[1]);
  });
  if (!numbers.length) throw new Error('Provide at least one Issue ID or URL.');
  return [...new Set(numbers)];
}

async function api(path) {
  const { stdout } = await execFileAsync('gh', ['api', path], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

export async function collectIssue(number, read = api) {
  const result = { number, url: `https://github.com/${repo}/issues/${number}`, ok: false,
    commentsComplete: false, comments: [] };
  try {
    const issue = await read(`repos/${repo}/issues/${number}`);
    if (issue.pull_request) throw new Error('Input is a pull request, not an Issue.');
    result.issue = { number, url: issue.html_url, title: issue.title, body: issue.body,
      author: issue.user?.login, state: issue.state, stateReason: issue.state_reason,
      createdAt: issue.created_at, updatedAt: issue.updated_at, reportedCommentCount: issue.comments,
      labels: issue.labels?.map((label) => typeof label === 'string' ? label : label.name),
      assignees: issue.assignees?.map((user) => user.login) };
    for (let page = 1; ; page++) {
      const comments = await read(`repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`);
      if (!Array.isArray(comments)) throw new Error('Unexpected comments response.');
      result.comments.push(...comments.map((comment) => ({ id: comment.id, url: comment.html_url,
        author: comment.user?.login, createdAt: comment.created_at,
        updatedAt: comment.updated_at, body: comment.body })));
      if (comments.length < 100) break;
    }
    result.comments = [...new Map(result.comments.map((comment) => [comment.id, comment])).values()];
    result.commentsComplete = true;
    result.ok = true;
  } catch (error) {
    // execFile errors can include raw stdout/stderr. Never forward those or credentials.
    result.error = error?.cmd ? 'GitHub read failed; check gh authentication, access, network, or response size.'
      : 'Issue retrieval failed or returned an unsupported response.';
  }
  return result;
}

async function selfTest() {
  assert.deepEqual(parseIssues(['#12,12', 'https://github.com/marswaveai/cola/issues/34#issuecomment-1']), [12, 34]);
  for (const bad of ['0', '-1', '1;whoami', 'https://github.com/other/repo/issues/12']) {
    assert.throws(() => parseIssues([bad]));
  }
  const page = Array.from({ length: 100 }, (_, id) => ({ id, body: `comment ${id}` }));
  const calls = [];
  const complete = await collectIssue(12, async (path) => {
    calls.push(path);
    return path.endsWith('/12') ? { comments: 101 }
      : path.endsWith('page=1') ? page : [{ id: 100, body: 'last page' }];
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.comments.length, 101);
  assert.equal(calls.length, 3);
  const partial = await collectIssue(12, async (path) => {
    if (path.endsWith('/12')) return {};
    if (path.endsWith('page=1')) return page;
    throw new Error('sensitive response');
  });
  assert.equal(partial.commentsComplete, false);
  assert.equal(partial.ok, false);
  assert.equal(partial.comments.length, 100);
  assert.equal(JSON.stringify(partial).includes('sensitive response'), false);
  const pr = await collectIssue(12, async () => ({ pull_request: {} }));
  assert.equal(pr.ok, false);
  process.stdout.write('Self-test passed: input validation, pagination, partial failures, and PR rejection.\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--self-test') return selfTest();
  if (!args.length || args.includes('--help')) {
    process.stdout.write('Usage: node collect-issues.mjs <issue-id-or-url> [...]\n       node collect-issues.mjs --self-test\n');
    return;
  }
  const numbers = parseIssues(args);
  const results = [];
  for (const number of numbers) results.push(await collectIssue(number));
  process.stdout.write(`${JSON.stringify({ repo, collectedAt: new Date().toISOString(), results }, null, 2)}\n`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write('Invalid input or collection failure. Use --help for accepted inputs.\n');
    process.exitCode = 1;
  });
}
