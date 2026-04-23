# CLAUDE.md — Design System Agent Instructions

You are working inside the **AI Query Inspector** Chrome extension. This folder contains the design system. Every UI file in this repo must conform to it.

---

## Before you write any UI code

1. Read **`DESIGN_SYSTEM.md`** in this folder (philosophy, component catalog, screen recipes, rules).
2. Link **`tokens.css`** and **`components.css`** in the HTML file you are editing — do NOT duplicate the styles inline.
3. Load Google Fonts once at the top of any HTML entry point:
   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
   <link rel="stylesheet" href="/design-system/tokens.css">
   <link rel="stylesheet" href="/design-system/components.css">
   ```
4. If a design question isn't answered by `DESIGN_SYSTEM.md`, open **`reference-mockup.html`** in the browser, find the closest existing screen, and copy its structure. If nothing matches, ask the user — do not invent a new pattern.

---

## Non-negotiable rules

These override any prior convention in the extension codebase.

### Rule 1 — Tokens only
Never use a hex color, font-family, font-size, spacing value, shadow, or border-radius literal in CSS or inline styles. Always use a `var(--…)` from `tokens.css`. Adding a new raw value means you either missed the token or need to propose a new one — surface it to the user first.

### Rule 2 — Component classes over new CSS
Before writing a new `.foo { ... }` rule, search `components.css` for an existing class. The answer is almost always there. If you truly need a new component, add it to `components.css` with a short comment explaining purpose, and document it in `DESIGN_SYSTEM.md`.

### Rule 3 — Typography
Only three font families exist: `--font-display` (Instrument Serif), `--font-sans` (Geist), `--font-mono` (JetBrains Mono). Never use Arial, Helvetica, Roboto, Inter, Space Grotesk, SF Pro, or any `system-ui` stack.

### Rule 4 — One accent color
`--accent` (deep teal-green) is the only chromatic voice. Use it for: the "live" indicator dot, "cited" source markers, primary CTA emphasis, and the section underline accent. Do not introduce blues, purples, oranges, or gradients of mixed hues. Warn/danger colors exist but are for semantic states only, not decoration.

### Rule 5 — Tabs, not sidebars
Dashboard navigation uses `.dash-tabs` at the top. Never build a left sidebar.

### Rule 6 — Tables for source lists, not card grids
Any list of domains, URLs, or sources uses `.src-table` (full dashboard) or `.src-row` (popup). Card grids truncate titles and scan worse than rows.

### Rule 7 — Max 4 KPIs per strip
`.kpi-strip` holds at most 4 cards. If there are more than 4 numbers to show, the extras aren't KPIs — move them into a dedicated section or the prompt-hero chips.

### Rule 8 — One primary CTA per screen
A screen has one dark `.btn-cta-primary` (Overview: Compare CTA. Google-empty: Capture. Popup: Open dashboard). All other actions are `.btn-outline` or `.btn-ghost`.

### Rule 9 — Persistent banners are forbidden
Status messages like "Loaded ChatGPT conversation" use the `.toast` component — it fades in, holds 2.8s, fades out. Never create a sticky banner that lives on the page.

### Rule 10 — Privacy settings live in a modal
Privacy/safety copy, auto-capture toggles, and the like go in a settings modal opened via the gear `.icon-btn`. They do not take up dashboard real estate.

---

## Anatomy: the Section component

This is the most-used pattern. Memorize it.

```html
<div class="section" data-collapse>
  <div class="section-head">
    <div class="title">
      <span class="s-icon"><svg>…</svg></span>
      <div class="title-text">
        <h3>Title in Instrument Serif</h3>
        <span class="sub">UPPERCASE MONO META</span>
      </div>
      <span class="count-pill">12</span>      <!-- optional -->
    </div>
    <div class="tools">
      <!-- any action buttons. MUST use onclick="event.stopPropagation()"
           or they collapse the section when clicked. -->
      <button class="btn btn-outline" onclick="event.stopPropagation()">Copy</button>
      <span class="chevron"><svg>…chevron-down…</svg></span>
    </div>
  </div>

  <div class="section-body">
    <!-- content -->
  </div>
