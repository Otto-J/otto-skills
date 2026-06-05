# Baseline Firmware Pattern for BOX0

A BOX0 application follows a standard ESP-IDF + LVGL initialization sequence. This document describes the proven pattern independent of any specific project.

## Minimum Viable Firmware Structure

```text
my_app/
├── CMakeLists.txt              # include($ENV{IDF_PATH}/tools/cmake/project.cmake)
├── main/
│   ├── CMakeLists.txt          # idf_component_register(SRCS ... REQUIRES esp_lcd esp_driver_ledc ...)
│   ├── idf_component.yml       # lvgl/lvgl ~9.2, espressif/esp_lvgl_port ~2.6
│   └── main.c
└── sdkconfig.defaults          # CONFIG_IDF_TARGET="esp32s3"
```

## app_main() Initialization Sequence

Every BOX0 firmware should follow these steps in order:

```text
1. nvs_flash_init() — handle NVS_NO_FREE_PAGES by erase+reinit
2. Power hold — GPIO2 output high (keeps board powered)
3. Backlight — LEDC timer + channel on GPIO42, PWM at 5kHz/8bit, duty=255
4. LCD SPI panel — SPI2_HOST, ST7789, 240×240, invert_color=true
5. LVGL init — lvgl_port_init() + lvgl_port_add_disp() with swap_bytes=1
6. Button init — GPIO3/4/0 as input with appropriate pull resistors
7. Build initial UI — lv_label or other widgets
8. Main loop — poll buttons (20ms tick), refresh UI (1s tick)
```

## Key Code Patterns

### Power hold

```c
#define SYS_POWER_HOLD  GPIO_NUM_2

gpio_config_t io_conf = {
    .pin_bit_mask = (1ULL << SYS_POWER_HOLD),
    .mode = GPIO_MODE_OUTPUT,
};
gpio_config(&io_conf);
gpio_set_level(SYS_POWER_HOLD, 1);  // keep power on
```

### Power off (long-press middle button)

```c
gpio_set_level(SYS_POWER_HOLD, 0);
esp_deep_sleep_start();
```

### Backlight PWM

```c
#define LCD_BACKLIGHT  GPIO_NUM_42

ledc_timer_config_t timer = {
    .speed_mode = LEDC_LOW_SPEED_MODE,
    .timer_num = LEDC_TIMER_0,
    .duty_resolution = LEDC_TIMER_8_BIT,
    .freq_hz = 5000,
    .clk_cfg = LEDC_AUTO_CLK,
};
ledc_timer_config(&timer);

ledc_channel_config_t ch = {
    .gpio_num = LCD_BACKLIGHT,
    .speed_mode = LEDC_LOW_SPEED_MODE,
    .channel = LEDC_CHANNEL_0,
    .timer_sel = LEDC_TIMER_0,
    .duty = 255,
};
ledc_channel_config(&ch);
```

### LCD SPI + LVGL

```c
#define LCD_SCLK   GPIO_NUM_39
#define LCD_MOSI   GPIO_NUM_40
#define LCD_DC     GPIO_NUM_38
#define LCD_CS     GPIO_NUM_41
#define LCD_H_RES  240
#define LCD_V_RES  240

// SPI bus → panel IO → ST7789 panel → lvgl_port_add_disp
// Critical settings: invert_color=true, swap_bytes=1, color_format=RGB565
```

### Button polling with debounce and long-press

```c
#define BTN_LEFT    GPIO_NUM_3   // pull-up, active low
#define BTN_MIDDLE  GPIO_NUM_4   // pull-down, active high
#define BTN_RIGHT   GPIO_NUM_0   // pull-up, active low

#define BTN_DEBOUNCE_MS  30
#define BTN_LONG_MS      900
```

Middle button uses pull-down (pressed = level 1). Left and Right use pull-up (pressed = level 0).

### LVGL thread safety

All UI updates must be wrapped:

```c
if (lvgl_port_lock(0)) {
    lv_label_set_text(label, "Hello");
    lvgl_port_unlock();
}
```

## Component Dependencies

Typical `REQUIRES` in main/CMakeLists.txt:

```text
esp_lcd esp_driver_ledc esp_event esp_wifi esp_netif nvs_flash
```

Typical `idf_component.yml`:

```yaml
dependencies:
  idf:
    version: ">=5.0.0"
  lvgl/lvgl: "~9.2"
  espressif/esp_lvgl_port: "~2.6"
```

## Flash Map

Standard BOX0 flash layout:

```text
bootloader:      0x0
partition table: 0x8000
app:             0x10000
```

Verify from any project's `build/flasher_args.json` after building.

## Optional: lcd_demo (author's private reference)

If available at `$LCD_DEMO` or `~/esp/lcd_demo`, it provides a complete working example of this pattern with additional hardware tests (WiFi scan, TF card, audio, battery ADC). It also includes a web simulator at `server/` for previewing UI without hardware.
