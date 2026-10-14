import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { parseRange, prepareView, serveView, probe } from "./view.mjs";
import { pace, render, validate } from "./render.mjs";
const exec = promisify(execFile);
test("range requests support seeking and reject malformed input", () => {
  assert.deepEqual(parseRange("bytes=3-7", 10), [3, 7]);
  assert.deepEqual(parseRange("bytes=-3", 10), [7, 9]);
  assert.deepEqual(parseRange("bytes=8-", 10), [8, 9]);
  assert.deepEqual(parseRange("bytes=0-99", 10), [0, 9]);
  for (const r of [
    "bytes=10-",
    "bytes=4-2",
    "bytes=-0",
    "bytes=0-1,3-4",
    "bytes=-",
    "garbage",
  ])
    assert.throws(() => parseRange(r, 10));
});
test("adaptive pace leaves available speech natural and caps backlog acceleration", () => {
  assert.deepEqual(pace({ startMs: 1000, endMs: 5000 }, 2000, 0, 10000), {
    start: 1000,
    speed: 1,
  });
  assert.equal(
    pace({ startMs: 1000, endMs: 5000 }, 8000, 5000, 10000).speed,
    1.5,
  );
  assert.equal(
    pace({ startMs: 1000, endMs: 5000 }, 6000, 1000, 10000).speed,
    6000 / 5500,
  );
});
test("offline audio/video delivery, metadata, quality rejection and local viewer isolation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "web-iting-test-"));
  let server;
  try {
    const wav = join(dir, "speech.wav"),
      video = join(dir, "source.mp4");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=500:duration=2",
      "-y",
      wav,
    ]);
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=160x90:d=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=200:duration=6",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-y",
      video,
    ]);
    const seg = { id: "s1", startMs: 500, endMs: 3000, text: "Hello." },
      source = { durationMs: 6000, segments: [seg] },
      translated = { segments: [{ ...seg, text: "你好。" }], metadata: {} };
    translated.metadata.translationQuality = {
      passed: true,
      digest: createHash("sha256")
        .update(
          JSON.stringify(
            translated.segments.map(({ id, text }) => ({ id, text })),
          ),
        )
        .digest("hex"),
    };
    const generated = {
      segments: [
        {
          segmentId: "s1",
          sourceSegmentIds: ["s1"],
          startMs: 500,
          endMs: 3000,
          text: "你好。",
          audioPath: wav,
        },
      ],
    };
    validate(source, translated, generated);
    assert.throws(
      () =>
        validate(
          source,
          {
            ...translated,
            segments: [{ ...translated.segments[0], text: "Changed" }],
          },
          generated,
        ),
      /质检/,
    );
    assert.throws(
      () =>
        validate(source, translated, {
          segments: [{ ...generated.segments[0], text: "旧配音" }],
        }),
      /过期/,
    );
    for (const [name, value] of Object.entries({
      source,
      translated,
      generated,
    }))
      await writeFile(join(dir, name + ".json"), JSON.stringify(value));
    const options = {
      input: video,
      source: join(dir, "source.json"),
      translated: join(dir, "translated.json"),
      generated: join(dir, "generated.json"),
      output: join(dir, "video-out"),
    };
    const result = await render(options);
    const info = await probe(result);
    assert.deepEqual(
      info.streams
        .filter((s) => s.codec_type === "audio")
        .map((s) => [s.tags.language, s.disposition.default]),
      [
        ["zho", 1],
        ["eng", 0],
      ],
    );
    assert.deepEqual(
      info.streams
        .filter((s) => s.codec_type === "subtitle")
        .map((s) => [s.tags.language, s.disposition.default]),
      [
        ["zho", 1],
        ["eng", 0],
      ],
    );
    await assert.rejects(render(options), /EEXIST/);
    const originalAudio = join(dir, "source.m4a");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-i",
      video,
      "-vn",
      "-c:a",
      "copy",
      originalAudio,
    ]);
    const audioResult = await render({
      ...options,
      input: originalAudio,
      output: join(dir, "audio-out"),
    });
    assert.equal(
      (await probe(audioResult)).streams.some((s) => s.codec_type === "video"),
      false,
    );
    for (const doc of [source, translated, generated]) {
      doc.segments[0].startMs = 5000;
      doc.segments[0].endMs = 5500;
    }
    for (const [name, value] of Object.entries({source, translated, generated})) {
      await writeFile(join(dir, name + '.json'), JSON.stringify(value));
    }
    const blocked = join(dir, 'blocked');
    await assert.rejects(render({...options, output: blocked}), /积压超限/);
    assert.equal(JSON.parse(await readFile(join(blocked, 'timing.json'))).blocked, true);
    await assert.rejects(readFile(join(blocked, '中英双音轨.mp4')), /ENOENT/);
    const data = await prepareView(result, join(dir, "cache"));
    assert.equal(data.subtitles.length, 2);
    assert.equal(data.audio[0].label, "中文配音");
    assert.match(
      await readFile(data.files[data.subtitles[0].url], "utf8"),
      /你好/,
    );
    assert.deepEqual(await prepareView(result, join(dir, "cache")), data);
    const service = await serveView(data);
    server = service.server;
    const manifest = await (await fetch(service.url + "manifest.json")).json();
    assert.equal(manifest.files, undefined);
    const partial = await fetch(service.url + data.video, {
      headers: { Range: "bytes=0-9" },
    });
    assert.equal(partial.status, 206);
    assert.equal((await partial.arrayBuffer()).byteLength, 10);
    assert.equal(
      (
        await fetch(service.url + data.video, {
          headers: { Range: "bytes=999999999-" },
        })
      ).status,
      416,
    );
    assert.equal(
      (await fetch(service.url + "index.html", { method: "HEAD" })).status,
      200,
    );
    assert.equal(
      (await fetch(service.url + "index.html", { method: "POST" })).status,
      405,
    );
    for (const url of [
      new URL("/manifest.json", service.url),
      service.url + "../source.json",
      service.url + "%2e%2e%2fsource.json",
      service.url + "__proto__",
    ])
      assert.equal((await fetch(url)).status, 404);
  } finally {
    if (server) {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    await rm(dir, { recursive: true, force: true });
  }
});
