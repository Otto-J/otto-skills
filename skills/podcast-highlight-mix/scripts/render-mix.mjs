#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 1920;
const HEIGHT = 1080;
const PORT = 8878;
const CDP_PORT = 9338;

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

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log([cmd, ...args].join(" "));
    const child = spawn(cmd, args, { stdio: "inherit", ...options });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)));
  });
}

function send(ws, method, params = {}) {
  send.seq = (send.seq || 1) + 1;
  const id = send.seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    send.pending.set(id, { resolve, reject });
  });
}
send.pending = new Map();

async function waitJson(url, label) {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error(`${label} did not start`);
}

async function waitOk(url, label) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(250);
  }
  throw new Error(`${label} did not start`);
}

function videoByCamera(mix, camera) {
  const speaker = Object.values(mix.source.videos).find((item) => item && item.camera === camera);
  return speaker?.path || mix.source.videos[camera];
}

async function cutVideos(mix, outDir) {
  const duration = String(mix.clip.duration);
  for (const camera of ["cam1", "cam2", "cam3"]) {
    const input = videoByCamera(mix, camera);
    if (!input || !existsSync(input)) throw new Error(`Missing video for ${camera}: ${input}`);
    await run("ffmpeg", [
      "-y",
      "-ss", String(mix.clip.start),
      "-i", input,
      "-t", duration,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      join(outDir, `${camera}.mp4`),
    ]);
  }
}

