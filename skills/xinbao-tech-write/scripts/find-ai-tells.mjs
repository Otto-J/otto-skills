#!/usr/bin/env node
// Scan one Markdown document for writing patterns that make technical prose
// sound staged, argumentative, or mechanically sequenced.
//
// Usage:
//   node find-ai-tells.mjs <markdown-file>
//   node find-ai-tells.mjs <markdown-file> --pretty
//
// stdout is a JSON array. stderr contains the scan summary.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("用法: node find-ai-tells.mjs <markdown 文件路径>");
  process.exit(1);
}

const pretty = process.argv.includes("--pretty");

const TELLS = {
  "破折号": /—+/u,
  "而是": /而是/u,
  "随后": /随后/u,
  "最后": /最后/u,
  "首先": /首先/u,
  "然后": /然后/u,
  "其次": /其次/u,
  "first": /\bfirst\b/iu,
  "then": /\bthen\b/iu,
  "finally": /\bfinally\b/iu,
  "but also": /\bbut\s+also\b/iu,
};

const filePath = resolve(fileArg);
let text;
try {
  text = readFileSync(filePath, "utf8");
} catch (err) {
  console.error(`读取失败: ${err.message}`);
  process.exit(1);
}

const paragraphs = text.split(/\n[ \t]*\n/);
const hits = [];

paragraphs.forEach((paragraph, index) => {
  const matches = Object.entries(TELLS)
    .filter(([, pattern]) => pattern.test(paragraph))
    .map(([name]) => name);

  if (matches.length === 0) return;

  hits.push({
    file: filePath,
    paragraphIndex: index + 1,
    matches,
    paragraph: paragraph.trim(),
    prev: index > 0 ? paragraphs[index - 1].trim() : "",
    next: index < paragraphs.length - 1 ? paragraphs[index + 1].trim() : "",
  });
});

process.stdout.write(JSON.stringify(hits, null, pretty ? 2 : 0) + "\n");
console.error(
  `扫描 ${paragraphs.length} 段，命中 ${hits.length} 段：` +
    Object.keys(TELLS)
      .map((name) => `${name}=${hits.filter((hit) => hit.matches.includes(name)).length}`)
      .join(" "),
);
