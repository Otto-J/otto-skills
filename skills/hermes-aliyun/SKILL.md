---
name: hermes-aliyun
description: Operate or diagnose the Hermes Agent deployment on the user's Aliyun host through the local `ssh aliyun` alias. Use for Hermes container status, logs, profiles, gateways, Weixin or Feishu channels, pairing, skills, and safe configuration workflows on that host.
---

# Hermes on Aliyun

Use the local `ssh aliyun` alias to reach the production host. Treat it as a privileged production connection.

## Safety boundary

- Start with read-only checks: container state, process UID, mounts, file ownership, logs, and configuration presence.
- Require explicit user authorization before changing configuration, permissions, files, services, containers, gateways, pairing grants, or remote skills.
- State the exact path, service, or container before a mutation. Keep the change scoped to the requested Hermes profile or channel.
- Do not print, copy, or persist API keys, channel credentials, pairing codes, account identifiers, or `.env` values. Redact them from command output and reports.
- Preserve unrelated work on the host and in the local `otto-skills` repository.

## Identify the runtime

From the local Mac, confirm the target and service before operating:

```bash
ssh aliyun 'sudo docker ps --filter name=hermes --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
ssh aliyun 'sudo docker inspect -f "{{.State.Status}}" hermes'
```

The Hermes container uses `/opt/data` as persistent state. Its Gateway, Dashboard, and supervised child processes run as UID/GID `10000:10000` (`hermes`), even though Docker inspection can show the container configured as root.

## Enter the container for Hermes configuration

Run this from the local Mac whenever a user has authorized an interactive Hermes configuration task:

```bash
ssh -t aliyun 'sudo docker exec -it \
  -u 10000:10000 \
  -w /opt/hermes \
  hermes /bin/bash'
```

Inside that shell, configure a channel or gateway with:

```bash
hermes gateway setup
```

Run profile creation, `setup`, `chat`, gateway configuration, and pairing commands as UID 10000. This keeps profiles, sessions, memories, channel state, and logs writable by the supervised Gateway.

Use root only for host-level inspection or an explicitly authorized ownership repair. A plain `sudo docker exec hermes ...` runs as root and can create state that later blocks the Gateway.

## Read-only diagnostics

Use narrow commands and redact sensitive output:

```bash
ssh aliyun 'sudo docker logs --tail 200 hermes 2>&1'
ssh aliyun 'sudo docker top hermes'
ssh aliyun 'sudo docker exec hermes stat -c "%A %a %U:%G %u:%g %n" /opt/data'
ssh aliyun 'sudo docker exec hermes find /opt/data/profiles -maxdepth 2 -type d -printf "%M %u:%g %p\\n"'
```

For a permission failure, compare the effective Gateway process UID with the owner and mode of the exact data directory. Check bind mounts before changing ownership.

## Profiles and isolated family accounts

A Hermes profile stores its state under `/opt/data/profiles/<profile>/`. A profile separates Hermes sessions, memories, configuration, skills, SOUL, and channel state at the application-data level.

Create and configure profiles as UID 10000. Give a family profile its own messaging bot credentials and its own supervised Gateway service. A shared provider API key shares provider billing and quota; profile data remains separate. Separate containers and data mounts provide a stronger host-level privacy boundary.

## Pairing behavior

Treat the pairing code delivered by a channel as the approval input. Pairing codes are one-time, eight-character values and expire after one hour.

The Hermes `2026.7.7` dashboard lists a masked hash prefix for pending requests. That value differs from the original channel code and should not be submitted as an approval code. Use the original code through the CLI after explicit authorization:

```bash
hermes pairing approve weixin <channel-provided-code>
```

Refresh the dashboard after a CLI approval because this dashboard view only loads pairing state when the page opens or when an action originates from the page.

## Execution context

Use `ssh aliyun` only from the local Mac or another machine that defines that alias. Inside the Hermes container, operate Hermes commands directly; container lifecycle and host Docker actions require the host connection.

## Remote skill deployment

The Hermes container reads global custom skills from the persistent `/opt/data/skills/` directory. When the user explicitly requests deployment, copy the complete skill folder to the corresponding host data-volume path and ensure UID/GID `10000:10000` owns it. Verify the deployed `SKILL.md` checksum and ownership. Do not restart the container solely to copy a skill unless the user asks for a restart or live reload requires it.
