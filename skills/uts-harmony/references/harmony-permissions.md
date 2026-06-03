# Harmony permissions essentials (from local harmony-api-21 docs)

## Declare permissions in module.json5

- Permissions must be declared under `requestPermissions` in `module.json5`.
- Each entry includes:
  - `name`: required, must be a predefined SDK permission or a custom one under `definePermissions`.
  - `reason`: required for `user_grant`/`manual_settings` permissions; use `$string:...` and define in `string.json`.
  - `usedScene`: required for `user_grant`/`manual_settings`; includes `abilities` and `when`.
    - `when` can be `inuse` or `always`.

## Runtime permission flow

- For `user_grant` permissions:
  - Declare in `module.json5`.
  - At runtime, call `requestPermissionsFromUser()` to trigger the system prompt.
  - Check permission with `checkAccessToken()`; do not persist the previous grant state.
  - If user denies, guide them to settings or use `requestPermissionOnSetting()`.

## UIAbility timing

- `requestPermissionsFromUser()` should be called after `loadContent()`/`setUIContent()` completes,
  otherwise it can fail before content loads.

