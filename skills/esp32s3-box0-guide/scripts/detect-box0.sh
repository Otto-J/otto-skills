#!/usr/bin/env bash
set -euo pipefail

IDF_ACTIVATE="${IDF_ACTIVATE:-${HOME}/.espressif/tools/activate_idf_v6.0.1.sh}"
PORT="${1:-${PORT:-}}"

find_port() {
  if [[ -n "$PORT" ]]; then
    printf '%s\n' "$PORT"
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

printf '# BOX0 Device Detection\n'
printf 'date: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')"

printf '\n## Candidate ports\n'
ls /dev/cu.usbmodem* /dev/cu.usbserial* 2>/dev/null || true

DEVICE_PORT="$(find_port || true)"
if [[ -z "$DEVICE_PORT" ]]; then
  printf '\nNo serial port found. Connect BOX0 or pass PORT=/dev/cu.usbmodemXXXX.\n' >&2
  exit 2
fi

printf '\n## Selected port\n%s\n' "$DEVICE_PORT"

printf '\n## chip_id\n'
IDF_ACTIVATE="$IDF_ACTIVATE" DEVICE_PORT="$DEVICE_PORT" \
  zsh -lc 'source "$IDF_ACTIVATE" >/dev/null && python -m esptool --chip esp32s3 -p "$DEVICE_PORT" chip_id'

printf '\n## flash_id\n'
IDF_ACTIVATE="$IDF_ACTIVATE" DEVICE_PORT="$DEVICE_PORT" \
  zsh -lc 'source "$IDF_ACTIVATE" >/dev/null && python -m esptool --chip esp32s3 -p "$DEVICE_PORT" flash_id'
