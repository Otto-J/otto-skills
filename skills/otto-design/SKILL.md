---
name: otto-design
description: Use this skill when building HTML, CSS, React UI, dashboards, pages, artifacts, posters, or web apps for Otto that should preserve the same Cola-like Otto Workbench visual system across runs. Use whenever the user says Otto Workbench, Otto Design, Cola-like, fixed visual system, same visual language, consistent HTML style, or asks for an interface that should look like Cola.
---

# Otto Design

Create interfaces with the Otto Workbench visual system: a Cola-compatible, work-focused, warm-neutral, high-density interface language for HTML artifacts, dashboards, tools, React screens, and technical reports.

This skill preserves visual continuity. Use the same design DNA across runs and adapt layout to content.

## Design Anchor

Otto Workbench is a Cola-like desktop workbench:

- Warm light app chrome for general pages and tools.
- Black/white primary action language with orange Cola brand highlight.
- Thin borders, compact spacing, restrained shadows, small radius.
- Dense but calm information architecture.
- Editorial hierarchy with clear section labels and strong scan paths.
- Coding surfaces that use the Coding Cola terminal language only for code, logs, terminals, diffs, and developer workspaces.

Default mode: Cola main UI warm light.

Coding mode: Coding Cola `hacker-dark` surface.

## Source Of Truth

When working inside the Cola repo, treat these files as the canonical visual source:

- `apps/desktop/src/styles/colors.css`
- `apps/desktop/src/styles/radius.css`
- `apps/desktop/src/styles/spacing.css`
- `apps/desktop/src/styles/shadows.css`
- `apps/desktop/src/styles/typography.css`
- `apps/desktop/src/styles/globals.css`
- `apps/desktop/src/components/ui/button.tsx`
- `apps/desktop/src/components/ui/input.tsx`
- `apps/desktop/src/components/ui/badge.tsx`
- `apps/desktop/src/components/ui/select.tsx`
- `apps/desktop/src/components/ui/tabs.tsx`
- `apps/desktop/src/components/ui/segmented-control.tsx`
- `apps/desktop/src/mods/coding-cola/styles/coding-cola.css`

Renderer implementation rules:

- Build from `apps/desktop/src/components/ui/`, `apps/desktop/src/components/`, and existing feature components.
- Use semantic `--cola-*` tokens and mapped Tailwind utilities.
- Keep primitive `--cola-gray-*` references inside token definitions.
- Extend shared component variants for reusable states, sizes, and shapes.
- Use `cn()` for class merging and `lucide-react` for icons.
- Put user-facing copy in i18n locale files.

## Standalone HTML Token Pack

For standalone HTML/CSS, use the Cola-compatible token namespace first. Keep the `--otto-*` aliases for convenience.

