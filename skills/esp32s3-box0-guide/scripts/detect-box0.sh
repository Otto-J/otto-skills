#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/scripts/_resolve.sh"

ACTIVATE="$(find_idf_activate)" || { printf 'ERROR: ESP-IDF not found. Run check-env.sh for details.\n' >&2; exit 1; }
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
ACTIVATE="$ACTIVATE" DEVICE_PORT="$DEVICE_PORT" \
  zsh -lc 'source "$ACTIVATE" >/dev/null 2>&1 && python -m esptool --chip esp32s3 -p "$DEVICE_PORT" chip_id'

printf '\n## flash_id\n'
ACTIVATE="$ACTIVATE" DEVICE_PORT="$DEVICE_PORT" \
  zsh -lc 'source "$ACTIVATE" >/dev/null 2>&1 && python -m esptool --chip esp32s3 -p "$DEVICE_PORT" flash_id'
