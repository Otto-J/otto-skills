#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';

const DEFAULT_OUT = '~/.config/get-email/config.json';

const PRESETS = {
  qq: { host: 'imap.qq.com', port: 993, secure: true },
  gmail: { host: 'imap.gmail.com', port: 993, secure: true },
  outlook: { host: 'outlook.office365.com', port: 993, secure: true },
  '163': { host: 'imap.163.com', port: 993, secure: true },
  custom: { host: '', port: 993, secure: true }
};

function usage() {
  return `Usage:
  node init-config.mjs [options]

Options:
  --out <path>          Config path (default: ${DEFAULT_OUT})
  --name <name>         Account name, such as work or personal
  --preset <provider>   qq, gmail, outlook, 163, or custom
  --user <email>        Mail account username
  --host <host>         IMAP host for custom provider
  --pass-env <name>     Environment variable that stores app password
  --limit <n>           Default fetch limit (default: 20)
  --max-chars <n>       Default content truncation (default: 2000)
  --help                Show this help
`;
}

function expandHome(inputPath) {
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith('~/')) return path.join(os.homedir(), inputPath.slice(2));
  return inputPath;
}

function parseArgs(argv) {
  const opts = {
    out: DEFAULT_OUT,
    limit: 20,
    maxChars: 2000
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const readValue = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return value;
    };

    switch (arg) {
      case '--out':
        opts.out = readValue();
        break;
      case '--name':
        opts.name = readValue();
        break;
      case '--preset':
        opts.preset = readValue();
        break;
      case '--user':
        opts.user = readValue();
        break;
      case '--host':
        opts.host = readValue();
        break;
      case '--pass-env':
        opts.passEnv = readValue();
        break;
      case '--limit':
        opts.limit = parsePositiveInt(readValue(), '--limit');
        break;
      case '--max-chars':
        opts.maxChars = parsePositiveInt(readValue(), '--max-chars');
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
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function envNameFor(name) {
  return `${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_MAIL_APP_PASSWORD`;
}

async function askMissing(opts) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    opts.name ||= await rl.question('Account name (work/personal): ');
    opts.preset ||= await rl.question('Provider preset (qq/gmail/outlook/163/custom): ');
    opts.user ||= await rl.question('Email user: ');

    if (opts.preset === 'custom') {
      opts.host ||= await rl.question('IMAP host: ');
    }

    opts.passEnv ||= await rl.question(`Password env name (${envNameFor(opts.name)}): `);
    if (!opts.passEnv) opts.passEnv = envNameFor(opts.name);
  } finally {
    rl.close();
  }

  return opts;
}

function buildConfig(opts) {
  const presetName = opts.preset || 'custom';
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown preset: ${presetName}`);

  const host = opts.host || preset.host;
  if (!host) throw new Error('IMAP host is required for custom preset');

  return {
    defaults: {
      limit: opts.limit,
      mailbox: 'INBOX',
      maxContentChars: opts.maxChars,
      previewChars: 300,
      includeHtml: false,
      markSeen: false,
      action: 'fetch',
      deleteMode: 'preview',
      format: 'preview',
      filters: {
        unseen: true,
        since: "",
        from: "",
        subject: "",
        query: ""
      },
      out: ""
    },
    accounts: [
      {
        name: opts.name,
        host,
        port: preset.port,
        secure: preset.secure,
        user: opts.user,
        passEnv: opts.passEnv || envNameFor(opts.name),
        mailbox: 'INBOX'
      }
    ]
  };
}

async function writeConfig(outPath, config) {
  const resolved = path.resolve(expandHome(outPath));
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
  return resolved;
}

async function main() {
  let opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(usage());
    return;
  }

  opts = await askMissing(opts);
  const config = buildConfig(opts);
  const out = await writeConfig(opts.out, config);
  const envName = config.accounts[0].passEnv;

  process.stdout.write(`Created ${out}

Next:
  export ${envName}="your_app_password"
  node fetch-mail.mjs --config ${out} --unseen --limit 5
`);
}

main().catch(error => {
  if (error.code === 'EEXIST') {
    process.stderr.write('Config file already exists. Choose a new --out path or edit the existing file.\n');
  } else {
    process.stderr.write(`${error.message}\n`);
  }
  process.exitCode = 1;
});
