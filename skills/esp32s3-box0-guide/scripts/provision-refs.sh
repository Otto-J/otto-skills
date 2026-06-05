#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${SKILL_DIR}/.cache"

mkdir -p "$CACHE_DIR"

clone_if_missing() {
  local name="$1" url="$2"
  shift 2
  local dest="${CACHE_DIR}/${name}"
  if [[ -d "$dest/.git" ]]; then
    printf 'Already cached: %s\n' "$dest"
    return 0
  fi
  printf 'Cloning %s → %s\n' "$url" "$dest"
  git clone --depth 1 "$@" "$url" "$dest"
  printf 'Done: %s\n\n' "$name"
}

printf '# Provision Reference Sources\n\n'

# xiaozhi-esp32: board abstraction model + BOX0 config.h
clone_if_missing "xiaozhi-esp32" "https://github.com/78/xiaozhi-esp32.git"

# esp-idf: API headers and examples (read-only, not for building)
if [[ "${1:-}" == "--with-idf" ]]; then
  clone_if_missing "esp-idf" "https://github.com/espressif/esp-idf.git" --no-recurse-submodules
else
  printf 'Skipping esp-idf (pass --with-idf to include, ~80-100MB read-only clone).\n'
  printf 'For building, install ESP-IDF via official docs: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/get-started/\n\n'
fi

printf '\n## Cache contents\n'
du -sh "$CACHE_DIR"/* 2>/dev/null || printf '(empty)\n'
