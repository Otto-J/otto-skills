# Hardware Map

Use current source files as authority:

- `lcd_demo`: `~/esp/lcd_demo/main/main.c`
- `xiaozhi-esp32`: `~/mycode/xiaozhi-esp32/main/boards/atk-dnesp32s3-box0/config.h`

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

`lcd_demo` holds power by setting `SYS_POWER_HOLD` / `GPIO2` high during boot. A long-press power-off example can show a shutdown label, delay briefly, then set `GPIO2` low.

## Buttons

```text
Right  GPIO0
Middle GPIO4
Left   GPIO3
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

## TF Card

`lcd_demo` currently uses SDSPI:

```text
CLK  GPIO16
MOSI GPIO17
MISO GPIO18
CS   GPIO15
```

Use these values as practical `lcd_demo` evidence. For a new firmware branch, verify against the real board and source before baking them into a board package.

