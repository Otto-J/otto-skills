---
name: aliyuncloud
description: Operate Alibaba Cloud from Codex with the official aliyun CLI. Use this skill whenever the user asks to install or authorize Alibaba Cloud CLI, inspect Aliyun ECS or cloud resources, manage Alibaba Cloud services, verify the current Aliyun account/profile/region, troubleshoot aliyun CLI plugins, or turn Alibaba Cloud console/API tasks into command-line workflows.
---

# Aliyun Cloud

Use this skill for Alibaba Cloud operations through the official `aliyun` CLI.

The working style is read-only first: establish the current CLI, profile, plugin, account, and resource state before changing anything. Cloud mutations can affect production infrastructure, billing, DNS, storage, or access, so get explicit user approval for create/update/delete/restart/stop/security-group/credential actions.

## Current local baseline

On Otto's Mac, the Alibaba Cloud CLI was installed through Homebrew and verified:

```bash
which aliyun
aliyun version
aliyun configure list
```

Expected known-good state:

- `aliyun` path: `/opt/homebrew/bin/aliyun`
- CLI version: `3.4.2` or newer
- active profile: `default`
- credential mode: OAuth
- default region: `cn-beijing`
- language: `zh`
- useful installed plugins: `sts`, `ecs`

Treat this as a starting point, not a guarantee. Re-check live state before answering.

## Safety rules

- Prefer OAuth authentication. Use AccessKey only when OAuth is unsuitable, such as a headless server.
- Do not ask the user to paste AccessKey secrets, OAuth tokens, refresh tokens, or passwords into chat.
- Do not print raw secrets from `~/.aliyun/config.json`.
- Redact account IDs, ARNs, instance names, public IPs, EIPs, and token-like values unless the user explicitly asks for exact values and the output is necessary.
- Use read-only commands first: `describe-*`, `get-*`, `list`, `configure list`, `plugin list`.
- Before mutations, state the exact command, target region/resource, and expected effect, then wait for user approval.
- If network access fails, try the user's `proxy` shell alias once before concluding that the network or endpoint is unavailable.

## Install or repair CLI

Check the current installation:

```bash
command -v aliyun || true
aliyun version || true
```

On macOS, prefer Homebrew:

```bash
brew install aliyun-cli
```

If Homebrew metadata is stale, run the exact formula anyway before switching methods:

```bash
brew update
brew install aliyun-cli
```

Fallback installer from Alibaba Cloud:

```bash
/bin/bash -c "$(curl -fsSL https://aliyuncli.alicdn.com/install.sh)"
```

Verify after install:

```bash
which aliyun
aliyun version
```

Version `3.3.0` or newer is required for the modern plugin-based CLI. Prefer the latest stable release.

## Configure OAuth

Use OAuth on local GUI machines:

```bash
aliyun configure --mode OAuth --profile default
```

Flow:

1. Select `CN` for China site unless the user says they use the international site.
2. Open the generated SignIn URL in the browser if the CLI does not open it automatically.
3. Let the user complete login and authorization in the browser.
4. Set default region to the user's actual resource region. For Otto's current ECS host, use `cn-beijing`.
5. Set output format to `json`.
6. Set language to `zh` unless the user asks for English.

Validate the profile:

```bash
aliyun configure list
aliyun sts get-caller-identity
```

If `sts` is missing, install it:

```bash
aliyun plugin install --names sts
```

When reporting validation, include whether the profile is valid, the credential mode, the default region, and the returned `RequestId`. Redact account identity details by default.

## Plugin management

Alibaba Cloud CLI uses service plugins. Install only the plugins needed for the current task.

```bash
aliyun plugin list
aliyun plugin list-remote
aliyun plugin install --names ecs
aliyun plugin install --names sts ecs
```

If a command says a plugin is required, install that plugin and rerun the command.

## ECS read-only inventory

Start with regions:

```bash
aliyun ecs describe-regions --accept-language zh-CN
```

For ECS instances, this plugin requires `--biz-region-id`. The global `--region` selects the endpoint; pass both for clarity:

```bash
aliyun ecs describe-instances --biz-region-id cn-beijing --region cn-beijing
```

If the user does not know the region, scan regions read-only and report a redacted summary:

```bash
node <<'NODE'
const { execFileSync } = require('node:child_process');

function run(args) {
  return JSON.parse(execFileSync('aliyun', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

function maskId(value) {
  const s = String(value || '');
  return s.replace(/^(.{6}).*(.{4})$/, '$1...$2');
}

const regions = run(['ecs', 'describe-regions', '--accept-language', 'zh-CN'])
  .Regions.Region;
const hits = [];

for (const region of regions) {
  try {
    const out = run([
      'ecs',
      'describe-instances',
      '--biz-region-id',
      region.RegionId,
      '--region',
      region.RegionId,
      '--page-size',
      '10',
    ]);
    const list = ((out.Instances || {}).Instance || []);
    if ((out.TotalCount || 0) > 0) {
      hits.push({
        RegionId: region.RegionId,
        LocalName: region.LocalName,
        TotalCount: out.TotalCount,
        Returned: list.length,
        Instances: list.map((x) => ({
          InstanceId: maskId(x.InstanceId),
          InstanceName: x.InstanceName ? '<redacted>' : '',
          Status: x.Status,
          ZoneId: x.ZoneId,
          PublicIpCount: ((x.PublicIpAddress || {}).IpAddress || []).length,
          Eip: x.EipAddress && x.EipAddress.IpAddress ? '<present>' : '',
        })),
      });
    }
  } catch (error) {
    hits.push({
      RegionId: region.RegionId,
      LocalName: region.LocalName,
      Error: String(error.stderr || error.message).split('\n')[0],
    });
  }
}

console.log(JSON.stringify({ scanned: regions.length, hits }, null, 2));
NODE
```

Known current result from initial setup: one running ECS instance was found in `cn-beijing`, zone `cn-beijing-h`. Re-run the scan before relying on that fact.

## Common task patterns

### Check who is logged in

```bash
aliyun configure list
aliyun sts get-caller-identity
```

Report:

- active profile
- credential mode and validity
- default region
- account type when visible, such as root or RAM user, with identifiers redacted
- `RequestId`

### List ECS instances in the known region

```bash
aliyun ecs describe-instances --biz-region-id cn-beijing --region cn-beijing
```

Summarize only:

- region and zone
- count
- status
- instance ID masked
- public IP/EIP presence, redacted by default

### Change default region

Only change the default region after explaining the reason:

```bash
aliyun configure set --profile default --region cn-beijing
aliyun configure list
```

### Inspect command parameters

Use CLI help before guessing parameter names:

```bash
aliyun ecs describe-instances --help
aliyun <service> <command> --help
```

## Reporting format

Lead with the operational result:

- installed or already installed
- authorized or blocked at browser/login/permission step
- profile validity
- plugins installed
- read-only resource findings
- exact next command when useful

Keep raw JSON out of the final answer unless the user asks for it. Preserve `RequestId` values for troubleshooting.

## References

Use official Alibaba Cloud docs when the user asks for current install/auth behavior or a new service workflow:

- CLI quick start: `https://help.aliyun.com/zh/cli/quickly-start-using-alibaba-cloud-cli`
- CLI install/update: `https://help.aliyun.com/zh/cli/install-update-alibaba-cloud-cli`
- CLI plugins: `https://help.aliyun.com/zh/cli/managing-and-using-cli-plugins`
