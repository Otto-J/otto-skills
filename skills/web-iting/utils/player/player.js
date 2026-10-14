const video = document.querySelector("#video"),
  audio = document.querySelector("#audio");
const voices = document.querySelector("#voices"),
  subs = document.querySelector("#subs"),
  status = document.querySelector("#status");
let switching = false,
  serial = 0,
  chosen = "zh";
const error = (e) => {
  video.pause();
  audio.pause();
  status.textContent = `播放失败：${e.message || e}。请检查浏览器是否支持该媒体编码。`;
};
const sync = () => {
  if (
    audio.readyState >= 1 &&
    Number.isFinite(video.currentTime) &&
    Math.abs(audio.currentTime - video.currentTime) > 0.15
  )
    audio.currentTime = video.currentTime;
  audio.playbackRate = video.playbackRate;
};
async function startAudio() {
  if (switching || video.paused || video.seeking || video.readyState < 3)
    return;
  sync();
  try {
    await audio.play();
  } catch (e) {
    if (e.name !== "AbortError") error(e);
  }
}
async function selectAudio() {
  const id = ++serial,
    wasPlaying = !video.paused;
  switching = true;
  audio.pause();
  video.pause();
  audio.src = voices.value;
  audio.load();
  status.textContent = "正在切换音轨…";
  try {
    await new Promise((ok, no) => {
      if (audio.readyState >= 1) return ok();
      audio.addEventListener("loadedmetadata", ok, { once: true });
      audio.addEventListener("error", () => no(new Error("音轨无法加载")), {
        once: true,
      });
    });
    if (id !== serial) return;
    sync();
    switching = false;
    if (wasPlaying) await video.play();
    status.textContent = `${voices.selectedOptions[0].textContent} · 已就绪`;
  } catch (e) {
    switching = false;
    error(e);
  }
}
function selectSubs() {
  chosen = subs.value;
  for (const [i, t] of Array.from(video.textTracks).entries())
    t.mode = String(i) === chosen ? "showing" : "disabled";
}
video.addEventListener("play", startAudio);
video.addEventListener("playing", startAudio);
video.addEventListener("pause", () => audio.pause());
video.addEventListener("waiting", () => audio.pause());
video.addEventListener("seeking", () => audio.pause());
video.addEventListener("seeked", () => {
  sync();
  startAudio();
});
video.addEventListener("ratechange", sync);
video.addEventListener("ended", () => audio.pause());
video.addEventListener("volumechange", () => {
  if (!video.muted) video.muted = true;
});
video.addEventListener("error", () => error("画面无法解码"));
audio.addEventListener("error", () => error("音轨无法解码"));
voices.addEventListener("change", selectAudio);
subs.addEventListener("change", selectSubs);
document.querySelector("#rate").onchange = (e) =>
  (video.playbackRate = Number(e.target.value));
document.querySelector("#volume").oninput = (e) =>
  (audio.volume = Number(e.target.value));
setInterval(() => {
  if (!video.paused && !switching) {
    sync();
    startAudio();
    status.textContent = `${voices.selectedOptions[0]?.textContent} · ${video.currentTime.toFixed(1)} 秒 · 同步差 ${Math.abs(audio.currentTime - video.currentTime).toFixed(2)} 秒`;
  }
}, 400);
try {
  const data = await (await fetch("manifest.json")).json();
  document.querySelector("#title").textContent = data.title;
  video.src = data.video;
  for (const a of data.audio) {
    const o = new Option(a.label, a.url);
    voices.add(o);
    if (a.language === "zh") voices.value = a.url;
  }
  subs.add(new Option("关闭字幕", "off"));
  for (const [i, s] of data.subtitles.entries()) {
    subs.add(new Option(s.label, String(i)));
    const t = document.createElement("track");
    t.kind = "subtitles";
    t.label = s.label;
    t.srclang = s.language;
    t.src = s.url;
    t.default = i === data.subtitles.findIndex((s) => s.language === "zh");
    t.onload = selectSubs;
    video.append(t);
  }
  const zh = data.subtitles.findIndex((s) => s.language === "zh");
  subs.value = zh < 0 ? "off" : String(zh);
  selectSubs();
  await selectAudio();
} catch (e) {
  error(e);
}
