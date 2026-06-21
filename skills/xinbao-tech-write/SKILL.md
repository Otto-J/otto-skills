---
name: xinbao-tech-write
description: "Write or plan concise, story-led Xinbao-style technical articles from hands-on exploration, API trials, product experiments, source-code inspection, or engineering prototypes. Use when the user asks to write, outline, brainstorm, polish, structure, or illustrate a serious technical article/blog/post about a technology, website, API, tool, product capability, or implementation experience. Default style: observer-style preface, one illustration before the body when useful, human story first, solution second, architecture third, technical details last, lists over tables, concise direct expression, and restrained Xiaohei-style illustrations."
---

# Xinbao Tech Write

## Core Shape

Write technical articles as a readable field note, then add only the technical detail needed for readers who want to reproduce the work.

Default rhythm:

1. **Preface**: A short observer-style opening that states what this article describes and who should read it.
2. **Lead illustration**: Place one Xiaohei-style illustration slot before the body when the article has a clear cognitive anchor.
3. **Story background**: What happened, what the user was trying to solve, and why this became worth testing.
4. **Solution**: What was built or verified, in practical terms.
5. **Architecture**: How the system is organized and why the boundaries exist.
6. **Technical details**: Code paths, commands, request shapes, runtime observations, and pitfalls.
7. **Current judgment**: What the result means and what the next concrete step should be.
8. **Visual pass**: Decide whether the article needs additional Mermaid or Xiaohei-style visuals, then provide visual slots or prompts.
9. **De-AI flavor pass**: After the draft is written to a file, run the tell-finder script, then rewrite every flagged paragraph. See the "Post-Write De-AI Flavor Pass" section.

Keep the article grounded in what was actually tested. Mark technical facts as docs, source code, runtime behavior, logs, screenshots, or inference.

Default reader: a technical peer, product builder, or future self who wants the real story and enough implementation detail to continue the work.

## Writing Taste

- Start like a person explaining what happened.
- The first paragraph is an observer-style preface: 2-3 sentences covering the scenario, what this piece describes, and who should read it. Write it fresh each time — never a fill-in template. Avoid formulaic openers like "本文描述了…" or "在…的背景下".
- Put the first illustration slot after the preface and before the body when the article has a clear visual metaphor.
- Use short paragraphs and lists.
- Use tables only when the user asks for a table, or when rows and columns are the clearest representation of data.
- Keep the default article compact. A normal article should stay around 1,000-1,800 Chinese characters before the technical appendix.
- Keep each section focused on one job.
- Use direct claims. State distinctions as parallel positive facts.
- Write in first person with an exploratory tone. Vary how you open and close paragraphs — do not recycle fixed phrases. Avoid overused tells: "值得一提的是", "总而言之", "不仅…而且…", "众所周知".
- Give enough background for the reader to enter the story quickly.
- Assume the reader can follow technical context once the practical problem is clear.
- Use lists for phases, observations, risks, decisions, and next steps.
- Use code excerpts sparingly; each snippet needs a short reason before it appears.

## Standard Article Structure

Use this shape as the default. Section order is fixed — background, then the result, then the details in between — because it makes the piece easy to share and follow. Headings are not fixed: each section below lists the job it must do and a heading or two you can use or replace. Pick wording that fits the article; do not reuse the same headings verbatim across articles.

**前言**
- Job: 2-3 sentences — the scenario, what this describes, who it's for. Calm observer voice, no over-explaining.
- Headings you can use or replace: 前言 / 写在前面

**正文前配图**
- Job: one lead image that helps the reader enter the story, expressing the main scene, tension, or workflow state.
- Emit it as an inline image-prompt comment (see "Inline Image-Prompt Comments"). Readers do not see the comment; post-processing resolves it later.

**背景**
- Job: the short story — the real workflow or pain point, and the one thing the experiment needed to confirm.
- Headings you can use or replace: 我为什么要试这个 / 起因 / 这件事的来由

