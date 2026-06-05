# Environment Setup

The BOX0 development base is ESP-IDF (C/C++ framework for ESP32).

## Prerequisites

ESP-IDF is **infrastructure** — it provides the build system, all system components (WiFi, SPI, GPIO drivers), and the toolchain. Without it installed, no ESP32 project compiles.

## Check Current Environment

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/check-env.sh
```

This auto-detects:
- ESP-IDF installation (via `$IDF_PATH` or common paths)
- Activation script
- Build tools (cmake, ninja, esptool)
- Reference sources (xiaozhi-esp32 from `.cache/` or local)
- Optional local projects

## Fresh Machine Setup

### 1. Install ESP-IDF

Official guide: https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/get-started/

Quick path (macOS/Linux):

```bash
mkdir -p ~/esp && cd ~/esp
git clone -b v5.5.2 --recursive https://github.com/espressif/esp-idf.git
cd esp-idf && ./install.sh esp32s3
```

Activate:

```bash
. ~/esp/esp-idf/export.sh
```

### 2. Verify

```bash
idf.py --version
idf.py --list-targets | grep esp32s3
python -m esptool version
```

### 3. First build sanity check

```bash
cp -R "$IDF_PATH/examples/get-started/hello_world" ~/esp/hello_world
cd ~/esp/hello_world
idf.py set-target esp32s3
idf.py build
```

### 4. Provision reference sources

```bash
$SKILL_DIR/scripts/provision-refs.sh
```

Clones `xiaozhi-esp32` into `.cache/` for board config reference.

## CI Build (GitHub Actions)

Local development always uses native ESP-IDF. Docker is only used in CI for automated/reproducible builds.

See `references/github-actions-build.md` for the workflow template.

## Environment Variables

| Variable | Purpose |
|---|---|
| `IDF_PATH` | ESP-IDF root directory |
| `IDF_ACTIVATE` | Activation script path override |
| `XIAOZHI` | xiaozhi-esp32 checkout path |
| `LCD_DEMO` | BOX0 test firmware path (optional) |
| `ESPINFO_SOURCE` | Web Serial demo source (optional) |