```css
:root {
  color-scheme: light;

  /* Cola primitives, stored as rgb triplets to match Cola's token shape. */
  --cola-gray-50: 255, 252, 248;   /* #fffcf8 */
  --cola-gray-100: 247, 243, 238;  /* #f7f3ee */
  --cola-gray-200: 233, 228, 222;  /* #e9e4de */
  --cola-gray-300: 207, 200, 192;  /* #cfc8c0 */
  --cola-gray-400: 168, 162, 158;  /* #a8a29e */
  --cola-gray-500: 120, 113, 108;  /* #78716c */
  --cola-gray-600: 87, 83, 78;     /* #57534e */
  --cola-gray-700: 63, 62, 61;     /* #3f3e3d */
  --cola-gray-800: 42, 41, 40;     /* #2a2928 */
  --cola-gray-900: 26, 25, 24;     /* #1a1918 */
  --cola-white: 255, 255, 255;
  --cola-black: 0, 0, 0;

  --cola-brand-base: 241, 117, 45;
  --cola-accent-base: 0, 0, 0;
  --cola-highlight-base: 241, 117, 45;

  --cola-red: 238, 100, 84;
  --cola-orange: 230, 128, 69;
  --cola-brown: 182, 136, 78;
  --cola-yellow: 216, 176, 46;
  --cola-green: 86, 172, 102;
  --cola-teal: 64, 176, 172;
  --cola-blue: 68, 122, 200;
  --cola-purple: 135, 89, 177;
  --cola-pink: 218, 92, 138;

  /* Passive surfaces. */
  --cola-bg: rgb(var(--cola-gray-50));
  --cola-bg-surface: rgb(var(--cola-gray-100));
  --cola-bg-control: rgb(var(--cola-white));

  /* Active fills. */
  --cola-fill-black: rgb(var(--cola-black));
  --cola-fill-white: rgb(var(--cola-white));
  --cola-fill-neutral: rgb(var(--cola-brown));
  --cola-fill-muted: rgb(var(--cola-gray-200));
  --cola-fill-secondary: rgb(var(--cola-gray-300));

  /* Text. */
  --cola-text: rgb(var(--cola-gray-900));
  --cola-text-strong: rgb(var(--cola-black));
  --cola-text-muted: rgb(var(--cola-gray-600));
  --cola-text-subtle: rgb(var(--cola-gray-500));
  --cola-text-placeholder: rgb(var(--cola-gray-500));
  --cola-text-tertiary: rgb(var(--cola-gray-400));
  --cola-text-disabled: rgb(var(--cola-gray-300));
  --cola-text-on-fill: rgb(var(--cola-white));
  --cola-text-on-accent: rgb(var(--cola-white));

  /* Borders. */
  --cola-border: rgb(var(--cola-gray-200));
  --cola-border-strong: rgb(var(--cola-gray-400));
  --cola-border-heavy: rgb(var(--cola-gray-400));

  /* Accent and brand. */
  --cola-accent: rgb(var(--cola-accent-base));
  --cola-accent-soft: rgba(var(--cola-accent-base), 0.08);
  --cola-highlight: rgb(var(--cola-highlight-base));
  --cola-highlight-soft: rgba(var(--cola-highlight-base), 0.1);
  --cola-brand: rgb(var(--cola-brand-base));
  --cola-brand-soft: rgba(var(--cola-brand-base), 0.1);

  /* Status. */
  --cola-link: rgb(var(--cola-blue));
  --cola-success: rgb(var(--cola-green));
  --cola-success-bg: rgba(var(--cola-green), 0.1);
  --cola-success-border: rgba(var(--cola-green), 0.25);
  --cola-danger: rgb(var(--cola-red));
  --cola-danger-bg: rgba(var(--cola-red), 0.1);
  --cola-danger-border: rgba(var(--cola-red), 0.25);
  --cola-warning: rgb(var(--cola-yellow));
  --cola-warning-bg: rgba(var(--cola-yellow), 0.1);

  /* Overlays and visual chrome. */
  --cola-overlay-heavy: rgba(var(--cola-black), 0.8);
  --cola-overlay-medium: rgba(var(--cola-black), 0.6);
  --cola-overlay-light: rgba(var(--cola-black), 0.4);
  --cola-dialog-overlay: rgba(0, 0, 0, 0.5);
  --cola-visual-chrome: rgb(var(--cola-white));
  --cola-visual-chrome-muted: rgba(var(--cola-white), 0.84);
  --cola-visual-chrome-subtle: rgba(var(--cola-white), 0.72);
  --cola-visual-chrome-border: rgba(var(--cola-white), 0.38);
  --cola-visual-chrome-soft: rgba(var(--cola-white), 0.16);

  /* Radius. */
  --cola-radius-2: 2px;
  --cola-radius-4: 4px;
  --cola-radius-6: 6px;
  --cola-radius-8: 8px;
  --cola-radius-10: 10px;
  --cola-radius-12: 12px;
  --cola-radius-16: 16px;
  --cola-radius-full: 9999px;
  --cola-radius-control: var(--cola-radius-12);
  --cola-radius-card: var(--cola-radius-8);
  --cola-radius-container: var(--cola-radius-16);
  --cola-radius-badge: var(--cola-radius-full);
  --cola-radius-button-sm: var(--cola-radius-6);
  --cola-radius-button: var(--cola-radius-8);
  --cola-radius-button-lg: var(--cola-radius-10);
  --cola-radius-button-xl: var(--cola-radius-12);

  /* Spacing. */
  --cola-space-0: 0;
  --cola-space-px: 1px;
  --cola-space-05: 2px;
  --cola-space-1: 4px;
  --cola-space-15: 6px;
  --cola-space-2: 8px;
  --cola-space-3: 12px;
  --cola-space-4: 16px;
  --cola-space-5: 20px;
  --cola-space-6: 24px;
  --cola-space-8: 32px;
  --cola-space-10: 40px;
  --cola-space-12: 48px;
  --cola-space-16: 64px;
  --cola-space-component-gap: var(--cola-space-15);
  --cola-space-section-gap: var(--cola-space-3);
  --cola-space-page-padding: var(--cola-space-4);

  /* Shadows. */
  --cola-shadow-xs: 0 1px 2px rgba(var(--cola-black), 0.05);
  --cola-shadow-sm: 0 2px 4px rgba(var(--cola-black), 0.05), 0 1px 2px rgba(var(--cola-black), 0.04);
  --cola-shadow-md: 0 4px 8px rgba(var(--cola-black), 0.06), 0 2px 4px rgba(var(--cola-black), 0.04);
  --cola-shadow-lg: 0 8px 24px rgba(var(--cola-black), 0.08), 0 4px 8px rgba(var(--cola-black), 0.04);
  --cola-shadow-xl: 0 24px 80px rgba(var(--cola-black), 0.08);
  --cola-shadow-panel: var(--cola-shadow-xl);
  --cola-shadow-focus: 0 0 0 3px var(--cola-highlight-soft);
  --cola-shadow-inset: inset 0 1px 0 var(--cola-border);

  /* Type scale. */
  --cola-type-scale: 1;
  --cola-type-micro-10: calc(10px * var(--cola-type-scale));
  --cola-type-caption-11: calc(11px * var(--cola-type-scale));
  --cola-type-note-12: calc(12px * var(--cola-type-scale));
  --cola-type-detail-13: calc(13px * var(--cola-type-scale));
  --cola-type-body-14: calc(14px * var(--cola-type-scale));
  --cola-type-reading-15: calc(15px * var(--cola-type-scale));
  --cola-type-prose-16: calc(16px * var(--cola-type-scale));
  --cola-type-subhead-18: calc(18px * var(--cola-type-scale));
  --cola-type-title-20: calc(20px * var(--cola-type-scale));
  --cola-type-display-34: calc(34px * var(--cola-type-scale));
  --cola-type-display-44: calc(44px * var(--cola-type-scale));

  --cola-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  --cola-font-lexend: "Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --cola-font-mono: "Maple Mono NF CN", ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace;

  /* Otto aliases. Prefer --cola-* in reusable CSS. */
  --otto-bg: var(--cola-bg);
  --otto-bg-surface: var(--cola-bg-surface);
  --otto-bg-control: var(--cola-bg-control);
  --otto-text: var(--cola-text);
  --otto-text-muted: var(--cola-text-muted);
  --otto-border: var(--cola-border);
  --otto-accent: var(--cola-accent);
  --otto-highlight: var(--cola-highlight);
}

html.dark,
[data-theme="dark"] {
  color-scheme: dark;

  --cola-bg: rgb(var(--cola-gray-900));
  --cola-bg-surface: rgb(var(--cola-gray-800));
  --cola-bg-control: rgb(var(--cola-gray-700));
  --cola-fill-black: rgb(var(--cola-white));
  --cola-fill-white: rgb(var(--cola-gray-900));
  --cola-fill-neutral: #d2a876;
  --cola-fill-muted: rgb(var(--cola-gray-600));
  --cola-fill-secondary: rgb(var(--cola-gray-600));
  --cola-text: rgb(var(--cola-gray-200));
  --cola-text-strong: rgb(var(--cola-white));
  --cola-text-muted: rgb(var(--cola-gray-400));
  --cola-text-subtle: rgb(var(--cola-gray-500));
  --cola-text-placeholder: rgb(var(--cola-gray-500));
  --cola-text-tertiary: rgb(var(--cola-gray-600));
  --cola-text-disabled: rgb(var(--cola-gray-700));
  --cola-text-on-fill: rgb(var(--cola-black));
  --cola-text-on-accent: rgb(var(--cola-black));
  --cola-border: rgb(var(--cola-gray-700));
  --cola-border-strong: rgb(var(--cola-gray-600));
  --cola-border-heavy: rgb(var(--cola-gray-500));
  --cola-accent: rgb(var(--cola-white));
  --cola-accent-soft: rgba(var(--cola-white), 0.14);
  --cola-highlight: #df7436;
  --cola-highlight-soft: rgba(223, 116, 54, 0.12);
  --cola-brand: #df7436;
  --cola-brand-soft: rgba(223, 116, 54, 0.12);
  --cola-link: #6c9ee0;
  --cola-success: #7ac88a;
  --cola-success-bg: rgba(122, 200, 138, 0.1);
  --cola-success-border: rgba(122, 200, 138, 0.3);
  --cola-danger: #f88e80;
  --cola-danger-bg: rgba(248, 142, 128, 0.1);
  --cola-danger-border: rgba(248, 142, 128, 0.3);
}
```

