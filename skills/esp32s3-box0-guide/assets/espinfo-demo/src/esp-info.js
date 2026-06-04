import { ESPLoader, Transport } from "esptool-js";

const DEFAULT_SERIAL_OPTIONS = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  bufferSize: 1024,
  flowControl: "none",
};

const DEFAULT_PORT_FILTERS = [
  { usbVendorId: 0x303a },
  { usbVendorId: 0x10c4 },
  { usbVendorId: 0x0403 },
  { usbVendorId: 0x2341 },
  { usbVendorId: 0x1a86 },
  { usbVendorId: 0x2e8a },
  { usbVendorId: 0x303a, usbProductId: 0x0002 },
  { usbVendorId: 0x10c4, usbProductId: 0xea60 },
  { usbVendorId: 0x1a86, usbProductId: 0x7523 },
];

const USB_BRIDGES = {
  "303a:0002": "Espressif ESP32-S2 Native USB",
  "303a:1000": "Espressif ESP32 Native USB",
  "303a:1001": "Espressif ESP32 Native USB",
  "303a:1002": "Espressif ESP32 Native USB",
  "303a:4002": "Espressif ESP32 Native USB CDC",
  "10c4:ea60": "Silicon Labs CP210x USB to UART",
  "1a86:7523": "QinHeng CH340 USB to UART",
  "0403:6001": "FTDI FT232 USB to UART",
  "2e8a:0005": "Raspberry Pi Pico USB Serial",
};

const VENDORS = {
  0x303a: "Espressif Systems",
  0x10c4: "Silicon Labs",
  0x1a86: "QinHeng Electronics",
  0x0403: "FTDI",
  0x2341: "Arduino",
  0x2e8a: "Raspberry Pi",
};

const FLASH_MANUFACTURERS = {
  0x20: "Micron / XMC",
  0x85: "Puya",
  0xc8: "GigaDevice",
  0xef: "Winbond",
  0x68: "Boya",
  0x51: "XTX",
  0xbf: "Microchip / SST",
  0x1c: "EON",
  0x9d: "ISSI",
};

const FLASH_DEVICES = {
  0xc8: {
    0x4014: "GD25Q80 (8 Mbit)",
    0x4015: "GD25Q16 (16 Mbit)",
    0x4016: "GD25Q32 (32 Mbit)",
    0x4017: "GD25Q64 (64 Mbit)",
    0x4018: "GD25Q128 (128 Mbit)",
    0x4019: "GD25Q256 (256 Mbit)",
  },
  0xef: {
    0x4015: "W25Q16 (16 Mbit)",
    0x4016: "W25Q32 (32 Mbit)",
    0x4017: "W25Q64 (64 Mbit)",
    0x4018: "W25Q128 (128 Mbit)",
  },
  0x20: {
    0x4016: "N25Q32 / MX25L32 (32 Mbit)",
    0x4017: "N25Q64 / MX25L64 (64 Mbit)",
    0x4018: "N25Q128 / MX25L128 (128 Mbit)",
  },
};

const FAMILY_FEATURES = {
  ESP32: { cores: "dual core", pwm: "LEDC 4 timers / 16 channels" },
  "ESP32-S2": { cores: "single core", pwm: "LEDC 4 timers / 8 channels" },
  "ESP32-S3": { cores: "dual core", pwm: "LEDC 4 timers / 8 channels" },
  "ESP32-C2": { cores: "single core", pwm: "LEDC 4 timers / 6 channels" },
  "ESP32-C3": { cores: "single core", pwm: "LEDC 4 timers / 6 channels" },
  "ESP32-C5": { cores: "single core", pwm: "LEDC 4 timers / 6 channels" },
  "ESP32-C6": { cores: "single core", pwm: "LEDC 4 timers / 6 channels" },
  "ESP32-H2": { cores: "single core", pwm: "LEDC 4 timers / 6 channels" },
  "ESP32-P4": { cores: "dual core", pwm: "LEDC 4 timers / 8 channels" },
  ESP8266: { cores: "single core", pwm: "software PWM" },
};

