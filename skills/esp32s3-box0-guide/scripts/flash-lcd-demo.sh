#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${LCD_DEMO:-${HOME}/esp/lcd_demo}"
IDF_ACTIVATE="${IDF_ACTIVATE:-${HOME}/.espressif/tools/activate_idf_v6.0.1.sh}"
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
IDF_ACTIVATE="$IDF_ACTIVATE" DEVICE_PORT="$DEVICE_PORT" \
  zsh -lc 'source "$IDF_ACTIVATE" >/dev/null && idf.py set-target esp32s3 && idf.py build && idf.py -p "$DEVICE_PORT" flash monitor'
