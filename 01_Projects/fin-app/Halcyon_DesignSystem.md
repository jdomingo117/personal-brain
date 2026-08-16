---
aliases:
  - Halcyon Design System
  - Design System
tags:
  - halcyon
  - projects/fin-app
  - finance
  - design-system
type: design-system
status: current
project: Halcyon
up: "[[CONTEXT]]"
related:
  - "[[System requirements - SRD]]"
  - "[[MVP_SCOPE]]"
  - "[[MIGRATION_PLAN]]"
  - "[[app/README|App README]]"
---

# Halcyon — Design System

**A light, editorial design language for premium personal finance.**

Halcyon reframes a finance app as a calm, precise, product-grade experience. It pairs the
cinematic confidence of a premium console/product landing page with the restraint of a
private-banking interface: one continuous surface, a single accent, heavy display typography,
frosted-glass depth, and quiet, intentional motion. It ships in a **light** and a **dark
("Slate + luminous")** theme from the same token set.

> **This document is the definitive, current specification, and it describes the shipping
> product: the React application in [`app/`](app/).** The tokens, components, and motion below
> are encoded in real source — primarily [`app/src/index.css`](app/src/index.css) (tokens) and
> `app/src/`. Two earlier documents are retained for **historical reference only**:
> `HalcyonHUD_DesignSystem.md` (the original dark "console HUD" direction) and the
> vanilla HTML/CSS/JS prototype at the repository root (`index.html`, `styles.css`, `app.js`,
> `card3d.js`, `background.js`, …), which the React app supersedes.

### Reproduce this exactly
1. `cd app && npm install && npm run dev` → http://localhost:5300 (Node 20+).
2. The **source of truth for every token is [`app/src/index.css`](app/src/index.css)** — the
   `@theme` block (light), the `:root` raw vars, and the `.dark` override block. This document
   mirrors those values; if they ever disagree, the CSS wins.
3. Fonts load from Google Fonts in [`app/index.html`](app/index.html) (Archivo + Hanken Grotesk).
   No other external assets are required.

---

## 1. Principles

1. **One surface, glass depth.** Everything lives on a single tone (light `#eceef1` /
   dark `#181c22`). Data modules are **frosted-glass tiles** — translucent fill with a
   backdrop-blur — so the ambient scene bleeds through and the dashboard feels physically
   present in a space rather than printed on a page. Structure comes from the glass material
   and whitespace, not from opaque stacked cards or heavy borders.
2. **Colour means something.** The interface is near-monochrome ink-on-surface. A single mint
   accent and the semantic trio (positive / warning / negative) are used sparingly — colour
   signals state or emphasis, never decoration.
3. **Type carries the design.** Hierarchy is built from a heavy display face against a calm
   body face — by weight and scale, not ornament.
4. **Quiet, intentional motion.** Animation is slow, eased, and confident: entrance
   choreography, a techy scramble for navigation, a shared-element card→tile morph, smooth view
   transitions. Never flashing, never looping noise.
5. **Console soul, premium register.** A restrained technical flavour survives — index numbers,
   a scramble effect, a boot sequence, a letterbox frame — but the voice is premium, never
   militarised or gamer-coded.
6. **One token set, two themes.** Light and dark are the same design expressed through swapped
   CSS variables. Components are authored once against tokens; the theme flips for free.

---

## 2. Design Tokens

Tokens are defined in [`app/src/index.css`](app/src/index.css). Colours that drive Tailwind
utilities live in the `@theme` block as `--color-*`; raw values used outside colour utilities
(hairlines, glass, control fills) live in `:root`. **Dark mode** re-declares the same names
inside `.dark` (see §3).

```css
/* @theme — colour tokens (become Tailwind utilities: bg-surface, text-ink, …) */
--font-display: 'Archivo', sans-serif;          /* weights 600–900 */
--font-body:    'Hanken Grotesk', -apple-system, sans-serif;  /* 400–700 */

--color-surface: #eceef1;   /* the one tone everything sits on */
--color-ink:     #15181c;   /* primary text */
--color-ink2:    #3b424a;   /* secondary text */
--color-muted:   #5f6872;   /* AA labels, captions — 4.87:1 on surface */
--color-faint:   #646d77;   /* AA inactive numerals, hints — 4.52:1 */

--color-accent:     #11b596;  /* mint — used sparingly */
--color-accent-ink: #08735f;  /* mint text — 4.98:1 on light */

--color-pos:  #08734c;   /* income, gains, healthy — 5.06:1 */
--color-warn: #87570d;   /* user-actionable risk — 5.31:1 */
--color-neg:  #a83430;   /* blocked/error/loss — 5.65:1 */

--color-blue: #3b6fd4;   /* chart series */
--color-gold: #c2a24e;   /* chart series */

--color-bar:  #0b0d11;   /* cinematic letterbox bars (top header + bottom strip) */

--shadow-glass: inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 30px rgba(28,38,58,0.10);
--ease-halcyon: cubic-bezier(0.22, 1, 0.36, 1);   /* the house easing */

/* :root — raw vars (hairlines, glass material, control fills) */
--hair:       rgba(20,24,28,0.12);   /* borders, dividers */
--hair-soft:  rgba(20,24,28,0.07);   /* row rules, tile separators */
--glass-fill: rgba(255,255,255,0.34);
--glass-bd:   rgba(255,255,255,0.6);
--accent-wash: rgba(17,181,150,0.10);
--track:      rgba(20,24,28,0.08);   /* meter / ring / donut tracks */
--toast-bg:   rgba(255,255,255,0.92);
--input-bg:   rgba(255,255,255,0.6);
--switch-off: rgba(20,24,28,0.15);
--workflow-control-border: #747c85; /* 3:1+ native-control boundary */

/* categorical hues — one fixed hue per expense category, assigned by taxonomy
   index. IDENTITY ONLY, never state (see §8.15). --cat-unknown is the
   fallback for a name outside the expense taxonomy (Income, Transfer,
   Investing, Uncategorized) and must never read as a real category. */
--cat-1: #2a78d6;  --cat-2: #1baf7a;  --cat-3: #eda100;  --cat-4: #008300;
--cat-5: #4a3aa7;  --cat-6: #e34948;  --cat-7: #e87ba4;  --cat-8: #8a5a2b;
--cat-9: #007f95;  --cat-10: #5b5bd6; --cat-11: #b85c00; --cat-12: #a83f8f;
--cat-13: #5f6b32;
--cat-unknown: #8a94a1;
```

**Adding a category.** The mapping is positional (`catColor` in
`app/src/lib/categoryColor.ts` indexes `EXPENSE_CATEGORIES`), so **appending** a
category is safe but **reordering** deliberately reassigns existing hues. The
Phase 3 taxonomy has 13 distinct tokens in both themes and `catColor` no longer
wraps missing tokens with modulo arithmetic: a future category must add its own
token or it will resolve to an undeclared CSS variable. Re-run the palette's CVD
and contrast checks whenever the taxonomy or order changes.

