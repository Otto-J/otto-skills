# XiaoZhi Board Porting

[xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) provides the mature board-abstraction model for BOX0.

## Source Resolution

Resolve via: `$XIAOZHI` → `~/mycode/xiaozhi-esp32` → `.cache/xiaozhi-esp32` (after `provision-refs.sh`).

Or read directly from GitHub: `mcp__zread__read_file("78/xiaozhi-esp32", "main/boards/atk-dnesp32s3-box0/config.h")`

## Board Directory

```text
xiaozhi-esp32/main/boards/atk-dnesp32s3-box0/
  atk_dnesp32s3_box0.cc
  config.h
  config.json
  power_manager.h
```

## Build Identity

`config.json` selects:

```text
target = esp32s3
board = atk-dnesp32s3-box0
```

The release flow:

```bash
cd /path/to/xiaozhi-esp32
python scripts/release.py atk-dnesp32s3-box0 --name atk-dnesp32s3-box0
```

## Architecture Model

```text
Shared application layer
  → Board abstraction
      → Specific hardware implementation
```

The application asks the board for display, audio, buttons, power, and storage capability. The board owns GPIO, codec, LCD, and power details.

For a custom BOX0 system, keep this separation:

- **Board layer**: hardware constants, initialization, drivers, power policy.
- **App layer**: menus, business state, images, text, button actions.
- **Validation layer**: scripts, Web Serial report, serial monitor logs.
