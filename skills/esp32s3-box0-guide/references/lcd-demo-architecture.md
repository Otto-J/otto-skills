# lcd_demo Architecture

`~/esp/lcd_demo` is the baseline BOX0 hardware test firmware.

## Purpose

It proves the board can boot a custom ESP-IDF app and exercise hardware surfaces:

- LCD and LVGL rendering
- Backlight PWM
- Three physical buttons
- Power hold
- WiFi setup flow
- TF card mount/read/write
- Battery ADC
- Audio smoke path
- Cola Link protocol and PTT paths

## Key Files

```text
CMakeLists.txt
main/CMakeLists.txt
main/main.c
main/app_network.c
main/audio_smoke.c
main/cola_link.c
scripts/box0-ptt-hw-verify.sh
build/flasher_args.json
```

## Main App Pattern

`main/main.c` follows this shape:

1. Define BOX0 GPIO constants.
2. Initialize power hold.
3. Initialize LCD SPI panel.
4. Initialize LVGL display.
5. Initialize buttons and debounce/long-press state.
6. Build a menu-driven hardware test UI.
7. Enter task loop and update UI from hardware/business state.

Use this file as the first reference for a custom display/button/power demo.

## Web Simulator

The repo also includes a local simulator under `server/`:

```bash
cd ~/esp/lcd_demo
npm --prefix server install
npm --prefix server run dev
```

Open:

```text
http://127.0.0.1:8787/simulator
```

The simulator mirrors screen layout, button semantics, WebSocket protocol, PTT scenarios, and hardware-facing acceptance plans. Use it before porting larger business logic into firmware.

