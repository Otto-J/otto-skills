import test from "node:test";
import assert from "node:assert/strict";
import {
  splitText,
  splitCues,
  width,
  parseSrt,
  formatSrt,
  buildCaptions,
} from "./captions.mjs";
test("long Chinese captions split without losing text and prefer punctuation", () => {
  const text =
    "标准库工作、模糊测试和代码审查，Opus 处理那些硬核部分，也就是设计错误代价高昂的地方，比如这个 T2 速度合并、trait 系统修复，并且它们互相审查对方的工作，每次审查都会转化为修复方案。";
  const parts = splitText(text);
  assert.equal(parts.join(""), text);
  assert.ok(parts.length >= 4);
  assert.ok(parts.every((p) => width(p) <= 28));
  assert.ok(parts[0].endsWith("，"));
  const cue = { startMs: 950000, endMs: 975000, text };
  const cues = splitCues([cue]);
  assert.equal(cues[0].startMs, cue.startMs);
  assert.equal(cues.at(-1).endMs, cue.endMs);
  for (let i = 0; i < cues.length; i++) {
    assert.ok(cues[i].endMs > cues[i].startMs);
    if (i) assert.equal(cues[i].startMs, cues[i - 1].endMs);
  }
  assert.deepEqual(parseSrt(formatSrt(cues)), cues);
});
test("short cues unchanged; hard bounds handle unpunctuated text and Unicode", () => {
  const cue = { startMs: 100, endMs: 1500, text: "你好，世界。" };
  assert.deepEqual(splitCues([cue]), [cue]);
  for (const text of [
    "中文".repeat(80),
    "Hello world with no punctuation ".repeat(10),
    "😀".repeat(80),
  ]) {
    const parts = splitText(text);
    assert.equal(parts.join(""), text);
    assert.ok(parts.every((p) => width(p) <= 28));
  }
});
test("new render captions preserve original sentence boundaries", () => {
  const entries = [
    {
      actualStartMs: 10,
      durationMs: 9000,
      text: "第一句。" + "长".repeat(100) + "。",
    },
  ];
  const cues = buildCaptions(entries);
  assert.equal(cues[0].text, "第一句。");
  assert.equal(cues[0].startMs, 10);
  assert.equal(cues.at(-1).endMs, 9010);
  assert.equal(cues.map((c) => c.text).join(""), entries[0].text);
});