## Coding Cola Token Pack

Use this theme for terminal, code review, developer workspace, diff, shell output, logs, trace viewers, and coding dashboards.

```css
[data-otto-surface="coding"] {
  color-scheme: dark;
  --coding-cola-bg-window: #060807;
  --coding-cola-bg-pane: #0a0f0d;
  --coding-cola-bg-pane-strong: #101614;
  --coding-cola-bg-titlebar: #0d1210;
  --coding-cola-line: #18211f;
  --coding-cola-line-strong: #26322f;
  --coding-cola-line-emphasis: #34433f;
  --coding-cola-fg: #d8e0dc;
  --coding-cola-fg-muted: #abb7b2;
  --coding-cola-fg-subtle: #76827e;
  --coding-cola-fg-faint: #48534f;
  --coding-cola-accent: #48d6ab;
  --coding-cola-accent-soft: rgba(72, 214, 171, 0.11);
  --coding-cola-accent-line: rgba(72, 214, 171, 0.48);
  --coding-cola-success: #6fe0a0;
  --coding-cola-success-bg: rgba(111, 224, 160, 0.07);
  --coding-cola-danger: #f47272;
  --coding-cola-danger-bg: rgba(244, 114, 114, 0.07);
  --coding-cola-warning: #d9b657;
  --coding-cola-warning-bg: rgba(217, 182, 87, 0.08);
  --coding-cola-info: #74c7df;
  --coding-cola-syntax-keyword: #d397ff;
  --coding-cola-syntax-string: #91d884;
  --coding-cola-syntax-name: #74c7df;
  --coding-cola-syntax-comment: #53615c;
  --coding-cola-syntax-type: #d9b657;
  --coding-cola-syntax-punctuation: #87948f;
  --coding-cola-radius-xs: 3px;
  --coding-cola-radius-sm: 4px;
  --coding-cola-radius-md: 5px;
  --coding-cola-radius-lg: 6px;
  --coding-cola-radius-window: 8px;
  --coding-cola-shadow-panel: 0 18px 54px rgba(0, 0, 0, 0.46);
  --coding-cola-font-scale: 1;
  --coding-cola-font-micro: calc(0.59375rem * var(--coding-cola-font-scale));
  --coding-cola-font-xs: calc(0.65625rem * var(--coding-cola-font-scale));
  --coding-cola-font-sm: calc(0.6875rem * var(--coding-cola-font-scale));
  --coding-cola-font-ui: calc(0.71875rem * var(--coding-cola-font-scale));
  --coding-cola-font-md: calc(0.78125rem * var(--coding-cola-font-scale));
  --coding-cola-font-lg: calc(0.875rem * var(--coding-cola-font-scale));
  --coding-cola-font-code: calc(0.71875rem * var(--coding-cola-font-scale));
  --coding-cola-font-display: calc(1.625rem * var(--coding-cola-font-scale));

  --cola-bg: var(--coding-cola-bg-pane);
  --cola-bg-surface: var(--coding-cola-bg-pane-strong);
  --cola-bg-control: color-mix(in srgb, var(--coding-cola-bg-pane-strong) 86%, var(--coding-cola-fg));
  --cola-border: var(--coding-cola-line-strong);
  --cola-border-strong: var(--coding-cola-line-emphasis);
  --cola-text: var(--coding-cola-fg);
  --cola-text-muted: var(--coding-cola-fg-muted);
  --cola-text-placeholder: var(--coding-cola-fg-subtle);
  --cola-text-disabled: var(--coding-cola-fg-faint);
  --cola-fill-black: var(--coding-cola-fg);
  --cola-text-on-fill: var(--coding-cola-bg-window);
  --cola-accent: var(--coding-cola-accent);
  --cola-text-on-accent: var(--coding-cola-bg-window);
  --cola-danger: var(--coding-cola-danger);
  --cola-success: var(--coding-cola-success);
  --cola-success-bg: var(--coding-cola-success-bg);
  --cola-link: var(--coding-cola-info);
  --cola-brand: var(--coding-cola-accent);
  --cola-brand-soft: var(--coding-cola-accent-soft);
  --cola-highlight: var(--coding-cola-accent);
  --cola-highlight-soft: var(--coding-cola-accent-soft);
}
```

