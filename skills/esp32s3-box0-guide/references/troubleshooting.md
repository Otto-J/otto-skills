# Troubleshooting

## `idf.py` Missing

Activate ESP-IDF:

```bash
source ~/.espressif/tools/activate_idf_v6.0.1.sh
```

Then retry:

```bash
idf.py --version
```

## Serial Port Missing

Check the USB cable and port:

```bash
ls /dev/cu.usbmodem* /dev/cu.usbserial* 2>/dev/null
```

Use a data-capable cable. Put the device into ROM download mode if `esptool` cannot connect.

## Web Serial Fails

Use Chrome or Edge and open the page from `localhost` or `127.0.0.1`.

Run:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/start-espinfo-demo.sh
```

Then open the printed local URL.

## Flash Succeeds And App Fails To Boot

Check the repo's current flash arguments:

```bash
cat ~/esp/lcd_demo/build/flasher_args.json
```

For `lcd_demo`, current expected settings are `dio`, `16MB`, `80m`. For `xiaozhi-esp32` merged binaries, use the build's own flash parameters.

## Build Is Slow

For small code-only changes in an existing build directory:

```bash
cmake --build build -- -j1
idf.py merge-bin
```

Use full `idf.py build` after target, partition, sdkconfig, or component changes.

## Docker Network Conflict

Use the user's shell alias:

```bash
zsh -ic 'proxy; docker pull espressif/idf:v5.5.2'
```
