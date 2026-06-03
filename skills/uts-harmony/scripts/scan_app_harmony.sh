#!/usr/bin/env bash
set -euo pipefail

root="${1:-.}"

if ! command -v rg >/dev/null 2>&1; then
  echo "rg not found" >&2
  exit 1
fi

files=$(rg --files -g 'uni_modules/**/app-harmony/**' "$root" || true)
if [[ -z "$files" ]]; then
  echo "No app-harmony files found under $root" >&2
  exit 0
fi

# list plugins
plugins=$(printf "%s\n" "$files" | sed 's|^.*uni_modules/||' | cut -d/ -f1 | sort -u)

printf "Plugins with app-harmony (count=%s):\n" "$(printf "%s\n" "$plugins" | sed '/^$/d' | wc -l | tr -d ' ')"
printf "%s\n" "$plugins"

# summary counts
printf "\nFile summary:\n"

count_total=$(printf "%s\n" "$files" | sed '/^$/d' | wc -l | tr -d ' ')
count_index_uts=$(printf "%s\n" "$files" | rg -c 'app-harmony/index\.uts$' || true)
count_config=$(printf "%s\n" "$files" | rg -c 'app-harmony/config\.json$' || true)
count_module=$(printf "%s\n" "$files" | rg -c 'app-harmony/module\.json5$' || true)
count_ets=$(printf "%s\n" "$files" | rg -c '\.ets$' || true)

printf "- total files: %s\n" "$count_total"
printf "- index.uts: %s\n" "$count_index_uts"
printf "- config.json: %s\n" "$count_config"
printf "- module.json5: %s\n" "$count_module"
printf "- .ets files: %s\n" "$count_ets"

