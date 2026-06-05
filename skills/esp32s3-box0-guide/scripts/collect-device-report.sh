#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/scripts/_resolve.sh"

OUT_DIR="${OUT_DIR:-$PWD/box0-device-report-$(date +%Y%m%d-%H%M%S)}"
PORT_ARG="${1:-${PORT:-}}"

mkdir -p "$OUT_DIR"

"$SKILL_DIR/scripts/check-env.sh" > "$OUT_DIR/environment.txt"
if "$SKILL_DIR/scripts/detect-box0.sh" "$PORT_ARG" > "$OUT_DIR/device.txt" 2>&1; then
  printf 'device detection: OK\n' > "$OUT_DIR/summary.txt"
else
  printf 'device detection: FAILED\n' > "$OUT_DIR/summary.txt"
fi

# Optional: copy lcd_demo build info if available
LCD_FOUND="$(find_lcd_demo 2>/dev/null || true)"
if [[ -n "$LCD_FOUND" ]]; then
  [[ -f "$LCD_FOUND/build/flasher_args.json" ]] && cp "$LCD_FOUND/build/flasher_args.json" "$OUT_DIR/lcd-demo-flasher_args.json"
  [[ -f "$LCD_FOUND/build/project_description.json" ]] && cp "$LCD_FOUND/build/project_description.json" "$OUT_DIR/lcd-demo-project_description.json"
fi

cat >> "$OUT_DIR/summary.txt" <<EOF
report_dir: $OUT_DIR
web_serial_manual_step:
  run $SKILL_DIR/scripts/start-espinfo-demo.sh
  open http://127.0.0.1:5173 in Chrome or Edge
  copy the JSON result into $OUT_DIR/web-serial-result.json
EOF

printf '%s\n' "$OUT_DIR"