Coding surface background:

```css
.coding-workspace {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--coding-cola-line) 28%, transparent) 1px, transparent 1px),
    linear-gradient(180deg, color-mix(in srgb, var(--coding-cola-line) 22%, transparent) 1px, transparent 1px),
    var(--coding-cola-bg-window);
  background-size: 3rem 3rem;
  color: var(--coding-cola-fg);
  font-family: var(--cola-font-mono);
  font-size: var(--coding-cola-font-ui);
  line-height: 1.42;
}
```

## Component Language

General UI:

- Body: `var(--cola-bg)`, `var(--cola-text)`, system sans, 14px body.
- Main panels: `var(--cola-bg-surface)`, 1px `var(--cola-border)`, `var(--cola-radius-card)`.
- Floating panels, select menus, popovers, tooltips: `var(--cola-bg)`, border, `var(--cola-shadow-panel)`, 12px radius.
- Glass panels: translucent warm background, 24px blur, `var(--cola-shadow-panel)`, inset top line.
- Tables: rounded wrapper, internal 1px dividers, compact rows.
- Scrollbars: 4px width, transparent track, `var(--cola-border)` thumb while active.

Controls:

- Primary button: `var(--cola-fill-black)` fill, `var(--cola-text-on-fill)`, rounded-full for text buttons.
- Icon button: 28-40px square, `var(--cola-radius-button*)`, surface fill, muted text, hover to strong text.
- Secondary/control button: `var(--cola-bg-surface)` or `var(--cola-bg-control)` fill, semantic border.
- Accent state: `var(--cola-highlight-soft)` background, `var(--cola-highlight)` text, highlight-mixed border.
- Success/danger state: semantic soft background plus semantic border.
- Input: 36px default height, transparent or surface fill, semantic border, placeholder token, 1px strong focus ring.
- Select: 36px height, rounded-full trigger, rounded-xl content, panel shadow.
- Badge: rounded-full, 12px type, `px 10px`, soft semantic fills.
- Tabs: bottom border list, 40px trigger height, text emphasis, 2px active underline.
- Segmented control: surface container, 1px border, 2px padding, active segment uses `var(--cola-bg)`.
- Switch: unchecked `var(--cola-fill-secondary)`, checked `var(--cola-success)`, white thumb.

