# AI Query Inspector — Design System

Version 1.0. A complete specification of the visual language, components, and composition rules for the AI Query Inspector Chrome extension.

> This document is for **both** humans and Claude Code. If you're reading it as a human, skim Part 1 for philosophy and jump to Part 5 for component recipes. If you're Claude Code, read linearly — every section contains rules you're expected to follow.

---

## Part 1 — Philosophy

### Editorial analytics

Think Financial Times meets Bloomberg Terminal meets Linear. The audience is SEO professionals, GEO analysts, and developers who want clarity. Our strengths are:

- **Typographic hierarchy, not chromatic noise.** Serif display numbers and prompts do the heavy lifting. Color is used once per screen, deliberately.
- **Dense where data lives, spacious where the eye needs to rest.** KPI strips and source tables are tight. Heroes and CTAs breathe.
- **One accent, used like a spice.** Deep teal-green (`#0E5C4E`). It marks "live," "cited," and "primary action." Nothing else.
- **The prompt is the subject.** Every screen is downstream of a user's prompt to an AI. The prompt is the subject and is set in 36px Instrument Serif as a quote.

### What this system is NOT

- Not a generic SaaS dashboard (no Tailwind cards-in-a-grid aesthetic)
- Not playful (no emoji, no micro-interactions on everything, no gradients of mixed hues)
- Not maximalist (no competing visual voices)
- Not minimalist (we are data-dense where needed)

---

## Part 2 — Design tokens

All values live in `tokens.css`. Never inline a color, font, size, spacing, or shadow — always use a `var(--...)`.

### Colors

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F7F6F1` | App background. Warm off-white — NOT cool blue-grey. |
| `--bg-2` | `#EFEDE5` | Pill tint, bar-chart tracks |
| `--card` | `#FFFFFF` | Default card surface |
| `--card-2` | `#FCFBF7` | Hover, table header |
| `--border` | `#E5E3DA` | Default 1px border |
| `--border-2` | `#D4D2C7` | Stronger border, empty-state dashed |
| `--ink` | `#0F0F0E` | Primary text, display numbers |
| `--ink-2` | `#3A3A36` | Body text |
| `--ink-3` | `#6E6E66` | Meta, labels |
| `--ink-4` | `#A3A39A` | Tertiary, placeholders |
| `--accent` | `#0E5C4E` | The ONE accent |
| `--accent-2` | `#0A7A66` | Hover variant |
| `--accent-bg` | `#E3F0EB` | Accent tint |
| `--accent-line` | `#B8D6CC` | 1px border in accent range |
| `--considered` | `#8A6D1F` | Warm olive, 2nd-tier semantic (source type) |
| `--warn` | `#A14F00` | Warning state |
| `--danger` | `#952020` | Danger / downward drift |

### Typography

Three families. No substitutes.

| Token | Family | Role |
|---|---|---|
| `--font-display` | Instrument Serif | Display numbers, prompt quotes, section titles |
| `--font-sans` | Geist | All UI, body copy, buttons, chips |
| `--font-mono` | JetBrains Mono | Domains, URLs, timestamps, counts, tags |

Load once at the top of any HTML entry point:

```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

### Type scale

| Token | Size | Role |
|---|---|---|
| `--fs-display-xl` | 108px | Overlap % hero (Compare screen) |
| `--fs-display-lg` | 44px | KPI numbers |
| `--fs-display-md` | 36px | Prompt quote |
| `--fs-display-sm` | 30px | Section `<h3>` titles |
| `--fs-display-xs` | 22px | Inline headlines (turn prompt, timeline item) |
| `--fs-body` | 14px | Default body |
| `--fs-body-sm` | 13px | Secondary body |
| `--fs-body-xs` | 12px | Meta, chips |
| `--fs-caption` | 11.5px | Captions |
| `--fs-eyebrow` | 10.5px | Uppercase letter-spaced labels |

### Spacing

`--space-1` … `--space-9` step from 4px to 56px. Use these; don't invent intermediates.

### Shadows

| Token | Use |
|---|---|
| `--shadow-1` | Subtle card lift |
| `--shadow-2` | Popup, dashboard container |

### Motion

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--dur-fast` | 0.15s — hover, color change |
| `--dur` | 0.25s — chevron rotate |
| `--dur-slow` | 0.4s — section collapse, toast |

---

## Part 3 — Voice & copy

- **Headlines** in Instrument Serif. Sentence case, not Title Case. Example: *"See how ChatGPT's answer overlaps with Google's SERP"*
- **Eyebrows** in uppercase Geist with `letter-spacing: 0.12em`, color `--ink-3`. Example: `LAST PROMPT · TURN 2 OF 2`
- **Mono chips** for anything that is or looks like code: domains, model names, status codes, timestamps
- **Italics via Instrument Serif italic** — reserved for emphasis in longer body text. Example: *"brand moats"* in the Compare CTA
- **Numbers**: always display-serif, never bold sans
- **Captions**: always Geist at 11.5–12.5px, color `--ink-3`

