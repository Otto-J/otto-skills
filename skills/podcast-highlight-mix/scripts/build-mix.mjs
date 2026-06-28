#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_SPEAKERS = {
  SPEAKER_0: { name: "xinbao", camera: "cam2", video: "xiaoyu-vibecoding-2.mp4" },
  SPEAKER_1: { name: "Smart", camera: "cam3", video: "xiaoyu-vibecoding-3.mp4" },
  SPEAKER_2: { name: "晓宇", camera: "cam1", video: "xiaoyu-vibecoding-1.mp4" },
};

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[name] = true;
    else {
      args[name] = next;
      i++;
    }
  }
  return args;
}

function normalizeInput(raw, inputPath) {
  if (Array.isArray(raw.segments) && typeof raw.audio_duration === "number") {
    return {
      inputType: "asr",
      inputPath,
      title: "ASR source",
      sourceStart: 0,
      sourceEnd: raw.audio_duration,
      segments: raw.segments,
    };
  }
  if (Array.isArray(raw.segments) && typeof raw.start === "number") {
    return {
      inputType: "clip",
      inputPath,
      title: raw.title || raw.id || "clip",
      sourceStart: raw.start,
      sourceEnd: raw.end,
      segments: raw.segments,
    };
  }
  throw new Error("Unsupported JSON: expected AuralWise ASR JSON or refined clip JSON with segments");
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function segmentScore(segment) {
  const text = segment.text || "";
  let score = Math.min(text.length / 20, 4);
  if (/为什么|怎么|好问题|但是|难|反思|例子|自己做|工具|课程|耐心/.test(text)) score += 4;
  if (/哈哈|笑|棒|犀利/.test(text)) score += 3;
  if (segment.speaker && segment.speaker !== "SPEAKER_2") score += 1.2;
  return score;
}

function chooseWindow(segments, maxDuration) {
  let best = null;
  for (let i = 0; i < segments.length; i++) {
    const start = segments[i].start;
    const endLimit = start + maxDuration;
    let score = 0;
    const speakers = new Set();
    let end = start;
    for (let j = i; j < segments.length; j++) {
      const segment = segments[j];
      if (segment.start >= endLimit) break;
      end = Math.min(segment.end, endLimit);
      speakers.add(segment.speaker || "?");
      score += segmentScore(segment);
      if (j > i && segment.speaker !== segments[j - 1].speaker) score += 2;
    }
    const duration = end - start;
    if (duration < Math.min(60, maxDuration * 0.5)) continue;
    score += speakers.size * 3;
    const item = { start, end, score, duration };
    if (!best || item.score > best.score) best = item;
  }
  if (!best) {
    const first = segments[0];
    return { start: first.start, end: Math.min(first.start + maxDuration, segments.at(-1).end) };
  }
  return { start: best.start, end: best.end };
}

function permutations(items, size) {
  if (size === 1) return items.map((item) => [item]);
  const out = [];
  for (const item of items) {
    for (const rest of permutations(items.filter((other) => other !== item), size - 1)) {
      out.push([item, ...rest]);
    }
  }
  return out;
}

function buildTemplates(speakerIds) {
  const templates = [];
  for (const [speaker] of permutations(speakerIds, 1)) {
    templates.push({
      id: `solo:${speaker}`,
      layout: "solo",
      slots: [{ role: "primary", speaker }],
    });
  }
  for (const pair of permutations(speakerIds, 2)) {
    templates.push({
      id: `duo:${pair.join("|")}`,
      layout: "duo",
      slots: [
        { role: "left", speaker: pair[0] },
        { role: "right", speaker: pair[1] },
      ],
    });
  }
  if (speakerIds.length >= 3) {
    for (const trio of permutations(speakerIds, 3)) {
      templates.push({
        id: `trio:${trio.join("|")}`,
        layout: "trio",
        slots: [
          { role: "primary", speaker: trio[0] },
          { role: "sideTop", speaker: trio[1] },
          { role: "sideBottom", speaker: trio[2] },
        ],
      });
    }
  }
  return templates;
}

function speakersInWindow(segments, start, end) {
  const totals = new Map();
  for (const segment of segments) {
    const amount = overlap(segment.start, segment.end, start, end);
    if (amount <= 0) continue;
    const speaker = segment.speaker || "UNKNOWN";
    totals.set(speaker, (totals.get(speaker) || 0) + amount);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function chooseTemplateId(entries, allSpeakerIds) {
  const active = entries[0]?.[0] || allSpeakerIds[0];
  const present = entries.map(([speaker]) => speaker).filter((speaker) => allSpeakerIds.includes(speaker));
  if (present.length <= 1) return { id: `solo:${active}`, active, reason: "single dominant speaker" };
  if (present.length === 2) {
    const ordered = present[0] === active ? [present[1], present[0]] : present.slice(0, 2);
    return { id: `duo:${ordered.join("|")}`, active, reason: "two speakers appear in this shot window" };
  }
  const others = allSpeakerIds.filter((speaker) => speaker !== active);
  return {
    id: `trio:${[active, ...others].slice(0, 3).join("|")}`,
    active,
    reason: "three speakers appear in this shot window",
  };
}

function subtitleRows(segments, clipStart, clipEnd) {
  return segments
    .filter((segment) => overlap(segment.start, segment.end, clipStart, clipEnd) > 0)
    .map((segment) => ({
      id: segment.id,
      speaker: segment.speaker || null,
      start: Number((Math.max(segment.start, clipStart) - clipStart).toFixed(3)),
      end: Number((Math.min(segment.end, clipEnd) - clipStart).toFixed(3)),
      text: segment.text || "",
    }));
}

function buildShots(segments, clipStart, clipEnd, speakerIds, maxShotDuration) {
  const shots = [];
  let cursor = clipStart;
  while (cursor < clipEnd - 0.01) {
    const hardEnd = Math.min(cursor + maxShotDuration, clipEnd);
    const nearbyEnd = segments
      .filter((segment) => segment.end > cursor + 4 && segment.end <= hardEnd)
      .map((segment) => segment.end)
      .sort((a, b) => b - a)[0];
    const end = nearbyEnd || hardEnd;
    const entries = speakersInWindow(segments, cursor, end);
    const picked = chooseTemplateId(entries, speakerIds);
    shots.push({
      start: Number((cursor - clipStart).toFixed(3)),
      end: Number((end - clipStart).toFixed(3)),
      templateId: picked.id,
      active: picked.active,
      reason: picked.reason,
    });
    cursor = end;
  }
  return shots;
}

function sourceVideos(sourceDir) {
  if (!sourceDir) return {};
  const entries = {};
  for (const [speaker, info] of Object.entries(DEFAULT_SPEAKERS)) {
    const path = join(sourceDir, info.video);
    entries[info.camera] = existsSync(path) ? path : null;
    entries[speaker] = { ...info, path: entries[info.camera] };
  }
  return entries;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.input || !args.out) {
    throw new Error("Usage: build-mix.mjs --input asr-or-clip.json --out mix.json [--start seconds --end seconds --title title]");
  }
  const raw = JSON.parse(await readFile(args.input, "utf8"));
  const input = normalizeInput(raw, args.input);
  const maxDuration = Number(args["max-duration"] || 180);
  const maxShotDuration = Number(args["max-shot"] || 10);
  const window = args.start && args.end
    ? { start: Number(args.start), end: Number(args.end) }
    : chooseWindow(input.segments, maxDuration);
  const clipStart = input.inputType === "clip" && window.start < input.sourceStart
    ? input.sourceStart + window.start
    : window.start;
  const clipEnd = input.inputType === "clip" && window.end <= input.sourceEnd - input.sourceStart + 0.001
    ? input.sourceStart + window.end
    : window.end;
  const duration = Number((clipEnd - clipStart).toFixed(3));
  if (duration > maxDuration + 0.001) {
    throw new Error(`Selected clip duration ${duration}s exceeds max duration ${maxDuration}s`);
  }

  const clipSegments = input.segments.filter((segment) => overlap(segment.start, segment.end, clipStart, clipEnd) > 0);
  const speakerIds = Object.keys(DEFAULT_SPEAKERS);
  const mix = {
    version: "podcast-mix/v0.1",
    createdAt: new Date().toISOString(),
    source: {
      inputType: input.inputType,
      asrJson: args.input,
      sourceDir: args["source-dir"] || null,
      videos: sourceVideos(args["source-dir"]),
    },
    clip: {
      title: args.title || input.title,
      start: Number(clipStart.toFixed(3)),
      end: Number(clipEnd.toFixed(3)),
      duration,
      timebase: "source-absolute-seconds",
    },
    speakers: DEFAULT_SPEAKERS,
    templates: buildTemplates(speakerIds),
    subtitles: subtitleRows(clipSegments, clipStart, clipEnd),
    shots: buildShots(clipSegments, clipStart, clipEnd, speakerIds, maxShotDuration),
    render: {
      aspect: "16:9",
      width: 1920,
      height: 1080,
      fps: 30,
      audioSource: "cam1",
      subtitleSource: "raw-asr",
      maxShotDuration,
    },
  };

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(mix, null, 2)}\n`);
  console.log(args.out);
  console.log(`duration=${duration}s shots=${mix.shots.length} subtitles=${mix.subtitles.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
