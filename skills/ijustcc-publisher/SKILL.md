---
name: ijustcc-publisher
description: Publish local content to ijust.cc. Use this whenever the user gives a local HTML page, static directory, Markdown article, MDX article, or image file and wants an online ijust.cc URL. HTML publishes under /tools/<slug>/, Markdown/MDX publishes as a blog article through the admin API, and images upload to the CDN and return a public URL.
---

# ijustcc Publisher

Use this skill to publish local artifacts to ijust.cc:

- HTML file or static directory -> `/tools/<slug>/`
- Markdown or MDX file -> blog article (`/posts/<slug>` by default)
- Image file -> CDN upload, returning the public CDN URL

Default repo: `/Users/otto/mycode/self/astro-ijustcc`.

Legacy repo fallback: `/Users/otto/mycode/forks/astro-ijustcc` if the default path does not exist.

## Inputs

Collect or infer these values from the user prompt:

- `source`: local file path or directory path
- `kind`: `page`, `article`, or `image`
- `slug`: URL slug for HTML pages and articles
- `title`: display title for HTML pages and articles
- `description`: one-sentence index card text or article description
- `collection`: `posts` or `fm` for articles; default to `posts`
- `imagePrefix`: CDN key prefix for images; default to `img/`
- `imageKey`: optional exact CDN object key
- `publishOnline`: whether to deploy or call the production API; default to yes when the user asks for a URL

Infer `kind` from the source:

- Directory with `index.html` or `.html` file: `page`
- `.md` or `.mdx` file: `article`
- `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.avif`, `.bmp`, `.svg`: `image`

Slug rules:

- Page slugs can be lowercase URL-safe strings with letters, numbers, and hyphens.
- Article slugs must match the API rule: start with a lowercase English letter and contain only lowercase English letters, numbers, and hyphens.
- Derive missing slugs from the file or parent directory name, then normalize to lowercase ASCII.

## Shared Setup

1. Resolve the repo path:
   ```bash
   REPO=/Users/otto/mycode/self/astro-ijustcc
   [ -d "$REPO" ] || REPO=/Users/otto/mycode/forks/astro-ijustcc
   ```

2. Use `pnpm` in this repo.

3. Preserve unrelated dirty files. Check status before edits:
   ```bash
   git -C "$REPO" status --short
   ```

4. Confirm local git email before commits:
   ```bash
   git -C "$REPO" config user.email
   ```
   The expected value is `fa@ijust.cc`.

5. For GitHub operations, use account `Otto-J` and SSH host `github-self`.

6. For network or package access failures, run the local `proxy` alias, then retry the failed command.

## Admin API Auth

Use the production base URL unless the user gives another one:

```bash
IJUSTCC_BASE_URL="${IJUSTCC_BASE_URL:-https://ijust.cc}"
```

Get an admin token using one of these routes:

1. Reuse an existing token:
   ```bash
   TOKEN="$IJUSTCC_ADMIN_TOKEN"
   ```

2. Login with username/password stored in environment variables:
   ```bash
   TOKEN="$(
     curl -fsS "$IJUSTCC_BASE_URL/api/admin/auth/login" \
       -H 'Content-Type: application/json' \
       -d "{\"username\":\"${IJUSTCC_ADMIN_USERNAME:-admin}\",\"password\":\"$IJUSTCC_ADMIN_PASSWORD\"}" \
       | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.parse(s).token||""))'
   )"
   ```

Keep tokens and passwords out of shell output, committed files, article bodies, and final responses.

## Route A: HTML Page

Use this route for a local single-page HTML artifact or a static directory containing `index.html`.

### Inspect

1. Confirm `index.html` exists.
2. List adjacent files:
   ```bash
   find <source-dir> -maxdepth 2 -type f
   ```
3. Detect dependencies and risky behavior:
   ```bash
   rg -n "<(script|link)|src=|href=|import |fetch\\(|new Worker|https?://|cdn|localStorage|indexedDB|sendBeacon|WebSocket|postMessage" <source-index.html>
   ```
4. Classify the HTML artifact:
   - Single-file: only `index.html`
   - Static multi-file: HTML plus local assets
   - Build-required: package/build config or source files requiring bundling

### Publish Shape

1. Single-file pages go to:
   ```text
   public/tools/<slug>/index.html
   ```

2. Static multi-file pages copy the full asset directory to:
   ```text
   public/tools/<slug>/
   ```

3. Build-required pages should be built first, then copy generated static output to:
   ```text
   public/tools/<slug>/
   ```

4. Add an explicit route for each HTML page because the repo has a catch-all blog route:
   ```text
   src/pages/tools/<slug>/index.ts
   ```

   Endpoint template:
   ```ts
   import type { APIRoute } from 'astro'
   import { readFile } from 'node:fs/promises'
   import { join } from 'node:path'

   export const GET: APIRoute = async () => {
     const htmlCandidates = [
       join(process.cwd(), 'public/tools/<slug>/index.html'),
       join(process.cwd(), 'dist/client/tools/<slug>/index.html'),
     ]

     for (const file of htmlCandidates) {
       try {
         const html = await readFile(file, 'utf8')
         return new Response(html, {
           headers: { 'Content-Type': 'text/html; charset=utf-8' },
         })
       } catch {}
     }

     return new Response('Page not found', { status: 404 })
   }
   ```

5. Update `src/pages/tools/index.astro` with a card:
   - `name`: title
   - `href`: `/tools/<slug>/`
   - `description`: short purpose
   - status label: concise and useful

6. Add a `Tools` link to `src/layouts/RetroLayout.astro` when the visible nav lacks it.

### Validate and Deploy

Run:

```bash
cd "$REPO"
pnpm run build
pnpm run deploy:prod
curl -I https://ijust.cc/tools
curl -I https://ijust.cc/tools/<slug>/
```

For visual or browser-sensitive pages, also run:

```bash
pnpm dev:astro -- --host 127.0.0.1 --port <free-port>
```

Check `/tools` and `/tools/<slug>/`.

## Route B: Markdown Article

Use this route for `.md` or `.mdx` source files.

Default behavior: publish through the production admin API. This writes directly to the database and clears `content:*` Redis caches through the existing app code.

### Inspect

1. Parse front matter with a structured parser such as `gray-matter`.
2. Read:
   - `title`
   - `description`
   - `published`, `publish_time`, or `create_time`
   - `updated`
   - `tags`
   - `category`
   - `image`
   - `draft`
   - `slug`
   - `collection`
3. Use the Markdown body without front matter as `content`.
4. Detect credential-looking values before publishing:
   ```bash
   rg -n "AKIA|SECRET|TOKEN|PASSWORD|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH|sk-[A-Za-z0-9]|xox[baprs]-|AIza" <source.md>
   ```
5. Confirm `draft`:
   - `draft: false` publishes publicly.
   - `draft: true` saves it as an admin-visible draft.

### Build Payload

Article API endpoint:

```text
POST /api/admin/posts
PUT /api/admin/posts/<collection>/<slug>
```

Payload:

```json
{
  "collection": "posts",
  "slug": "my-new-post",
  "title": "My New Post",
  "description": "",
  "content": "Markdown body",
  "tags": [],
  "category": "",
  "image": "",
  "draft": false,
  "published": "2026-07-07T12:00:00.000Z",
  "updated": null
}
```

Use `posts` unless the user says Flash Memory or the front matter sets `collection: fm`.

Use the current time when no publish date exists.

### Publish

Create or update via the API:

```bash
curl -fsS "$IJUSTCC_BASE_URL/api/admin/posts" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @payload.json
```

For an existing article:

```bash
curl -fsS -X PUT "$IJUSTCC_BASE_URL/api/admin/posts/<collection>/<slug>" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @payload.json
```

### Optional Repo-Backed Archive

When the user asks to keep the Markdown in the repo, also write or update:

```text
src/content/posts/<filename>.md
src/content/fm/<filename>.md
```

Then deploy with production import:

```bash
cd "$REPO"
DEPLOY_IMPORT_CONTENT=1 pnpm run deploy:prod
```

### Validate

For posts:

```bash
curl -I "$IJUSTCC_BASE_URL/posts/<slug>"
```

For fm:

```bash
curl -I "$IJUSTCC_BASE_URL/fm/<slug>"
```

If the page is intentionally a draft, validate through `/admin` or `GET /api/admin/posts/<collection>/<slug>`.

## Route C: Image CDN Upload

Use this route for local image files.

Supported types: JPEG, PNG, GIF, WebP, AVIF, BMP, SVG.

### Inspect

1. Confirm file type:
   ```bash
   file <source-image>
   ```
2. On macOS, inspect dimensions when useful:
   ```bash
   sips -g pixelWidth -g pixelHeight <source-image>
   ```
3. Treat screenshots and photos as privacy-sensitive. Check visible content and metadata when appropriate:
   ```bash
   mdls <source-image> 2>/dev/null | sed -n '1,80p'
   ```

The API stores the supplied file bytes. Strip EXIF or compress locally before upload when the user asks for that behavior or the file clearly contains sensitive metadata.

### Upload

Multipart upload is the simplest route:

```bash
curl -fsS -X POST "$IJUSTCC_BASE_URL/api/admin/images" \
  -H "Authorization: Bearer $TOKEN" \
  -F "prefix=${IMAGE_PREFIX:-img/}" \
  -F "file=@<source-image>"
```

Use an exact CDN key when requested:

```bash
curl -fsS -X POST "$IJUSTCC_BASE_URL/api/admin/images" \
  -H "Authorization: Bearer $TOKEN" \
  -F "key=<image-key>" \
  -F "file=@<source-image>"
```

JSON/base64 upload also works:

```json
{
  "prefix": "img/",
  "filename": "image.webp",
  "mimeType": "image/webp",
  "dataBase64": "<base64>"
}
```

Response shape:

```json
{
  "bucket": "hexoblog",
  "item": {
    "key": "img/example-123.webp",
    "url": "https://cdn.ijust.cc/img/example-123.webp",
    "previewUrl": "https://cdn.ijust.cc/img/example-123.webp-w200",
    "fsize": 12345,
    "mimeType": "image/webp",
    "putTime": 123456789
  }
}
```

Return `item.url` as the primary output and `item.previewUrl` when useful.

### Validate

```bash
curl -I "<item.url>"
```

## Safety Check

Before publishing, report findings relevant to the selected route:

- HTML pages: external network calls, CDN scripts, analytics, local storage, indexedDB, workers, websocket calls, upload behavior, credential-looking values
- Markdown articles: credential-looking values, draft status, canonical slug, collection, source path
- Images: file type, dimensions, CDN key, possible metadata/privacy concerns

For local browser-only pages that read user-selected files, describe them as local-first.

## Output

Return the result in this shape:

- `kind`: page, article, or image
- `source`: local source path
- `local artifact`: copied HTML directory or repo Markdown path when applicable
- `URL`: verified production URL or CDN URL
- `validation`: commands run and result
- `privacy/dependency findings`: concise findings from the safety check

For skill edits, inspect the final skill for security and privacy risks, then ask whether to sync the updated skill to `/Users/otto/mycode/otto-skills/skills/ijustcc-publisher/` and push.