---

## Part 4 — Component catalog

Every component's styles live in `components.css`. This section tells you when and how to use each.

### 4.1 Buttons

| Class | Purpose | Notes |
|---|---|---|
| `.btn .btn-primary` | Primary CTA in the popup. Full-width ink-on-white. | One per popup screen max. |
| `.btn .btn-cta-primary` | Oversized hero CTA in the dashboard. Dark ink, shadow, lift-on-hover. | Used in `.compare-cta` and `.google-empty`. |
| `.btn .btn-outline` | Section tools (Copy, Export CSV, Expand all). | Always combine with `onclick="event.stopPropagation()"` when inside a collapsible `.section-head`. |
| `.btn .btn-ghost` | Tertiary text-only action. | Settings, "Learn more" links. |
| `.icon-btn` | Square 28px icon-only action. | Refresh, settings, expand. |

### 4.2 Section (most used)

The section is the universal content block. See Anatomy in `CLAUDE.md`. Rules:

- `h3` is always 30px Instrument Serif (`--fs-display-sm`)
- Always has an `.s-icon` — 32px rounded tile in `--accent-bg`
- `.sub` below the title is UPPERCASE MONO
- Optional `.count-pill` on the right of the title
- Always collapsible unless the content is a fixed short element (< ~80px height)
- Collapse toggles the `.collapsed` class on the outer `.section`

### 4.3 KPI strip

Single-row grid of 4 metric cards. Use for the top-of-screen summary. Rules:

- Maximum 4 KPIs. If you have more, they aren't KPIs.
- Numbers in `--fs-display-lg` (44px), Instrument Serif
- Label below in `--fs-caption` `--ink-3`
- Optional `.trend.up`/`.trend.down` indicator top-right

### 4.4 Prompt hero

The hero of every screen — a quote of the prompt, plus meta.

- `.prompt-hero` — single column base
- `.prompt-hero.with-cta` — 2-column grid with inline `.prompt-cta` on the right (used on ChatGPT Overview)

The quote uses smart quotes rendered as CSS `::before`/`::after` in `--ink-4`.

### 4.5 Chips

Small pill badges in the prompt meta and elsewhere. Variants:

- Base chip: white background, 1px border, Geist
- `.chip.mono` — same shape, JetBrains Mono

Chips with a leading `.dot` indicate a live/model status.

### 4.6 Citation strength (horizontal bar chart)

`.bars` is a 3-column grid:
```
[domain, right-aligned] [track with fill] [count]
```

Fill variants:
- `.row-fill` — solid accent (cited only)
- `.row-fill.cited-considered` — linear gradient, accent → considered at ~55% boundary
- `.row-fill.considered` — olive, 85% opacity

Always include the `.legend` below.

### 4.7 Source table

`.src-table` — the canonical way to display a list of sources, ranked. Columns: rank · domain · title+URL · type · mentions.

Type cell uses `.type-cited` or `.type-considered` pill.

**Never replace this with a card grid.** Card grids truncate titles and don't scan.

### 4.8 Fan-out tree

`.turn` groups fan-out queries by conversation turn. Each `.turn-head` has a `.turn-tag` (mono, accent) and a `.turn-prompt` (serif). Queries are `.fanout-item` rows inside an `.fanout-list`.

`.source-chip.cited` highlights which domains were cited for each query.

### 4.9 Compare screen primitives

- `.overlap-hero` — 2-column grid with huge `.pct` on the left and `.venn` on the right
- `.venn` — absolutely positioned overlapping circles using accent + warn tints
- `.precision-strip` — 3 cards (Precision, Recall, Jaccard)
- `.rank-compare` — 3-column grid table (ChatGPT | match | Google), `.rank-row.match` highlights matches

### 4.10 History primitives

- `.history-head` — 4 KPI cards (same structure as `.kpi-strip` but standalone)
- `.conv-list` — list of `.conv-item` buttons (conversation picker)
- `.conv-detail-head` — inner detail hero with `.back-link`
- `.timeline` + `.tl-item` — vertical timeline with node dots and drift badges

### 4.11 CTA cards

Three levels of emphasis:

- **Inline** — `.prompt-cta` (compact, in the prompt-hero right column)
- **Section** — `.compare-cta` (full-width, bottom of Overview)
- **Empty state** — `.google-empty` (hero card when a tab is awaiting capture)

All three share the accent-gradient background, left accent bar, and green icon tile.

### 4.12 Empty state pattern

When a tab has no data, show:

1. A hero empty card (accent gradient, icon, headline, explainer, primary CTA)
2. Below: 3 `.preview-card`s with `.pc-icon`, title, description, `.placeholder-line`s, set to `opacity: 0.75` to read as "preview of what you'll see"

### 4.13 Popup

