---
name: xinbao-write-style
description: "Write or plan Xinbao-style technical articles from hands-on exploration, API trials, product experiments, or engineering prototypes. Use when the user asks to write, outline, brainstorm, polish, or structure an article/blog/post about a technology, website, API, tool, product capability, or implementation experience in their reusable style: popular explanation first, current result second, architecture/design thinking third, one key insight or pitfall as the focus, status/outlook, then technical details and code excerpts."
---

# Xinbao Write Style

## Core Shape

Write in two passes:

1. **Readable article body**: Explain the technology and the experiment in plain language before going into engineering detail.
2. **Technical appendix**: Show implementation details, selected code excerpts, request/response shapes, and reproducible notes.

Keep the article grounded in what was actually tested. Separate observed results from assumptions, vendor claims, and future possibilities.

## Standard Article Structure

Use this default structure unless the user asks otherwise:

1. **这是什么，为什么我要试**
   - Explain the technology, API, website, or product capability in human terms.
   - State the user's practical motivation: verifying whether a documented capability can support a real workflow.
   - Avoid starting with code or vendor terminology.

2. **我实际做到了什么**
   - Give the current working result early.
   - List what was successfully run, what was partially run, and what did not work as expected.
   - This section should feel like an honest field report, not a marketing summary.

3. **我是怎么设计这个验证系统的**
   - Describe the architecture and design thinking.
   - Explain why each major component exists and what boundary it owns.
   - Prefer diagrams or concise flow descriptions when helpful.

4. **这次最值得单独说的问题**
   - Pick one central insight, misconception, or pitfall.
   - Make it the article's strongest point.
   - Example pattern: "支持流式接口" is not the same as "用户能实时听到音频."

5. **现在的判断和下一步**
   - State the current conclusion and limits.
   - Mention what would make the technology production-ready.
   - Give practical next steps without overpromising.

6. **技术细节展示**
   - Explain how the implementation works.
   - Include short code excerpts only where they clarify the idea.
   - Prefer a few representative snippets over large file dumps.

## Writing Principles

- Lead with 人话, then engineering, then code.
- Preserve the user's exploratory voice: "我想确认", "我实际测了一下", "这里和文档理解不完全一样".
- Do not turn the piece into an API manual. Use the API only to support the experience and conclusion.
- Do not make the article a changelog. Features are supporting evidence; the central insight is the article.
- Be candid about limits. Phrases like "当前能跑通的是..." and "这里还不能说明..." are useful.
- For technical claims, say whether they came from docs, source code, runtime behavior, or inference.
- Keep code excerpts small and annotated with why they matter.

## Reusable Outline Template

```markdown
# 标题：把 <技术/产品/网站> 跑成一个小实验后，我发现 <核心洞察>

## 一、这是什么，为什么我要试

## 二、我实际做到了什么

## 三、我是怎么设计这个验证系统的

## 四、这次最值得单独说的问题

## 五、现在的判断和下一步

## 六、技术细节展示
```

## Title Patterns

Prefer titles that reveal the real discovery:

- `把 <技术> 文档跑成网站后，我才发现 <关键误区>`
- `我用一个小工具验证了 <技术>：能用，但边界在 <问题>`
- `<技术> 不是不能用，真正要确认的是 <判断标准>`
- `从文档到真实体验：<技术> 的 <能力> 到底跑到了哪一步`

## Technical Appendix Pattern

For the technical section, use this order:

1. **为什么需要这个后端/中间层**
   - Security, key isolation, payload assembly, format conversion, proxying.

2. **接口和数据流**
   - Routes, request body, upstream payload, response handling.

3. **关键实现片段**
   - Show only the core code path.
   - Add one short paragraph before each snippet explaining why it matters.

4. **踩坑和验证**
   - Include runtime observations, failure modes, and test results.

5. **还能怎么改**
   - Concrete improvement directions.

## Before Writing

If details are available in a repo, inspect them before drafting. Confirm:

- What actually runs.
- Which features were verified.
- Which parts are only designed or inferred.
- The most important pitfall or insight.
- The intended reader: beginner, technical peer, product builder, or future self.

If the key insight is unclear, propose 2-3 possible angles and recommend one before writing the full article.
