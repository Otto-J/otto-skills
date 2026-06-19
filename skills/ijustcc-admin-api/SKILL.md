---
name: ijustcc-admin-api
description: Use this skill when working in the astro-ijustcc repository and the user wants to publish, update, delete, inspect, script, document, or remotely control ijust.cc content through the SSR admin API. This includes mobile publishing, iOS Shortcuts, curl scripts, token-based admin calls, and debugging `/api/admin/*` behavior.
---

# ijustcc Admin API

Use this skill to operate the private SSR admin API for the `astro-ijustcc` site.

All operations go through three CLI scripts. The token lives at `~/.ijustcc/token` (mode 0600) and never enters Claude's context — Claude only runs the scripts.

| Script | What it does |
|---|---|
| `scripts/auth.mjs` | Interactive: open browser → user pastes token → save to `~/.ijustcc/token` |
| `scripts/publish.mjs` | Create or update a post (POST) |
| `scripts/manage.mjs` | List / read / delete posts |

Paths below are relative to the repo root (`skills/ijustcc-admin-api/scripts/...`).

## 1. Authorize (interactive — the user runs it)

`auth.mjs` opens a browser and waits for a paste, so it must be run by the user with the `!` prefix:

```text
! node skills/ijustcc-admin-api/scripts/auth.mjs
```

It opens `https://ijust.cc/admin/authorize`:

- If already logged in (admin cookie within 7 days), the token is shown immediately.
- Otherwise the login form is shown first, then the token after a successful login.

The user copies the token with the page's **Copy token** button, pastes it into the script prompt, and the script saves it to `~/.ijustcc/token`. The token is valid for 7 days.

Local dev override: `IJUSTCC_AUTHORIZE_URL=http://localhost:4321/admin/authorize`.

## 2. Publish (create / update)

Claude writes the post payload to a JSON file, then runs:

```bash
node skills/ijustcc-admin-api/scripts/publish.mjs payload.json
```

Or pipe via stdin:

```bash
cat payload.json | node skills/ijustcc-admin-api/scripts/publish.mjs -
```

The payload is the JSON body for `POST /api/admin/posts` — it upserts (create or replace by `collection`+`slug`). Schema and field rules are below.

If the token is missing or expired, the script exits non-zero with a message telling the user to run `auth.mjs`.

## 3. List / read / delete

```bash
node skills/ijustcc-admin-api/scripts/manage.mjs list
node skills/ijustcc-admin-api/scripts/manage.mjs get posts my-post
node skills/ijustcc-admin-api/scripts/manage.mjs delete posts my-post
```

Local dev override: `IJUSTCC_API_BASE=http://localhost:4321`.

## Post payload schema

Required: `slug`, `title`, `content`.

Optional: `description`, `tags`, `category`, `image`, `draft`, `published`, `updated`.

- `collection`: `posts` or `fm` (defaults to `posts`).
- `slug`: lowercase ASCII URL identifier — must start with a lowercase English letter, then lowercase letters / digits / hyphens. Example: `new-post-2026`.
- `title`: non-empty string.
- `content`: non-empty string. Markdown is preserved verbatim.
- `tags`: string array; blank items removed.
- `published` / `updated`: valid ISO dates when provided.
- `draft: true` for drafts; production public reads hide drafts.

Example payload:

```json
{
  "collection": "posts",
  "slug": "new-post-2026",
  "title": "一篇新文章",
  "description": "",
  "content": "# 标题\n\n正文",
  "tags": ["随笔"],
  "category": "随笔",
  "draft": false,
  "published": "2026-06-19T00:00:00.000Z"
}
```

Validation is defined with Zod in `src/server/admin-post-payload.ts`.

Admin writes call `upsertPost()` in `src/server/posts.ts`, which writes to the `blog_posts` MySQL table and clears the `content:*` Redis cache keys, so published content appears immediately without rebuilding the site.

## Token lifecycle & revocation

- Tokens are JWTs signed with the server's `JWT_SECRET`, valid **7 days**.
- `publish.mjs` / `manage.mjs` check the expiry locally and prompt to re-run `auth.mjs` when expired.
- To **revoke** a token (e.g. if you suspect it leaked): `rm ~/.ijustcc/token`, then run `auth.mjs` to mint a fresh one. The old token remains valid server-side until it expires — rotate `JWT_SECRET` on the server if you need to invalidate it immediately.
- Treat real tokens as secrets: never paste them into chat, docs, or source files.

## Fallback: curl (when the scripts are unavailable)

The scripts are thin wrappers over the admin REST API. If a script can't run, call the endpoints directly with the token from `~/.ijustcc/token` as a Bearer header. The endpoints are:

- `POST /api/admin/posts` — create/update (payload schema above)
- `GET /api/admin/posts` — list
- `GET /api/admin/posts/<collection>/<slug>` — read one
- `DELETE /api/admin/posts/<collection>/<slug>` — delete

```bash
TOKEN=$(cat ~/.ijustcc/token)
curl https://ijust.cc/api/admin/posts -H "Authorization: Bearer $TOKEN"
```

Password login (`POST /api/admin/auth/login`) also exists for scripts that cannot open a browser, but prefer the `auth.mjs` flow so the password is never typed into a CLI.

## Confirm the runtime model

When debugging API behavior, read these files first:

- `astro.config.mjs`: `output: 'server'` with the Node standalone adapter.
- `src/server/auth.ts`: JWT creation, cookie storage, Bearer verification.
- `src/server/admin-post-payload.ts`: the Zod schema for post payloads.
- `src/pages/api/admin/posts/index.ts` and `[collection]/[slug].ts`: the endpoints.
- `src/server/posts.ts`: MySQL read/write + cache invalidation.

## Verification

After changing API implementation, run:

```bash
pnpm run build
```

For full local parity with MySQL and Redis, run `pnpm run verify:local`. Use `pnpm` — this repo standardizes on pnpm.
