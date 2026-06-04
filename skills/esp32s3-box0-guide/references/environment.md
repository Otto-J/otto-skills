# Environment Setup

The BOX0 development base is ESP-IDF + C/C++.

## Local Verified Environment

Expected local paths:

```text
ESP-IDF: ~/.espressif/v6.0.1/esp-idf
activation: ~/.espressif/tools/activate_idf_v6.0.1.sh
lcd_demo: ~/esp/lcd_demo
xiaozhi-esp32: ~/mycode/xiaozhi-esp32
espinfo-demo: ~/mycode/espinfo-demo
```

Check:

```bash
source ~/.espressif/tools/activate_idf_v6.0.1.sh
idf.py --version
idf.py --list-targets | rg '^esp32s3$'
python -m esptool version
cmake --version
ninja --version
node --version
npm --version
```

The helper script prints this in one pass:

```bash
SKILL_DIR=/path/to/esp32s3-box0-guide
$SKILL_DIR/scripts/check-env.sh
```

## Fresh Machine Setup

Use Espressif's ESP-IDF setup for the host OS, then verify:

```bash
. "$HOME/esp/esp-idf/export.sh"
idf.py --version
idf.py --list-targets | rg '^esp32s3$'
```

The first project-level sanity check can use the ESP-IDF `hello_world` sample:

```bash
mkdir -p ~/mycode/esp32-lab
cp -R "$IDF_PATH/examples/get-started/hello_world" ~/mycode/esp32-lab/
cd ~/mycode/esp32-lab/hello_world
idf.py set-target esp32s3
idf.py build
```

## Docker Build Path For XiaoZhi

For `xiaozhi-esp32`, use the verified Docker flow when local ESP-IDF versions diverge:

```bash
cd ~/mycode/xiaozhi-esp32
rm -f releases/*atk-dnesp32s3-box0*.zip
docker run --rm --platform linux/amd64 \
  -v "$PWD":/project \
  -w /project \
  espressif/idf:v5.5.2 \
  bash -lc 'source $IDF_PATH/export.sh && python scripts/release.py atk-dnesp32s3-box0 --name atk-dnesp32s3-box0'
```

Use `proxy` in the user's interactive shell when Docker pull or registry access conflicts with the network:

```bash
zsh -ic 'proxy; docker pull espressif/idf:v5.5.2'
```
