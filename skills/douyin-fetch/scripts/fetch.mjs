#!/usr/bin/env bun

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

const CWD = process.cwd();

// ─── Config ──────────────────────────────────────────────
function loadEnv() {
  const envPath = join(CWD, ".env");
  if (!existsSync(envPath)) {
    console.error("Missing .env file. Copy .env.example to .env and set your token.");
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      process.env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  }
}

// ─── API ─────────────────────────────────────────────────
async function fetchVideoDetail(awemeId, token) {
  const url = `https://api.tikhub.io/api/v1/douyin/web/fetch_one_video?aweme_id=${awemeId}&need_anchor_info=false`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.code !== 200) {
    throw new Error(`API returned code ${json.code}: ${json.message}`);
  }
  return json;
}

// ─── Extract ─────────────────────────────────────────────
function extractInfo(raw) {
  const d = raw.data.aweme_detail;

  // MP3
  const mp3Url = d.music?.play_url?.url_list?.[0] || null;

  // Cover: origin_cover (original aspect ratio), fallback to cover
  const coverUrl =
    d.video?.origin_cover?.url_list?.[0] ||
    d.video?.cover?.url_list?.[0] ||
    null;

  // MP4: prefer 1080p mp4, fallback to first mp4
  const bitRates = d.video?.bit_rate || [];
  const mp4Entry =
    bitRates.find((b) => b.gear_name === "normal_1080_0" && b.format === "mp4") ||
    bitRates.find((b) => b.format === "mp4");
  const mp4Url = mp4Entry?.play_addr?.url_list?.[0] || null;
  const mp4Quality = mp4Entry?.gear_name || "unknown";
  const mp4Height = mp4Entry?.play_addr?.height || 0;
  const mp4Width = mp4Entry?.play_addr?.width || 0;

  // Keywords from hashtags
  const keywords = (d.text_extra || [])
    .filter((t) => t.type === 1 && t.hashtag_name)
    .map((t) => t.hashtag_name);

  // Shownotes
  const chapterInfo = d.recommend_chapter_info || {};
  const shownotes = {
    abstract: chapterInfo.chapter_abstract || "",
    chapters: (chapterInfo.recommend_chapter_list || []).map((c) => ({
      title: c.desc || "",
      timestamp: c.timestamp || 0,
      points: (c.points || []).map((p) => p.desc || ""),
      details: (c.points || []).map((p) => p.detail || ""),
    })),
  };

  return {
    id: d.aweme_id,
    title: d.item_title || "",
    desc: d.desc || "",
    caption: d.caption || "",
    author: {
      nickname: d.author?.nickname || "",
      uid: d.author?.uid || "",
      secUid: d.author?.sec_uid || "",
      followerCount: d.author?.follower_count || 0,
    },
    duration: d.duration || 0,
    createTime: d.create_time || 0,
    mp3: { localPath: "audio.mp3", url: mp3Url },
    mp4: {
      localPath: "video.mp4",
      url: mp4Url,
      quality: mp4Quality,
      height: mp4Height,
      width: mp4Width,
    },
    cover: { localPath: "cover.jpeg", url: coverUrl },
    keywords,
    shownotes,
    stats: {
      diggCount: d.statistics?.digg_count || 0,
      collectCount: d.statistics?.collect_count || 0,
      commentCount: d.statistics?.comment_count || 0,
      shareCount: d.statistics?.share_count || 0,
    },
    shareUrl: d.share_url || "",
    fetchedAt: new Date().toISOString(),
  };
}

