#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ZIP_LIMITS = {
  compressedBytes: 512 * 1024 * 1024,
  entries: 20_000,
  uncompressedBytes: 1024 * 1024 * 1024,
};

const EXTRACTED_HASH_FILE = ".bundle-sha256";

export const TEXT_EXTENSIONS = new Set([
  ".log",
  ".txt",
  ".json",
  ".jsonl",
  ".ndjson",
  ".md",
  ".yaml",
  ".yml",
  ".csv",
]);

export async function runCommand(bin, args, options = {}) {
  return execFileAsync(bin, args, {
    maxBuffer: 1024 * 1024 * 20,
    ...options,
  });
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensurePathInside(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path outside workspace: ${candidatePath}`);
  }
}

export async function safeExtract(zipPath, destination) {
  ensureDir(destination);
  const destinationRoot = path.resolve(destination);
  const archive = fs.statSync(zipPath);
  if (archive.size > ZIP_LIMITS.compressedBytes) {
    throw new Error(`Feedback zip exceeds compressed size limit: ${humanSize(archive.size)}`);
  }

  const { stdout } = await runCommand("unzip", ["-Z1", zipPath]);
  const entries = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (entries.length > ZIP_LIMITS.entries) {
    throw new Error(`Feedback zip contains too many entries: ${entries.length}`);
  }

  const { stdout: summary } = await runCommand("zipinfo", ["-t", zipPath]);
  const sizeMatch = /(\d+)\s+files?,\s+(\d+)\s+bytes?\s+uncompressed/i.exec(summary);
  if (!sizeMatch) {
    throw new Error("Unable to verify feedback zip uncompressed size");
  }
  const uncompressedBytes = Number.parseInt(sizeMatch[2], 10);
  if (uncompressedBytes > ZIP_LIMITS.uncompressedBytes) {
    throw new Error(`Feedback zip exceeds uncompressed size limit: ${humanSize(uncompressedBytes)}`);
  }

  for (const entry of entries) {
    const portableEntry = entry.replaceAll("\\", "/");
    if (/^[A-Za-z]:\//.test(portableEntry) || portableEntry.startsWith("/")) {
      throw new Error(`Unsafe absolute path in feedback attachment: ${entry}`);
    }
    ensurePathInside(destinationRoot, path.join(destinationRoot, portableEntry));
  }

  await assertZipHasOnlyRegularEntries(zipPath);
  await runCommand("unzip", ["-q", "-o", zipPath, "-d", destinationRoot]);
  assertExtractedFilesInside(destinationRoot);
}

async function assertZipHasOnlyRegularEntries(zipPath) {
  const { stdout } = await runCommand("zipinfo", ["-l", zipPath]);
  const unsafeEntry = stdout
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && /^[lh]/.test(line));

  if (unsafeEntry) {
    throw new Error(`Unsupported zip entry type in feedback attachment: ${unsafeEntry}`);
  }
}

function assertExtractedFilesInside(rootPath) {
  const root = fs.realpathSync(rootPath);
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Unsupported symbolic link in feedback attachment: ${fullPath}`);
      }

      const realPath = fs.realpathSync(fullPath);
      ensurePathInside(root, realPath);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Unsupported extracted entry type in feedback attachment: ${fullPath}`);
      }
    }
  }
}

export async function ensureExtracted(bundlePath, workspacePath, suffix) {
  const bundle = path.resolve(bundlePath);
  const stat = fs.statSync(bundle);
  if (stat.isDirectory()) {
    return { root: bundle, reused: true, sha256: "" };
  }

  if (path.extname(bundle).toLowerCase() !== ".zip") {
    throw new Error(`Unsupported bundle type: ${bundle}`);
  }

  const parsed = path.parse(bundle);
  const extractRoot = workspacePath
    ? path.resolve(workspacePath)
    : path.join(parsed.dir, `${parsed.name}${suffix}`);
  const sha256 = await sha256File(bundle);

  if (hasExtractedColaLogs(extractRoot) && extractedHash(extractRoot) === sha256) {
    return { root: extractRoot, reused: true, sha256 };
  }

  fs.rmSync(extractRoot, { recursive: true, force: true });
  ensureDir(extractRoot);
  await safeExtract(bundle, extractRoot);
  fs.writeFileSync(path.join(extractRoot, EXTRACTED_HASH_FILE), `${sha256}\n`, "utf8");
  return { root: extractRoot, reused: false, sha256 };
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

function extractedHash(root) {
  try {
    return fs.readFileSync(path.join(root, EXTRACTED_HASH_FILE), "utf8").trim();
  } catch {
    return "";
  }
}

function hasExtractedColaLogs(root) {
  try {
    const stat = fs.statSync(root);
    if (!stat.isDirectory()) return false;
    return walkFiles(root).some((filePath) => {
      const relative = path.relative(root, filePath).split(path.sep);
      return relative.includes("logs") && /^cola(?:-mobile)?-\d{4}-\d{2}-\d{2}\.log$/.test(path.basename(filePath));
    });
  } catch {
    return false;
  }
}

export function walkFiles(root) {
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export function readLines(filePath) {
  const data = fs.readFileSync(filePath);
  return data.toString("utf8").split(/\r?\n/);
}

export function recentTextLines(filePath) {
  const stat = fs.statSync(filePath);
  const chunkSize = 512 * 1024;
  const size = stat.size;
  const start = size <= 1024 * 1024 ? 0 : Math.max(0, size - chunkSize);
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer.toString("utf8").split(/\r?\n/);
  } finally {
    fs.closeSync(fd);
  }
}

export function isTextFile(filePath) {
  if (TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return true;
  }

  try {
    const handle = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(4096);
      const bytesRead = fs.readSync(handle, buffer, 0, buffer.length, 0);
      if (bytesRead === 0) return true;
      const chunk = buffer.subarray(0, bytesRead);
      if (chunk.includes(0)) return false;
      chunk.toString("utf8");
      return true;
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    return false;
  }
}

export function humanSize(size) {
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  const lastUnit = units[units.length - 1];
  for (const unit of units) {
    if (value < 1024 || unit === lastUnit) {
      return unit === "B" ? `${Math.trunc(value)} ${unit}` : `${value.toFixed(1)} ${unit}`;
    }
    value /= 1024;
  }
  return `${size} B`;
}

export function relativePath(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

export function newestFirstDateKey(fileName, pattern) {
  const match = pattern.exec(fileName);
  return match ? match[1] : "";
}

export function jsonTailPreview(lines, limit = 3, maxLength = 280) {
  const parsed = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    if (!(line.startsWith("{") && line.endsWith("}"))) continue;
    try {
      const item = JSON.parse(line);
      parsed.push(JSON.stringify(item).slice(0, maxLength));
      if (parsed.length >= limit) break;
    } catch {
      continue;
    }
  }
  return parsed.toReversed();
}

export function tailLines(lines, count) {
  return lines.slice(Math.max(0, lines.length - count));
}

export function defaultWorkspaceSuffix(kind) {
  return kind === "fast" ? ".fast-extracted" : ".extracted";
}
