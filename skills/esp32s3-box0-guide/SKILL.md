---
name: esp32s3-box0-guide
description: Use when helping users develop, flash, verify, document, or debug ATK-DNESP32S3-BOX0 / BOX0 / ESP32-S3 firmware with ESP-IDF, lcd_demo, xiaozhi-esp32 board parameters, Web Serial device inspection, or a minimal custom BOX0 system. This skill should trigger for BOX0 onboarding, ESP-IDF environment setup, device detection, basic demo flashing, hardware parameter lookup, local espinfo-demo validation, and custom display/button/power examples.
---

# BOX0 Development

Use this skill to help a BOX0 user move from a connected device to an independently verified ESP-IDF development workflow.

## Primary Workflow

1. Check the host development environment (ESP-IDF installed and activated).
2. Provision reference sources if needed (`scripts/provision-refs.sh`).
3. Detect the connected BOX0 through command-line tools.
4. Start the local Web Serial verifier for manual hardware inspection.
5. Build and flash a baseline firmware.
6. Guide a minimal custom system: boot screen, image/text display, button behavior, long-press power handling.

## Source Resolution

The skill resolves code references in this priority order:

1. **Local project** — user's own working copy (if it exists at the conventional path or a custom env var).
2. **Skill cache** — shallow clones under `$SKILL_DIR/.cache/`, provisioned by `scripts/provision-refs.sh`.
3. **GitHub remote** — read files directly via `mcp__zread` tools when only a few files are needed.

### Infrastructure (must be installed to build)

ESP-IDF is the build framework. Without it, no ESP32 project compiles.

Detection order: `$IDF_PATH` → common install paths (`~/.espressif/*/esp-idf`, `~/esp/esp-idf`).
If missing: guide the user through official installation, do NOT attempt to clone as a substitute.

### Reference repositories (read-only knowledge)

| Repository | Purpose | Provision |
|---|---|---|
| [xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) | Board abstraction model, BOX0 config.h, release scripts | `git clone --depth 1` into `.cache/` |
| [esp-idf](https://github.com/espressif/esp-idf) | API headers, examples, component source (read-only) | Optional `git clone --depth 1 --no-recurse-submodules` into `.cache/` |

### Optional local projects

These are the skill author's private repos. When present they are used first; when absent the skill works without them.

| Env var | Default path | Description |
|---|---|---|
| `LCD_DEMO` | `~/esp/lcd_demo` | BOX0 hardware test firmware (private) |
| `ESPINFO_SOURCE` | `~/mycode/espinfo-demo` | Web Serial verifier source (falls back to `assets/espinfo-demo/`) |

## Stage Selection

Read only the reference needed for the current user request:

- Environment setup or first-run checks: `references/environment.md`
- Device connection and command-line verification: `references/device-detection.md`
- Web Serial verification: `references/web-serial-validation.md`
- Baseline build and flashing: `references/flash-and-monitor.md`
- BOX0 GPIO, display, audio, power, TF card parameters: `references/hardware-map.md`
- BOX0 baseline firmware architecture and patterns: `references/baseline-firmware-pattern.md`
- `xiaozhi-esp32` board porting model: `references/xiaozhi-board-porting.md`
- Minimal custom app example: `references/simple-app-example.md`
- CI/CD with GitHub Actions: `references/github-actions-build.md`
- Common failures and recovery: `references/troubleshooting.md`

## Fast Commands

Run from any directory:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/check-env.sh
$SKILL_DIR/scripts/provision-refs.sh
$SKILL_DIR/scripts/detect-box0.sh
$SKILL_DIR/scripts/start-espinfo-demo.sh
$SKILL_DIR/scripts/flash-lcd-demo.sh /dev/cu.usbmodemXXXX
$SKILL_DIR/scripts/collect-device-report.sh /dev/cu.usbmodemXXXX
```

## Expected Baseline

The target device is ATK-DNESP32S3-BOX0:

- Board name: `atk-dnesp32s3-box0`
- ESP-IDF target: `esp32s3`
- Display: 240 x 240 ST7789 over SPI
- Buttons: left `GPIO3`, middle `GPIO4`, right `GPIO0`
- Power hold: `GPIO2`
- LCD pins: SCLK `GPIO39`, MOSI `GPIO40`, DC `GPIO38`, CS `GPIO41`, backlight `GPIO42`
- Standard flash map: bootloader `0x0`, partition table `0x8000`, app `0x10000`

## Working Principles

- Prefer current source files and build artifacts over remembered values.
- Use `build/flasher_args.json` as the flash-map truth for any project.
- Use `main/boards/atk-dnesp32s3-box0/config.h` in xiaozhi-esp32 as the board-parameter source.
- Keep the first successful path small: environment check, device detect, Web Serial identity, baseline flash, monitor logs.
- Use the Web Serial verifier for manual inspection during testing and command-line scripts for repeatable automation.
- Local development uses native ESP-IDF; Docker is only for GitHub Actions CI.
- All scripts use environment variables with auto-detection fallbacks — no path is assumed to exist.
