---
name: otto-design
description: Use this skill when building HTML, CSS, React UI, dashboards, pages, artifacts, posters, or web apps for Otto that should keep the same Cola-like Otto Workbench visual system across runs. Use whenever the user says Otto Workbench, Otto Design, fixed visual system, consistent style, Cola-like, same visual language, or asks to make an HTML page with the same style.
---

# Otto Design

Create interfaces with the Otto Workbench visual system: a Cola-like, work-focused, warm-neutral, high-density interface style for HTML artifacts, dashboards, tools, and React screens.

This skill exists to preserve visual continuity across generations. Keep the same design DNA unless the user explicitly asks for a different art direction.

## Core Direction

Otto Workbench combines:

- Industrial/utilitarian structure: dense, functional, scan-friendly surfaces.
- Editorial hierarchy: clear title rhythm, strong section labels, confident information grouping.
- Brutally minimal restraint: few colors, clear borders, disciplined spacing.
- Cola-like chrome: warm gray surfaces, black/white fills, orange brand highlight, subtle glass panels, small-radius controls.

The result should feel like a polished desktop workbench: practical, calm, precise, and slightly editorial.

## When Building Inside Cola

When the target is the Cola desktop renderer, use the real design system first:

- Build from `apps/desktop/src/components/ui/`, `apps/desktop/src/components/`, and existing feature components.
- Use semantic `--cola-*` tokens and mapped Tailwind utilities.
- Keep primitive tokens such as `--cola-gray-*` inside token definitions.
- Add missing variants to shared components when a reusable control needs a new state, size, or shape.
- Use `cn()` for class merging and `lucide-react` for icons.
- Keep user-facing text in i18n files.

Canonical token references:

- `apps/desktop/src/styles/colors.css`
- `apps/desktop/src/styles/radius.css`
- `apps/desktop/src/styles/spacing.css`
- `apps/desktop/src/styles/shadows.css`
- `apps/desktop/src/styles/typography.css`
- `apps/desktop/src/mods/coding-cola/styles/coding-cola.css`

## Standalone HTML Token Pack

For standalone HTML/CSS artifacts, start from this token pack and adapt only where the content requires it.

```css
:root {
  color-scheme: light;

  --otto-gray-50: #fffcf8;
  --otto-gray-100: #f7f3ee;
  --otto-gray-200: #e9e4de;
  --otto-gray-300: #cfc8c0;
  --otto-gray-400: #a8a29e;
  --otto-gray-500: #78716c;
  --otto-gray-600: #57534e;
  --otto-gray-700: #3f3e3d;
  --otto-gray-800: #2a2928;
  --otto-gray-900: #1a1918;

  --otto-bg: var(--otto-gray-50);
  --otto-bg-surface: var(--otto-gray-100);
  --otto-bg-control: #ffffff;
  --otto-text: var(--otto-gray-900);
  --otto-text-strong: #000000;
  --otto-text-muted: var(--otto-gray-600);
  --otto-text-subtle: var(--otto-gray-500);
  --otto-text-tertiary: var(--otto-gray-400);
  --otto-text-on-fill: #ffffff;
  --otto-border: var(--otto-gray-200);
  --otto-border-strong: var(--otto-gray-400);

  --otto-accent: #000000;
  --otto-highlight: #f1752d;
  --otto-highlight-soft: rgba(241, 117, 45, 0.1);
  --otto-link: #447ac8;
  --otto-success: #56ac66;
  --otto-danger: #ee6454;
  --otto-warning: #d8b02e;

  --otto-radius-2: 2px;
  --otto-radius-4: 4px;
  --otto-radius-6: 6px;
  --otto-radius-8: 8px;
  --otto-radius-10: 10px;
  --otto-radius-12: 12px;
  --otto-radius-16: 16px;
  --otto-radius-control: var(--otto-radius-12);
  --otto-radius-card: var(--otto-radius-8);
  --otto-radius-container: var(--otto-radius-16);
  --otto-radius-button: var(--otto-radius-8);

  --otto-space-1: 4px;
  --otto-space-2: 8px;
  --otto-space-3: 12px;
  --otto-space-4: 16px;
  --otto-space-5: 20px;
  --otto-space-6: 24px;
  --otto-space-8: 32px;
  --otto-space-10: 40px;
  --otto-space-12: 48px;

  --otto-shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
  --otto-shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.04);
  --otto-shadow-panel: 0 24px 80px rgba(0, 0, 0, 0.08);
  --otto-shadow-focus: 0 0 0 3px var(--otto-highlight-soft);

  --otto-font-sans: "Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  --otto-font-mono: "Maple Mono NF CN", ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace;

  --otto-type-micro: 10px;
  --otto-type-caption: 11px;
  --otto-type-note: 12px;
  --otto-type-detail: 13px;
  --otto-type-body: 14px;
  --otto-type-reading: 15px;
  --otto-type-prose: 16px;
  --otto-type-subhead: 18px;
  --otto-type-title: 20px;
  --otto-type-display: 34px;
}

[data-theme="dark"] {
  color-scheme: dark;

  --otto-bg: #0a0f0d;
  --otto-bg-surface: #101614;
  --otto-bg-control: color-mix(in srgb, #101614 86%, #d8e0dc);
  --otto-text: #d8e0dc;
  --otto-text-strong: #ffffff;
  --otto-text-muted: #abb7b2;
  --otto-text-subtle: #76827e;
  --otto-text-tertiary: #48534f;
  --otto-text-on-fill: #060807;
  --otto-border: #26322f;
  --otto-border-strong: #34433f;
  --otto-accent: #48d6ab;
  --otto-highlight: #48d6ab;
  --otto-highlight-soft: rgba(72, 214, 171, 0.11);
  --otto-link: #74c7df;
  --otto-success: #6fe0a0;
  --otto-danger: #f47272;
  --otto-warning: #d9b657;
  --otto-shadow-panel: 0 18px 54px rgba(0, 0, 0, 0.46);
}
```

