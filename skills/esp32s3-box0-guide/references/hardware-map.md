# Hardware Map

## Source of Truth

Board parameters come from the xiaozhi-esp32 board config:

```text
xiaozhi-esp32/main/boards/atk-dnesp32s3-box0/config.h
```

Resolve via: `$XIAOZHI` env var → `~/mycode/xiaozhi-esp32` → `.cache/xiaozhi-esp32` (after provision).

## Board Identity

```text
Board: ATK-DNESP32S3-BOX0
Board name: atk-dnesp32s3-box0
Target: esp32s3
Display: 240 x 240 ST7789 SPI
```

## Power

```text
SYS_POW_PIN GPIO2
CHG_CTRL_PIN GPIO47
CODEC_PWR_PIN GPIO14
CHRG_PIN GPIO48
BAT_VSEN_PIN GPIO1
```

Power hold: set `GPIO2` high during boot to keep the board powered. Long-press power-off: set `GPIO2` low then enter deep sleep.

## Buttons

```text
Right  GPIO0   (pull-up, active low)
Middle GPIO4   (pull-down, active high)
Left   GPIO3   (pull-up, active low)
```

Suggested UI mapping:

```text
Left: previous or back
Right: next
Middle: confirm or enter
Middle long press: power off
```

## LCD

```text
SCLK GPIO39
MOSI GPIO40
MISO GPIO_NUM_NC
DC   GPIO38
CS   GPIO41
RST  GPIO_NUM_NC
BL   GPIO42
```

Display settings:

```text
width: 240
height: 240
mirror_x: false
mirror_y: false
swap_xy: false
offset_x: 0
offset_y: 0
invert_color: true
swap_bytes: true (for LVGL RGB565)
```

## Audio

```text
sample rate input: 16000
sample rate output: 16000
MCLK GPIO13
WS   GPIO10
BCLK GPIO5
DIN  GPIO6
DOUT GPIO9
I2C SDA GPIO11
I2C SCL GPIO12
speaker GPIO21
codec ES8311
```

## TF Card (SDSPI)

```text
CLK  GPIO16
MOSI GPIO17
MISO GPIO18
CS   GPIO15
```

## Verification

For any new firmware, verify pin assignments against the xiaozhi-esp32 config.h before baking them into code. The values above are verified against the real board.