**产物**
- Job: the working result in plain language. A short list of what works / what is partial / what is unverified, plus only the strongest single piece of evidence (one log line, screenshot, command, file path, or behavior).
- Headings you can use or replace: 我最后跑出了什么 / 结果 / 跑通的东西

**做法路径**
- Job: the solution path as a sequence (did X, added Y, fixed Z), focused on decisions and tradeoffs.
- Headings you can use or replace: 我是怎么把它做出来的 / 实现路径

**系统长相**
- Job: architecture and boundaries. Prefer Mermaid; use lists for module responsibilities.
- Headings you can use or replace: 这个系统现在长什么样 / 架构

**关键判断**
- Job: one central insight, pitfall, or boundary — why it matters, tied to evidence from the experiment.
- Headings you can use or replace: 这次最关键的判断 / 一个判断

**技术细节**
- Job: implementation details — small snippets, commands, request/response shapes, config, repo paths. End with the next concrete verification step.
- Headings you can use or replace: 技术细节和复现线索 / 复现线索

**配图收尾**
- Job: a separate pass after the draft. Default output is inline image-prompt comments (see "Inline Image-Prompt Comments") plus Mermaid code blocks in the body — no separate end-of-article plan unless asked. A normal draft carries 0-2 Mermaid/Xiaohei visuals total.

## Compact Outline Template