## Layout Rules

- Use a work-surface layout: header/tool strip, dense main canvas, side rail, inspector, table, feed, or split panes.
- Keep hero pages rare. For tools and apps, make the working UI the first screen.
- Use 12-column grids or split panes for data-heavy screens.
- Keep cards for repeated items, panels, modals, and framed tools.
- Use full-width bands or unframed sections for page-level composition.
- Keep controls compact: 32-40px height for normal buttons, 28-32px for dense toolbars.
- Use borders before heavy shadows. Use `--otto-shadow-panel` for floating surfaces only.
- Keep radius restrained: 8px for cards/buttons, 12px for inputs, 16px for major containers.

## Typography Rules

- Use `Lexend Deca` for identity and interface headings when available.
- Use system UI fallback for long reading if Lexend feels too wide.
- Use the mono stack for code, terminal, logs, timestamps, IDs, metrics, and compact technical labels.
- Keep display text scarce. Use 34px for true identity moments or large metrics.
- Use 14px as the default UI body size, 12-13px for metadata, and 18-20px for section headings.
- Keep letter spacing at `0` for normal text. Use uppercase labels sparingly with modest tracking.

## Component Language

Use these recurring forms:

- Panel: warm surface, 1px border, 8-16px radius, optional subtle panel shadow.
- Button: black fill on light theme, cyan/green fill on coding-dark theme, 8px radius.
- Secondary button: surface fill, border, strong text.
- Input: surface/control fill, 1px border, 12px radius, focus ring from highlight soft.
- Badge: small radius-full pill, muted surface, 11-12px type.
- Table/list: compact rows, soft dividers, sticky or strong header row.
- Status: muted text plus one clear semantic color.
- Code/log surface: dark pane, mono font, cyan/green accent, tight spacing.

## Motion Rules

- Use quiet CSS motion: 120-180ms hover/focus transitions, 240-420ms entrance reveal.
- Use staggered entrance for dashboards and reports.
- Use transform by 1-2px, opacity, border-color, and background changes.
- Respect `prefers-reduced-motion`.
- Reserve large movement for onboarding, presentation, or poster-like artifacts.

## Visual Guardrails

- Preserve the warm gray plus black/white plus orange/cyan accent palette.
- Keep the interface work-focused and scan-friendly.
- Avoid one-off palettes across runs.
- Avoid purple-blue gradient hero pages, generic SaaS card piles, decorative orbs, and soft bokeh backgrounds.
- Avoid glossy marketing composition unless the user asks for a landing page.
- Avoid nested cards. Use pane boundaries, dividers, and grid structure.
- Avoid oversized rounded rectangles in dense tools.

## Default Standalone HTML Skeleton

For single-file HTML output, include the token pack, then use this structure as the default shape:

```html
<body>
  <main class="otto-shell">
    <header class="otto-topbar">...</header>
    <section class="otto-workspace">
      <aside class="otto-rail">...</aside>
      <section class="otto-main">...</section>
      <aside class="otto-inspector">...</aside>
    </section>
  </main>
</body>
```

Default CSS structure:

```css
body {
  margin: 0;
  background: var(--otto-bg);
  color: var(--otto-text);
  font-family: var(--otto-font-sans);
  font-size: var(--otto-type-body);
  line-height: 1.43;
}

.otto-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
}

.otto-topbar {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--otto-space-3);
  padding: var(--otto-space-3) var(--otto-space-4);
  border-bottom: 1px solid var(--otto-border);
  background: color-mix(in srgb, var(--otto-bg-surface) 92%, transparent);
}

.otto-workspace {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr) minmax(240px, 320px);
  gap: var(--otto-space-3);
  padding: var(--otto-space-4);
}

.otto-panel {
  border: 1px solid var(--otto-border);
  border-radius: var(--otto-radius-card);
  background: var(--otto-bg-surface);
}

.otto-button {
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: var(--otto-radius-button);
  background: var(--otto-accent);
  color: var(--otto-text-on-fill);
  padding: 0 var(--otto-space-3);
  font: inherit;
  font-weight: 600;
}

.otto-button.secondary {
  background: var(--otto-bg-control);
  border-color: var(--otto-border);
  color: var(--otto-text);
}
```

## Prompt Contract

When the user invokes this skill, keep style continuity as a primary requirement. Ask at most one clarifying question when the content or target format is ambiguous. Then implement.

Good user shorthand:

```text
Use Otto Design / Otto Workbench style.
```

Expanded prompt template:

```text
Use Otto Design. Build a single-file HTML page for: [topic].
Keep the Cola-like Otto Workbench visual system.
Use the same token pack, compact workbench layout, warm gray surfaces, black/orange/cyan accents, tight controls, and dense editorial hierarchy.
```

## Quality Checklist

Before finishing:

- The page uses Otto/Cola-like tokens throughout.
- The first screen looks like a usable work surface.
- Controls have consistent radius, spacing, hover, focus, and disabled states.
- Text sizes stay within the Otto scale.
- The page works in light mode; dark coding mode is available when relevant.
- Mobile layout collapses predictably into topbar, main content, and stacked panels.
- The output has no external dependency surprises beyond fonts or explicitly requested libraries.
