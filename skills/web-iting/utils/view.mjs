import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, writeFile, mkdir, stat, rename } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomBytes } from "node:crypto";
import { resolve, join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
const exec = promisify(execFile),
  here = dirname(fileURLToPath(import.meta.url));
export async function probe(path) {
  return JSON.parse(
    (
      await exec("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path,
      ])
    ).stdout,
  );
}
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!m || (!m[1] && !m[2])) throw Error("range");
  let a = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2])),
    b = m[2] && m[1] ? Number(m[2]) : size - 1;
  if (
    !Number.isSafeInteger(a) ||
    !Number.isSafeInteger(b) ||
    a < 0 ||
    a >= size ||
    b < a
  )
    throw Error("range");
  return [a, Math.min(b, size - 1)];
}
export async function prepareView(video, cache) {
  video = resolve(video);
  cache = resolve(cache);
  const info = await probe(video);
  const vs = info.streams.find(
    (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
  );
  if (!vs) throw Error("需要视频文件");
  if (vs.codec_name !== "h264")
    throw Error("本地验证页目前要求 H.264 视频；不会自动重编码原片。");
  const st = await stat(video),
    key = createHash("sha256")
      .update(JSON.stringify([video, st.size, st.mtimeMs]))
      .digest("hex")
      .slice(0, 16);
  const dir = join(cache, key);
  await mkdir(dir, { recursive: true });
  const marker = join(dir, "manifest.json");
  try {
    const d = JSON.parse(await readFile(marker, "utf8"));
    await Promise.all(Object.values(d.files).map((p) => stat(p)));
    return d;
  } catch {}
  const files = {},
    audio = [],
    subtitles = [];
  async function extract(name, args) {
    const dest = join(dir, name),
      tmp = join(dir, "tmp-" + name);
    await exec(
      "ffmpeg",
      ["-v", "error", "-nostdin", "-y", "-i", video, ...args, tmp],
      { maxBuffer: 1024 * 1024 },
    );
    await rename(tmp, dest);
    files[name] = dest;
    return name;
  }
  const picture = await extract("video.mp4", [
    "-map",
    `0:${vs.index}`,
    "-c:v",
    "copy",
    "-an",
    "-sn",
    "-movflags",
    "+faststart",
  ]);
  for (const [i, s] of info.streams
    .filter((s) => s.codec_type === "audio")
    .entries()) {
    const language = /^(zh|chi|zho)/i.test(s.tags?.language || "")
      ? "zh"
      : s.tags?.language === "eng"
        ? "en"
        : `track-${i + 1}`;
    const label =
      language === "zh"
        ? "中文配音"
        : language === "en"
          ? "英文原声"
          : s.tags?.title || `音轨 ${i + 1}`;
    const url = await extract(`audio-${i}.m4a`, [
      "-map",
      `0:${s.index}`,
      "-vn",
      "-sn",
      "-c:a",
      s.codec_name === "aac" ? "copy" : "aac",
    ]);
    audio.push({ url, language, label });
  }
  for (const [i, s] of info.streams
    .filter((s) => s.codec_type === "subtitle")
    .entries()) {
    const language = /^(zh|chi|zho)/i.test(s.tags?.language || "")
      ? "zh"
      : s.tags?.language === "eng"
        ? "en"
        : `sub-${i + 1}`;
    const url = await extract(`subtitle-${i}.vtt`, [
      "-map",
      `0:${s.index}`,
      "-c:s",
      "webvtt",
    ]);
    subtitles.push({
      url,
      language,
      label:
        language === "zh"
          ? "简体中文"
          : language === "en"
            ? "English"
            : s.tags?.title || `字幕 ${i + 1}`,
    });
  }
  if (!audio.length) throw Error("视频没有音轨");
  const data = {
    title: basename(video),
    video: picture,
    audio,
    subtitles,
    files,
  };
  await writeFile(marker, JSON.stringify(data, null, 2));
  return data;
}
export async function serveView(data, port = 0) {
  const token = randomBytes(18).toString("hex"),
    prefix = `/${token}/`;
  const files = {
    ...data.files,
    "index.html": join(here, "player/index.html"),
    "player.js": join(here, "player/player.js"),
    "style.css": join(here, "player/style.css"),
  };
  const { files: privatePaths, ...manifest } = data;
  const server = createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        return res.end();
      }
      const path = new URL(req.url, "http://localhost").pathname;
      if (!path.startsWith(prefix)) {
        res.writeHead(404);
        return res.end();
      }
      const key = path.slice(prefix.length) || "index.html";
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; media-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'",
      );
      if (key === "manifest.json") {
        res.setHeader("Content-Type", "application/json");
        return res.end(req.method === "HEAD" ? "" : JSON.stringify(manifest));
      }
      const file = Object.hasOwn(files, key) ? files[key] : null;
      if (!file) {
        res.writeHead(404);
        return res.end();
      }
      const { size } = await stat(file);
      const type =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".vtt": "text/vtt; charset=utf-8",
          ".mp4": "video/mp4",
          ".m4a": "audio/mp4",
        }[extname(file)] || "application/octet-stream";
      let range;
      try {
        range = parseRange(req.headers.range, size);
      } catch {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        return res.end();
      }
      res.setHeader("Content-Type", type);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", range ? range[1] - range[0] + 1 : size);
      if (range)
        res.writeHead(206, {
          "Content-Range": `bytes ${range[0]}-${range[1]}/${size}`,
        });
      if (req.method === "HEAD") return res.end();
      const stream = createReadStream(
        file,
        range ? { start: range[0], end: range[1] } : {},
      );
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end("读取失败");
    }
  });
  await new Promise((ok, no) => {
    server.once("error", no);
    server.listen(port, "127.0.0.1", ok);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}${prefix}` };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [video, ...rest] = process.argv.slice(2);
  if (!video || video === "--help") {
    console.log(
      "node utils/view.mjs VIDEO [--cache DIR] [--port NUMBER]\nLocal-only player. Chinese audio/subtitles selected by default.",
    );
  } else {
    const value = (k, d) => {
      const i = rest.indexOf(k);
      return i < 0 ? d : rest[i + 1];
    };
    try {
      const data = await prepareView(
        video,
        value("--cache", join(dirname(resolve(video)), ".web-iting-player")),
      );
      const { url } = await serveView(data, Number(value("--port", "0")));
      console.log(url);
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
  }
}
