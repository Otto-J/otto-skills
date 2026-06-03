# uni-app UTS Harmony patterns (repo-derived)

## Typical folder layout

- `uni_modules/<plugin>/utssdk/app-harmony/`
  - `index.uts` is the Harmony entry point.
  - `config.json` declares Harmony-side dependencies (npm packages or local `.har`).
  - `module.json5` declares permissions when needed.
  - `resources/base/...` contains `element` and `media` resources.
  - Optional subfolders (e.g., `network/`, `tool/`, `location/`) host implementation files.
  - Optional `.ets` files register UI components or native embeds.

## Common entry patterns in `index.uts`

- Re-export types/interfaces from `../interface.uts`.
- Re-export platform-specific implementations from local submodules.
- Import side-effect `.ets` files to register components.

## Dependencies and permissions

- `config.json` is used to add Harmony dependencies, e.g.:
  - npm packages: `@tencent/wechat_open_sdk`, `@amap/*`
  - local HAR: `./libs/*.har`
- `module.json5` (when present) declares `requestPermissions`.

## UI/native embed patterns (ETS)

- `.ets` files can define ArkUI components and register native embeds.
- `index.uts` often `import './xxx.ets'` to register and expose the component.

## Permission request patterns

- Runtime permission prompts are often wrapped by UTS helper APIs (example usage observed: `UTSHarmony.requestSystemPermission`).

## Optional Harmony module projects

- Some plugins embed a full Harmony module (e.g., `hvigorfile.ts`, `oh-package.json5`, `Index.ets`) under `app-harmony/components/`.