- Width: **580px** via `--popup-width`
- Structure: header → hero body (prompt + `.hero-stat` + `.mini-stats` + `.btn-primary`) → sections (`.pop-section`) → `.popup-actions` bar
- `.pop-section.prominent` — the primary CTA section (Compare with Google). One per popup max.

### 4.14 Toast

Used for status like "Loaded ChatGPT conversation." Fades in, holds 2.8s, fades out. **Never** create a sticky status banner.

---

## Part 5 — Screen recipes

A recipe is the ordered list of components that compose a screen.

### ChatGPT / Overview

```
dash-header → dash-tabs → dash-content:
  prompt-hero.with-cta (prompt + prompt-cta)
  kpi-strip (4 kpis)
  section — Fan-out tree    (collapsible, with .turn groups)
  section — Citation strength (collapsible, .bars chart + .legend)
  section — Captured sources  (collapsible, .src-table)
  compare-cta (full-width bottom)
```

### Google — empty (default on first open)

```
dash-header → dash-tabs → dash-content:
  google-empty
    google-empty-icon + google-empty-copy + google-empty-actions
  google-empty-preview (3 preview-cards)
```

### Google — captured

```
dash-header → dash-tabs → dash-content:
  prompt-hero (the SERP query)
  kpi-strip (organic, sites, features, engine)
  section — Top results (.serp-result rows + .serp-aside)
```

### Compare

```
dash-header → dash-tabs → dash-content:
  prompt-hero
  overlap-hero (pct + venn)
  precision-strip
  section — Rank comparison (.rank-compare)
```

### History — Level 1 (conversation picker)

```
dash-header → dash-tabs → dash-content:
  history-view[data-history="list"] active:
    prompt-hero ("Saved runs")
    history-head (4 KPIs)
    section — Conversations (.conv-list with .conv-item buttons)
```

### History — Level 2 (conversation detail)

```
history-view[data-history="detail"] active:
  conv-detail-head (back-link + quote + meta chips)
  history-head (4 KPIs scoped to this conversation)
  section — Run timeline (.timeline with .tl-items)
```

Clicking a `.conv-item` → swap `.active` from `[data-history="list"]` to `[data-history="detail"]`, populate detail header from data. Clicking `.back-link` → reverse.

### Popup — with capture

```
popup:
  popup-header (brand + icon-btns)
  popup-body:
    prompt-block
    hero-stat (retrieval intensity, 56px number)
    mini-stats (4 cells)
    btn-primary "Open full dashboard"
  pop-section — Fan-out queries (collapsible)
  pop-section — Top cited sources (collapsible)
  pop-section.prominent — Compare with Google (with .pop-cta-card)
  popup-actions (3 buttons)
```

### Popup — empty

```
popup:
  popup-header
  popup-empty (illus + h3 + p + buttons)
  popup-actions
```

---

## Part 6 — Migration map

When you encounter a legacy pattern in the extension, use this table.

| Legacy | New pattern |
|---|---|
| Sidebar with 4 tabs | `.dash-tabs` at top of `.dashboard` |
| `<h2>Heading</h2>` with bottom border | `.section-head` (icon + serif h3 + sub + chevron) |
| `display: grid; grid-template-columns: repeat(auto-fit, 200px)` of source cards | `.src-table` |
| 11 tile-cards each showing a domain + bar + count | One `.bars` chart |
| 6 stat cards across the top | 4-column `.kpi-strip` |
| Sticky "Loaded conversation" banner | `.toast` (auto-hide 2.8s) |
| Privacy panel persistently visible | `.icon-btn` gear → settings modal |
| `0` / `None` / `Unknown` placeholders | Proper empty state: illustrated icon + headline + explainer + CTA |
| "See history" global timeline | Two levels: `.conv-list` then `.timeline` per conversation |

---

## Part 7 — Do's and don'ts

**DO:**
- Use `.toast` for any transient status message
- Collapse long sections by default when the user likely scans titles first
- Put meta in `.chip` pills rather than inline in headings
- Set `aria-expanded` on `.section-head` buttons that toggle bodies
- Use `<button>` for interactive items, even styled like cards (e.g. `.conv-item`)

**DON'T:**
- Don't use bullet point lists in UI chrome — they belong inside article content only
- Don't use drop-shadows on everything; reserve them for CTAs and the main dashboard/popup shell
- Don't animate more than one thing per user action
- Don't add new section titles without an `.s-icon`
- Don't put more than one `.btn-cta-primary` on a screen
- Don't create new variants of `.kpi-strip` — if the layout needs more than 4 cards, re-think whether they're KPIs

---

## Part 8 — Extending the system

If a screen truly needs something new:

1. Sketch it in `reference-mockup.html` first
2. Add the CSS to `components.css` with a commented section header matching the existing style
3. Document the new component here in Part 4
4. Add a recipe entry in Part 5 if it's a screen-level composition
5. Cross-reference from `CLAUDE.md` Rule 2

No component ships without all 5 steps.
