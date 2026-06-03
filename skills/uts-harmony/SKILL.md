---
name: uts-harmony
description: Build and maintain uni-app UTS plugins targeting HarmonyOS (鸿蒙) under `uni_modules/**/utssdk/app-harmony`. Use when creating or modifying Harmony-side UTS/ETS code, configuring `module.json5` permissions, adding `app-harmony/config.json` dependencies (npm or .har), exporting APIs in `index.uts`, or when you must consult the local Harmony docs mirror at `~/Documents/harmony-api-21`.
---

# UTS Harmony

## Overview

Implement a consistent, reusable workflow for uni-app UTS Harmony plugins: structure `app-harmony/`, wire exports in `index.uts`, declare dependencies and permissions, and cross-check with Harmony API docs using `rg`.

## Response template (required)

- Always follow the stable response structure in `references/uts-harmony-response-template.md`.
- Always include a ready-to-paste `index.vue` example in README.
- Always use module-level import in README examples: `import { ... } from '@/uni_modules/<plugin-id>'`.
- If permissions are required, add the README note and HBuilderX path snippet from `references/uts-harmony-response-template.md`.

## Workflow

### 1) Locate or create the Harmony entry

- Use `uni_modules/<plugin>/utssdk/app-harmony/index.uts` as the Harmony entry.
- Re-export public types from `../interface.uts` and re-export platform implementations from local submodules.
- If using `.ets` components, import them for registration side effects.

Reference: `references/uniapp-uts-harmony-patterns.md`

### 2) Add dependencies (Harmony side)

- Declare Harmony dependencies in `app-harmony/config.json`.
  - npm packages: `"@vendor/pkg": "x.y.z"`
  - local HAR: `"name": "./libs/lib.har"`

Reference: `references/uniapp-uts-harmony-patterns.md`

### 3) Declare permissions (if needed)

- Add `app-harmony/module.json5` with `requestPermissions` entries.
- For `user_grant`/`manual_settings`, include `reason` and `usedScene` fields.
- Keep permission reasons in `string.json` and reference via `$string:...`.

Reference: `references/harmony-permissions.md`

### 4) Implement runtime permission flow (if needed)

- Use `checkAccessToken()` before calling APIs.
- Trigger permission prompts via `requestPermissionsFromUser()`.
- Do not persist permission state; users can revoke it later.
- Call `requestPermissionsFromUser()` only after `loadContent()`/`setUIContent()` completes.

Reference: `references/harmony-permissions.md`

### 5) Validate against Harmony docs (local mirror)

- Do NOT use `ls` under `~/Documents/harmony-api-21`.
- Use `rg` to find the right doc, then open with `sed -n`.

Reference: `references/harmony-docs-search.md`

## Output requirements

- For every new plugin or update, ensure `readme.md` contains the `index.vue` example from the response template.
- Do not use deep import paths in README examples (avoid `utssdk/...` in import paths).
- In interface types, keep `errCode` as `number` (not a narrower union). Harmony + UTS require strong type consistency; avoid narrower error-code unions that break generated code.

## Common tasks

### Add a new Harmony permission

1. Edit or create `app-harmony/module.json5`.
2. Add `requestPermissions` entry (with `reason`/`usedScene` as required).
3. Add `string.json` entries for permission reasons.
4. Add runtime calls to `requestPermissionsFromUser()`.

### Add a Harmony native UI component (ETS)

1. Implement `*.ets` in `app-harmony/`.
2. Register via ArkUI or `defineNativeEmbed()`.
3. `import './your_component.ets'` in `index.uts` for side-effect registration.

### Add a Harmony dependency

1. Update `app-harmony/config.json` dependencies.
2. If `.har`, place it under `app-harmony/libs/` and reference the relative path.

## Resources

### scripts/

- `scan_app_harmony.sh`: list plugins and summarize `app-harmony` structure in a repo.
  - Usage: `scripts/scan_app_harmony.sh /path/to/repo`

### references/

- `uniapp-uts-harmony-patterns.md`: patterns derived from local repo plugins.
- `harmony-permissions.md`: permission declaration + runtime flow notes.
- `harmony-docs-search.md`: how to search the local Harmony docs mirror via `rg`.
