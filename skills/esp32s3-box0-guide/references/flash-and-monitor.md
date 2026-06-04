# Flash And Monitor

Use `lcd_demo` as the baseline firmware for BOX0 hardware validation.

## Build

```bash
cd ~/esp/lcd_demo
source ~/.espressif/tools/activate_idf_v6.0.1.sh
idf.py set-target esp32s3
idf.py build
```

## Flash

```bash
cd ~/esp/lcd_demo
source ~/.espressif/tools/activate_idf_v6.0.1.sh
idf.py -p /dev/cu.usbmodemXXXX flash monitor
```

One-command helper:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/flash-lcd-demo.sh /dev/cu.usbmodemXXXX
```

## Flash Map

For `lcd_demo`, read the current truth from:

```text
~/esp/lcd_demo/build/flasher_args.json
```

Known current map:

```text
chip: esp32s3
flash mode: dio
flash size: 16MB
flash freq: 80m
bootloader: 0x0 build/bootloader/bootloader.bin
partition table: 0x8000 build/partition_table/partition-table.bin
app: 0x10000 build/lcd_demo.bin
```

Manual `esptool` equivalent:

```bash
cd ~/esp/lcd_demo/build
python -m esptool \
  --chip esp32s3 \
  -p /dev/cu.usbmodemXXXX \
  -b 460800 \
  --before default-reset \
  --after hard-reset \
  write_flash \
  --flash-mode dio \
  --flash-size 16MB \
  --flash-freq 80m \
  0x0 bootloader/bootloader.bin \
  0x8000 partition_table/partition-table.bin \
  0x10000 lcd_demo.bin
```

## Monitor Evidence

Run:

```bash
idf.py -p /dev/cu.usbmodemXXXX monitor
```

Useful evidence:

- Boot reaches the application.
- Screen shows the hardware test menu.
- Button presses appear on screen or serial.
- WiFi setup, TF card, audio smoke, or Cola Link test pages can be entered.
