---
name: esp32s3-box0-guide
description: Use when helping users develop, flash, verify, document, or debug ATK-DNESP32S3-BOX0 / BOX0 / ESP32-S3 firmware with ESP-IDF, lcd_demo, xiaozhi-esp32 board parameters, Web Serial device inspection, or a minimal custom BOX0 system. This skill should trigger for BOX0 onboarding, ESP-IDF environment setup, device detection, basic demo flashing, hardware parameter lookup, local espinfo-demo validation, and custom display/button/power examples.
---

# BOX0 Development

Use this skill to help a BOX0 user move from a connected device to an independently verified ESP-IDF development workflow.

## Primary Workflow

1. Check the host development environment.
2. Detect the connected BOX0 through command-line tools.
3. Start the local Web Serial verifier for manual hardware inspection.
4. Build and flash the baseline `lcd_demo` firmware.
5. Guide a minimal custom system: boot screen, image/text display, button behavior, long-press power handling.
6. Use `lcd_demo` and `xiaozhi-esp32` as source references for board parameters, architecture, and hardware practice.

## Source Roots

Use these local paths first when they exist:

- BOX0 hardware test firmware: `~/esp/lcd_demo`
- XiaoZhi ESP32 firmware: `~/mycode/xiaozhi-esp32`
- Web Serial device info demo: `~/mycode/espinfo-demo`
- ESP-IDF: `~/.espressif/v6.0.1/esp-idf`
- ESP-IDF activation script: `~/.espressif/tools/activate_idf_v6.0.1.sh`
- Obsidian notes: `~/mynote/obsidian-note`

## Stage Selection

Read only the reference needed for the current user request:

- Environment setup or first-run checks: `references/environment.md`
- Device connection and command-line verification: `references/device-detection.md`
- Web Serial verification: `references/web-serial-validation.md`
- Baseline build and flashing: `references/flash-and-monitor.md`
- BOX0 GPIO, display, audio, power, TF card parameters: `references/hardware-map.md`
- `lcd_demo` architecture and firmware practice: `references/lcd-demo-architecture.md`
- `xiaozhi-esp32` board porting model: `references/xiaozhi-board-porting.md`
- Minimal custom app example: `references/simple-app-example.md`
- Common failures and recovery: `references/troubleshooting.md`

## Fast Commands

Run from any directory:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/check-env.sh
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
- `lcd_demo` flash map: bootloader `0x0`, partition table `0x8000`, app `0x10000`

## Working Principles

- Prefer current source files and build artifacts over remembered values.
- Treat `build/flasher_args.json` as the flash-map source for `lcd_demo`.
- Treat `main/boards/atk-dnesp32s3-box0/config.h` as the board-parameter source for `xiaozhi-esp32`.
- Keep the first successful path small: environment check, device detect, Web Serial identity, baseline flash, monitor logs.
- Use the Web Serial verifier for manual inspection during testing and command-line scripts for repeatable automation.
- For network download or Docker registry conflicts, run the command through the user's `proxy` shell alias.