Coding UI:

- Use mono font broadly, with sans only for chat/reading panes.
- Use 3-6px radius inside developer panes.
- Use strong dark pane separation: window, pane, pane-strong, titlebar.
- Use cyan/green accent line for active states.
- Use compact type: 10-14px equivalent via `--coding-cola-font-*`.
- Use grid background for full coding workspaces.

## Layout Rules

- Use a work-surface layout: titlebar/topbar, dense workspace, side rail, main canvas, inspector, table, feed, or split panes.
- General dashboards use warm light chrome by default.
- Developer/coding dashboards use `[data-otto-surface="coding"]`.
- Hero treatment appears only for presentation pages, reports, or posters.
- The first viewport should show usable content and controls.
- Use 12-column grids or split panes for data-heavy screens.
- Keep cards for repeated objects, framed tools, modals, and popovers.
- Use dividers, pane boundaries, and grid structure for page-level layout.
- Keep text controls 32-40px high and icon controls 28-40px square.
- Use borders as the primary separation layer and panel shadow for floating surfaces.

## Typography Rules

- General UI uses the system sans stack; identity and brand moments may use Lexend Deca.
- Coding UI uses Maple Mono NF CN or the mono fallback stack.
- Type scale follows Cola: 10, 11, 12, 13, 14, 15, 16, 18, 20, 34, 44.
- Use 14px for UI body, 12-13px for metadata, 18-20px for section headings.
- Use 34px for true metric or identity moments.
- Keep letter spacing at 0 for normal text.
- Uppercase kicker labels use modest tracking and muted text.

