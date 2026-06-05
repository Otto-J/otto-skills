# Flash And Monitor

## Build Any BOX0 Project

With ESP-IDF activated:

```bash
cd /path/to/your-project
idf.py set-target esp32s3
idf.py build
```

## Flash And Monitor

```bash
idf.py -p /dev/cu.usbmodemXXXX flash monitor
```

## Flash Map

Standard BOX0 flash layout:

```text
chip: esp32s3
flash mode: dio
flash size: 16MB
flash freq: 80m
bootloader: 0x0
partition table: 0x8000
app: 0x10000
```

Always verify from `build/flasher_args.json` after building.

## Manual esptool Flash

```bash
cd /path/to/project/build
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
  0x10000 your_app.bin
```

## Flash lcd_demo (optional helper)

If `lcd_demo` is available locally:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/flash-lcd-demo.sh /dev/cu.usbmodemXXXX
```

## Monitor Evidence

Run:

```bash
idf.py -p /dev/cu.usbmodemXXXX monitor
```

Useful evidence:

- Boot reaches the application.
- Screen shows UI.
- Button presses appear on serial.
- WiFi/network events logged.
