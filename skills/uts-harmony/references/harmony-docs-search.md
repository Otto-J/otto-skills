# Harmony docs search (local mirror)

Local docs root: `~/Documents/harmony-api-21`

Rules:
- Do NOT use `ls` to explore this folder.
- Use `rg` to locate content, then open with `sed -n` or `rg -n`.

Common search patterns:

- Find files that mention a permission or API:
  - `rg -n "ohos.permission.CAMERA" ~/Documents/harmony-api-21`
  - `rg -n "requestPermissionsFromUser" ~/Documents/harmony-api-21`

- Find a specific module or kit:
  - `rg -n "@kit.AbilityKit" ~/Documents/harmony-api-21`
  - `rg -n "abilityAccessCtrl" ~/Documents/harmony-api-21`

- Open a specific file after search:
  - `sed -n '1,160p' "~/Documents/harmony-api-21/<file>.md"`

