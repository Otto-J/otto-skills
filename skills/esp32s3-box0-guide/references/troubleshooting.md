# Troubleshooting

## `idf.py` Missing

ESP-IDF needs to be activated for the current shell. The scripts auto-detect the activation path, but manually:

```bash
# If installed via eim:
source ~/.espressif/tools/activate_idf_v6.0.1.sh

# If installed manually:
. ~/esp/esp-idf/export.sh

# Verify:
idf.py --version
```

## Serial Port Missing

Check the USB cable and port:

```bash
ls /dev/cu.usbmodem* /dev/cu.usbserial* 2>/dev/null
```

Use a data-capable cable. Put the device into ROM download mode if `esptool` cannot connect (BOOT + RESET sequence).

## Web Serial Fails

Use Chrome or Edge and open the page from `localhost` or `127.0.0.1`:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/start-espinfo-demo.sh
```

## Flash Succeeds But App Fails To Boot

Check your project's flash arguments:

```bash
cat build/flasher_args.json
```

Expected settings for BOX0: flash mode `dio`, size `16MB`, freq `80m`.

## Build Is Slow

For small code-only changes in an existing build:

```bash
cmake --build build -- -j$(nproc)
```

Use full `idf.py build` after target, partition, sdkconfig, or component changes.

## GitHub Actions Build Fails

Check the IDF image version matches your project's requirements. See `references/github-actions-build.md`.

## ESP-IDF Not Found By Scripts

Scripts search in this order:
1. `$IDF_PATH` environment variable
2. `$IDF_ACTIVATE` environment variable
3. `~/.espressif/tools/activate_idf_v6.0.1.sh`
4. `~/.espressif/tools/activate_idf_v5.5.2.sh`
5. `$IDF_PATH/export.sh` (if IDF_PATH is found at common locations)

Set `IDF_ACTIVATE` explicitly if your setup is non-standard.
