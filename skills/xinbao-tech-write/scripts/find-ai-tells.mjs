#!/usr/bin/env node
// 扫描单个文档，定位含「AI 味儿」关键词的段落，输出 JSON 数组供 AI 重写。
// 关键词：中文破折号「——」、连接词「而是」
// 这是 xinbao-tech-write skill 的「收尾去 AI 味」环节所用的脚本。
//
// 用法：
//   node find-ai-tells.mjs <markdown 文件路径>
//   node find-ai-tells.mjs <文件路径> --pretty   # 缩进打印
//
// 输出：JSON 数组（stdout），每项含段落序号、命中的关键词、原始段落，以及前后段落做上下文。
// 末尾汇总走 stderr，不污染 stdout。

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("用法: node find-ai-tells.mjs <markdown 文件路径>");
  process.exit(1);
}

const pretty = process.argv.includes("--pretty");

// 关键词 -> 正则
// 「——」用 Unicode em dash U+2014；要求至少连续两个，覆盖中文写法。
// 「而是」按字面匹配。
const TELLS = {
  "——": /—{2,}/u,
  "而是": /而是/u,
};

const filePath = resolve(fileArg);
let text;
try {
  text = readFileSync(filePath, "utf8");
} catch (err) {
  console.error(`读取失败: ${err.message}`);
  process.exit(1);
}

// 按空行切段落，保留序号（1-based）。保留原始换行。
const paragraphs = text.split(/\n[ \t]*\n/);

const hits = [];
paragraphs.forEach((para, i) => {
  const matched = Object.keys(TELLS).filter((key) => TELLS[key].test(para));
  if (matched.length === 0) return;

  hits.push({
    file: filePath,
    paragraphIndex: i + 1,
    matches: matched,
    paragraph: para.trim(),
    prev: i > 0 ? paragraphs[i - 1].trim() : "",
    next: i < paragraphs.length - 1 ? paragraphs[i + 1].trim() : "",
  });
});

const out = JSON.stringify(hits, null, pretty ? 2 : 0);
process.stdout.write(out + "\n");

console.error(
  `扫描 ${paragraphs.length} 段，命中 ${hits.length} 段：` +
    Object.keys(TELLS)
      .map((k) => `${k}=${hits.filter((h) => h.matches.includes(k)).length}`)
      .join(" ")
);
