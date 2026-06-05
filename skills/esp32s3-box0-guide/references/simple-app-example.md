# Simple App Example

Use this as the first custom development milestone after verifying the environment.

## Goal

Create a minimal BOX0 app that:

- Boots into a custom screen.
- Shows text on the 240×240 LCD.
- Uses left/right/middle buttons.
- Uses middle long-press for power-off.
- Prints serial logs for each state transition.

## Suggested UI

```text
Title: BOX0 Dev Demo
Main text: HELLO ESP32-S3
Footer: L prev | M enter | R next
```

Button behavior:

```text
Left click: previous message
Right click: next message
Middle click: show selected action
Middle long press: show "Power Off" and release GPIO2
```

## Development Approach

Start from the baseline firmware pattern (see `references/baseline-firmware-pattern.md`):

- power hold setup (GPIO2)
- LCD SPI panel setup (ST7789, 240×240)
- LVGL setup (lvgl_port)
- backlight PWM setup (GPIO42)
- button debounce and long-press polling (GPIO3/4/0)

Then add a simple app state:

```c
typedef enum {
    APP_SCREEN_HOME = 0,
    APP_SCREEN_INFO,
    APP_SCREEN_POWER,
} app_screen_t;
```

Use LVGL labels for the first version. Add bitmap/image display after the text path is stable.

## Validation

After flashing, verify:

```text
- Serial boot log shows "boot menu ready" or similar
- Screen displays text UI
- Left/right clicks cycle content
- Middle long-press triggers shutdown (screen goes dark, device powers off)
```

Optionally collect a device report:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/collect-device-report.sh /dev/cu.usbmodemXXXX
```
