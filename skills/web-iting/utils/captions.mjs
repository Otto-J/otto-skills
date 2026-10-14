import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Width is an estimate: CJK/full-width characters = 1, ASCII = 0.5.
export const width = (text) =>
  Array.from(text).reduce((n, c) => n + (/^[\x00-\x7f]$/.test(c) ? 0.5 : 1), 0);
export function splitText(text, maxWidth = 28) {
  if (!Number.isFinite(maxWidth) || maxWidth < 4)
    throw Error("maxWidth must be at least 4");
  const chars = Array.from(text),
    parts = [];
  let start = 0;
  while (start < chars.length) {
    let end = start,
      w = 0,
      lastPunctuation = -1,
      lastSpace = -1;
    while (end < chars.length && w + width(chars[end]) <= maxWidth) {
      w += width(chars[end]);
      end++;
      if (w >= maxWidth * 0.4) {
        if (/[，,；;：:。！？!?]/u.test(chars[end - 1])) lastPunctuation = end;
        if (/\s/u.test(chars[end - 1])) lastSpace = end;
      }
    }
    if (end < chars.length)
      end =
        lastPunctuation > start
          ? lastPunctuation
          : lastSpace > start
            ? lastSpace
            : end;
    // Keep every character; prefer punctuation, then spaces, then a hard length bound.
    parts.push(chars.slice(start, end).join(""));
    start = end;
  }
  return parts;
}
export function splitCues(cues, maxWidth = 28) {
  return cues.flatMap((cue) => {
    const parts = splitText(cue.text, maxWidth);
    if (parts.length <= 1) return [cue];
    const weights = parts.map((p) => Array.from(p).length),
      total = weights.reduce((a, b) => a + b, 0);
    let offset = 0;
    return parts.map((text, i) => {
      const startMs = Math.round(
        cue.startMs + ((cue.endMs - cue.startMs) * offset) / total,
      );
      offset += weights[i];
      return {
        text,
        startMs,
        endMs:
          i === parts.length - 1
            ? cue.endMs
            : Math.round(
                cue.startMs + ((cue.endMs - cue.startMs) * offset) / total,
              ),
      };
    });
  });
}
export function buildCaptions(entries, maxWidth = 28) {
  const cues = [];
  for (const g of entries) {
    const phrases = g.text.match(/[^。！？；]+[。！？；]?|[。！？；]/g) || [
      g.text,
    ];
    let offset = 0;
    const length = phrases.join("").length;
    for (const text of phrases) {
      const startMs = g.actualStartMs + (g.durationMs * offset) / length;
      offset += text.length;
      cues.push({
        text,
        startMs: Math.round(startMs),
        endMs: Math.round(g.actualStartMs + (g.durationMs * offset) / length),
      });
    }
  }
  return splitCues(cues, maxWidth);
}
const stamp = (ms) => {
  const n = Math.round(ms);
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
};
export const formatSrt = (cues) =>
  cues
    .map(
      (c, i) =>
        `${i + 1}\n${stamp(c.startMs)} --> ${stamp(c.endMs)}\n${c.text}\n`,
    )
    .join("\n");
export function parseSrt(text) {
  const ms = (t) => {
    const [h, m, s, v] = t.split(/[:,]/).map(Number);
    return ((h * 60 + m) * 60 + s) * 1000 + v;
  };
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split("\n"),
        match = /^(\d+:\d{2}:\d{2},\d{3}) --> (\d+:\d{2}:\d{2},\d{3})$/.exec(
          lines[1],
        );
      if (!match) throw Error("Invalid SRT cue");
      return {
        startMs: ms(match[1]),
        endMs: ms(match[2]),
        text: lines.slice(2).join("\n"),
      };
    });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw Error("node captions.mjs INPUT.srt NEW_OUTPUT.srt");
  const before = parseSrt(await readFile(input, "utf8")),
    after = splitCues(before);
  await writeFile(output, formatSrt(after), { flag: "wx" });
  console.log(
    JSON.stringify({
      before: before.length,
      after: after.length,
      maxWidth: Math.max(...after.map((c) => width(c.text))),
      shortCues: after.filter((c) => c.endMs - c.startMs < 800).length,
    }),
  );
}