export class EspInfoReader {
  constructor(options = {}) {
    this.baudRate = options.baudRate || 115200;
    this.serialOptions = { ...DEFAULT_SERIAL_OPTIONS, ...options.serialOptions };
    this.portFilters = options.filters || DEFAULT_PORT_FILTERS;
    this.logs = [];
    this.transport = null;
    this.loader = null;
    this.onLog = options.onLog || null;
  }

  async requestPort() {
    assertWebSerial();
    const existingPorts = await navigator.serial.getPorts();
    const preferredInfo = existingPorts.at(-1)?.getInfo?.();
    const filters = preferredInfo?.usbVendorId
      ? [preferredInfo, ...this.portFilters]
      : this.portFilters;

    return await navigator.serial.requestPort({ filters });
  }

  async read(port = null) {
    const selectedPort = port || (await this.requestPort());
    this.transport = new Transport(selectedPort);
    this.transport.setDeviceLostCallback?.(() => this.log("Device lost"));

    await this.runLoader();

    const chip = this.loader.chip;
    const description = await callOrNull(() => chip.getChipDescription(this.loader));
    const family = normalizeFamily(chip?.CHIP_NAME || description);
    const revision = await callOrNull(() => chip.getChipRevision?.(this.loader));
    const pkgVersion = await callOrNull(() => chip.getPkgVersion?.(this.loader));
    const features = normalizeFeatures(
      await callOrNull(() => chip.getChipFeatures?.(this.loader), []),
    );
    const crystalMHz = await callOrNull(() => chip.getCrystalFreq?.(this.loader));
    const mac = await callOrNull(() => chip.readMac?.(this.loader));
    const flashId = await callOrNull(() => this.loader.readFlashId?.());
    const flashSize =
      this.loader.flashSize ||
      (await callOrNull(() => this.loader.detectFlashSize?.("detect")));

    return {
      family,
      isEsp32S3: family === "ESP32-S3",
      description: description || family || "Unknown ESP device",
      revision: formatRevision(description, revision),
      packageVersion: pkgVersion,
      mac,
      crystalMHz,
      features,
      coreCount: inferCoreCount(features, family),
      maxCpuFrequency: inferMaxCpuFrequency(features),
      embeddedFlash: findFeature(features, "embedded flash"),
      embeddedPsram: findFeature(features, "embedded psram"),
      flashId: decodeFlashId(flashId),
      flashSize: flashSize || null,
      pwm: FAMILY_FEATURES[family]?.pwm || "",
      usb: describeUsb(selectedPort),
      baudRate: this.loader?.IS_STUB
        ? this.baudRate
        : this.loader?.romBaudrate || this.baudRate,
      logs: [...this.logs],
    };
  }

  async runLoader() {
    const terminal = createTerminal((line) => this.log(line));
    const loaderOptions = {
      transport: this.transport,
      baudrate: this.baudRate,
      serialOptions: this.serialOptions,
      terminal,
      debugLogging: false,
    };

    this.loader = new ESPLoader(loaderOptions);
    try {
      await this.loader.main();
      return;
    } catch (error) {
      if (!isStubUploadError(error)) {
        throw error;
      }
    }

    this.log("Stub upload failed. Falling back to ROM bootloader mode.");
    await callOrNull(() => this.transport.disconnect());
    this.transport = new Transport(this.transport.device);
    this.loader = new ESPLoader({ ...loaderOptions, transport: this.transport });
    await this.loader.detectChip();

    const chip = this.loader.chip;
    this.log(`Chip is ${await callOrNull(() => chip.getChipDescription(this.loader))}`);
    this.log(`Features: ${await callOrNull(() => chip.getChipFeatures(this.loader), [])}`);
    this.log(`Crystal is ${await callOrNull(() => chip.getCrystalFreq(this.loader))}MHz`);
    this.log(`MAC: ${await callOrNull(() => chip.readMac(this.loader))}`);
    await callOrNull(() => chip.postConnect?.(this.loader));
  }

