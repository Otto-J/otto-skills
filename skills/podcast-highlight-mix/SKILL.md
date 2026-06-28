---
name: podcast-highlight-mix
description: Build a data-driven highlight mix for a synced three-camera video podcast from ASR JSON. Use this whenever the user gives a folder with 3 camera videos plus ASR/diarization JSON and wants high-light selection, speaker-to-camera mapping, a mix.json, automatic director shots, HTML/CSS rendering, or MP4 export planning.
---

# Podcast Highlight Mix

Create a `mix.json` that turns a long three-camera podcast into a short directed highlight.

The core idea is to keep judgment and rendering separate:

- The agent or LM chooses the highlight range and title from ASR context.
- A deterministic script builds subtitles, template definitions, and shot timing.
- The renderer consumes `mix.json` and produces HTML preview or MP4.

## Inputs

Expect a folder with:

- Three synchronized camera videos.
- One ASR JSON with diarization segments.
- Optional existing clip JSON files generated from the full ASR JSON.

For the current Xiaoyu workflow, the durable mapping is:

- `SPEAKER_0` -> `xinbao` -> `cam2`
- `SPEAKER_1` -> `Smart` -> `cam3`
- `SPEAKER_2` -> `晓宇` -> `cam1`

When the mapping is unknown, infer it from the intro first. Look for self-introductions such as “我是…”. Ask the user only if the intro evidence is missing or ambiguous.

## Workflow

1. Inspect the ASR JSON shape and video names.
2. Use LM judgment to choose one highlight under the target duration.
   - Prefer concrete stories, sharp questions, topic turns, disagreement, laughter, and clear takeaways.
   - Return one range: absolute `start`, absolute `end`, and a short title.
3. Run `scripts/build-mix.mjs` with that range.
4. Inspect the resulting `mix.json`.
5. Use the renderer or HTML template to export MP4.

Do not rewrite subtitles by default. Use raw ASR text for burned-in subtitles unless the user asks for a polished subtitle track.

## mix.json Contract

The top level should contain:

- `version`: schema version.
- `source`: input ASR/video paths.
- `clip`: absolute and relative timing for the chosen highlight.
- `speakers`: person/camera mapping.
- `templates`: all precomputed layout choices.
- `subtitles`: raw ASR subtitles in clip-relative seconds.
- `shots`: the actual director timeline.
- `render`: output defaults such as aspect ratio, fps, and audio source.

Templates are precomputed so the renderer can pick by ID:

- `solo:SPEAKER_2`
- `duo:SPEAKER_1|SPEAKER_2`
- `trio:SPEAKER_2|SPEAKER_0|SPEAKER_1`

The order after `duo:` and `trio:` is layout order:

- `duo`: left, right
- `trio`: primary, sideTop, sideBottom

Shots reference templates:

```json
{
  "start": 16,
  "end": 24,
  "templateId": "trio:SPEAKER_2|SPEAKER_0|SPEAKER_1",
  "active": "SPEAKER_2",
  "reason": "three speakers appear in this shot window"
}
```

Keep each shot under 10 seconds unless the user asks for slower cutting.

## Script Usage

Generate a mix from the full ASR JSON:

```bash
node podcast-highlight-mix/scripts/build-mix.mjs \
  --input /path/to/asr.json \
  --source-dir /path/to/video-folder \
  --start 678 \
  --end 781 \
  --title "为什么零基础学员要自己做作业批改工具" \
  --out /path/to/mix.json
```

Generate a mix from an existing clip JSON:

```bash
node podcast-highlight-mix/scripts/build-mix.mjs \
  --input /path/to/clip.json \
  --start 0 \
  --end 170 \
  --title "教非程序员写程序最需要的是耐心" \
  --out /path/to/mix.json
```

If `--start` and `--end` are omitted, the script picks a heuristic window. For production, prefer LM-selected ranges.

## Quality Checks

After producing `mix.json`, verify:

- `clip.duration <= target duration`.
- Every shot duration is `<= maxShotDuration`.
- Every shot has a valid `templateId`.
- Subtitles preserve raw ASR text.
- Speaker IDs in shots exist in `speakers`.
- `render.audioSource` points to one camera only.

## Safety And Privacy

This skill only reads local media metadata and ASR JSON, then writes local JSON/VTT style outputs. It should not upload files, call remote APIs, delete source videos, or modify source ASR data.
