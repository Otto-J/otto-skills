import { EspInfoReader, assertWebSerial } from "./esp-info.js";

const readBtn = document.querySelector("#readBtn");
const disconnectBtn = document.querySelector("#disconnectBtn");
const statusEl = document.querySelector("#status");
const resultEl = document.querySelector("#result");
const logEl = document.querySelector("#log");

let reader = null;

function setStatus(text) {
  statusEl.textContent = text;
}

function setResult(value) {
  resultEl.textContent = JSON.stringify(value, null, 2);
}

function setLogs(logs) {
  logEl.textContent = logs.join("\n");
}

readBtn.addEventListener("click", async () => {
  readBtn.disabled = true;
  disconnectBtn.disabled = true;
  setStatus("正在选择串口设备...");
  setLogs([]);
  setResult({});

  try {
    assertWebSerial();
    reader = new EspInfoReader({
      baudRate: 115200,
      onLog: setLogs,
    });

    setStatus("正在同步 ESP ROM bootloader 并读取芯片信息...");
    const info = await reader.read();
    setResult(info);
    setStatus(
      info.isEsp32S3
        ? "读取完成：当前设备是 ESP32-S3"
        : `读取完成：当前设备是 ${info.family || info.description}`,
    );
    disconnectBtn.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(`读取失败：${error?.message || error}`);
    await reader?.disconnect();
    reader = null;
  } finally {
    readBtn.disabled = false;
  }
});

disconnectBtn.addEventListener("click", async () => {
  disconnectBtn.disabled = true;
  await reader?.disconnect();
  reader = null;
  setStatus("已断开");
});
