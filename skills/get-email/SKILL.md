---
name: get-email
description: Fetch, parse, filter, and normalize email from one or more IMAP mailboxes through a Node.js CLI. Use when the user wants an Agent Skill or local script for reading recent mail, unread mail, filtered mail, or mailbox content from multiple configured accounts using imapflow and mailparser.
---

# getEmail

Use this skill to fetch email from configured IMAP accounts, parse MIME into clean JSON, and return text that is ready for LLM filtering, summarization, routing, or task extraction.

## Quick Start

Run from the bundled script directory:

```bash
cd ~/.codex/skills/get-email/scripts
npm install
```

Create the first account config with a provider preset:

```bash
node init-config.mjs --preset qq --name personal --user your_email@qq.com --pass-env QQ_MAIL_APP_PASSWORD
export QQ_MAIL_APP_PASSWORD="your_app_password"
```

For Gmail, Outlook, 163, or a private IMAP server, use `--preset gmail`, `--preset outlook`, `--preset 163`, or `--preset custom --host imap.example.com`.

Then edit one config file:

```bash
~/.config/get-email/config.json
```

Fetch with config defaults:

```bash
node fetch-mail.mjs --config ~/.config/get-email/config.json
```

Override a config value for one run:

```bash
node fetch-mail.mjs --config ~/.config/get-email/config.json --account work --action mark-read
```

## Workflow

1. Run `scripts/init-config.mjs` for the first account.
2. Edit `~/.config/get-email/config.json` to add accounts and default fetch parameters.
3. Store passwords or app authorization codes in `pass`, or reference an environment variable with `passEnv`.
4. Run `scripts/fetch-mail.mjs` with server-side filters first.
5. Feed compact JSON or JSONL to downstream Agent tools.

## First-Use Configuration

Recommended single-file config:

```json
{
  "defaults": {
    "accounts": ["work", "personal"],
    "limit": 20,
    "mailbox": "INBOX",
    "maxContentChars": 2000,
    "previewChars": 300,
    "includeHtml": false,
    "markSeen": false,
    "action": "fetch",
    "deleteMode": "preview",
    "format": "preview",
    "filters": {
      "unseen": true,
      "since": "",
      "from": "",
      "subject": "",
      "query": ""
    },
    "out": ""
  },
  "accounts": [
    {
      "name": "work",
      "host": "outlook.office365.com",
      "port": 993,
      "secure": true,
      "user": "you@example.com",
      "pass": "PUT_APP_PASSWORD_HERE",
      "mailbox": "INBOX"
    }
  ]
}
```

Config defaults for LLM consumption:

- `limit: 20`: enough for inbox triage and table previews.
- `maxContentChars: 2000`: enough for summaries while keeping context predictable.
- `previewChars: 300`: compact preview text for tables.
- `includeHtml: false`: plain text is cleaner for model input.
- `markSeen: false`: safe default while testing filters.
- `action: "fetch"`: read and parse messages.
- `deleteMode: "preview"`: list delete candidates without changing the server.
- `mailbox: "INBOX"`: provider-compatible default.
- `format: "preview"`: Markdown table preview for direct reading.
- `filters.unseen: true`: keeps repeated runs focused on fresh content.

Provider starting points:

- QQ Mail: `host=imap.qq.com`, app authorization code, `port=993`, `secure=true`.
- Gmail: `host=imap.gmail.com`, app password or OAuth-backed IMAP setup.
- Outlook / Microsoft 365: `host=outlook.office365.com`, modern account policy may require app-specific setup.
- 163 Mail: `host=imap.163.com`, authorization code.
- Private mail server: use `--preset custom --host <imap-host>`.

## Usage Patterns

Prefer commands that keep output small and actionable:

```bash
node fetch-mail.mjs --config ~/.config/get-email/config.json
node fetch-mail.mjs --config ~/.config/get-email/config.json --account work
node fetch-mail.mjs --config ~/.config/get-email/config.json --since 2026-06-01 --subject invoice
node fetch-mail.mjs --config ~/.config/get-email/config.json --action mark-read
node fetch-mail.mjs --config ~/.config/get-email/config.json --action delete --query newsletter@example.com
node fetch-mail.mjs --config ~/.config/get-email/config.json --action delete --delete-mode commit --query newsletter@example.com
```

Use `preview` for direct Markdown reading, JSONL for pipelines, JSON for structured inspection, and text for quick terminal reading. Use `--action delete` to preview candidates, then `--action delete --delete-mode commit` to delete one candidate set at a time.

## CLI Capabilities

The CLI uses `imapflow` for IMAP and `mailparser` for MIME parsing.

- `init-config.mjs`: create a first-use config from provider presets.
- `--config <path>`: JSON config path. Defaults to `~/.config/get-email/config.json`.
- `--account <names>`: comma-separated account names. Defaults to all enabled accounts.
- `--mailbox <name>`: override mailbox name. Defaults to account `mailbox` or `INBOX`.
- `--limit <n>`: maximum messages per account.
- `--unseen`: fetch only unread messages.
- `--since <YYYY-MM-DD>`: fetch messages since a date.
- `--from <text>` and `--subject <text>`: server-side IMAP search filters.
- `--query <text>`: local post-parse search over subject, from, and content.
- `--max-content-chars <n>`: truncate parsed text for LLM context control.
- `--preview-chars <n>`: truncate preview text for table display.
- `--include-html`: include parsed HTML in output.
- `--action fetch|mark-read|delete`: fetch, mark matched messages read on the server, or delete matched messages on the server.
- `--delete-mode preview|commit`: `delete` defaults to preview; commit deletes candidates one by one on the server.
- `--mark-seen`: mark fetched messages as seen after retrieval.
- `--format json|jsonl|text|markdown|preview`: choose output format.
- `--out <path>`: write output to a file.

## Output Contract

Preview output is a Markdown document with account status and an email table. JSON output has this shape:

```json
{
  "fetchedAt": "2026-06-01T12:00:00.000Z",
  "accounts": [{"name": "work", "status": "ok", "count": 3, "operation": {"action": "fetch", "affected": 0, "ok": true}}],
  "emails": [
    {
      "account": "work",
      "mailbox": "INBOX",
      "read": true,
      "from": "Sender <sender@example.com>",
      "subject": "Example",
      "date": "2026-06-01T08:00:00.000Z",
      "preview": "Short table-friendly preview",
      "content": "Markdown/plain text body truncated to max-content-chars",
      "attachments": [{"filename": "report.pdf", "contentType": "application/pdf", "size": 12345}]
    }
  ]
}
```

## Operational Notes

Use app passwords or provider-specific authorization codes for IMAP. Use `pass` for a self-contained config file, or `passEnv` when credentials should live outside the file.

HTML-only email is converted to Markdown with `turndown`, then cleaned and truncated. For very large mailboxes, combine server-side filters (`--unseen`, `--since`, `--from`, `--subject`) with `--limit`. Use `--query` for quick local filtering after parsing.
