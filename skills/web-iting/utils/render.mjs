// Deterministic delivery from reviewed transcripts and cached TTS. No provider calls.
import { readFile, writeFile, mkdir, open, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify, parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { probe } from "./view.mjs";
import { buildCaptions } from "./captions.mjs";
const exec = promisify(execFile),
  json = async (p) => JSON.parse(await readFile(p, "utf8"));
const ff = (args) =>
  exec("ffmpeg", ["-v", "error", "-nostdin", "-y", ...args], {
    maxBuffer: 4 * 1024 * 1024,
  });
export function pace(
  { startMs, endMs },
  durationMs,
  cursor,
  total,
  { cap = 1.5, lag = 1500 } = {},
) {
  const start = Math.max(startMs, cursor),
    deadline = Math.min(endMs + lag, total - 300);
  return {
    start,
    speed: Math.min(
      cap,
      Math.max(1, durationMs / Math.max(1, deadline - start)),
    ),
  };
}
export function validate(source, translated, generated) {
  const ids = source.segments.map((s) => s.id),
    ts = translated.segments;
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    !generated.segments.length
  )
    throw Error("转写或配音为空，或存在重复段落");
  for (const [i, s] of ts.entries()) {
    const original = source.segments[i];
    if (
      !s.text?.trim() ||
      ![s.startMs, s.endMs].every(Number.isFinite) ||
      s.startMs < 0 ||
      s.endMs <= s.startMs ||
      s.startMs !== original?.startMs ||
      s.endMs !== original?.endMs
    )
      throw Error("翻译时间戳与 ASR 不一致");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify(ts.map(({ id, text }) => ({ id, text }))))
    .digest("hex");
  if (
    !translated.metadata?.translationQuality?.passed ||
    translated.metadata.translationQuality.digest !== digest
  )
    throw Error("翻译质检缺失或已过期，请先进行 LLM 审核");
  if (
    JSON.stringify(ids) !== JSON.stringify(ts.map((s) => s.id)) ||
    JSON.stringify(ids) !==
      JSON.stringify(
        generated.segments.flatMap((g) => g.sourceSegmentIds || [g.segmentId]),
      )
  )
    throw Error("ASR、翻译、TTS 覆盖范围不一致");
  const byId = new Map(ts.map((s) => [s.id, s]));
  const clean = (t) => t.replace(/\s/g, "");
  for (const g of generated.segments) {
    const parts = (g.sourceSegmentIds || [g.segmentId]).map((id) =>
      byId.get(id),
    );
    if (clean(parts.map((s) => s.text).join("")) !== clean(g.text))
      throw Error(`TTS 文本已过期：${g.segmentId}`);
    if (g.startMs !== parts[0].startMs || g.endMs !== parts.at(-1).endMs)
      throw Error(`TTS 时间戳已过期：${g.segmentId}`);
  }
}
const stamp = (ms) => {
  const n = Math.round(ms);
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
};
const srt = (segments) =>
  segments
    .map(
      (s, i) =>
        `${i + 1}\n${stamp(s.startMs)} --> ${stamp(s.endMs)}\n${s.text}\n`,
    )
    .join("\n");
