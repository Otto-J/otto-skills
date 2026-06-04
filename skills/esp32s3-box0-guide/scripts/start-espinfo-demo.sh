#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${ESPINFO_SOURCE:-${HOME}/mycode/espinfo-demo}"
ASSET_DIR="${SKILL_DIR}/assets/espinfo-demo"
PORT="${PORT:-5173}"

if [[ -d "$SOURCE_DIR" ]]; then
  APP_DIR="$SOURCE_DIR"
else
  APP_DIR="$ASSET_DIR"
fi

if [[ ! -f "$APP_DIR/package.json" ]]; then
  printf 'espinfo-demo package.json missing in %s\n' "$APP_DIR" >&2
  exit 2
fi

cd "$APP_DIR"
if [[ ! -d node_modules ]]; then
  npm install
fi

printf 'Starting ESP info Web Serial demo:\n'
printf '  http://127.0.0.1:%s\n' "$PORT"
printf 'Use Chrome or Edge.\n'
exec npm run dev -- --port "$PORT"