**Hue vs. state — the rule.** A colour in a tile means *either* "which thing this is" (`--cat-*`)
*or* "how this thing is doing" (`pos`/`warn`/`neg`/`accent`) — **never both in one tile**. A hue
that means "Shopping" competes with a hue that means "overspent", and only one of those deserves an
alarm. `ExpenseFlowCard` is an identity tile (hues, no judgement); `ExpensePacingCard` is a state
tile (no hues, judgement only). Pick one per tile and hold the line.

**Accent discipline:** at most one mint highlight per view region. The accent is reserved for
the active nav state, links/CTAs, focus rings, the card edge, chart series, and status dots.
Card bodies, text, and chrome stay monochrome. The accent is **live-retintable** from Settings
(Mint / Azure / Gold / Ink) because every utility references `var(--color-accent)`.

---

## 3. Dark Mode — "Slate + luminous"

Dark mode is a `.dark` class on `<html>`, toggled from **Settings → Dark mode** *or* a **floating
quick toggle** pinned bottom-right ([`ThemeToggle.tsx`](app/src/components/ThemeToggle.tsx)) for
one-tap access from any view; both share the same `dark`/`setDark` context, so they stay in sync.
Starts light on first visit, then **persists the choice in `localStorage`** (`halcyon-theme`); an
inline script in [`index.html`](app/index.html) re-applies the `.dark` class before first paint so
returning visitors never see a flash of the wrong mode. Because every component is authored against
tokens, the whole app flips by re-declaring those tokens. The design intent: a **warm-charcoal workspace** with the
letterbox bars kept *darker than the workspace* so the cinematic frame still reads, dark frosted
glass, and a **brighter, glowing** lattice + colour wash for a Halo-HUD luminosity.

```css
.dark {
  --color-surface: #181c22;   /* warm charcoal workspace */
  --color-ink: #eef1f4;  --color-ink2: #b2bac4;
  --color-muted: #a5aeb8; --color-faint: #98a2ad;
  --color-bar: #0b0e12;       /* darker than the workspace → frame still reads */
  --color-accent: #16c7a4;    /* luminous mint */  --color-accent-ink: #3ad9bd;
  --color-pos: #36cf93;  --color-warn: #d9a23f;  --color-neg: #e0635c;

  --hair: rgba(255,255,255,0.12);     --hair-soft: rgba(255,255,255,0.07);
  --glass-fill: rgba(255,255,255,0.05); --glass-bd: rgba(255,255,255,0.09);
  --accent-wash: rgba(22,199,164,0.16);
  --track: rgba(255,255,255,0.09);    --toast-bg: rgba(28,33,40,0.92);
  --input-bg: rgba(255,255,255,0.06); --switch-off: rgba(255,255,255,0.16);
  --workflow-control-border: #818b96;
  --shadow-glass: inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 36px rgba(0,0,0,0.45);
}
```

**Rules for staying theme-safe (so the toggle keeps working):**
- Author against tokens. Never hardcode a colour where a token exists.
- The handful of legitimately hardcoded spots (glass border, meter/ring/donut tracks, toast,
  inputs, switch, scroll-cue) are **var-ised** — they read `var(--track)`, `var(--input-bg)`, etc.
- The ambient scene is **theme-aware in code** (`SceneBackground` takes a `dark` prop and the
  `.scene-wash` gradient has a `.dark` variant — brighter/deeper colour fields on charcoal).
- **Animated** colours (Framer Motion) must be `rgba`/hex, never Tailwind colour utilities —
  Tailwind v4 emits `oklab()`, which Framer Motion cannot interpolate. (See §11.)

---

## 4. Typography

| Role | Font | Weight | Size | Case / tracking |
|---|---|---|---|---|
| Landing headline | Archivo | 900 | clamp 48–92px | mixed, `-0.03em` |
| View title | Archivo | 800–900 | ~46px | mixed, `-0.02em` |
| Hero / stat figure | Hanken Grotesk | 700 | 32–40px | tabular numerals |
| Card / tile title | Archivo | 700 | 14–15px | mixed |
| Body | Hanken Grotesk | 400–500 | 13–15px | mixed |
| Micro-label / eyebrow | Hanken Grotesk | 600 | 11–12px | UPPERCASE, `0.14–0.18em` |
| Index numeral (rail/boot) | Archivo | 800 | 14–34px | tabular |

- **All numbers use tabular figures** (`tabular-nums`) so currency and data align in columns.
- Uppercase is reserved for **micro-labels only** (eyebrows, tags, statuses). Titles and body
  are sentence case.
- No monospace anywhere — proportional sans only (mono read "techy / scoreboard").
- The `.micro` utility ([`index.css`](app/src/index.css)) is the canonical eyebrow:
  `11px / 600 / 0.14em / uppercase`.

---

## 5. Layout Architecture — the letterbox shell

A locked, full-viewport shell: no window-level scroll; content scrolls within the screen region.
Implemented in [`Shell.tsx`](app/src/components/Shell.tsx) as a three-row grid.

```
+================================================================+   ← bg-bar (top letterbox)
|  [H] HALCYON │ Private Wealth        (search)(gear)(bell) [AM] |
+----------+-----------------------------------------------------+
|  00 ──   |                                                     |
|  01 ──── |  DASHBOARD            [ screen region — transparent ]|   ← rail | screen
|  02 ──   |  (landing hero, or frosted-glass data tiles)        |
|  03 ──   |                                                     |
+----------+-----------------------------------------------------+
|  ● System nominal · synced    │ dashboard │   Last sync 2m ago |   ← bg-bar (bottom strip)
+================================================================+
```

- **App grid:** `grid-rows-[auto_1fr_auto]` — top bar, body, bottom strip.
- **Letterbox pair:** the top header and bottom status strip are both `bg-bar` (near-black,
  *darker than the workspace*), each with a faint mint hairline gradient on the inner edge.
  This is the cinematic black-bars identity, and the reason `--color-bar` stays darker than
  `--color-surface` in both themes.
- **Body:** `grid-cols-[52px_1fr]` on small screens, `md:grid-cols-[188px_1fr]` (rail · screen).
- **Screen region** is transparent — *not* a card. The landing fills it; data views render a
  scroll container (`.scroll-region`) inside it.
- **View routing** uses `<AnimatePresence mode="sync">` with views positioned `absolute inset-0`
  so the shared-element morph (§9) doesn't cause layout shift.

---

## 6. Navigation — the Index Rail

Floating, vertically centred in the left gutter, **borderless**. Each item is a **technical
index**: a number, a hairline rule, and a scramble-in label. Source of truth for order is
`NAV` in [`router.tsx`](app/src/router.tsx); behaviour is in [`Shell.tsx`](app/src/components/Shell.tsx).

```
00 ──── DASHBOARD        ← active: accent-ink numeral, extended rule + mint indicator, label shown
01 ──                    ← default: faint numeral, short rule, label hidden
```

