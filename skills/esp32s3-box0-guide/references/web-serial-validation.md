# Web Serial Validation

Use the Web Serial page for manual hardware inspection during testing. It shows chip family, MAC, Flash, features, and USB bridge information in a browser.

## Start

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/start-espinfo-demo.sh
```

Default URL:

```text
http://127.0.0.1:5173
```

Use Chrome or Edge. Web Serial requires HTTPS or `localhost` / `127.0.0.1`.

## Source Resolution

The script uses:
1. `$ESPINFO_SOURCE` environment variable (if set)
2. `~/mycode/espinfo-demo` (if exists)
3. Bundled `assets/espinfo-demo/` (always available)

## Manual Check

1. Open the local URL.
2. Put BOX0 into ROM download mode when needed.
3. Click the read button.
4. Select the ESP serial port.
5. Save or copy the JSON result for the device report.

Expected fields:

```text
family: ESP32-S3
isEsp32S3: true
mac: present
flashId: present
flashSize: present
features: present
usb: present
```