function htmlForMix(mix) {
  const mixJson = JSON.stringify(mix).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(mix.clip.title)}</title>
  <style>
    :root {
      --paper: #f3f0ea;
      --line: rgba(255,255,255,0.22);
      --gold: #d7b56d;
      --cyan: #62d5cf;
      --coral: #ff7a62;
      --shadow: 0 30px 90px rgba(0,0,0,0.46);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #171411, #29231b 52%, #111312);
      font-family: "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
      color: var(--paper);
      overflow: hidden;
    }
    .scale-wrap { width: min(100vw, calc(100vh * 16 / 9)); aspect-ratio: 16 / 9; display: grid; place-items: center; }
    .stage {
      position: relative;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      transform: scale(calc(min(100vw / 1920, 100vh / 1080)));
      transform-origin: center;
      background:
        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255,255,255,0.035) 1px, transparent 1px),
        linear-gradient(145deg, #15120f, #2a241d 54%, #0f1412);
      background-size: 64px 64px, 64px 64px, auto;
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: var(--shadow);
    }
    .stage::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(120deg, rgba(215,181,109,0.08), transparent 38%),
        radial-gradient(circle at 70% 78%, rgba(98,213,207,0.11), transparent 42%);
      mix-blend-mode: screen;
    }
    .brand { position: absolute; left: 72px; top: 48px; display: flex; gap: 18px; align-items: center; z-index: 20; }
    .mark { width: 14px; height: 52px; background: linear-gradient(180deg, var(--cyan), var(--gold)); border-radius: 999px; box-shadow: 0 0 28px rgba(98,213,207,0.46); }
    .topic { display: grid; gap: 3px; letter-spacing: 0; }
    .series { font-size: 21px; color: rgba(243,240,234,0.64); font-weight: 500; }
    .title { font-size: 37px; line-height: 1.15; font-weight: 700; color: #fffaf0; text-shadow: 0 2px 18px rgba(0,0,0,0.36); }
    .video-layer { position: absolute; inset: 0; z-index: 5; }
    .slot {
      position: absolute;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.20);
      background: #0d0d0c;
      border-radius: 30px;
      box-shadow: 0 26px 80px rgba(0,0,0,0.36);
      opacity: 0;
      transform: scale(0.985);
      transition: left 50ms linear, top 50ms linear, width 50ms linear, height 50ms linear, opacity 50ms linear, transform 50ms linear, border-color 50ms linear;
    }
    .slot.visible { opacity: 1; transform: scale(1); }
    .slot.active { border-color: rgba(215,181,109,0.88); box-shadow: 0 28px 90px rgba(0,0,0,0.44), 0 0 0 4px rgba(215,181,109,0.13); }
    video { width: 100%; height: 100%; object-fit: cover; display: block; filter: saturate(0.98) contrast(1.02); }
    .cam1 video { object-position: 50% 50%; }
    .cam2 video { object-position: 44% 50%; }
    .cam3 video { object-position: 58% 50%; }
    .nameplate { position: absolute; left: 24px; bottom: 22px; display: flex; align-items: center; gap: 10px; padding: 10px 14px 10px 12px; border-radius: 999px; color: #fffaf0; font-size: 20px; font-weight: 650; background: rgba(0,0,0,0.46); backdrop-filter: blur(14px); }
    .nameplate::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--speaker-color); box-shadow: 0 0 18px var(--speaker-color); }
    .speaker-0 { --speaker-color: var(--cyan); }
    .speaker-1 { --speaker-color: var(--coral); }
    .speaker-2 { --speaker-color: var(--gold); }
    .caption-wrap { position: absolute; left: 240px; right: 240px; bottom: 58px; z-index: 30; min-height: 130px; display: grid; place-items: center; padding: 22px 38px; background: linear-gradient(180deg, rgba(12,11,9,0.58), rgba(12,11,9,0.82)); border: 1px solid rgba(255,255,255,0.16); border-radius: 28px; box-shadow: 0 22px 72px rgba(0,0,0,0.35); backdrop-filter: blur(18px); }
    .caption { margin: 0; color: #fffaf0; font-size: 38px; line-height: 1.34; text-align: center; font-weight: 700; text-shadow: 0 3px 16px rgba(0,0,0,0.55); }
  </style>
</head>
<body>
  <script id="mix-data" type="application/json">${mixJson}</script>
  <div class="scale-wrap">
    <main class="stage">
      <header class="brand"><div class="mark"></div><div class="topic"><div class="series">Vibe Coding Podcast</div><div class="title"></div></div></header>
      <section class="video-layer" id="video-layer"></section>
      <footer class="caption-wrap"><p class="caption" id="caption"></p></footer>
    </main>
  </div>
  <script>
    const mix = JSON.parse(document.getElementById("mix-data").textContent);
    document.querySelector(".title").textContent = mix.clip.title;
    const videoLayer = document.getElementById("video-layer");
    const caption = document.getElementById("caption");
    const videos = {};
    const slots = {};
    const speakerIds = Object.keys(mix.speakers);
    const byCamera = Object.fromEntries(speakerIds.map((speaker) => [mix.speakers[speaker].camera, speaker]));
    const speakerClass = Object.fromEntries(speakerIds.map((speaker, index) => [speaker, "speaker-" + index]));

    for (const speaker of speakerIds) {
      const info = mix.speakers[speaker];
      const slot = document.createElement("article");
      slot.className = "slot " + info.camera + " " + speakerClass[speaker];
      const video = document.createElement("video");
      video.preload = "auto";
      video.playsInline = true;
      video.muted = true;
      video.src = "./" + info.camera + ".mp4";
      const name = document.createElement("div");
      name.className = "nameplate";
      name.textContent = info.name;
      slot.append(video, name);
      videoLayer.append(slot);
      videos[speaker] = video;
      slots[speaker] = slot;
    }

    const videoSafeArea = { top: 142, bottom: 876 };
    const centerTop = (height) => Math.round(videoSafeArea.top + (videoSafeArea.bottom - videoSafeArea.top - height) / 2);
    const duoTop = centerTop(720);
    const trioTop = centerTop(546);
    const boxes = {
      solo: { primary: { left: 320, top: centerTop(720), width: 1280, height: 720 } },
      duo: {
        left: { left: 180, top: duoTop, width: 760, height: 720 },
        right: { left: 980, top: duoTop, width: 760, height: 720 }
      },
      trio: {
        primary: { left: 154, top: trioTop, width: 960, height: 540 },
        sideTop: { left: 1188, top: trioTop, width: 578, height: 258 },
        sideBottom: { left: 1188, top: trioTop + 288, width: 578, height: 258 }
      }
    };

    function templateById(id) {
      return mix.templates.find((template) => template.id === id);
    }
    function shotAt(time) {
      return mix.shots.find((shot) => time >= shot.start && time < shot.end) || mix.shots[mix.shots.length - 1];
    }
    function subtitleAt(time) {
      const current = mix.subtitles.find((item) => time >= item.start && time < item.end);
      if (current) return current;
      const previous = [...mix.subtitles].reverse().find((item) => item.end <= time && time - item.end < 0.9);
      return previous || { text: "" };
    }
    function setSlot(speaker, box, active) {
      const slot = slots[speaker];
      Object.assign(slot.style, { left: box.left + "px", top: box.top + "px", width: box.width + "px", height: box.height + "px" });
      slot.classList.add("visible");
      slot.classList.toggle("active", active);
    }
    function applyShot(shot) {
      const template = templateById(shot.templateId);
      const visible = [];
      for (const slot of template.slots) {
        visible.push(slot.speaker);
        setSlot(slot.speaker, boxes[template.layout][slot.role], shot.active === slot.speaker);
      }
      for (const speaker of speakerIds) {
        if (!visible.includes(speaker)) slots[speaker].classList.remove("visible", "active");
      }
    }
    function syncFollowers(time) {
      for (const video of Object.values(videos)) {
        if (Math.abs(video.currentTime - time) > 0.18) video.currentTime = time;
      }
    }
    function tick() {
      const time = videos[speakerIds[0]].currentTime;
      caption.textContent = subtitleAt(time).text;
      applyShot(shotAt(time));
      syncFollowers(time);
      requestAnimationFrame(tick);
    }
    window.recordStart = async () => {
      for (const video of Object.values(videos)) {
        video.pause();
        video.muted = true;
        video.currentTime = 0;
        video.playbackRate = 1;
      }
      await Promise.all(Object.values(videos).map((video) => new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          video.removeEventListener("seeked", done);
          resolve();
        };
        video.addEventListener("seeked", done, { once: true });
        if (video.readyState >= 2 && video.currentTime < 0.04) setTimeout(done, 0);
        setTimeout(done, 800);
      })));
      applyShot(shotAt(0));
      caption.textContent = subtitleAt(0).text;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(Object.values(videos).map((video) => video.play()));
      return true;
    };
    applyShot(mix.shots[0]);
    caption.textContent = subtitleAt(0).text;
    tick();
  </script>
