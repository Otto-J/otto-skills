# Simple App Example

Use this as the first custom development milestone after baseline flashing.

## Goal

Create a minimal BOX0 app that:

- Boots into a custom screen.
- Shows an icon or bitmap plus text.
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
Middle long press: show "Power Off" and release SYS_POW_PIN / GPIO2
```

## Development Approach

Start from `lcd_demo` and keep the working hardware initialization:

- power hold setup
- LCD SPI panel setup
- LVGL setup
- backlight PWM setup
- button debounce and long-press polling

Then simplify the menu state into a small app state:

```c
typedef enum {
    APP_SCREEN_HOME = 0,
    APP_SCREEN_INFO,
    APP_SCREEN_POWER,
} app_screen_t;
```

Use LVGL labels for the first version. Add bitmap/image display after the text path is stable.

## Validation

After flashing, collect:

```text
serial boot log
photo of screen
left/right/middle click behavior
middle long-press shutdown behavior
```

Run:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/collect-device-report.sh /dev/cu.usbmodemXXXX
```

Attach the report to future debugging work so the next agent has exact environment and device facts.
