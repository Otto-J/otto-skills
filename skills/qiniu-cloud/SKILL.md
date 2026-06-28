---
name: qiniu-cloud
description: Operate Qiniu Cloud account resources from Codex. Use this skill whenever the user mentions 七牛云, Qiniu, Kodo/OSS buckets, CDN domains, HTTPS/SSL certificates, CDN refresh, or account inventory, especially when they ask to list, inspect, audit, or manage Qiniu resources.
---

# Qiniu Cloud

Use this skill for Qiniu account operations that should run from the user's local machine with their own credentials.

## Safety

- Treat `QINIU_SK` and `qiniu_sk` as secrets. Read credentials from the shell environment, local password manager output, or an existing private `.env.local`; avoid printing them.
- Keep generated inventories local unless the user asks to publish or commit them.
- Prefer read-only inventory commands before any mutation such as upload, delete, refresh, certificate upload, or domain changes.

## Credentials

Expected environment variables:

```bash
export QINIU_AK="..."
export QINIU_SK="..."
```

Lowercase `qiniu_ak` and `qiniu_sk` are also accepted.

The current bundled inventory script prints a masked access key in the report and never prints the secret key.

## Inventory Workflow

For account inventory, run the bundled script:

```bash
cd /Users/otto/.codex/skills/qiniu-cloud/scripts
pnpm install
pnpm run inventory
```

Use options when needed:

```bash
QINIU_INCLUDE_BUCKET_DOMAINS=1 pnpm run inventory
QINIU_INCLUDE_CDN_DETAILS=1 pnpm run inventory
QINIU_INVENTORY_OUTPUT=/tmp/qiniu-inventory.json pnpm run inventory
QINIU_TIMEOUT_MS=30000 pnpm run inventory
QINIU_DEBUG=1 pnpm run inventory
QINIU_SKIP_CDN=1 QINIU_SKIP_CERTS=1 pnpm run inventory
```

Report these sections back to the user:

- `buckets`: Kodo bucket names, with bucket-bound domains when requested.
- `cdnDomains`: CDN accelerated domains from `GET https://api.qiniu.com/domain`.
- `httpsCertificates`: HTTPS certificate metadata from `GET https://fusion.qiniuapi.com/sslcert`.

## Implementation Notes

- Kodo bucket listing uses the official Node SDK `BucketManager.listBucket`.
- CDN domain management APIs use `api.qiniu.com` with explicit Qiniu request signing; GET requests omit `Content-Type` in the signature.
- Certificate management APIs use `fusion.qiniuapi.com` with QBox path signing.
- The API families use different auth schemes, so keep the inventory script's request helpers separate.