export async function render({
  input,
  source,
  translated,
  generated,
  output,
  cap = 1.5,
  maxLag = 15000,
}) {
  if (
    !Number.isFinite(cap) ||
    cap < 1 ||
    cap > 1.5 ||
    !Number.isFinite(maxLag) ||
    maxLag < 0
  )
    throw Error("倍速须在 1–1.5；允许积压须为非负毫秒");
  input = resolve(input);
  output = resolve(output);
  const [asr, zh, tts, info] = await Promise.all([
    json(source),
    json(translated),
    json(generated),
    probe(input),
  ]);
  validate(asr, zh, tts);
  const video = info.streams.find(
      (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
    ),
    original = info.streams.find((s) => s.codec_type === "audio");
  if (!original) throw Error("输入没有音轨");
  if (video && video.codec_name !== "h264")
    throw Error("目前视频输出要求 H.264；不自动重编码画面");
  const total = Number(info.format.duration) * 1000;
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    Math.abs(total - asr.durationMs) > 1000
  )
    throw Error("原始媒体与 ASR 时长不一致");
  // Each render requires a fresh directory: original and previous deliveries are never overwritten.
  await mkdir(output);
  const parts = join(output, "parts");
  await mkdir(parts);
  const raw = join(output, "timeline.pcm"),
    handle = await open(raw, "wx");
  let cursor = 0;
  const entries = [];
  if (video) await handle.truncate(Math.round(total * 48) * 2);
  try {
    for (const [i, g] of tts.segments.entries()) {
      const path = join(parts, `${i}.pcm`);
      await ff([
        "-i",
        g.audioPath,
        "-ar",
        "48000",
        "-ac",
        "1",
        "-f",
        "s16le",
        path,
      ]);
      let bytes = await readFile(path);
      const rawDurationMs = bytes.length / 96;
      const p = video
        ? pace(g, rawDurationMs, cursor, total, { cap })
        : { start: cursor, speed: 1 };
      if (p.speed > 1) {
        await ff([
          "-i",
          g.audioPath,
          "-af",
          `atempo=${p.speed.toFixed(8)}`,
          "-ar",
          "48000",
          "-ac",
          "1",
          "-f",
          "s16le",
          path,
        ]);
        bytes = await readFile(path);
      }
      const startSamples = Math.round(p.start * 48),
        durationMs = bytes.length / 96,
        end = (startSamples + bytes.length / 2) / 48;
      await handle.write(bytes, 0, bytes.length, startSamples * 2);
      entries.push({
        ...g,
        rawDurationMs,
        durationMs,
        speed: p.speed,
        actualStartMs: startSamples / 48,
        actualEndMs: end,
        lagMs: video ? Math.max(0, p.start - g.startMs, end - g.endMs) : 0,
      });
      cursor = end;
      if (i % 20 === 0) console.log(`对齐 ${i + 1}/${tts.segments.length}`);
    }
  } finally {
    await handle.close();
  }
  const maxLagMs = Math.max(0, ...entries.map((s) => s.lagMs)),
    tailOverrunMs = video ? Math.max(0, cursor - total) : 0;
  const report = {
    mode: video ? "adaptive" : "audio-concatenate",
    cap,
    maxLagMs,
    tailOverrunMs,
    blocked: maxLagMs > maxLag || tailOverrunMs > 0.1,
    entries,
  };
  await writeFile(join(output, "timing.json"), JSON.stringify(report, null, 2));
  if (report.blocked)
    throw Error(
      `积压超限，停止交付；查看 timing.json（最大 ${Math.round(maxLagMs / 1000)} 秒，尾部 ${Math.round(tailOverrunMs / 1000)} 秒）。只修订必要段落。`,
    );
  const audio = join(output, "中文配音.m4a");
  await ff([
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "1",
    "-i",
    raw,
    "-af",
    "loudnorm=I=-16:TP=-2:LRA=11",
    "-ar",
    "48000",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    audio,
  ]);
  const captions = buildCaptions(entries);
  const zhSrt = join(output, "中文字幕.srt"),
    enSrt = join(output, "英文字幕.srt");
  await writeFile(zhSrt, srt(captions));
  await writeFile(enSrt, srt(asr.segments));
  let result = audio;
  if (video) {
    result = join(output, "中英双音轨.mp4");
    const metadata = [];
    for (const type of ["a", "s"])
      for (const [i, language, label] of [
        [
          0,
          "zho",
          type === "a"
            ? "Chinese Dub / 中文配音"
            : "Chinese Subtitles / 简体中文",
        ],
        [1, "eng", type === "a" ? "English Original" : "English Subtitles"],
      ])
        metadata.push(
          `-metadata:s:${type}:${i}`,
          `language=${language}`,
          `-metadata:s:${type}:${i}`,
          `title=${label}`,
          `-metadata:s:${type}:${i}`,
          `handler_name=${label}`,
          `-metadata:s:${type}:${i}`,
          `name=${label}`,
          `-disposition:${type}:${i}`,
          i === 0 ? "default" : "0",
        );
    await ff([
      "-i",
      input,
      "-i",
      audio,
      "-i",
      zhSrt,
      "-i",
      enSrt,
      "-map",
      `0:${video.index}`,
      "-map",
      "1:a:0",
      "-map",
      `0:${original.index}`,
      "-map",
      "2:0",
      "-map",
      "3:0",
      "-c:v",
      "copy",
      "-c:a:0",
      "copy",
      "-c:a:1",
      original.codec_name === "aac" ? "copy" : "aac",
      "-c:s",
      "mov_text",
      ...metadata,
      "-movflags",
      "+faststart",
      result,
    ]);
    const check = await probe(result);
    for (const type of ["audio", "subtitle"]) {
      const tracks = check.streams.filter((s) => s.codec_type === type);
      if (
        tracks.length !== 2 ||
        tracks[0].tags?.language !== "zho" ||
        tracks[1].tags?.language !== "eng" ||
        tracks[0].disposition.default !== 1 ||
        tracks[1].disposition.default !== 0
      )
        throw Error("封装轨道验证失败");
    }
    if (Math.abs(Number(check.format.duration) * 1000 - total) > 150)
      throw Error("成片时长验证失败");
  }
  await ff(["-i", result, "-map", "0:a", "-f", "null", "-"]);
  await writeFile(
    join(output, "verification.json"),
    JSON.stringify(
      {
        result,
        bytes: (await stat(result)).size,
        decodePassed: true,
        subtitleTiming: "phrase-length approximation, not forced alignment",
        originalVideoReencoded: false,
        originalAudioCopied: !!video && original.codec_name === "aac",
        maxLagMs,
        tailOverrunMs,
      },
      null,
      2,
    ),
  );
  console.log(result);
  return result;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values: v } = parseArgs({
    options: Object.fromEntries(
      [
        "input",
        "source",
        "translated",
        "generated",
        "output",
        "cap",
        "max-lag",
      ].map((k) => [k, { type: "string" }]),
    ),
  });
  if (
    !["input", "source", "translated", "generated", "output"].every((k) => v[k])
  ) {
    console.error(
      "node utils/render.mjs --input MEDIA --source ASR.json --translated ZH.json --generated generated.json --output NEW_DIRECTORY [--cap 1.5] [--max-lag 15000]",
    );
    process.exitCode = 1;
  } else
    try {
      await render({
        ...v,
        cap: Number(v.cap || 1.5),
        maxLag: Number(v["max-lag"] || 15000),
      });
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
}
