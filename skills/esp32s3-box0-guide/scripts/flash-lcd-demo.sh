#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/scripts/_resolve.sh"

ACTIVATE="$(find_idf_activate)" || { printf 'ERROR: ESP-IDF not found. Run check-env.sh for details.\n' >&2; exit 1; }
ROOT_DIR="$(find_lcd_demo)" || { printf 'ERROR: lcd_demo not found. Set LCD_DEMO=/path/to/lcd_demo or place it at ~/esp/lcd_demo.\n' >&2; exit 1; }
PORT_ARG="${1:-${PORT:-}}"

find_port() {
  if [[ -n "$PORT_ARG" ]]; then
    printf '%s\n' "$PORT_ARG"
    return 0
  fi
  local match
  match="$(compgen -G '/dev/cu.usbmodem*' | head -n 1 || true)"
  if [[ -n "$match" ]]; then
    printf '%s\n' "$match"
    return 0
  fi
  match="$(compgen -G '/dev/cu.usbserial*' | head -n 1 || true)"
  if [[ -n "$match" ]]; then
    printf '%s\n' "$match"
    return 0
  fi
  return 1
}

DEVICE_PORT="$(find_port || true)"
if [[ -z "$DEVICE_PORT" ]]; then
  printf 'USB serial port not found. Pass /dev/cu.usbmodemXXXX.\n' >&2
  exit 2
fi

cd "$ROOT_DIR"
ACTIVATE="$ACTIVATE" DEVICE_PORT="$DEVICE_PORT" \
  zsh -lc 'source "$ACTIVATE" >/dev/null 2>&1 && idf.py set-target esp32s3 && idf.py build && idf.py -p "$DEVICE_PORT" flash monitor'