// ─── Download ────────────────────────────────────────────
async function downloadFile(url, dest) {
  if (!url) {
    console.log(`  ⏭ Skip (no URL): ${dest}`);
    return false;
  }
  console.log(`  ↓ Downloading: ${dest}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  ✗ Failed ${res.status}: ${dest}`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  const sizeMB = (buf.length / 1024 / 1024).toFixed(1);
  console.log(`  ✓ Saved: ${dest} (${sizeMB} MB)`);
  return true;
}

// ─── Index ───────────────────────────────────────────────
function updateIndex(dataDir, info) {
  const indexPath = join(dataDir, "index.json");
  let index = [];
  if (existsSync(indexPath)) {
    index = JSON.parse(readFileSync(indexPath, "utf-8"));
  }
  // Remove existing entry for this id
  index = index.filter((e) => e.id !== info.id);
  index.push({
    id: info.id,
    title: info.title,
    author: info.author.nickname,
    duration: info.duration,
    keywords: info.keywords,
    fetchedAt: info.fetchedAt,
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

// ─── Main ────────────────────────────────────────────────
async function main() {
  const { values } = parseArgs({
    options: {
      aweme_id: { type: "string" },
      url: { type: "string" },
      force: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values.aweme_id && !values.url) {
    console.error("Usage: bun run fetch.mjs --aweme_id=<id> [--force]");
    console.error("       bun run fetch.mjs --url=<douyin_url> [--force]");
    process.exit(1);
  }

  let awemeId = values.aweme_id;
  if (!awemeId && values.url) {
    let input = values.url;

    // 从任意文本中提取抖音相关 URL
    const urlMatch = input.match(/https?:\/\/(?:v\.douyin\.com|www\.douyin\.com|www\.iesdouyin\.com)\/\S+/);
    if (!urlMatch) {
      console.error(`未找到抖音链接: ${input}`);
      process.exit(1);
    }
    let resolvedUrl = urlMatch[0].replace(/[）\)。，,"""''\s]+$/, ""); // 去掉尾部可能的标点

    // 短链接（v.douyin.com）先跟随跳转拿到最终 URL
    if (/v\.douyin\.com/.test(resolvedUrl)) {
      console.log(`解析短链接: ${resolvedUrl}`);
      const res = await fetch(resolvedUrl, { method: "HEAD", redirect: "manual" });
      const location = res.headers.get("location");
      if (!location) {
        console.error(`短链接跳转失败: ${resolvedUrl}`);
        process.exit(1);
      }
      resolvedUrl = location;
      console.log(`跳转到: ${resolvedUrl}`);
    }
    const match = resolvedUrl.match(/\/video\/(\d+)/);
    if (!match) {
      console.error(`无法从 URL 提取 aweme_id: ${resolvedUrl}`);
      process.exit(1);
    }
    awemeId = match[1];
  }

  loadEnv();
  const token = process.env.TIKHUB_TOKEN;
  if (!token) {
    console.error("TIKHUB_TOKEN not set in .env");
    process.exit(1);
  }

  const dataDir = join(CWD, "data");
  const videoDir = join(dataDir, awemeId);

  if (existsSync(videoDir) && !values.force) {
    console.log(`Already fetched: ${awemeId} (use --force to re-fetch)`);
    process.exit(0);
  }

  mkdirSync(videoDir, { recursive: true });

  // 1. Fetch API
  console.log(`Fetching: ${awemeId}`);
  const raw = await fetchVideoDetail(awemeId, token);

  // 2. Save raw response
  const rawPath = join(videoDir, "raw.json");
  writeFileSync(rawPath, JSON.stringify(raw, null, 2));
  console.log(`Saved raw.json`);

  // 3. Extract structured info
  const info = extractInfo(raw);
  const infoPath = join(videoDir, "info.json");
  writeFileSync(infoPath, JSON.stringify(info, null, 2));
  console.log(`Saved info.json`);

  // 4. Download mp3 + mp4 + cover in parallel
  console.log("Downloading media...");
  await Promise.all([
    downloadFile(info.mp3.url, join(videoDir, "audio.mp3")),
    downloadFile(info.mp4.url, join(videoDir, "video.mp4")),
    downloadFile(info.cover.url, join(videoDir, "cover.jpeg")),
  ]);

  // 5. Update index
  updateIndex(dataDir, info);
  console.log("Updated index.json");

  console.log(`\nDone! → data/${awemeId}/`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
