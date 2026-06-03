#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CONFIG = '~/.config/get-email/config.json';
const ACTIONS = new Set(['fetch', 'mark-read', 'delete']);
const FORMATS = new Set(['json', 'jsonl', 'text', 'markdown', 'preview']);
let loadedMailDeps;

function usage() {
  return `Usage:
  node fetch-mail.mjs [options]

Options:
  --config <path>             Config JSON path (default: ${DEFAULT_CONFIG})
  --account <names>           Comma-separated account names
  --mailbox <name>            Override mailbox name
  --limit <n>                 Max messages per account
  --unseen                    Fetch unread messages only
  --since <YYYY-MM-DD>        Fetch messages since date
  --from <text>               Server-side sender search
  --subject <text>            Server-side subject search
  --query <text>              Local search over parsed subject/from/content
  --max-content-chars <n>     Truncate text content for LLM context
  --preview-chars <n>         Truncate preview field
  --include-html              Include parsed HTML
  --action <name>             fetch, mark-read, or delete (default: fetch)
  --delete-mode <mode>        preview or commit; delete defaults to preview
  --mark-seen                 Mark fetched messages as seen
  --format <format>           json, jsonl, text, markdown, or preview
  --out <path>                Write output to file
  --help                      Show this help
`;
}

function expandHome(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith('~/')) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function parseArgs(argv) {
  const opts = {
    config: DEFAULT_CONFIG
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    switch (arg) {
      case '--config':
        opts.config = readValue();
        break;
      case '--account':
        opts.accounts = readValue().split(',').map(value => value.trim()).filter(Boolean);
        break;
      case '--mailbox':
        opts.mailbox = readValue();
        break;
      case '--limit':
        opts.limit = parsePositiveInt(readValue(), '--limit');
        break;
      case '--since':
        opts.since = parseDate(readValue(), '--since');
        break;
      case '--from':
        opts.from = readValue();
        break;
      case '--subject':
        opts.subject = readValue();
        break;
      case '--query':
        opts.query = readValue().toLowerCase();
        break;
      case '--max-content-chars':
        opts.maxContentChars = parsePositiveInt(readValue(), '--max-content-chars');
        break;
      case '--preview-chars':
        opts.previewChars = parsePositiveInt(readValue(), '--preview-chars');
        break;
      case '--format':
        opts.format = readFormat(readValue(), '--format');
        break;
      case '--out':
        opts.out = readValue();
        break;
      case '--unseen':
        opts.unseen = true;
        break;
      case '--include-html':
        opts.includeHtml = true;
        break;
      case '--action':
        opts.action = readAction(readValue(), '--action');
        break;
      case '--delete-mode':
        opts.deleteMode = readDeleteMode(readValue(), '--delete-mode');
        break;
      case '--mark-seen':
        opts.markSeen = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return opts;
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseDate(value, flag) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${flag} must be a valid YYYY-MM-DD date`);
  }
  return date;
}

function readAction(value, flag) {
  if (!ACTIONS.has(value)) {
    throw new Error(`${flag} must be fetch, mark-read, or delete`);
  }
  return value;
}

function readFormat(value, flag) {
  const normalized = value === 'md' ? 'markdown' : value;
  if (!FORMATS.has(normalized)) {
    throw new Error(`${flag} must be json, jsonl, text, markdown, or preview`);
  }
  return normalized;
}

function readDeleteMode(value, flag) {
  if (!['preview', 'commit'].includes(value)) {
    throw new Error(`${flag} must be preview or commit`);
  }
  return value;
}

async function readConfig(configPath) {
  const resolved = path.resolve(expandHome(configPath));
  const raw = await fs.readFile(resolved, 'utf8');
  const config = JSON.parse(raw);
  if (!Array.isArray(config.accounts) || config.accounts.length === 0) {
    throw new Error('Config must include a non-empty accounts array');
  }
  return { config, resolved };
}

function normalizeConfigDefaults(defaults = {}) {
  const normalized = {
    ...defaults,
    ...(defaults.filters || {})
  };
  delete normalized.filters;

  if (typeof normalized.account === 'string') {
    normalized.accounts = normalized.account.split(',').map(value => value.trim()).filter(Boolean);
    delete normalized.account;
  }

  if (typeof normalized.accounts === 'string') {
    normalized.accounts = normalized.accounts.split(',').map(value => value.trim()).filter(Boolean);
  }

  for (const key of ['since', 'from', 'subject', 'query', 'out']) {
    if (typeof normalized[key] === 'string' && normalized[key].trim() === '') {
      delete normalized[key];
    }
  }

  if (typeof normalized.since === 'string') {
    normalized.since = parseDate(normalized.since.trim(), 'defaults.since');
  }

  if (typeof normalized.query === 'string') {
    normalized.query = normalized.query.toLowerCase().trim();
  }

  if (typeof normalized.action === 'string') {
    normalized.action = readAction(normalized.action, 'defaults.action');
  }

  if (typeof normalized.format === 'string') {
    normalized.format = readFormat(normalized.format, 'defaults.format');
  }

  if (typeof normalized.deleteMode === 'string') {
    normalized.deleteMode = readDeleteMode(normalized.deleteMode, 'defaults.deleteMode');
  }

  return normalized;
}

function mergeOptions(configDefaults, cliOptions) {
  const merged = { ...configDefaults };
  for (const [key, value] of Object.entries(cliOptions)) {
    if (value !== undefined) merged[key] = value;
  }
  merged.format ||= 'preview';
  merged.action ||= 'fetch';
  merged.deleteMode ||= 'preview';

  merged.format = readFormat(merged.format, 'format');
  readAction(merged.action, 'action');
  readDeleteMode(merged.deleteMode, 'deleteMode');

  return merged;
}

function selectAccounts(config, opts) {
  const wanted = opts.accounts ? new Set(opts.accounts) : null;
  const selected = config.accounts.filter(account => {
    if (account.disabled) return false;
    return wanted ? wanted.has(account.name) : true;
  });

  if (wanted) {
    const found = new Set(selected.map(account => account.name));
    const missing = [...wanted].filter(name => !found.has(name));
    if (missing.length > 0) {
      throw new Error(`Configured accounts missing or disabled: ${missing.join(', ')}`);
    }
  }

  return selected;
}

function getPassword(account) {
  if (account.passEnv) {
    const value = process.env[account.passEnv];
    if (!value) {
      throw new Error(`Missing environment variable ${account.passEnv} for account ${account.name}`);
    }
    return value;
  }
  if (account.pass) return account.pass;
  throw new Error(`Account ${account.name} must define passEnv or pass`);
}

function buildSearchCriteria(opts) {
  const criteria = {};
  if (opts.unseen) criteria.seen = false;
  if (opts.since) criteria.since = opts.since;
  if (opts.from) criteria.from = opts.from;
  if (opts.subject) criteria.subject = opts.subject;
  return criteria;
}

function hasSearchCriteria(criteria) {
  return Object.keys(criteria).length > 0;
}

function truncate(value, maxChars) {
  if (!value || !maxChars || value.length <= maxChars) return value || '';
  const omitted = value.length - maxChars;
  return `${value.slice(0, maxChars)}\n[truncated ${omitted} chars]`;
}

function cleanContent(value) {
  if (!value) return '';

  const imageLikeUrl = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)(?:\?\S*)?$/i;
  const trackingUrl = /^https?:\/\/(?:tr\.jd\.com|i-mkt\.jd\.com|click\.|link\.|trk\.|t\.mail\.)/i;

  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\((?:\[long-url\]|https?:\/\/[^)]*)\)/g, '$1')
    .replace(/\[data:image\/[^\]]+\]/gi, '[inline-image]')
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\r\n]+/gi, '[inline-image]')
    .replace(/\[https?:\/\/[^\]]{160,}\]/gi, '[long-url]')
    .replace(/\bhttps?:\/\/\S{180,}/gi, '[long-url]')
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (line === '[inline-image]') return false;
      const unwrapped = line.replace(/^\[(.*)\]$/, '$1');
      if (imageLikeUrl.test(unwrapped)) return false;
      if (trackingUrl.test(unwrapped)) return false;
      if (/^(#outlook|@media|body\s*\{|table,\s*td\s*\{|img\s*\{|p\s*\{|\.moz-|\.mj-|\.wfix|td\.mj-)/i.test(line)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function makePreview(value, maxChars) {
  if (!value) return '';
  const compact = value
    .replace(/\[[^\]]*long-url[^\]]*\]/gi, '')
    .replace(/\[[^\]]*inline-image[^\]]*\]/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact || compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}...`;
}

function contentScore(value) {
  if (!value) return -Infinity;
  let score = Math.min(value.length, 4000);
  score -= (value.match(/\[long-url\]/g) || []).length * 80;
  score -= (value.match(/https?:\/\//g) || []).length * 40;
  if (/(#outlook|@media|mso-table|mj-column|text-size-adjust|border-collapse)/i.test(value)) score -= 1200;
  if (/(发票号码|发票类型|订单\d{8,}|invoice|receipt|订阅|subscription)/i.test(value)) score += 1000;
  if (/(model|launch|context window|coding|agentic)/i.test(value)) score += 400;
  return score;
}

function chooseContent(markdown, text) {
  if (contentScore(markdown) >= contentScore(text)) return markdown || text || '';
  return text || markdown || '';
}

function addressText(addressObject) {
  return addressObject?.text || '';
}

function normalizeAttachments(attachments = []) {
  return attachments.map(attachment => ({
    filename: attachment.filename || '',
    contentType: attachment.contentType || '',
    size: attachment.size || 0,
    contentId: attachment.contentId || ''
  }));
}

function matchesLocalQuery(email, query) {
  if (!query) return true;
  const haystack = [
    email.subject,
    email.from,
    email.to,
    email.content
  ].filter(Boolean).join('\n').toLowerCase();
  return haystack.includes(query);
}

async function loadMailDeps() {
  if (loadedMailDeps) return loadedMailDeps;

  try {
    const [imapflowPkg, mailparserPkg, turndownPkg] = await Promise.all([
      import('imapflow'),
      import('mailparser'),
      import('turndown')
    ]);
    const TurndownService = turndownPkg.default || turndownPkg.TurndownService || turndownPkg;
    const turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      linkStyle: 'inlined'
    });
    turndown.remove(['style', 'script', 'noscript', 'svg', 'img']);
    turndown.addRule('linksAsText', {
      filter: 'a',
      replacement(content) {
        return content.trim();
      }
    });
    loadedMailDeps = {
      ImapFlow: imapflowPkg.ImapFlow || imapflowPkg.default?.ImapFlow,
      simpleParser: mailparserPkg.simpleParser || mailparserPkg.default?.simpleParser,
      turndown
    };
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('Missing dependencies. Run `npm install` in ~/.codex/skills/get-email/scripts first.');
    }
    throw error;
  }

  if (!loadedMailDeps.ImapFlow || !loadedMailDeps.simpleParser || !loadedMailDeps.turndown) {
    throw new Error('Could not load imapflow, mailparser, or turndown exports.');
  }

  return loadedMailDeps;
}

function makeClient(account, ImapFlow) {
  return new ImapFlow({
    host: account.host,
    port: account.port ?? 993,
    secure: account.secure ?? true,
    auth: {
      user: account.user,
      pass: getPassword(account)
    },
    logger: false
  });
}

async function applyServerAction(client, action, uids, markSeen, deleteMode) {
  const uniqueUids = [...new Set(uids.filter(Boolean))];
  const operation = {
    action,
    deleteMode,
    markSeen: Boolean(markSeen),
    affected: 0,
    ok: true
  };

  if (uniqueUids.length === 0) {
    return operation;
  }

  if (action === 'mark-read' || markSeen) {
    operation.ok = await client.messageFlagsAdd(uniqueUids, ['\\Seen'], { uid: true });
    operation.affected = uniqueUids.length;
  }

  if (action === 'delete') {
    if (deleteMode !== 'commit') {
      operation.preview = true;
      operation.affected = 0;
      operation.candidates = uniqueUids.length;
      return operation;
    }

    operation.affected = 0;
    for (const uid of uniqueUids) {
      const ok = await client.messageDelete([uid], { uid: true });
      operation.ok = operation.ok && Boolean(ok);
      if (ok) operation.affected += 1;
    }
  }

  return operation;
}

async function fetchAccount(account, defaults, opts) {
  const { ImapFlow, simpleParser, turndown } = await loadMailDeps();
  const client = makeClient(account, ImapFlow);
  const mailbox = opts.mailbox || account.mailbox || defaults.mailbox || 'INBOX';
  const limit = opts.limit ?? defaults.limit ?? 10;
  const maxContentChars = opts.maxContentChars ?? defaults.maxContentChars ?? 2000;
  const previewChars = opts.previewChars ?? defaults.previewChars ?? 300;
  const includeHtml = opts.includeHtml ?? defaults.includeHtml ?? false;
  const markSeen = opts.markSeen ?? defaults.markSeen ?? false;
  const action = opts.action ?? defaults.action ?? 'fetch';
  const deleteMode = opts.deleteMode ?? defaults.deleteMode ?? 'preview';
  const rawMessages = [];

  try {
    await client.connect();
    const mailboxInfo = await client.mailboxOpen(mailbox);
    const criteria = buildSearchCriteria(opts);

    if (hasSearchCriteria(criteria)) {
      const uids = await client.search(criteria, { uid: true });
      const latestUids = uids.slice(-limit);
      if (latestUids.length > 0) {
        for await (const message of client.fetch(latestUids, {
          uid: true,
          flags: true,
          envelope: true,
          source: true
        }, { uid: true })) {
          rawMessages.push(message);
        }
      }
    } else if (mailboxInfo.exists > 0) {
      const start = Math.max(1, mailboxInfo.exists - limit + 1);
      const range = `${start}:*`;
      for await (const message of client.fetch(range, {
        uid: true,
        flags: true,
        envelope: true,
        source: true
      })) {
        rawMessages.push(message);
      }
    }

    const emails = [];
    const actionUids = [];
    for (const message of rawMessages) {
      const parsed = await simpleParser(message.source, {
        skipTextToHtml: true,
        skipImageLinks: true,
        skipTextLinks: true
      });
      const markdown = typeof parsed.html === 'string' && parsed.html.trim()
        ? cleanContent(turndown.turndown(cleanContent(parsed.html)))
        : '';
      const text = cleanContent(parsed.text || '');
      const content = truncate(chooseContent(markdown, text), maxContentChars);
      const flags = [...(message.flags || [])];
      const read = flags.some(flag => String(flag).toLowerCase() === '\\seen');

      const email = {
        account: account.name,
        mailbox,
        read,
        from: addressText(parsed.from),
        to: addressText(parsed.to),
        cc: addressText(parsed.cc),
        subject: parsed.subject || '',
        date: parsed.date ? parsed.date.toISOString() : null,
        preview: makePreview(content, previewChars),
        content,
        attachments: normalizeAttachments(parsed.attachments)
      };

      if (includeHtml) {
        email.html = truncate(typeof parsed.html === 'string' ? parsed.html : '', maxContentChars);
      }

      if (matchesLocalQuery(email, opts.query)) {
        emails.push(email);
        actionUids.push(message.uid);
      }
    }

    const operation = await applyServerAction(client, action, actionUids, markSeen, deleteMode);

    emails.sort((a, b) => {
      const left = a.date ? Date.parse(a.date) : 0;
      const right = b.date ? Date.parse(b.date) : 0;
      return right - left;
    });

    return {
      status: { name: account.name, status: 'ok', count: emails.length, operation },
      emails
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

async function fetchAll(opts) {
  const { config, resolved } = await readConfig(opts.config);
  const defaults = config.defaults || {};
  const effectiveOpts = mergeOptions(normalizeConfigDefaults(defaults), opts);
  const accounts = selectAccounts(config, effectiveOpts);
  const statuses = [];
  const emails = [];

  for (const account of accounts) {
    try {
      validateAccount(account);
      const result = await fetchAccount(account, defaults, effectiveOpts);
      statuses.push(result.status);
      emails.push(...result.emails);
    } catch (error) {
      statuses.push({
        name: account.name,
        status: 'error',
        error: error.message
      });
    }
  }

  emails.sort((a, b) => {
    const left = a.date ? Date.parse(a.date) : 0;
    const right = b.date ? Date.parse(b.date) : 0;
    return right - left;
  });

  const result = {
    fetchedAt: new Date().toISOString(),
    config: resolved,
    accounts: statuses,
    emails
  };

  Object.defineProperty(result, '_effectiveOpts', {
    value: effectiveOpts,
    enumerable: false
  });

  return result;
}

function validateAccount(account) {
  for (const field of ['name', 'host', 'user']) {
    if (!account[field]) {
      throw new Error(`Account is missing required field: ${field}`);
    }
  }
}

function formatOutput(result, format) {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  if (format === 'jsonl') {
    return result.emails.map(email => JSON.stringify(email)).join('\n') + (result.emails.length ? '\n' : '');
  }

  if (format === 'markdown' || format === 'preview') {
    return formatMarkdownPreview(result);
  }

  return result.emails.map(email => {
    const header = [
      `[${email.account}] ${email.subject}`,
      `From: ${email.from}`,
      `Date: ${email.date || ''}`
    ].join('\n');
    return `${header}\n\n${email.preview || email.content}`;
  }).join('\n\n---\n\n') + (result.emails.length ? '\n' : '');
}

function formatMarkdownPreview(result) {
  const lines = [
    '# Mail Preview',
    '',
    `Fetched: ${result.fetchedAt}`,
    '',
    '## Accounts',
    '',
    '| Account | Status | Count | Action | Affected | Error |',
    '|---|---|---:|---|---:|---|'
  ];

  for (const account of result.accounts) {
    lines.push([
      markdownCell(account.name),
      markdownCell(account.status),
      account.count ?? 0,
      markdownCell(account.operation?.action || ''),
      account.operation?.affected ?? 0,
      markdownCell(account.error || '')
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('', '## Emails', '', '| Date | Account | Read | From | Subject | Preview | Attachments |', '|---|---|---|---|---|---|---|');

  for (const email of result.emails) {
    lines.push([
      markdownCell(email.date || ''),
      markdownCell(email.account),
      email.read ? 'yes' : 'no',
      markdownCell(email.from),
      markdownCell(email.subject),
      markdownCell(email.preview || email.content || ''),
      markdownCell((email.attachments || []).map(attachment => attachment.filename).filter(Boolean).join(', '))
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  return `${lines.join('\n')}\n`;
}

function markdownCell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(usage());
    return;
  }

  const result = await fetchAll(opts);
  const effectiveOpts = result._effectiveOpts || opts;
  const output = formatOutput(result, effectiveOpts.format);
  if (effectiveOpts.out) {
    await fs.writeFile(path.resolve(expandHome(effectiveOpts.out)), output, 'utf8');
  } else {
    process.stdout.write(output);
  }

  const hasErrors = result.accounts.some(account => account.status === 'error');
  if (hasErrors) {
    process.exitCode = 2;
  }
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