</body>
</html>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

async function writeRenderer(mix, outDir) {
  await writeFile(join(outDir, "index.html"), htmlForMix(mix));
  await writeFile(join(outDir, "mix.json"), `${JSON.stringify(mix, null, 2)}\n`);
}

async function record(outDir, duration, fps) {
  const framesDir = join(outDir, "frames");
  const videoOnly = join(outDir, "video-only.mp4");
  const final = join(outDir, "highlight.mp4");
  if (existsSync(framesDir)) await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: outDir,
    stdio: ["ignore", "ignore", "pipe"],
  });
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-sync",
    "--no-first-run",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    `--remote-debugging-port=${CDP_PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    `--user-data-dir=${join(outDir, ".chrome-profile")}`,
    `http://127.0.0.1:${PORT}/index.html`,
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let ws;
  try {
    await waitOk(`http://127.0.0.1:${PORT}/index.html`, "HTTP server");
    const pages = await waitJson(`http://127.0.0.1:${CDP_PORT}/json`, "Chrome DevTools endpoint");
    const page = pages.find((item) => item.type === "page") || pages[0];
    ws = new WebSocket(page.webSocketDebuggerUrl);

    let latestFrame = null;
    let browserFrames = 0;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "Page.screencastFrame") {
        browserFrames++;
        latestFrame = Buffer.from(msg.params.data, "base64");
        ws.send(JSON.stringify({ id: ++send.seq, method: "Page.screencastFrameAck", params: { sessionId: msg.params.sessionId } }));
        return;
      }
      if (msg.id && send.pending.has(msg.id)) {
        const item = send.pending.get(msg.id);
        send.pending.delete(msg.id);
        if (msg.error) item.reject(new Error(msg.error.message));
        else item.resolve(msg.result);
      }
    };
    await new Promise((resolve) => { ws.onopen = resolve; });
    await send(ws, "Page.enable");
    await send(ws, "Runtime.enable");
    await send(ws, "Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
    await send(ws, "Runtime.evaluate", {
      awaitPromise: true,
      expression: `new Promise((resolve) => {
        const done = () => {
          const videos = [...document.querySelectorAll('video')];
          if (videos.length === 3 && videos.every(v => v.readyState >= 2)) resolve(true);
          else setTimeout(done, 100);
        };
        done();
      })`,
    });
    await send(ws, "Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
    await send(ws, "Runtime.evaluate", { awaitPromise: true, expression: "window.recordStart()" });
    const initialShot = await send(ws, "Page.captureScreenshot", {
      format: "jpeg",
      quality: 92,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
      captureBeyondViewport: false,
      fromSurface: true,
    });
    latestFrame = Buffer.from(initialShot.data, "base64");
    const total = Math.ceil(duration * fps);
    const start = performance.now();
    for (let i = 0; i < total; i++) {
      const delay = start + (i * 1000 / fps) - performance.now();
      if (delay > 1) await sleep(delay);
      if (!latestFrame) throw new Error("No browser frame captured");
      await writeFile(join(framesDir, `${String(i + 1).padStart(6, "0")}.jpg`), latestFrame);
      if ((i + 1) % 300 === 0 || i + 1 === total) console.log(`recorded frames ${i + 1}/${total}, browser frames ${browserFrames}`);
    }
    await send(ws, "Page.stopScreencast");
  } finally {
    if (ws) ws.close();
    chrome.kill("SIGTERM");
    server.kill("SIGTERM");
  }

  await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", join(framesDir, "%06d.jpg"), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(fps), videoOnly]);
  await run("ffmpeg", ["-y", "-i", videoOnly, "-i", join(outDir, "cam1.mp4"), "-map", "0:v:0", "-map", "1:a:0", "-t", String(duration), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final]);
  return final;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.mix || !args.out) throw new Error("Usage: render-mix.mjs --mix mix.json --out output-dir");
  const mix = JSON.parse(await readFile(args.mix, "utf8"));
  const outDir = args.out;
  await mkdir(outDir, { recursive: true });
  await writeRenderer(mix, outDir);
  await cutVideos(mix, outDir);
  const final = await record(outDir, mix.clip.duration, mix.render?.fps || 30);
  console.log(final);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