</div>
```

Wire up collapse globally once (add this to your shared JS):

```js
document.querySelectorAll('.section[data-collapse] .section-head').forEach(head => {
  head.addEventListener('click', e => {
    if (e.target.closest('button')) return;            // let buttons fire normally
    head.parentElement.classList.toggle('collapsed');
  });
});
```

Same pattern for the popup: `.pop-section[data-pop-collapse]` toggles `.collapsed` on its parent. See `DESIGN_SYSTEM.md` for the popup version.

---

## Mapping from current extension → design system

When you encounter legacy patterns, convert them:

| You see | Replace with |
|---|---|
| Left sidebar with tab list | `.dash-tabs` at the top |
| Scattered stat cards in a row (6+) | `.kpi-strip` (max 4 cards) |
| Grid of source cards with truncated titles | `.src-table` |
| 11+ bar-tile cards side by side | Single horizontal chart with `.bars` grid |
| Sticky "Loaded…" banner | `.toast` animation |
| Plain bold text section title | `.section-head` with `.s-icon` + serif `h3` |
| Card that does multiple things (stat + CTA + content) | Split into `.kpi` + `.compare-cta` + `.section` |
| History as one flat timeline | `.conv-list` (picker) → `.timeline` (detail) with `.back-link` |
| Free-floating "Capture Google" button | `.prompt-cta` (inline) + `.compare-cta` (bottom) |

---

## Screen recipes — composition in order

### ChatGPT / Overview screen
1. `.dash-header` with `.dash-brand` + `.dash-actions`
2. `.dash-tabs` (ChatGPT active)
3. `.dash-content` containing:
   - `.prompt-hero.with-cta` (prompt left + `.prompt-cta` right)
   - `.kpi-strip` (4 KPIs)
   - `.section` — **Fan-out tree** (fan-outs come before citations)
   - `.section` — **Citation strength** (`.bars` chart)
   - `.section` — **Captured sources** (`.src-table`)
   - `.compare-cta` (bottom, bridges to Compare tab)

### Google screen (empty by default)
1. `.dash-tabs` (Google active)
2. `.dash-content` containing:
   - `.google-empty` hero with `.btn-cta-primary`
   - `.google-empty-preview` (3 `.preview-card`s)

### Google screen (captured state)
- Same recipe as Overview but leading with a SERP-specific KPI strip + `.serp-layout` (ranked `.serp-result`s + `.serp-aside`)

### Compare screen
- `.overlap-hero` (big percentage + `.venn`)
- `.precision-strip` (3 `.p-card`s)
- `.section` — **Rank comparison** (`.rank-compare` table)

### History screen — two levels
- Level 1: `.history-view[data-history="list"]` with `.history-head` KPIs + `.conv-list`
- Level 2: `.history-view[data-history="detail"]` with `.back-link` + `.conv-detail-head` + `.timeline`
- Clicking a `.conv-item` swaps active view from list → detail

### Popup
- Width: **580px** (use `--popup-width`, never hardcode)
- `.popup-header` with `.brand` + `.icon-btn`s
- `.popup-body` with `.prompt-block` + `.hero-stat` + `.mini-stats` + `.btn-primary`
- `.pop-section`s in order: **Fan-out queries → Top cited sources → Compare with Google** (prominent variant)
- `.popup-actions` bar at the bottom

---

## Iconography

SVG icons are 16px inside `.s-icon`, 14px inside `.icon-btn`, 13px in `.popup-actions`. Use `stroke-width="2"` (or 1.8 for 16px+). Never use icon fonts, emoji, or raster icons. Always `fill="none" stroke="currentColor"` so icons inherit the slot's color.

---

## When stuck

- Treat the reference mockup (`reference-mockup.html`) as ground truth. If you can see it in the mockup, copy that structure.
- If the user's request implies a new component, pause and describe two alternatives from existing components first. Only create new CSS after the user confirms neither fits.
- If existing extension code has colors/fonts/patterns that clash with these rules: change them, don't preserve them. The design system is authoritative.
