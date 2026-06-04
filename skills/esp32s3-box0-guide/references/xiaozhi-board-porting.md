# XiaoZhi Board Porting

`xiaozhi-esp32` provides the mature board-abstraction model for BOX0.

## Board Directory

```text
~/mycode/xiaozhi-esp32/main/boards/atk-dnesp32s3-box0/
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

The release flow uses:

```bash
cd ~/mycode/xiaozhi-esp32
python scripts/release.py atk-dnesp32s3-box0 --name atk-dnesp32s3-box0
```

The build system derives:

```text
CONFIG_BOARD_TYPE_ATK_DNESP32S3_BOX0=y
BOARD_TYPE=atk-dnesp32s3-box0
```

## Architecture Model

The useful idea is:

```text
Shared application layer
  -> Board abstraction
      -> Specific hardware implementation
```

The application asks the board for display, audio, buttons, power, and storage capability. The board owns GPIO, codec, LCD, and power details.

For a custom BOX0 system, keep this separation:

- Board layer: hardware constants, initialization, drivers, power policy.
- App layer: menus, business state, images, text, button actions.
- Validation layer: scripts, Web Serial report, serial monitor logs.