  async disconnect() {
    await callOrNull(() => this.transport?.disconnect());
    this.transport = null;
    this.loader = null;
  }

  log(line) {
    if (!line) return;
    for (const item of String(line).split(/\r?\n/)) {
      const text = item.trim();
      if (text) this.logs.push(text);
    }
    this.onLog?.([...this.logs]);
  }
}

export function assertWebSerial() {
  if (!("serial" in navigator)) {
    throw new Error("当前浏览器不支持 Web Serial。请使用 Chrome 或 Edge，并通过 HTTPS 或 localhost 访问。");
  }
}

function createTerminal(writeLine) {
  return {
    clean() {},
    write(data) {
      writeLine(data);
    },
    writeLine(data) {
      writeLine(data);
    },
  };
}

async function callOrNull(fn, fallback = null) {
  if (typeof fn !== "function") return fallback;
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function isStubUploadError(error) {
  return /write to target RAM|leave RAM download mode|Failed to start stub/i.test(
    String(error?.message || error),
  );
}

function normalizeFamily(value) {
  const text = String(value || "").toUpperCase();
  return (
    [
      "ESP32-C61",
      "ESP32-S3",
      "ESP32-S2",
      "ESP32-C6",
      "ESP32-C5",
      "ESP32-C3",
      "ESP32-C2",
      "ESP32-P4",
      "ESP32-H2",
      "ESP8266",
      "ESP32",
    ].find((name) => text.includes(name)) ||
    text.split(/[\s(]/)[0] ||
    ""
  );
}

function normalizeFeatures(features) {
  return (Array.isArray(features) ? features : String(features || "").split(","))
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function formatRevision(description, revision) {
  const match = String(description || "").match(/\(revision\s+([^)]+)\)/i);
  if (match) return `Rev ${match[1].trim()}`;
  if (revision === null || revision === undefined || revision === "") return "";
  return `Rev ${revision}`;
}

function inferCoreCount(features, family) {
  if (features.some((feature) => /single core/i.test(feature))) return "single core";
  if (features.some((feature) => /dual core/i.test(feature))) return "dual core";
  return FAMILY_FEATURES[family]?.cores || "";
}

function inferMaxCpuFrequency(features) {
  const feature = features.find((item) => /(\d+)\s*mhz/i.test(item));
  return feature?.match(/(\d+)\s*mhz/i)?.[0] || "";
}

function findFeature(features, key) {
  return features.find((item) => item.toLowerCase().includes(key)) || "";
}

function decodeFlashId(flashId) {
  if (typeof flashId !== "number" || Number.isNaN(flashId)) {
    return { raw: null, manufacturer: "", device: "" };
  }

  const manufacturerId = flashId & 0xff;
  const deviceId = ((flashId >> 8) & 0xff) << 8 | ((flashId >> 16) & 0xff);
  return {
    raw: `0x${flashId.toString(16)}`,
    manufacturerId,
    deviceId,
    manufacturer:
      FLASH_MANUFACTURERS[manufacturerId] || `Manufacturer 0x${manufacturerId.toString(16)}`,
    device: FLASH_DEVICES[manufacturerId]?.[deviceId] || `Device 0x${deviceId.toString(16)}`,
  };
}

function describeUsb(port) {
  const info = port?.getInfo?.() || {};
  const { usbVendorId, usbProductId } = info;
  if (!usbVendorId || !usbProductId) {
    return { label: "Browser did not expose USB VID/PID", ...info };
  }

  const key = `${usbVendorId.toString(16).padStart(4, "0")}:${usbProductId
    .toString(16)
    .padStart(4, "0")}`;
  return {
    vendorId: usbVendorId,
    productId: usbProductId,
    key,
    label:
      USB_BRIDGES[key] ||
      `${VENDORS[usbVendorId] || `VID 0x${usbVendorId.toString(16)}`} / PID 0x${usbProductId.toString(16)}`,
  };
}
