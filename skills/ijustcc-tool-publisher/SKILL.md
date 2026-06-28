---
name: ijustcc-tool-publisher
description: Publish a local single-page HTML tool into the astro-ijustcc blog under /tools/<slug>/ and update the /tools index. Use this whenever the user gives a local HTML file or small static tool directory and wants it turned into an accessible ijust.cc tool URL, especially prompts mentioning "tools", "/tools", "小工具", "交付网址", or "线上可访问".
---

# ijustcc Tool Publisher

Use this skill to turn a local browser tool into a published page inside `/Users/otto/mycode/forks/astro-ijustcc`.

## Inputs

Collect or infer these values from the user prompt:

- `source`: local `index.html` path or a directory containing `index.html`
- `slug`: URL slug for `/tools/<slug>/`
- `title`: display name for the `/tools` index
- `description`: one-sentence purpose for the index card

If the user gives only a file path, derive the slug from the parent directory name. Keep it lowercase and URL-safe.

## Workflow

1. Inspect the source.
   - Confirm `index.html` exists.
   - List adjacent files with `find <source-dir> -maxdepth 2 -type f`.
   - Detect dependencies with:
     ```bash
     rg -n "<(script|link)|src=|href=|import |fetch\\(|new Worker|https?://|cdn|localStorage|indexedDB" <source-index.html>
     ```
   - Classify the tool as single-file, static multi-file, or build-required.

2. Choose the publish shape.
   - Single-file tools go to `public/tools/<slug>/index.html`.
   - Static multi-file tools copy their whole asset directory into `public/tools/<slug>/`.
   - Build-required tools should be built first, then copy the generated static output into `public/tools/<slug>/`.
   - This repo has a catch-all blog route at `src/pages/[...page].astro`. Add an explicit route for each tool, such as `src/pages/tools/<slug>/index.ts`, so `/tools/<slug>/` returns the tool HTML directly.
   - The endpoint can read from both dev and production locations:
     ```ts
     const htmlCandidates = [
       join(process.cwd(), 'public/tools/<slug>/index.html'),
       join(process.cwd(), 'dist/client/tools/<slug>/index.html'),
     ]
     ```

3. Update the tool index.
   - Create or edit `src/pages/tools/index.astro`.
   - Add a card with `name`, `href: "/tools/<slug>/"`, `description`, and a short status label.
   - Keep the page as an Astro route using `RetroLayout`.

4. Add site navigation when useful.
   - For this repo, `src/layouts/RetroLayout.astro` contains the visible header links.
   - Add a `Tools` link to `/tools` if it is missing.

5. Validate locally.
   - Run `pnpm run build`.
   - When visual or browser behavior matters, run `pnpm dev:astro -- --host 127.0.0.1 --port <free-port>` and check:
     - `/tools`
     - `/tools/<slug>/`
   - For single-file tools, verify there are no broken local asset references after copying.

6. Deploy when the user wants an online URL.
   - Use the repo deployment command:
     ```bash
     pnpm run deploy:prod
     ```
   - If package or network access fails, run the local `proxy` alias, then retry the failed command.
   - After deploy, verify:
     ```bash
     curl -I https://ijust.cc/tools
     curl -I https://ijust.cc/tools/<slug>/
     ```

## Repo Rules

- Work in `/Users/otto/mycode/forks/astro-ijustcc`.
- Use `pnpm` for this project.
- Preserve unrelated dirty files.
- Confirm local git email is `fa@ijust.cc` before commits.
- For GitHub operations, use the `Otto-J` account and SSH host `github-self`.

## Safety Check

Before publishing, report any external network calls, CDN scripts, analytics, credential-looking values, or server upload behavior found in the tool. A local browser-only tool that reads user-selected files should be described as local-first.

## Output

Return:

- local path of the published static artifact
- local or production URL that was verified
- validation commands run
- any dependency or privacy findings