**States**
| State | Numeral | Rule | Label |
|---|---|---|---|
| Default | `text-faint` | `w-[14px]`, faint | hidden (`max-w-0 opacity-0`) |
| Hover | `text-ink` | `w-[34px]` | reveals + scrambles in |
| Active | `text-accent-ink` | `w-[34px]` + mint indicator (`layoutId="rail-active"` spring) | shown persistently |

- The rule is a **real layout element that expands** (`14px → 34px`), and the mint active
  indicator fills it (`w-full`) — it never overflows into the label (a fix for an earlier bug
  where an absolutely-positioned line overlapped and obscured the selected label).
- **Scramble:** on hover/activation the label resolves character-by-character (`useScramble`,
  uppercase) — the system's signature flourish, also used by the boot status line.
- On the **landing**, the whole rail nudges up (`y: -26`) for optical centring; it settles to 0
  on any data view.
- Order: `00 Landing · 01 Dashboard · 02 Accounts · 03 Income · 04 Expenses · 05 Ingestion`.
  **Settings** is reached from the header gear, not the rail.

---

## 7. Top bar & status strip

- **Brand:** square `H` mark (white glyph, hairline-bordered, `rounded-[9px]`) + `HALCYON`
  (Archivo 800) + "Private Wealth" tag divided by a hairline. Click → landing.
- **Utilities:** ghost icon buttons (`38px`, `rounded-[11px]`, `white/55` → white on hover) for
  search, **settings (gear → Settings view)**, notifications; a white **avatar** chip (initials).
- **Bottom strip:** a mint status dot + "System nominal · all accounts synced", the current view
  name, and a "Last sync" stamp — all in `white/35` micro-label type.
- Icons are unified geometric line SVGs at 18px, 1.7 stroke. No emoji.

---

## 8. Components

The frosted-glass material is the shared `.glass` class ([`index.css`](app/src/index.css)); most
components compose it. React components live in [`app/src/components/`](app/src/components).

### 8.1 Frosted-glass tile — `.glass` (`Tile.tsx`)
The data-grouping material: translucent, blurred panels that let the ambient scene show through.

```css
.glass {
  border-radius: 16px;
  background: var(--glass-fill);            /* light .34 white / dark .05 white */
  border: 1px solid var(--glass-bd);
  box-shadow: var(--shadow-glass);
  backdrop-filter: blur(22px) saturate(1.2);
}
```

Tiles sit in a plain CSS grid with `gap` — no hairline background, no outer frame. Span
utilities apply. The glass is global (all views), so legibility must hold over the scene at all
tile densities, in both themes.

### 8.2 Stat block (`Stat.tsx`)
`label` (micro-label) · `value` (Hanken 700, tabular, 24–32px) · `delta` (`text-pos` up /
`text-neg` down).

### 8.3 Capacity meter (`CapacityMeter.tsx`)
A single continuous track (`height 6px`, `rounded`, `var(--track)`) with a fill that animates
width over ~1s. Fill colour encodes state: `healthy → accent`, `warning → warn`,
`critical → neg`. Label + percentage above, `spent / budget` caption below. (One bar, no blink —
evolved from the original segmented "shield".)

### 8.4 Ledger (`Ledger.tsx`)
Grid rows: date (`muted`, tabular) · merchant (500, truncates) · category (micro, `accent-ink`) ·
amount (600, tabular; `pos` for inflow). Header row is a micro-label over a `hair` underline;
rows divided by `hair-soft`.

The compact shared ledger remains a read-only preview inside Dashboard, Accounts, Income and
Expenses. The first-class `/ledger` route is the corrective work surface: review/source and
recurring/subscription/reimbursable/tax-related chips, search, account/category/kind filters and
50-row pagination sit above selectable rows showing date, merchant/description, account,
first-class kind, category/subcategory, provenance and amount. Its rail badge counts explicit
review rows plus `Uncategorized` rows.