## Motion Rules

- Use Cola-like motion: 120-180ms hover/focus, 150-200ms popover/dialog open, 240-420ms page entrance.
- Use opacity, background, border-color, box-shadow, and 1px active press movement.
- Use staggered entrance for dashboards and reports.
- Respect `prefers-reduced-motion`.

## Standalone HTML Skeleton

Default warm workbench:

```html
<body>
  <main class="cola-shell">
    <header class="cola-topbar">...</header>
    <section class="cola-workspace">
      <aside class="cola-rail">...</aside>
      <section class="cola-main">...</section>
      <aside class="cola-inspector">...</aside>
    </section>
  </main>
</body>
```

Default coding workbench:

```html
<body data-otto-surface="coding">
  <main class="coding-workspace">
    <header class="coding-titlebar">...</header>
    <section class="coding-panes">...</section>
  </main>
</body>
```

Starter CSS:

```css
body {
  margin: 0;
  min-height: 100vh;
  background: var(--cola-bg);
  color: var(--cola-text);
  font-family: var(--cola-font-sans);
  font-size: var(--cola-type-body-14);
  line-height: 1.43;
  -webkit-font-smoothing: antialiased;
}

.cola-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr;
}

.cola-topbar {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cola-space-3);
  padding: var(--cola-space-3) var(--cola-space-4);
  border-bottom: 1px solid var(--cola-border);
  background: color-mix(in srgb, var(--cola-bg-surface) 92%, transparent);
}

.cola-workspace {
  display: grid;
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr) minmax(240px, 320px);
  gap: var(--cola-space-section-gap);
  padding: var(--cola-space-page-padding);
}

.cola-panel {
  border: 1px solid var(--cola-border);
  border-radius: var(--cola-radius-card);
  background: var(--cola-bg-surface);
}

.cola-button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cola-space-2);
  border: 1px solid transparent;
  border-radius: var(--cola-radius-full);
  background: var(--cola-fill-black);
  color: var(--cola-text-on-fill);
  padding: 0 var(--cola-space-4);
  font: inherit;
  font-weight: 500;
  transition: opacity 150ms ease, transform 120ms ease;
}

.cola-button:hover {
  opacity: 0.85;
}

.cola-button:active {
  transform: translateY(1px) scale(0.985);
}

.cola-button.secondary {
  background: var(--cola-bg-surface);
  border-color: var(--cola-border);
  color: var(--cola-text);
}
```

## Prompt Contract

When the user invokes this skill, keep visual continuity as a primary requirement. Ask at most one clarifying question when content or target format is ambiguous. Then implement.

Short prompt:

```text
Use Otto Design / Otto Workbench style.
```

Expanded prompt:

```text
Use Otto Design. Build a single-file HTML page for: [topic].
Use the Cola-compatible token pack, warm light workbench chrome, compact controls, semantic borders, black/orange action language, and dense editorial hierarchy.
Use Coding Cola only for code/log/developer surfaces.
```

## Quality Checklist

- The CSS uses `--cola-*` semantic tokens as the primary visual layer.
- The standalone output includes the token pack or imports an existing Cola token source.
- General pages default to warm light Cola chrome.
- Code, logs, terminals, and developer panes use Coding Cola `hacker-dark`.
- Buttons, inputs, badges, tabs, selects, switches, panels, popovers, and tables follow the component language above.
- Radius, spacing, shadows, type, and focus rings match Cola scales.
- Mobile layout collapses into topbar, main content, and stacked panels.
- The skill contains visual guidance only: no secrets, credentials, network automation, or data access steps.
