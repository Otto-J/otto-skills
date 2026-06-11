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

Keep the article grounded in what was actually tested. Mark technical facts as docs, source code, runtime behavior, logs, screenshots, or inference.

Default reader: a technical peer, product builder, or future self who wants the real story and enough implementation detail to continue the work.

## Writing Taste

- Start like a person explaining what happened.
- The first paragraph should use an observer-style preface: "本文描述了 <场景> 下，<作者/团队/使用者> 如何完成 <经历/验证/系统搭建>。它适合 <阶段/角色> 的读者阅读。"
- Put the first illustration slot after the preface and before the body when the article has a clear visual metaphor.
- Use short paragraphs and lists.
- Use tables only when the user asks for a table, or when rows and columns are the clearest representation of data.
- Keep the default article compact. A normal article should stay around 1,000-1,800 Chinese characters before the technical appendix.
- Keep each section focused on one job.
- Use direct claims. State distinctions as parallel positive facts.
- Preserve exploratory voice: "我一开始想确认...", "我实际跑了一遍...", "这里的边界变清楚了...".
- Give enough background for the reader to enter the story quickly.
- Assume the reader can follow technical context once the practical problem is clear.
- Use lists for phases, observations, risks, decisions, and next steps.
- Use code excerpts sparingly; each snippet needs a short reason before it appears.

## Standard Article Structure

Use this shape as the default. Adjust section names to fit the article.

0. **前言**
   - Use a calm observer voice.
   - In 2-3 sentences, state the scenario, the experience described, and the suitable reader.
   - Avoid overexplaining background here.

1. **正文前配图**
   - Add one Xiaohei-style illustration slot before the body when it helps the reader enter the story.
   - The lead illustration should express the article's main scene, tension, or workflow state.
   - Include either a short visual note or a full Xiaohei prompt according to the user's request.

2. **我为什么要试这个**
   - Tell the short story.
   - Explain the real workflow or pain point.
   - Name the one thing the experiment needed to confirm.

3. **我最后跑出了什么**
   - Describe the working result in plain language.
   - Use a short list for what works, what is partial, and what remains unverified.
   - Include only the strongest evidence: one log line, one screenshot, one command, one file path, or one behavior.

4. **我是怎么把它做出来的**
   - Explain the solution path.
   - Use a narrative sequence: first did X, then added Y, then fixed Z.
   - Keep this section about decisions and tradeoffs.

5. **这个系统现在长什么样**
   - Explain architecture and boundaries.
   - Prefer Mermaid for architecture and sequence.
   - Use lists for module responsibilities.

6. **这次最关键的判断**
   - Pick one central insight, pitfall, or boundary.
   - Explain why it matters in real use.
   - Connect the judgment to evidence from the experiment.

7. **技术细节和复现线索**
   - Put implementation details here.
   - Include small code snippets, commands, request/response shapes, config examples, or repo paths.
   - End with the next concrete verification step.

8. **补充配图建议**
   - Treat visuals as a separate pass after the article draft.
   - For normal drafts, output a short visual plan when visuals help: 0-2 Mermaid diagrams or Xiaohei-style illustrations.
   - If the user asks to generate images, produce the Xiaohei prompts or call the image tool according to the environment.

## Compact Outline Template

```markdown
# 标题：我用 <实验> 跑通了 <能力>，边界在 <关键问题>

## 前言

## 正文前配图

## 我为什么要试这个

## 我最后跑出了什么

## 我是怎么把它做出来的

## 这个系统现在长什么样

## 这次最关键的判断

## 技术细节和复现线索

## 补充配图建议
```

## Title Patterns

Prefer titles that sound like a real field note:

- `我用 <实验> 跑通了 <能力>，边界在 <问题>`
- `<技术> 这次真正验证清楚的是 <判断>`
- `从一个具体问题出发，我把 <能力> 做成了 <结果>`
- `我试了一遍 <技术>，现在能确定 <结论>`
- `<工具/API/产品> 能用到哪一步，我用一个小实验确认了`

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

- When drafting a full article, include **正文前配图** after the preface.
- When drafting a full article, include a short **配图建议** section at the end.
- When drafting a compact post, include at most one visual suggestion.
- When the user asks for "配图", "插图", "小黑图", or "生成图片", produce the shot list or image prompt explicitly.
- When the article already contains a Mermaid diagram in the body, the visual pass can say which section it supports and whether a Xiaohei illustration is still useful.

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

Shot list format:

```markdown
### 配图 <序号>：<主题>
- 放置位置：<放在哪个段落后>
- 核心意思：<这张图要帮读者理解什么>
- 结构类型：<Workflow / 系统局部 / 前后对比 / 角色状态 / 概念隐喻 / 方法分层 / 地图路线 / 小漫画分镜>
- 小黑动作：<小黑正在做的核心动作>
- 建议元素：<3-5 个画面物件>
- 中文标注：<3-6 个短词，每个 2-8 个字>
```

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

## Before Writing

If the key insight is unclear, propose 2-3 possible angles and recommend one before writing the full article.

For article drafts, start with the compact structure and expand only where the evidence requires it.
