# Device Detection

This stage proves that the connected board is reachable from the host and exposes an ESP32-S3 bootloader.

## Find Serial Port

On macOS:

```bash
ls /dev/cu.usbmodem* /dev/cu.usbserial* 2>/dev/null
```

Common BOX0 ports:

```text
/dev/cu.usbmodemXXXX
/dev/cu.usbserial-XXXX
```

Run the helper:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/detect-box0.sh
```

Pass a specific port:

```bash
$SKILL_DIR/scripts/detect-box0.sh /dev/cu.usbmodemXXXX
```

## Read Chip Identity

```bash
source ~/.espressif/tools/activate_idf_v6.0.1.sh
python -m esptool --chip esp32s3 -p /dev/cu.usbmodemXXXX chip_id
python -m esptool --chip esp32s3 -p /dev/cu.usbmodemXXXX flash_id
```

Expected evidence:

- The chip connects without reset-loop errors.
- The detected target is ESP32-S3.
- Flash ID is readable.
- Serial port remains stable enough for `idf.py monitor`.

## Bootloader Mode

For Web Serial and some `esptool` operations, the board may need ROM download mode:

1. Hold BOOT.
2. Press and release RESET.
3. Release BOOT.
4. Retry `detect-box0.sh`.