A ready-to-use skeleton. The headings below are starter labels — rename them to fit the article (see Standard Article Structure for each section's job).

```markdown
# 标题（具体、带主语、带边界；自拟，不套模板）

## 前言

<!-- 正文前配图：image-prompt comment goes here inline -->

## 我为什么要试这个

## 我最后跑出了什么

## 我是怎么把它做出来的

## 这个系统现在长什么样

## 这次最关键的判断

## 技术细节和复现线索
```

## Title Patterns

Titles should read like a field note: concrete, with a subject and a boundary. Do not treat the examples below as fill-in templates — write the title fresh to fit the article.

Examples (for tone only, free to replace):

- 我用 X 跑通了 Y，边界在 Z
- X 这次真正验证清楚的是 Z

## Evidence Rules

When details are available in a repo or local run, inspect them before drafting.

Confirm:

- What actually runs.
- Which features were verified.
- Which parts are designed, inferred, or planned.
- The most important pitfall or insight.
- The intended reader.
- The shortest evidence path that supports the article.

Use evidence in the article as short anchors:

- file path
- command
- log line
- request body
- response shape
- runtime behavior
- screenshot
- Mermaid diagram

## Technical Detail Pattern

Use this order inside the technical section when needed:

1. **入口**
   - CLI command, route, function, or user action.

2. **数据怎么走**
   - Input, middle layer, upstream call, output.

3. **关键实现**
   - One to three snippets that explain the real mechanism.

4. **踩坑**
   - Runtime failure, wrong assumption, fragile boundary, surprising behavior.

5. **下一步**
   - One concrete improvement or verification task.

## Visual Strategy

Use visuals to make the article easier to understand. Keep them sparse. The lead illustration belongs before the body; additional visual planning is its own pass after the article draft.

Default visual count:

- Short post: 0-1 visual.
- Medium article: 1-2 visuals.
- Long field report: 2-4 visuals.

Use:

- **Mermaid flowchart** for architecture, data flow, module responsibility, and state transition.
- **Mermaid sequence diagram** for request timing, streaming behavior, async callback, and user-visible latency.
- **Xiaohei-style illustration** for one judgment, pitfall, workflow state, mental model, or product-experience gap.
- **List** for phases, observations, risks, and decisions.

Output behavior:

- Emit image prompts as **inline HTML comments at the position where the image belongs** (see "Inline Image-Prompt Comments"), not as a separate shot-list section at the end. The comment is invisible to readers; a later post-processing pass reads each comment, calls an image generator, and replaces it with the rendered image.
- When drafting a full article, place one lead-image comment right after the preface.
- When drafting a compact post, emit at most one image-prompt comment.
- Mermaid diagrams are still emitted as normal fenced ` ```mermaid ` code blocks where they belong — no comment needed.
- When the user asks for "配图", "插图", "小黑图", or "生成图片", produce the inline comments. If the user explicitly wants a visible plan (not hidden in comments), fall back to a short shot list.

## Inline Image-Prompt Comments

By default, image prompts are written into the article as HTML comments at the exact position where the image belongs. This keeps the rendered article clean (readers see nothing) while leaving a machine-readable marker that a post-processing step can resolve into a real image.

### Format

```markdown
<!-- 图片提示词
ALT: <一句话：这张图是什么 / 在文章里承担什么>
PROMPT:
<可直接喂给文生图服务的完整 prompt，可多行；到 --> 结束>
-->
```

Rules:

- The comment block lives **where the image should be inserted**. Position is implicit — do not add a separate "放置位置" field.
- `ALT:` is a single line. It doubles as the image's alt text after resolution.
- `PROMPT:` can span many lines; everything until the closing `-->` is the prompt body. For 小黑 illustrations, fill in the single-image prompt template below into this block.
- One comment = one image. Do not bundle several images in one comment.
- Keep `图片提示词` as the literal prefix so the post-processor can find every block with one regex: `/<!--\s*图片提示词\s*\n([\s\S]*?)-->/g`.

### What a post-processor will do

For each matched block: parse `ALT:` and `PROMPT:`, call the configured image generator with the prompt, then replace the whole comment with `![ALT](<generated-url>)` (or insert the image after it). The skill's job ends at emitting well-formed comments; generation is external.

### Example

```markdown
<!-- 图片提示词
ALT: 小黑站在链路终点核对结果
PROMPT:
Generate one standalone 16:9 horizontal Chinese article illustration.
... (filled single-image template) ...
-->
```

## Xiaohei-Style Article Illustration Rules

Use Xiaohei-style illustration when the article needs a memorable cognitive anchor.

Core goal: turn one key judgment, process, structure, state, or metaphor from the article into a clean 16:9 hand-drawn explanation image.

Visual DNA:

- 16:9 horizontal Chinese article illustration.
- Pure white background.
- Minimalist black hand-drawn line art with slightly wobbly pen lines.
- Lots of empty white space; main subject around 40%-60% of the canvas.
- Sparse handwritten Chinese annotations in Gundam-inspired accents: red, blue, yellow, and white space.
- Strange, clean, product-sketch feeling.
- One image explains one core action, structure, state, or metaphor.

Recurring character:

- Use "小黑": a small solid-black absurd creature with white dot eyes, tiny thin legs, blank serious expression, and slightly uneven hand-drawn body shape.
- 小黑 performs the core conceptual action.
- Treat 小黑 as a serious system operator inside the sketch.

Color use:

- Black: main line art, character, structure, objects, primary labels.
- White: background, breathing room, and visual discipline.
- Yellow: main path, arrows, flow, attention anchor, movement from A to B.
- Red: key problem, warning, result, emotional point.
- Blue: secondary note, system state, assistant/AI feedback, background explanation.
- Gray: optional weak structure, inactive modules, and secondary boundaries.

Shot list format (use as a thinking aid while deciding a shot; the canonical output is the inline comment above, not this list):

```markdown
### 配图 <序号>：<主题>
- 核心意思：<这张图要帮读者理解什么>
- 结构类型：<Workflow / 系统局部 / 前后对比 / 角色状态 / 概念隐喻 / 方法分层 / 地图路线 / 小漫画分镜>
- 小黑动作：<小黑正在做的核心动作>
- 建议元素：<3-5 个画面物件>
- 中文标注：<3-6 个短词，每个 2-8 个字>
```
(放置位置 is decided by where you drop the inline comment, so it is no longer a field here.)

Single-image prompt template:

```text
Generate one standalone 16:9 horizontal Chinese article illustration.

Visual DNA:
Pure white background. Minimalist black hand-drawn line art. Slightly wobbly pen lines. Lots of empty white space. Sparse Gundam-inspired red/blue/yellow handwritten Chinese annotations. Clean absurd product-sketch feeling. No gradients, no shadows, no paper texture, no complex background, no commercial vector style, no PPT infographic look, no cute mascot poster, no children's illustration, no realistic UI.

Recurring IP character required:
小黑, a small solid-black absurd creature with white dot eyes, tiny thin legs, blank serious expression, slightly uneven hand-drawn body shape. 小黑 must perform the core conceptual action, not decorate the scene. Make 小黑 serious, deadpan, and slightly bizarre, not cute.

Theme:
{正文配图主题}

Core idea:
{这张图要表达的核心意思}

Composition:
{具体画面：小黑在哪里、正在做什么、主要物件是什么、信息如何流动}

Suggested elements:
{元素1} / {元素2} / {元素3} / {元素4}

Chinese handwritten labels:
{标注词1} / {标注词2} / {标注词3} / {标注词4} / {可选标注词5}

Color use:
Black for main line art and 小黑. White for clean background and empty space. Yellow for main flow/path/arrows and attention anchors. Red only for key warnings/problems/results. Blue only for secondary notes or feedback/system state. Gray only for weak structure or inactive modules.

Constraints:
One image explains only one core structure. Keep the main subject around 40%-60% of the canvas. Preserve at least 35% blank white space. Use at most 5-8 short handwritten Chinese labels. Do not write a title in the top-left corner. Do not write the structure type on the image. Do not make it a formal diagram, course slide, or dense explainer. Do not copy prior examples or reuse known case compositions unless explicitly requested; invent a fresh visual metaphor for this specific article. It should be clear but not instructional, interesting but not childish, strange but clean.
```

QA checklist:

- 16:9 horizontal image.
- Clean white background.
- 小黑 carries the core action.
- Main subject stays under roughly 60% of canvas.
- One image explains one core idea.
- Chinese annotations are short and readable.
- Yellow marks primary path; red marks key issue/result; blue marks secondary note/state; white space remains dominant.
- The image feels like a sparse hand-drawn product sketch.
- The image uses a fresh metaphor for the article.

## Post-Write De-AI Flavor Pass

AI-written Chinese text leans on a few crutch patterns that give it away. The two most common are the em dash `——` (used to tack on a clause) and the `不是…而是…` construction (used to draw a contrast). Run this pass once the article is written to a file. Do not skip it.

### 1. Scan

Run the tell-finder script bundled with this skill on the finished article:

```bash
node <skill-dir>/scripts/find-ai-tells.mjs <article.md>
node <skill-dir>/scripts/find-ai-tells.mjs <article.md> --pretty   # readable
```

It returns a JSON array (stdout). Each entry has `paragraphIndex`, `matches` (which of `——` / `而是` it hit), the raw `paragraph`, plus `prev` / `next` for context. The summary line goes to stderr so the JSON stays clean.

The script lives next to this SKILL.md under `scripts/find-ai-tells.mjs`. To add more tells later (e.g. `总而言之`, `值得一提的是`, `不仅…而且…`), extend the `TELLS` map in that file.

### 2. Rewrite each flagged paragraph

For every hit, rewrite the paragraph using `prev` and `next` as surrounding context. Rules:

- Remove every `——`. Do not just delete the dash — restructure the sentence so it reads naturally without it (split into two sentences, use a comma or period, or fold the clause in).
- Remove the `不是…而是…` construction. State the positive claim directly; if a contrast is genuinely needed, use `实际上` / `真正的` sparingly, or two plain sentences.
- Keep the paragraph's meaning, evidence anchors (file paths, commands, log lines), and exploratory voice intact. Only the phrasing changes.
- Do not introduce new tells while rewriting.

### 3. Write back

Replace the flagged paragraphs in the article with the rewritten versions. After writing back, re-run the scan to confirm zero hits. If any remain, rewrite again.

Only the scan step is automated; the rewrite is your judgment, not a mechanical deletion.



If the key insight is unclear, propose 2-3 possible angles and recommend one before writing the full article.

For article drafts, start with the compact structure and expand only where the evidence requires it.
