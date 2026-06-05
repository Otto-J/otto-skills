#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${SKILL_DIR}/.cache"

# --- IDF detection ---
find_idf_activate() {
  if [[ -n "${IDF_ACTIVATE:-}" && -f "$IDF_ACTIVATE" ]]; then
    printf '%s' "$IDF_ACTIVATE"
    return 0
  fi
  local candidates=(
    "$HOME/.espressif/tools/activate_idf_v6.0.1.sh"
    "$HOME/.espressif/tools/activate_idf_v5.5.2.sh"
  )
  for c in "${candidates[@]}"; do
    [[ -f "$c" ]] && { printf '%s' "$c"; return 0; }
  done
  local idf="${IDF_PATH:-}"
  for p in "$HOME/.espressif/v6.0.1/esp-idf" "$HOME/.espressif/v5.5.2/esp-idf" "$HOME/esp/esp-idf" "${CACHE_DIR}/esp-idf"; do
    [[ -z "$idf" && -d "$p/tools/cmake" ]] && idf="$p"
  done
  [[ -n "$idf" && -f "$idf/export.sh" ]] && { printf '%s' "$idf/export.sh"; return 0; }
  return 1
}

find_xiaozhi() {
  for c in "${XIAOZHI:-}" "$HOME/mycode/xiaozhi-esp32" "${CACHE_DIR}/xiaozhi-esp32"; do
    [[ -n "$c" && -d "$c/main/boards" ]] && { printf '%s' "$c"; return 0; }
  done
  return 1
}

find_lcd_demo() {
  for c in "${LCD_DEMO:-}" "$HOME/esp/lcd_demo"; do
    [[ -n "$c" && -f "$c/main/main.c" ]] && { printf '%s' "$c"; return 0; }
  done
  return 1
}

print_check() {
  local label="$1"; shift
  printf '\n## %s\n' "$label"
  "$@" || true
}

printf '# BOX0 Environment Check\n'
printf 'date: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')"

# --- ESP-IDF ---
printf '\n## ESP-IDF (infrastructure)\n'
ACTIVATE="$(find_idf_activate 2>/dev/null || true)"
if [[ -n "$ACTIVATE" ]]; then
  printf 'OK   activate script: %s\n' "$ACTIVATE"

  idf_check() {
    local command="$1"
    ACTIVATE="$ACTIVATE" zsh -lc 'source "$ACTIVATE" >/dev/null 2>&1 && eval "$1"' zsh "$command"
  }
  print_check "idf.py version" idf_check "idf.py --version"
  print_check "esp32s3 target" idf_check "idf.py --list-targets 2>/dev/null | grep -x esp32s3"
  print_check "esptool" idf_check "python -m esptool version"
  print_check "cmake" idf_check "cmake --version | head -1"
  print_check "ninja" idf_check "ninja --version"
else
  printf 'MISS ESP-IDF not found.\n'
  printf '     Install: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/get-started/\n'
fi

# --- Reference sources ---
printf '\n## Reference sources\n'
XIAOZHI_FOUND="$(find_xiaozhi 2>/dev/null || true)"
if [[ -n "$XIAOZHI_FOUND" ]]; then
  printf 'OK   xiaozhi-esp32: %s\n' "$XIAOZHI_FOUND"
else
  printf 'MISS xiaozhi-esp32 — run: %s/scripts/provision-refs.sh\n' "$SKILL_DIR"
fi

# --- Optional local projects ---
printf '\n## Optional local projects\n'
LCD_FOUND="$(find_lcd_demo 2>/dev/null || true)"
if [[ -n "$LCD_FOUND" ]]; then
  printf 'OK   lcd_demo: %s\n' "$LCD_FOUND"
else
  printf 'SKIP lcd_demo not found (optional)\n'
fi

ESPINFO="${ESPINFO_SOURCE:-$HOME/mycode/espinfo-demo}"
if [[ -d "$ESPINFO" ]]; then
  printf 'OK   espinfo-demo: %s\n' "$ESPINFO"
else
  printf 'OK   espinfo-demo: using bundled assets/espinfo-demo/\n'
fi

# --- Node (for Web Serial demo) ---
printf '\n## Node.js (for Web Serial demo)\n'
node --version 2>/dev/null || printf 'MISS node not found (optional)\n'
npm --version 2>/dev/null || true
