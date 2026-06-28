---
name: yt-dlp
description: Use when downloading or inspecting videos, audio, subtitles, covers, metadata, playlists, or supported media URLs with yt-dlp on macOS. Trigger for YouTube/Bilibili/video URL download requests, format selection, audio extraction, subtitle download, cookie/browser-session usage, and local yt-dlp binary setup or troubleshooting.
metadata:
  short-description: Download and inspect media URLs with yt-dlp
---

# yt-dlp

Use `yt-dlp` as a CLI for downloading and inspecting supported media URLs. Prefer the bundled binary shipped with this skill, with `PATH` as a fallback when the bundled file is unavailable.

```bash
~/.agents/skills/yt-dlp/bin/yt-dlp
~/.codex/skills/yt-dlp/bin/yt-dlp
```

## First checks

Check the binary before running a download. Resolve the command from the current skill install first:

```bash
for candidate in \
  "$HOME/.agents/skills/yt-dlp/bin/yt-dlp" \
  "$HOME/.codex/skills/yt-dlp/bin/yt-dlp" \
  "$HOME/mycode/otto-skills/skills/yt-dlp/bin/yt-dlp" \
  "$(command -v yt-dlp 2>/dev/null)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then YTDLP="$candidate"; break; fi
done
"$YTDLP" --version
```

If the file has a misleading suffix such as `.dmg`, inspect it with `file`. A valid standalone macOS build reports `Mach-O universal binary` or a specific Mach-O executable architecture. Rename it to `yt-dlp` before placing it under `bin/`.

## YouTube downloads (default behavior)

YouTube now requires both authentication and a JavaScript runtime to extract media URLs. The bundled `youtube-dl` wrapper script bakes in the working defaults for this machine:

- **Edge cookies** (`--cookies-from-browser edge`) — bypasses "Sign in to confirm you're not a bot"
- **node as JS runtime** (`--js-runtimes node:<path>`) — solves YouTube's n challenge; without it only storyboard images are available
- **Audio extraction to MP3** at best quality (`-x --audio-format mp3 --audio-quality 0`)
- **Subtitles** — manual + auto, Chinese and English (`--write-subs --write-auto-subs --sub-langs "zh.*,en.*"`)

### Using the wrapper

```bash
# Default: audio MP3 + subtitles
~/.agents/skills/yt-dlp/bin/youtube-dl "https://www.youtube.com/watch?v=XXXX"

# Download video+audio instead of audio only
~/.agents/skills/yt-dlp/bin/youtube-dl --video "https://www.youtube.com/watch?v=XXXX"

# Skip subtitles
~/.agents/skills/yt-dlp/bin/youtube-dl --no-subs "https://www.youtube.com/watch?v=XXXX"

# List available formats
~/.agents/skills/yt-dlp/bin/youtube-dl --list-formats "https://www.youtube.com/watch?v=XXXX"
```

### Equivalent raw yt-dlp command

If the wrapper is unavailable, use the raw binary with these flags:

```bash
YTDLP="$HOME/.agents/skills/yt-dlp/bin/yt-dlp"
"$YTDLP" --no-playlist --no-update \
  --cookies-from-browser edge \
  --js-runtimes "node:$(command -v node)" \
  -x --audio-format mp3 --audio-quality 0 \
  --write-subs --write-auto-subs --sub-langs "zh.*,en.*" \
  -o "%(title).200B [%(id)s].%(ext)s" \
  "https://www.youtube.com/watch?v=XXXX"
```

### Sandbox note

The bundled PyInstaller binary fails with `Failed to initialize sync semaphore` inside the sandbox. Run yt-dlp with escalated permissions (`sandbox_permissions: require_escalated`).

## Command pattern

Set a variable so examples use the bundled binary:

```bash
for candidate in \
  "$HOME/.agents/skills/yt-dlp/bin/yt-dlp" \
  "$HOME/.codex/skills/yt-dlp/bin/yt-dlp" \
  "$HOME/mycode/otto-skills/skills/yt-dlp/bin/yt-dlp" \
  "$(command -v yt-dlp 2>/dev/null)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then YTDLP="$candidate"; break; fi
done
```

Use quoted URLs. Add `--no-playlist` for single-video requests when the URL may point to a playlist. For YouTube URLs specifically, prefer the `youtube-dl` wrapper described above.

## Common tasks

Download a single video:

```bash
"$YTDLP" --no-playlist -o "%(title).200B [%(id)s].%(ext)s" "URL"
```

List available formats:

```bash
"$YTDLP" -F "URL"
```

Download best video plus best audio with fallback:

```bash
"$YTDLP" -f "bestvideo+bestaudio/best" "URL"
```

Extract audio as MP3:

```bash
"$YTDLP" -x --audio-format mp3 --audio-quality 0 -o "%(title).200B [%(id)s].%(ext)s" "URL"
```

Download subtitles and automatic subtitles:

```bash
"$YTDLP" --write-subs --write-auto-subs --sub-langs "zh.*,en.*" --skip-download "URL"
```

Download thumbnail and metadata:

```bash
"$YTDLP" --write-thumbnail --write-info-json --skip-download "URL"
```

Download a playlist into a folder:

```bash
"$YTDLP" -o "%(playlist_title).200B/%(playlist_index)03d - %(title).200B [%(id)s].%(ext)s" "URL"
```

## Browser cookies

For videos that require the user's logged-in session, use browser cookies only after the user clearly asks for authenticated access or the site requires it:

```bash
"$YTDLP" --cookies-from-browser chrome "URL"
```

Do not print, save, or share cookie contents. Treat generated cookie files and info JSON from private URLs as sensitive local data.

## Troubleshooting

- `Permission denied`: run `chmod +x` on the bundled `bin/yt-dlp` inside the installed skill directory.
- Finder opens it as an app/image: run it from Terminal; this is a CLI binary.
- `ffmpeg` missing: install it with Homebrew when audio conversion or muxing fails: `brew install ffmpeg`.
- Site extractor errors: check `"$YTDLP" --version`, then consider `"$YTDLP" -U` if the binary supports self-update.
- Unexpected playlist download: add `--no-playlist`.

## Output hygiene

Save downloads under an explicit working folder when the user asks for artifacts. Keep filenames bounded with `%(title).200B` and include `%(id)s` to avoid collisions.
