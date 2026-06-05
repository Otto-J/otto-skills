# GitHub Actions Build

Docker is for CI, not local development. On CI runners (x86 Linux), Docker runs natively without emulation overhead.

## Why GitHub Actions + Docker

```
本地 Mac (ARM)  → 原生 idf.py build (快,零开销)
GitHub Actions  → Docker espressif/idf (一致环境,自动化,x86 原生)
```

Local Docker on ARM Mac = x86 emulation = slow + unnecessary. Avoid it.

## Workflow Template

Place at `.github/workflows/build.yml` in your project:

```yaml
name: Build Firmware

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: espressif/idf:v5.5.2

    steps:
      - uses: actions/checkout@v4

      - name: Build
        shell: bash
        run: |
          . $IDF_PATH/export.sh
          idf.py set-target esp32s3
          idf.py build

      - name: Upload firmware
        uses: actions/upload-artifact@v4
        with:
          name: firmware
          path: |
            build/bootloader/bootloader.bin
            build/partition_table/partition-table.bin
            build/*.bin
            build/flasher_args.json
```

## Release Build (with version tagging)

```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    container:
      image: espressif/idf:v5.5.2

    steps:
      - uses: actions/checkout@v4

      - name: Build release
        shell: bash
        run: |
          . $IDF_PATH/export.sh
          idf.py set-target esp32s3
          idf.py build

      - name: Package
        run: |
          mkdir -p release
          cp build/bootloader/bootloader.bin release/
          cp build/partition_table/partition-table.bin release/
          cp build/*.bin release/
          cp build/flasher_args.json release/

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: release/*
```

## xiaozhi-esp32 Release Build

For building xiaozhi firmware in CI:

```yaml
name: Build xiaozhi BOX0

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: espressif/idf:v5.5.2

    steps:
      - uses: actions/checkout@v4
        with:
          repository: 78/xiaozhi-esp32
          submodules: recursive

      - name: Build
        shell: bash
        run: |
          . $IDF_PATH/export.sh
          python scripts/release.py atk-dnesp32s3-box0 --name atk-dnesp32s3-box0

      - name: Upload
        uses: actions/upload-artifact@v4
        with:
          name: xiaozhi-box0
          path: releases/*.zip
```

## Key Points

- `espressif/idf:v5.5.2` runs natively on GitHub's x86 Linux runners — no emulation
- Pin the IDF version in the image tag to keep builds reproducible
- Use `actions/upload-artifact` for firmware binaries
- Use `softprops/action-gh-release` for tagged releases
- For projects needing specific IDF versions, change the image tag
