#!/usr/bin/env bash
set -euo pipefail

IDF_ACTIVATE="${IDF_ACTIVATE:-${HOME}/.espressif/tools/activate_idf_v6.0.1.sh}"
IDF_PATH_EXPECTED="${IDF_PATH_EXPECTED:-${HOME}/.espressif/v6.0.1/esp-idf}"
LCD_DEMO="${LCD_DEMO:-${HOME}/esp/lcd_demo}"
XIAOZHI="${XIAOZHI:-${HOME}/mycode/xiaozhi-esp32}"
ESPINFO="${ESPINFO:-${HOME}/mycode/espinfo-demo}"

print_check() {
  local label="$1"
  shift
  printf '\n## %s\n' "$label"
  "$@" || true
}

printf '# BOX0 Environment Check\n'
printf 'date: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')"

printf '\n## Paths\n'
for path in "$IDF_ACTIVATE" "$IDF_PATH_EXPECTED" "$LCD_DEMO" "$XIAOZHI" "$ESPINFO"; do
  if [[ -e "$path" ]]; then
    printf 'OK  %s\n' "$path"
  else
    printf 'MISS %s\n' "$path"
  fi
done

idf_check() {
  local command="$1"
  IDF_ACTIVATE="$IDF_ACTIVATE" zsh -lc 'source "$IDF_ACTIVATE" >/dev/null && eval "$1"' zsh "$command"
}

print_check "ESP-IDF" idf_check "idf.py --version"
print_check "ESP-IDF targets" idf_check "idf.py --list-targets 2>/dev/null | rg '^esp32s3$'"
print_check "esptool" idf_check "python -m esptool version"
print_check "cmake" idf_check "cmake --version"
print_check "ninja" idf_check "ninja --version"
print_check "python" idf_check "python --version"
print_check "node" node --version
print_check "npm" npm --version

printf '\n## lcd_demo project\n'
for path in "$LCD_DEMO/CMakeLists.txt" "$LCD_DEMO/main/CMakeLists.txt" "$LCD_DEMO/main/main.c" "$LCD_DEMO/build/flasher_args.json"; do
  if [[ -e "$path" ]]; then
    printf 'OK  %s\n' "$path"
  else
    printf 'MISS %s\n' "$path"
  fi
done

if [[ -f "$LCD_DEMO/build/project_description.json" ]]; then
  python - "$LCD_DEMO/build/project_description.json" <<'PY'
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
print(f"target: {data.get('target')}")
print(f"project: {data.get('project_name')}")
print(f"idf_path: {data.get('idf_path')}")
PY
fi
