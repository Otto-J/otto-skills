---
name: tencent-cloud
description: Work with Tencent Cloud APIs from Codex, starting with DNSPod DNS record automation using DNSPOD_ID and DNSPOD_KEY. Use when the user wants to list Tencent Cloud DNSPod domains or DNS records, inspect current DNS resolution, add DNS records, update DNS record values, automate DNSPod record upserts, or extend Tencent Cloud API workflows for additional Tencent Cloud scenarios.
---

# Tencent Cloud

Use this skill for Tencent Cloud API automation. The current implemented module is DNSPod DNS record management.

## DNSPod Quick Start

Script path:

```bash
node ~/.codex/skills/tencent-cloud/scripts/dnspod.mjs <command> [options]
```

Required environment variables:

```bash
export DNSPOD_ID="secret id"
export DNSPOD_KEY="secret key"
```

If the variables are defined only in `~/.zshrc`, invoke through interactive zsh:

```bash
zsh -ic 'node ~/.codex/skills/tencent-cloud/scripts/dnspod.mjs domains'
```

Common commands:

```bash
# List DNSPod domains
node ~/.codex/skills/tencent-cloud/scripts/dnspod.mjs domains

# List records under a domain
node ~/.codex/skills/tencent-cloud/scripts/dnspod.mjs list --domain example.com

# Filter records by subdomain and type
node ~/.codex/skills/tencent-cloud/scripts/dnspod.mjs list --domain example.com --subdomain www --type A

# Create or update the unique matching record
node ~/.codex/skills/tencent-cloud/scripts/dnspod.mjs upsert --domain example.com --subdomain www --type A --value 1.2.3.4 --ttl 600

# Update a known record id
node ~/.codex/skills/tencent-cloud/scripts/dnspod.mjs update --domain example.com --record-id 123456 --subdomain www --type A --value 1.2.3.4
```

## DNSPod Workflow

1. Confirm the target root domain, subdomain, record type, line, and value.
2. Run `list` first before mutating records. Use `--subdomain`, `--type`, and `--line` to narrow results.
3. Use `upsert` for normal automation. It creates a record when no match exists and updates exactly one matching record.
4. Use `update --record-id` when multiple records share the same name/type/line.
5. Report the returned `RecordId` and `RequestId` after mutations.

## Safety

- Keep credentials in environment variables only. Do not place `DNSPOD_ID` or `DNSPOD_KEY` in files or command history examples with real values.
- Treat `@` as the apex/root host record.
- The default record line is `默认`.
- New records can have a short index delay. If a newly created record is missing from `list`, retry after about 30 seconds.
- Tencent Cloud DNSPod APIs for this skill use host `dnspod.tencentcloudapi.com` and API version `2021-03-23`.

## References

For DNSPod API parameter details, read `references/dnspod-api.md` only when needed. Add future Tencent Cloud service modules as separate scripts and references under this skill.
