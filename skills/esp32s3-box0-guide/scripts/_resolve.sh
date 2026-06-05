#!/usr/bin/env bash
# Shared resolution functions for BOX0 skill scripts.
# Source this file, do not execute directly.

_SKILL_DIR="${_SKILL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
_CACHE_DIR="${_SKILL_DIR}/.cache"

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
  # Fallback: find IDF and use its export.sh
  local idf="${IDF_PATH:-}"
  if [[ -z "$idf" ]]; then
    for p in "$HOME/.espressif/v6.0.1/esp-idf" "$HOME/.espressif/v5.5.2/esp-idf" "$HOME/esp/esp-idf" "${_CACHE_DIR}/esp-idf"; do
      [[ -d "$p/tools/cmake" ]] && { idf="$p"; break; }
    done
  fi
  [[ -n "$idf" && -f "$idf/export.sh" ]] && { printf '%s' "$idf/export.sh"; return 0; }
  return 1
}

find_xiaozhi() {
  for c in "${XIAOZHI:-}" "$HOME/mycode/xiaozhi-esp32" "${_CACHE_DIR}/xiaozhi-esp32"; do
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