Selecting a row opens `TransactionCategoryDrawer` at the document root (a portal is required so
the route's animated/scroll-masked container cannot clip a fixed drawer on mobile). At desktop it is
a right-hand 520px panel; at narrow viewports it occupies the full 390px-class canvas. It shows
source/confidence/review/history, uses dependent native selects, and presents two explicit radio
scopes: safe-default “Only this transaction” or “All matching past and future”. Merchant scope shows
the exact existing/change count before confirmation and explains that future matches use the rule.
A distinct “Accounting & attributes” section edits transaction-only kind, spending nature,
recurring, subscription, reimbursable and tax-related state, shows kind provenance/history, and
offers guarded undo without implying a merchant-wide rule. Reconciliation anchors render as locked
system adjustments; category and attribute undo remain available only while no newer classification
conflicts.

Phase 5 extends this drawer with two patterns. “+ Add custom subcategory” reveals one compact inline
name field beneath the dependent subcategory select; creation remains category-scoped and the new
value becomes selected after refresh. “Split transaction” expands an exact-allocation editor made of
repeated bordered groups. Every group exposes signed amount, kind, category, dependent subcategory
and optional note. A live status block says `Allocated X of Y · Exact` or the signed remainder;
primary save stays disabled until 2–50 non-zero allocations reconcile exactly. Pending transactions
and system adjustments show one explanatory locked state. Saved splits collapse to a concise amount
and purpose summary, retain a guarded undo, and add a small `Split N` badge to the ledger parent.
The original parent amount remains the statement truth; category analytics render allocation rows.

The ledger header’s secondary `Rules & review policy` action opens a centered, scrollable dialog.
Its first card contains a native confidence select (60% automation, 75% balanced, 90% review) and a
Switch for AI rows missing subcategories. Its second section lists only user-authored merchant rules
with purpose, hit count and a 44px delete action; an empty state points back to the drawer’s explicit
past/future scope. Deletion changes future learning and never implies historic reversal. Both the
dialog and split editor use existing surface/input/hair/accent tokens, native keyboard controls,
`role="dialog"`/labelled headings, Escape dismissal, inline `role="alert"` errors and no horizontal
scroll at the 390px-class canvas.

Each ledger row also has an independent 44px selection target. “Select page” and individual
checkboxes expose `BulkCategoryDialog`, whose impact copy says selected rows change now and future
rows do not. The grouped mutation can be undone as one operation. Compact shell header/footer content
collapses below `sm`, and the rail/content grid uses `minmax(0,1fr)` so the dialog and ledger retain a
390px canvas without horizontal overflow.

### 8.5 Account / stream row (`AccountRow.tsx`)
Accent bar (3px) + name (600) + type (micro) + balance (tabular; `neg` if negative).

### 8.6 Allocation donut + legend (`AllocationDonut.tsx`, `charts/Donut.tsx`)
SVG donut (stroke 13, rounded caps, `var(--track)` rail, animated dash over ~1s) with a tabular
centre value; legend rows of `dot · label · value`.
The fixed 165px visual and legend sit side-by-side on wide cards. At 420px or less of the donut
component's own available width, a container query stacks the centred visual above a full-width
legend, so the legend retains readable labels and values even when the surrounding page is wide.

### 8.7 Objective ring (`ObjectiveRing.tsx`)
SVG progress ring (rounded cap, animated dashoffset over ~1.2s) with a tabular percentage
centred; value + label beneath.

### 8.8 Charts (`charts/Area.tsx`, `charts/Bar.tsx`, `charts/Donut.tsx`)
Hand-built SVG. **Area/line:** animated stroke draw-on, subtle gradient fill, hairline
gridlines, tabular ticks. **Bar:** animated vertical bars with dynamic height/y interpolation on sweep. **Donut:** as above. Palette keys map to tokens
(`accent / pos / warn / neg / blue / gold`). No glow.

**Responsive geometry foundation:** Chart SVGs must draw in their own measured CSS-pixel coordinate
space, obtained through `hooks/useResponsiveChartSize.ts`; their `viewBox` must match the returned
width and height. Do not stretch a fixed viewBox using `preserveAspectRatio="none"`: it distorts
chart typography, circles, tooltip cards and apparent trend slopes as grid cards reflow. The shared
sizing rule starts at the established 640×240 desktop proportion and clamps rendered height to
180–300px; chart-specific migrations can override those bounds where justified by data density.
`Area.tsx`, `Bar.tsx`, `ProjectionChart.tsx` and Income's `Sparkline` are all migrated to this
contract.

**Container-aware density:** Axis labels follow `lib/chartDensity.ts`, not a fixed label count.
It distributes labels evenly, always retaining the first and last period; compact cards show three
x labels and three horizontal reference guides, while desktop cards can earn up to eight x labels
and five guides. Projection keeps its target/today guide lines on narrow cards but hides their text
annotations until the usable plot width can accommodate them.

**Responsive regression matrix:** `lib/responsiveVisualRegression.test.ts` protects the compact,
tablet, laptop and wide-desktop modes at 390px, 768px, 1024px and 1440px. It asserts bounded
height, undistorted measured viewBox geometry, first-to-last tick coverage, chart-specific density,
the compact donut stack, and pointer-to-data-index behavior. Interactive charts share
`lib/chartInteraction.ts` for the CSS-pixel pointer conversion so tooltip and click selection stay
aligned when the SVG resizes.

**Income cash-flow pacing:** The Income analyzer charts the exact active date interval, including
zero-activity time buckets, rather than snapping Week or custom ranges to a whole calendar month.
It uses daily buckets through 45 days, weekly buckets through 183 days, then monthly buckets for
longer ranges. The chart's cumulative tag and the adjacent average/peak KPI language name the
active cadence; totals, coverage and the savings-rate sparkline all derive from that same series.

**Multi-series hover:** Area and Bar charts show one grouped, date-headed tooltip per hovered
x-position—not one card per series. It lists colour-keyed values inside a single card, then places
that card above the highest point or below the lowest when top clearance is unavailable, clamping
it to the plot bounds. `lib/chartTooltip.ts` owns this shared placement rule.

### 8.9 Forms (`Controls.tsx`)
Shared chrome: `var(--input-bg)` fill, `hair` border, rounded `10px`, plus a global 2px
`accent-ink` focus-visible outline that does not depend on a colour-only border change. Workflow
surfaces strengthen native control boundaries with `--workflow-control-border`. Min tap target 44px.
The family:
- **Input** — raw `<input>` with the chrome above (e.g. Ingestion amount / merchant).
- **`Chip`** — single-select pill (active = mint wash + accent border); also the **Quick range**
  preset toggles inside the `DateRangePicker` popover.
- **`Select`** — styled native `<select>` with the shared chrome + a chevron glyph; options inherit
  OS theming on open.
- **`DateInput`** — styled native `<input type="date">`; the native calendar popup + picker glyph
  follow the theme via `color-scheme` (`light` by default, `dark` under `.dark` in `index.css`).
- **`MultiSelect`** — checkbox dropdown for multi-select. Trigger mirrors `Select`; the panel is an
  **opaque** frosted popover (`var(--toast-bg)` + blur, so it stays legible over content) with a
  **Select all / Clear** header and per-row checkboxes (accent-filled when on) + an optional
  right-aligned hint. Closes on outside-click or Escape; roled `listbox`/`option`. The summary label
  collapses by count (all → `allLabel`, one → that option's label, many → "N {noun}", none →
  `emptyLabel`). The host container needs an elevated `z-index` so the panel paints over following
  content. Drives the Income analyzer **Linked accounts** filter.
- **`DateRangePicker`** — unified range control: one compact trigger (range label + calendar glyph)
  opening a frosted popover (same chrome as `MultiSelect`) with `Chip` **presets** over two
  `DateInput`s (From / To). Trigger label collapses to `MMM D – MMM D`, adding `'YY` when the range
  spans years. Closes on outside-click or Escape. Replaces the separate quick-range + custom-range
  groups; drives the Income analyzer period.

### 8.10 Buttons (`Controls.tsx`)
- **Primary CTA:** ink fill, surface-coloured text, micro-label, rounded; hover lifts 1px.
- **Ghost CTA:** transparent, `hair` border, ink text.

### 8.11 Switch / accent swatch (`Controls.tsx`, Settings)
Pill switch (`46×26`): `background: on ? var(--color-ink) : var(--switch-off)`, sliding
surface-coloured knob — token-driven so it is dark-safe. Settings hosts the **Dark mode** switch
(first interface toggle), the **motion** toggle, **redact balances**, and live **accent
swatches** (Mint / Azure / Gold / Ink) that set `--color-accent`.

### 8.12 Milestone toast (`MilestoneToast.tsx`)
A floating frosted chip (`var(--toast-bg)`, blur, `hair` border, glass shadow, `rounded-2xl`):
mint icon tile + "Milestone reached" eyebrow + Archivo title + caption. Slides from top,
auto-dismisses ~3.8s. Mounted in an `aria-live` region.

### 8.13 Segmented tabs (`SegmentedTabs.tsx`)
A mutually-exclusive view switcher: a `hair`-bordered glass track of options with a sliding
`accent-wash` thumb (shared Framer `layoutId`, spring) under the active label (`accent-ink` text).
Roled `tablist`/`tab`. Drives the Income view's **Income analyzer / Strategic projections** switch
(top-right of the header); the two panels cross-fade via `AnimatePresence`.

### 8.14 Income analyzer (header toolbar + tile layout)
Filters are **chrome, not content**, so they live in the page header (a global element, no glass
container) rather than a tile: a **`DateRangePicker`** (period) + **`MultiSelect`** (linked accounts)
sit between the title and the `SegmentedTabs`, shown only on the analyzer tab. The header row carries
an elevated `z-index` so the filter popovers overlay the content beneath. Below, the tiles follow a
summary → trend → detail hierarchy:

- **Row 1 — period KPIs:** four hero tiles (Total period inflow · Prorated monthly average · Peak
  deposit item · Inflow/outflow coverage). Coverage flips `pos`/`neg` (surplus/deficit) by sign.
- **Row 2 — pacing + savings:** a wide **cumulative cash-flow pacing** chart (two `Area` series —
  cumulative inflow `pos` + cumulative net `blue` — so the gap reads as spending) and a narrow
  **savings-rate** tile (an SVG ring of rate %, amount saved, a monthly-rate `Sparkline`, and a
  delta vs a 20% target; the ring clamps to `[0,1]` and reads red on a deficit).
- **Row 3 — sources + receipts:** an **income-source** breakdown (`AllocationDonut`; stream shares
  are fixed by cadence-normalised monthly-equivalents, the period total scales them) and a **recent
  deposits** `Ledger` (inflow txns within range, gated on having ≥1 account selected).

The dataset is a trailing-12-month window keyed by month: dates bucket to their month and the
selected accounts' shares sum to the period multiplier, so every tile recomputes live; empty
filters (no inflow) fall back to per-tile empty states. (A single-month range feeds the pacing
`Area` one point — it centres a lone point rather than dividing by zero.)

### 8.15 Category pacing rail (`ExpensePacingCard.tsx`, `lib/pacing.ts`)
A full-width scrollable list of **bullet rails** — one per expense category, click to focus it (which
also expands its sub-categories). It answers *"which category needs attention?"*, which is
deliberately **not** "what did I spend?" (that's the flow card's job). It's a *source* of the shared
focus and never filters itself — see §8.16.

The accordion has no state of its own: it opens iff exactly one category is selected
(`open = selection.categories.length === 1 ? selection.categories[0] : null`), so the chevron *means*
"this is your focus" and a multi-select expands nothing — the honest answer to "which one would you
open?".

**The header names the window it actually measures** (`Jul 2026 · to date`). The card snaps to whole
calendar months while the rest of the page uses the literal range, so on a Week or mid-month custom
range it is genuinely measuring something wider. Saying so beats disagreeing silently — the
alternative was a tile that shows all of July while the hero reads $0.

Each row, left → right: name · `spent of baseline` · rail · delta chip. The rail's marks:

| Mark | Meaning |
| --- | --- |
| Bar | Spend so far this period. Colour = **state only** (§2): `ok → accent`, `pacing over → warn`, `over last period → neg`, `dormant → muted` — the same encoding `CapacityMeter` uses (§8.3). |
| Pale band (`--hair`) | The **±1σ normal range** over the trailing 6 periods. Its *width is the volatility* — a wide band is an unpredictable category. |
| Caret | The **projected finish**. Inside the band = an ordinary period; outside = worth opening. |
| Rule (`ink`, 2px) | The **baseline** — the last completed period. |
| Dashed tick | Where you'd be pacing the baseline exactly. Hidden once the period closes. |
| `›` chevron | The mark ran **off-scale**; the chip carries the true figure. |

**The baseline is pinned to a constant x (66%)** on every row, so the rule reads as one vertical
line you scan down and bars past it are over. That's what makes the list scannable — and it's a
real trade: it caps the track at ~1.5× baseline, so erratic rows clamp and defer to the chip.

**The caret, not the bar, is what the band judges.** The band is built from *completed* periods
while the bar is a *partial* one, so comparing them directly is apples-to-oranges and would read
"under" on every row mid-period. The caret is the only mark commensurate with the band.

**Grain is the calendar month, not the raw range** (`buildPacing` snaps the range out to whole
months via `dateToIdx`). Rent, internet and auto-invest recur once a month; sub-month windows chop
one fixed cost into an alternating spend/no-spend series and report the app's *most* predictable
rows as its most erratic. History is up to 6 trailing blocks of the same month-count.

**Lumpy costs break naive pacing**, so `landingFor` projects **steady rows (σ/μ < 12%) to their
baseline** rather than straight-lining them — otherwise rent, landing whole on day 1, screams "2×
overspend" every period. Categories roll `landing` up **from their children** rather than
recomputing it on the aggregate: a category blends fixed and discretionary costs, so its blended
volatility is nobody's real behaviour.

Degradations, in order: **< 3 populated periods** → band suppressed, rail only; **no prior block at
all** (e.g. a 12-month range in a 12-month ledger) → no baseline to compare, so rows go neutral,
chips read `—`, and the rail falls back to a plain magnitude bar rather than inventing a comparison.

### 8.16 Cross-filtering the Expenses analyzer (`lib/expenseSelection.ts`, `ExpenseScopeBar.tsx`)
One shared category focus and one shared time-series focus drive the analytics view. They replace independent static selections so the entire page behaves as a unified, interactive dashboard.

**The rules of cross-filtering:**
1. **Comparison/structural tiles highlight; magnitude/detail tiles filter.**
   - **Category focus:** Clicking a category in `ExpenseFlowCard` or `ExpensePacingCard` highlights that category in those comparison tiles (dimming the rest) and filters the hero row, trend card, and transactions ledger.
   - **Time focus:** Clicking a data point (line point or bar) on `ExpenseTrendCard` highlights that point in the chart (drawing selection markers / dimming other bars) and filters the hero row, category flow card, category pacing card, and transactions ledger to that specific day, week, or month.
2. **The source tile never self-filters.** Clicking a week on the trend chart dims other weeks but doesn't remove them from the chart. This preserves context and allows clearing or changing selection.

| Interaction Source | Highlight Target (Dims Rest) | Filter Target (Computes Subset) |
| --- | --- | --- |
| **Category Selection** (`ExpenseFlowCard` / `ExpensePacingCard`) | `ExpenseFlowCard`, `ExpensePacingCard` | hero row, `ExpenseTrendCard`, `TransactionsPanel` |
| **Time Series Selection** (`ExpenseTrendCard`) | `ExpenseTrendCard` | hero row, `ExpenseFlowCard`, `ExpensePacingCard`, `TransactionsPanel` |

Dimming defaults to `opacity: 0.42` (flow nodes), `opacity-40` (pacing rows), and `opacity: 0.25` (non-selected chart bars) when a focus is active. Plain click toggles selection (replace-or-clear).

**Load-bearing details:**
- **Dynamic Prior Periods:** When `timeFocus` is active, the "vs prev" indicators dynamically recalculate their comparison window to match the exact duration of the focused time interval.
- **Scope Bar Union:** `ExpenseScopeBar` displays removable chips for both category and time focus. A clear button clears both, and the copy updates to state exactly which tiles follow the active focus.
- **Date Reset:** Any active `timeFocus` is automatically cleared if the page-wide date range or preset filters change, preventing stale selections.
- **Hero Card Swap:** Under focus, the third metric card swaps from "Heavyweight category" to "Share of outflow" so it remains meaningful.
- **No global `Esc`.** `FiltersPopover` and the header pickers already listen on `document`; an Esc handler here would nuke the focus while you were only dismissing a popover.
- `'Other'` (synthesized for txns with no `subcat`) is **not** in `CATEGORY_TAXONOMY` — clicking it would be pruned on the way in and match zero rows on the way out. Both cards guard it.

### 8.17 Recurring hub (`RecurringHub.tsx`, `RecurringDirectory.tsx`, `BillingCalendar.tsx`, `lib/recurring.ts`)
The Expenses view's second tab. Answers **"what am I committed to?"**, where the analyzer answers
"what did I spend?". Read-only detection over `data.transactions` — nothing in the ledger says a
charge is recurring, so it's inferred, exactly as it would be from a real bank feed.

**Anchored to today; no period filter.** Every question here is present-tense (what do I owe monthly,
what charges next, how much of my outflow is locked) and none sharpen under a date range — an
annualized run-rate actively fights one. `AnalyzerFilters` stays `view === 'analytics'`-only, and the
hub is outside the §8.16 cross-filter system entirely.

**Three windows are in play, and each is named where it's used** — the §8.15 "name the window you
actually measure" principle, which matters more here because there are three of them:

| Window | Span | Drives |
| --- | --- | --- |
| Detection | trailing 12 months | the directory; stated in the header strip |
| Pressure | trailing 30 days (`[today−29, today]`) | hero card 3; stated in its sub-line |
| Horizon | next 30 days (`[today, today+29]`) | the calendar; stated in its tile `tag` |

Pressure is **trailing**, not forward: the SRD says "against total 30-day *expenditures*", and a
forward denominator would need a forecast of *discretionary* spend — that's the Phase 2 insights
engine, so a forward window isn't a different choice, it's uncomputable.

**Detection** (`buildRecurring`, day-gap analysis). `pacing.ts`'s `bucket()` is unusable here: it
keys cat → subcat and buckets by whole calendar month, and month grain can't tell Quarterly from
irregular (a quarterly charge is "present in 4 of 12 months" — identical to four one-offs) nor
express a *day*, which is the directory's whole row metadata and the calendar's only input. Grouping
is `merchant + cat + subcat` — the **full** merchant, since ` // ` is a display convention and
splitting it would merge `Habitat // Rent Transfer` with a hypothetical `Habitat // Storage`.

Gates, in order — a series must clear all four:

| Gate | Value | Why |
| --- | --- | --- |
| `MIN_OBSERVATIONS` | 3 | 3 charges = 2 gaps = the fewest at which gaps can *agree*. One gap is a coincidence. Mirrors `MIN_BAND_PERIODS`. |
| cadence window | `CADENCE_DAYS ± CADENCE_TOLERANCE` | median gap must land in a window. The windows are **provably non-overlapping**; the dead zones between them (9→11, 17→24, 37→79, 103→335 days) are correct rejections. |
| `MIN_CONFORMANCE` | 0.6 | the median landing in a window isn't enough — the gaps must mostly sit there. Tolerates a skipped charge (gaps `[30,61,30,30]` → 0.75). Deliberately **not** `cv(gaps)`: that same obviously-monthly series scores 0.355 and would be thrown out. |
| amount stability | `cv(amounts) < ERRATIC_CV` | **a commitment is predictable in amount as well as date.** Without this, a hardware store visited most months reads as a monthly commitment: real cadence, but $45 then $210 is shopping, not a standing charge. |

That last gate is the one that isn't obvious, and it is load-bearing — it is the only thing
separating "I shop here regularly" from "I am billed here regularly".

**`STEADY_CV = 0.12` is shared with §8.15 via `lib/stats.ts` — one definition of "fixed cost", not
two.** Under it a series is `fixed`, over it `variable`. Rent reads cv 1.2%, power 14.9%, water 17.5%.

**`expected` is asymmetric on purpose:** `fixed` → the **last** amount, because that's the current
price (rent's 12-month mean is $2,070.83 but you owe $2,100 — averaging would erase the price creep);
`variable` → the **mean**, because the last amount is one draw from a distribution (July's power bill
doesn't forecast August's) and the mean averages the seasonality out, which is what a run-rate wants.

**Dormancy** is derived from `lastCharged` (silent > `DORMANT_CYCLES × CADENCE_DAYS`, 1.5 cycles),
not from `nextExpected` — one derivation, not two that can drift. A dormant series' `nextExpected` is
therefore in the past, and it is excluded from the calendar (projecting it is fiction), from
`monthlyCommitment`, and from the pressure numerator.

**`nextChargeDate` advances by whole calendar months**, never by `CADENCE_DAYS`: rent charged on the
1st is charged on the *1st*, whereas 1 Jul + 30.44d lands on the 31st. Day-of-month is clamped to the
target month's length or `Date` rolls 31 Jan + 1 month into early March.

**Hero row** (the §8.14 idiom, 4 × `HeroMetric`). Monthly commitment · Annualized cash burn · Fixed
outflow pressure · Active commitments. Two notes:
- Card 2 is card 1 × 12, which is weak information design but SRD-mandated — so its **sub-line earns
  the slot** by carrying what the multiplication throws away: the gap against what actually left the
  account over the same 12 months. It's a live readout of the rent's price creep.
- Pressure **sums actual rows in the window, never `monthly`**. A 30-day window isn't a calendar
  month, so a monthly series can land 0, 1 or 2 times in it depending on its day. Naming both terms
  in the sub-line (`$3,639 of $5,762`) is what makes a bare percentage auditable.

**Directory.** Sectional by category; sub-totals and the footer total reconcile with hero card 1 **by
construction** — both read `monthly` off the same model, because `buildRecurring` does the sectioning
(mirroring `buildPacing`'s `cats[].subs[]`) and the component stays presentational. Sections are
always open: the SRD asks for a sectional *table*, not a drill-down, and §8.16's accordion is
load-bearing there only because the expansion **is** the focus — there's no focus here.
Colour is **state only**: `active → accent`, `dormant → muted` (row at `opacity-40`).
**Fixed-vs-variable is not a state and never a hue** — a colour meaning "variable" would compete with
a colour meaning "dormant", and only one of those is worth an alarm. It's a monochrome `ink2` glyph:
solid bar = fixed, broken bar = variable, with σ/μ in the `title`.

**Billing calendar.** Forward 30 days, 7 columns, **Monday-first** (`(getDay()+6)%7` — the domain is
AU; the SRD carries AU financial years and Osko). Forward rather than backward because the directory
already gives `next expected` per row and this is that data spatially; a backward calendar would just
duplicate §8.8's daily bars.

*The heat encoding, and why it doesn't break the state-only rule:* §8.15 bans **category hues**, and
§2's deeper rule is that a tile means either identity or state, never both. This encodes
**magnitude** — no category identity, no state judgement, one hue, zero `--cat-*`. §2 reserves the
accent for "the card edge, **chart series**, and status dots"; a heat matrix is a chart series.

*The implementation matters as much as the argument:* the fill is
`background: var(--color-accent)` with a computed **`opacity`**, never a baked
`rgba(17,181,150,α)`. A hardcode would break the live-retintable accent (Settings rewrites
`--color-accent`) **and** dark mode (accent is `#16c7a4` there). It also sidesteps the §11
Tailwind-v4/oklab gotcha entirely, because opacity is a plain number Framer interpolates — **no
colour is ever animated.** This trick generalises; reach for it before reaching for `rgba`.

Alpha is **gamma-compressed** (`0.12 + 0.5 × (v/max)^0.6`): rent ($2,100) is 131× streaming ($15.99),
so a linear ramp renders every non-rent day invisibly faint. The low end still clusters, and that's
the right trade — **the calendar's job is *when*; the directory's job is *how much*.**

**anime.js is out of scope here, deliberately.** The §11 firewall's remit is *chart internals* — SVG
draw-on, dashoffset, fill sweeps, counters. The calendar is a CSS-grid DOM matrix: no path to draw,
no timeline to orchestrate, and `useChartReveal`'s scoped SVG `querySelectorAll` is inapplicable.
Every cell also lives inside a `Tile` whose `cell` variant Framer already animates, so routing cell
opacity through anime would put both libraries on one subtree — the precise thing §11 forbids.

**Gotcha (cost an hour):** a `motion` component whose `initial` names a variant its `variants` map
doesn't define resolves to `undefined` and **silently aborts the animation batch for the whole
variant tree** — every `Tile` in the `Grid` stays at `opacity: 0`, with no console error. Always pair
`hidden: {}` with `show`, as `gridStagger` does.

**Known carve-outs** (not oversights):
- **No "source account link"**, though SRD §6.D asks for it. Transactions carry no account — the
  codebase says so in three places and gates all-or-nothing *because* of it. Hashing merchant →
  account would be inventing data, and worse here than elsewhere, because the analyzer's account
  filter would contradict the column on the same page. Unblocks when the data model gains `accountId`.
- **Annual cadence can't fire** from a 12-month ledger: one observation, zero gaps. An
  information-theoretic limit, not a bug. It stays in the tables; it needs ~2 years of history.
  Quarterly is the longest honestly-detectable cadence today.
- **Weekly/Biweekly ship unexercised.** The realistic candidates fail on principle: a weekly grocery
  shop is regular but isn't an *obligation*. The cadence remains supported but requires an honest
  recurring-obligation fixture before it can be presented as exercised.
- **Smart Insights Bulletins** (SRD §6.D) are Phase 2 — they need the AI insights engine.

---

## 9. Landing & the hero card

The **Landing (00)** is a cinematic post-login hook, its own page
([`views/Landing.tsx`](app/src/views/Landing.tsx)):

- Eyebrow ("Session secured · Private Wealth"), an Archivo welcome headline, a portfolio line,
  an animated **net-worth count-up** (`useCountUp`), and an "Enter dashboard — or scroll" cue.
- **Cursor-parallax depth:** the copy and the card drift on opposing layers as the pointer moves.
- **Wheel-to-advance:** scrolling down (`deltaY > 18`) triggers the morph to the Dashboard.

**The hero card is a DOM card, not a 3D mesh** ([`HeroCard.tsx`](app/src/components/HeroCard.tsx)):

- A frosted/gradient card with **pointer-parallax 3D tilt** (`rotateX/rotateY` spring motion
  values + `perspective`) and a gentle **idle float**.
- It is the **shared element** for the signature transition: the *same* `layoutId="hero"` is used
  by the landing card and the dashboard **net-worth tile**, so Framer Motion physically **morphs**
  one into the other on navigation. This is the single most important interaction in the system.

> **Why a DOM card, not Three.js?** (1) Only a DOM element can drive the `layoutId` morph into
> the net-worth tile. (2) The literal Three.js card from the vanilla prototype (`card3d.js`) read
> as "too 3D / fake." The tilt card keeps the tactile premium feel *and* the morph. Porting the
> Three.js card remains an option, not a requirement.

**Hero figure** is the headline number (net worth) — the equivalent of a product's price.

---

## 10. The ambient scene

A full-viewport background ([`three/SceneBackground.tsx`](app/src/three/SceneBackground.tsx)) —
despite the folder name, it is a **pure 2D `<canvas>`**, no WebGL/Three.js. It combines:

- **A Halo Reach–style diamond lattice** (architecture): two diagonal line sets at ±45° on a
  `GAP`-sized grid, with a faint travelling shimmer.
- **A slow, sparse drifting node network** (life): nodes drift, link to nearby neighbours, and
  brighten mint near the cursor.
- **An occasional mint pulse** that sweeps the diamonds every ~9–16s.
- **Mouse + per-view parallax** (each view nudges the field via `VIEW_SHIFT`).
- A CSS **`.scene-wash`** colour field behind the canvas (mint / azure / gold radial gradients),
  with a brighter `.dark` variant for the luminous theme.

It is theme-aware (a `dark` prop swaps line/node colours and opacities) and respects the motion
toggle + `prefers-reduced-motion`. **Tuning guide for designers** (all in `SceneBackground.tsx`):

| Knob | Line | Effect |
|---|---|---|
| Node count | `const count = Math.max(25, Math.min(60, …/46000))` | density divisor — **lower = more nodes** |
| Diamond size | `const GAP = 56` | smaller = denser lattice |
| Drift speed | `(Math.random() - 0.5) * 0.075` (`vx`/`vy`) | lower = slower |
| Node radius | `ctx.arc(n.x, n.y, 1.5, …)` | dot size |
| Line weight | `ctx.lineWidth = …` (lattice / pulse / links) | per-set thickness |
| Link distance | `const linkD = 130` | how close nodes must be to draw a line |

> **Note:** `three` is still listed in `package.json` but is **unused** (the scene is 2D canvas).
> It can be removed.

---

## 11. Motion & Animation

Two animation libraries with a strict ownership boundary (the vanilla prototype used GSAP):

- **Framer Motion** owns layout, view routing, the `layoutId` hero morph, the tile blur-focus
  entrance, scramble + count-ups. Source: `components/motion.ts`, `hooks/useScramble.ts`,
  `hooks/useCountUp.ts`, per-component transitions.
- **anime.js** owns **chart internals only** — SVG stroke draw-on, dashoffset, fill sweeps,
  counters — orchestrated as timelines (which Framer Motion is awkward at). It is wired through a
  single firewall hook, `hooks/useChartReveal.ts`, that **scopes** every timeline to the chart's
  own root (no global selectors → no cross-chart bleed), skips animation and renders the resting
  state when motion/reduced-motion is off, and **tears every instance down on unmount**.

**The boundary rule: one property, one owner.** No element is animated by both libraries — anime
only touches geometry/counters *inside* the chart SVG; Framer Motion brings the *tile* in. This is
why the charts could move off Framer Motion's `motion.path`/`motion.circle` without disturbing the
morph or the blur-focus entrance.

| Moment | Behaviour | Timing |
|---|---|---|
| Boot | percentage 0→100, mint bar fill, status scrambles through init steps | ~2.0s |
| Letterbox reveal | top/bottom bars spring in from off-screen | spring |
| View enter | viewport fade/translate | ~0.35s |
| **Card → tile morph** | shared-element `layoutId="hero"` spring | spring (210 / 28) |
| View tiles | staggered **blur-focus** build (sharpen from `blur(10px)` + rise) | 0.7s, stagger ~0.055 |
| Landing entrance | choreographed reveal: eyebrow → title → line → figure → cue → card | timeline |
| Nav label | character scramble | per-frame |
| Counters (landing) | ease-out count-up (Framer) | ~1.4s |
| **Cash-flow area** (anime) | line draws on (scale-proof `pathLength=1`), fill fades up, end dot elastic-pops | ~1.3s |
| **Bar chart** (anime) | bars sweep up from baseline with staggered delay | ~900ms |
| **Allocation donut** (anime) | segments draw with `easeOutBack` overshoot, **each legend row lands as its segment completes**, centre value counts up | ~230ms/segment |
| **Objective rings** (anime) | `easeOutElastic` dashoffset draw + synced % counter, staggered | 1.2–1.4s |
| **Capacity meters** (anime) | cascade width fill + highlight that races ahead; threshold colour | ~1.0s |
| Scene | drift, pulse, parallax | continuous |

- **House easing:** `cubic-bezier(0.22, 1, 0.36, 1)` (`--ease-halcyon`) for CSS/SVG tweens;
  springs for layout/morph.
- **Gotcha — animated colours must be `rgba`/hex, not Tailwind utilities.** Tailwind v4 emits
  `oklab()`, which Framer Motion cannot interpolate (it warns and skips). Any colour inside a
  Framer `animate`/variant uses explicit `rgba()`/hex.
- **Boot robustness:** the boot launch is idempotent with a `setTimeout` safety net — rAF-based
  tickers pause on backgrounded tabs, so the timed sequence is never the only path forward.
- **No `StrictMode`** ([`main.tsx`](app/src/main.tsx)) — it double-invokes effects, and the
  imperative scene must initialise once.

---

## 12. Iconography

Unified geometric **line SVGs** (≈18–20px, ~1.7 stroke), monochrome, inheriting text colour.
The `H` monogram is the brand mark. No emoji, no filled/novelty icons.

---

## 13. Accessibility

- **Contrast:** muted, faint, accent-ink and semantic text tokens all clear 4.5:1 against their
  theme surface; a unit guard reads the shipping CSS and enforces this. Light muted is 4.87:1
  (formerly 2.89:1). Body text never relies on raw `accent` for contrast.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` collapses durations; the canvas
  also listens to the OS preference directly, while the in-app motion toggle remains an additional
  gate. Dense Ingestion/Transfers workflows reduce the wash/canvas to 38%/25% opacity and use a
  more opaque `workflow-surface` so decoration cannot compete with tables or decisions.
- **Targets and focus:** workflow controls, table checkbox hit areas and buttons meet a 44px
  minimum. All interactive elements receive a 2px `accent-ink` focus-visible outline with offset.
- **Semantics:** nav items use `aria-current="page"`; switches are real buttons with
  `aria-checked`; the toast mount is an `aria-live` region. Workflow tables have captions, filter
  toggles use `aria-pressed`, disclosures publish `aria-expanded`, and async/error copy uses
  status/alert regions.
- **Responsive:** below `md` the rail collapses to a 52px icon gutter (labels hidden) and the
  hero card hides on the landing; grids reflow to fewer columns.

---

## 14. Voice & Tone

Premium, precise, lightly technical — never militarised or gamer-coded. Keep the restrained
console flavour (index numbers, a boot sequence, a scramble) but use plain, confident finance
language. Examples: "Welcome back," · "Total net worth" · "On track / Watch / Over" ·
"Milestone reached." Avoid jargon cosplay, exclamation, and hype.

---

## 15. Code Architecture (the shipping app)

Stack: **Vite 6 · React 18 (no StrictMode) · TypeScript · Tailwind v4 (CSS-first `@theme`) ·
Framer Motion 11 · anime.js 3 (chart motion only)**. Fonts: Archivo + Hanken Grotesk (Google
Fonts). Dev server on `:5300`.

```
app/
  index.html            Google Fonts + #root mount
  package.json          deps + dev/build/preview scripts
  vite.config.ts        react + @tailwindcss/vite, port 5300
  src/
    main.tsx            createRoot — no StrictMode (single scene init)
    App.tsx             boot gate · view state · dark state · toast · AnimatePresence
    router.tsx          View type · NAV order · ViewContext / useView
    data.ts             typed mock dataset + formatters (fmt)
    index.css           ★ tokens: @theme (light) + :root vars + .dark + .glass/.micro/.scene-wash
    components/
      Shell  Boot  Tile  Stat  CapacityMeter  Ledger  AccountRow
      AllocationDonut  ObjectiveRing  HeroCard  MilestoneToast  ThemeToggle
      Controls (Button/Chip/Select/DateInput/MultiSelect/DateRangePicker/Switch)
      SegmentedTabs  Screen (Screen/ViewHeader/Grid)  motion.ts
      HeroMetric  AnalyzerFilters  TransactionsPanel  ExpenseScopeBar
      ExpenseTrendCard  ExpenseFlowCard  ExpensePacingCard
      RecurringHub  RecurringDirectory  BillingCalendar        (§8.17)
      charts/ Area  Bar  Donut
    views/              Landing Dashboard Accounts Income Expenses Ingestion Settings
    three/              SceneBackground.tsx   (2D canvas lattice + network; misnamed, not WebGL)
    hooks/              useScramble  useCountUp  useChartReveal (anime.js firewall)
                        usePeriodRange  useScrollIdle
    lib/                period.ts     range presets · month bucketing · txnIso · date labels
                        stats.ts      ★ mean/stdev/cv/median + STEADY_CV — the ONE definition
                                        of "fixed cost", shared by §8.15 and §8.17
                        cadence.ts    Cadence vocabulary + lookup tables. Imports NOTHING:
                                        data.ts needs `Cadence` and period.ts imports data,
                                        so any import here closes a cycle.
                        pacing.ts     category volatility + pacing model (§8.15)
                        recurring.ts  recurrence detection + billing projection (§8.17)
                        expenseSelection.ts  the Expenses cross-filter (§8.16)
```

`ViewContext` exposes `{ view, go, toast, motionOn, setMotionOn, dark, setDark }`. The `dark`
setter toggles `.dark` on `<html>`. **`index.css` is the design-system source of truth** — change
a token there and it propagates everywhere, in both themes.

---

## 16. Lineage

1. **Halcyon HUD** — dark, neon, console-HUD (see `HalcyonHUD_DesignSystem.md`).
2. De-militarised the lore; calmer type, a single-bar meter.
3. Pivoted to **light editorial**, product-showcase inspired (vanilla HTML/CSS/JS prototype at
   the repo root — Three.js scene + 3D card, GSAP).
4. **Re-platformed to React** (this document): Vite + React + TS + Tailwind v4 + Framer Motion;
   2D-canvas diamond-lattice scene; DOM tilt card with a shared-element morph; **dark mode**. The
   vanilla root files remain as historical reference only.
