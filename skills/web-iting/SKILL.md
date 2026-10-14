---
name: web-iting
description: "Local audio/video Chinese dubbing: ASR, reviewed translation, cached TTS, adaptive alignment, dual-track video, and a local browser player."
---

Use the installed `web-iting` CLI for ASR, translation and TTS. Read `web-iting <command> --help` before using an unfamiliar command. If unavailable, install the local package `/Users/otto/mycode/self/web-iting/web-iting-0.1.0.tgz` with npm. The utilities below use Node.js, ffmpeg and ffprobe, with no additional npm dependencies. Resolve `utils/` relative to this skill.

## Default delivery workflow

For a localization request, deliver audio for audio input, and video for video input. Use the existing project and provider settings when available. Download platform URLs through yt-dlp first; the CLI's `run` URL support is for direct media URLs. Do not publish or upload a finished result unless requested.

1. Locate existing original media, source ASR, reviewed Chinese transcript and cached TTS before invoking providers. Preserve originals and previous deliveries. Do not redo an entire translation or TTS set for a local defect.
2. For new media, use `web-iting run MEDIA --to translate` with the requested project/output/env-file and ASR provider. Translation must pass the CLI's LLM quality review: proper names and isolated English terms are allowed, substantial untranslated English is not. A changed transcript requires renewed review; never set the quality flag manually to bypass review.
3. Generate TTS at speed 1 using `web-iting tts PROJECT --timing natural --speed 1`. Reuse cached segments. This CLI may fail its original-speed timing gate after writing all segments; only proceed when `generated.json` is complete and the checks in `render.mjs` pass. A provider failure or incomplete synthesis must not be treated as a timing-only failure. Do not repeatedly call TTS merely because the natural-speed gate failed.
4. Run the deterministic renderer below. It checks transcript coverage, translation-review digest and TTS text/timestamps, measures decoded audio duration, applies local 1.0–1.5x tempo only where needed, and writes a timing report. It never calls ASR, translation or TTS providers. Audio-only delivery concatenates the natural-speed Chinese speech. Video retains picture speed, has Chinese audio and subtitles first/default, with English selectable. Language, title, name and handler metadata are written explicitly. Chinese subtitles follow the rendered speech using phrase-length approximation, not word-level forced alignment. Limit each cue to approximately 28 full-width characters (ASCII counts as half-width), split at punctuation or spaces where possible, and proportionally distribute offsets within the original cue without changing its overall start/end. Use `node utils/captions.mjs INPUT.srt NEW_OUTPUT.srt` to repair an existing subtitle file, then remux only the Chinese subtitle track with all other streams copied. Do not regenerate TTS for subtitle layout fixes.
5. If lag exceeds 15 seconds or speech spills beyond the source ending, the renderer stops before delivery. Inspect `timing.json`, report the affected segment IDs, and revise only necessary passages. Never silently cut speech, exceed 1.5x, or rewrite everything. Output must be a new directory; the renderer refuses an existing directory.
6. Check `verification.json` and preview using the local player. External players can interpret metadata differently; a successful ffprobe check alone does not prove their UI works. Do not promise universal compatibility. Current video utilities require H.264; ask about conversion if another codec is encountered.

```bash
node "$SKILL_DIR/utils/render.mjs" \
  --input "/path/original.mp4" \
  --source "/path/asr/transcript.json" \
  --translated "/path/translation/zh-CN/transcript.json" \
  --generated "/path/tts/generated.json" \
  --output "/path/new-delivery"
```

This is the default media delivery path. The legacy CLI `package` stage creates a podcast package and is not the default for a video localization request. `render.mjs` currently creates a clean Chinese track; low-volume original-sound mixing is a separate option to discuss when requested, not an implicit modification to the English original track.

## Local browser verification

```bash
node "$SKILL_DIR/utils/view.mjs" "/path/new-delivery/中英双音轨.mp4"
```

Open the printed localhost URL. Optional `--port 8787` and `--cache /path/cache`. Stop with Ctrl+C. First launch extracts a silent H.264 MP4, separate audio tracks and WebVTT subtitles to a cache; subsequent launches reuse the same unchanged file's cache. Extraction requires disk space roughly comparable to the input. The original is unchanged. The bundled `utils/player/index.html` is served by Node; opening it as a `file://` URL is not supported.

The player defaults to Chinese audio and Chinese subtitles, supports language switching, pause/seek, volume and overall playback rate. It uses synchronized video/audio elements because native `audioTracks` switching is not consistently supported across browsers. The rate control changes the whole playback rate; adaptive TTS speed is already baked into the audio by the renderer. The displayed sync difference measures the two media clocks, not semantic alignment with the speaker's mouth. Fullscreen/native casting may behave differently; use the normal page for verification.

Security: bind only to `127.0.0.1`, use a random URL token, serve an exact file allowlist, never expose credentials, and never upload media. Do not add LAN listening or analytics by default. Unknown language metadata receives numbered labels rather than an invented language. Do not infer a language from track order.

Test utilities locally:

```bash
node --test "$SKILL_DIR/utils/media.test.mjs" "$SKILL_DIR/utils/captions.test.mjs"
```

For the legacy processing console specifically, use `web-iting server --open`.
