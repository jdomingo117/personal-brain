# Strata — Design System v1.0

> A premium console-inspired design system for personal finance.
> Pairs with the Quartz spec (Nothing OS × Liquid Glass). Where Quartz refines
> the mobile OS metaphor, Strata refines the home console metaphor — fixed
> viewport, layered materials, spatial choreography, confident geometry —
> stripped of every gamer-y cliché and re-engineered to feel wealthy, quiet,
> and inevitable.

---

## 0. North Star

### 0.1 The thesis

The best console UIs (Xbox 360 Blades, PS5 Activities, Apple TV) share three
qualities most web apps lack:

1. **Fixed spatial logic.** You always know where you are. Content moves; the
   stage does not.
2. **Material confidence.** Layers, depth, and tactile surfaces — not flat
   cards floating on a flat background.
3. **Inevitable motion.** Every transition feels physically motivated, not
   decorative.

The mistake most "console-style web apps" make is borrowing the *aesthetic*
(neon green, sharp angles, gamer typography) without the *grammar*. Strata
borrows the grammar and discards the aesthetic. The result is a finance app
that feels like a premium piece of hardware — Bang & Olufsen, not Razer.

### 0.2 The five principles (named, in priority order)

| # | Principle      | Meaning                                                                                          |
|---|----------------|--------------------------------------------------------------------------------------------------|
| 1 | **Truth**      | Numbers are the hero. Typography, spacing, and color exist to make money legible and trustworthy. |
| 2 | **Quiet**      | One bold gesture per panel. Restraint is the wealth signal. Negative space is the most expensive material. |
| 3 | **Layered**    | Every surface declares its depth via material (Mica, Acrylic, Reveal). No floating cards. |
| 4 | **Inevitable** | Motion is choreographed and reduced-motion-safe. Every transition has a physical reason. |
| 5 | **Confident**  | Geometry is decisive. Tiles are tiles. Edges are clean. No timid borders, no decorative gradients. |

These are non-negotiable. Every token, component, and animation in this
document derives from them. When in doubt — pick Truth first, Quiet second.

### 0.3 What we explicitly reject

- Xbox green (`#107C10`) as a primary brand color. It carries gamer baggage. We
  keep the *spirit* (a positive-delta signal) and demote it to a single,
  desaturated semantic role.
- Glassmorphism as decoration. Translucency is a material with rules, not a
  Pinterest aesthetic. If it doesn't earn its blur cost, it's solid.
- Generic dashboard tropes: rainbow KPI cards, "AI sparkles," circular ring
  progress charts, emoji in numbers, animated gradients on hero text.
- Smooth-scroll libraries (Lenis, Locomotive). Native CSS scroll-snap is
  faster, cheaper, and matches platform inertia. We use anime.js v4 only for
  what it's best at (see §6).
- `100vh`. Always `100dvh` or `100svh`. iOS Safari toolbar collapse will break
  any fixed-viewport design that uses `vh`.

---

## 1. Foundations

### 1.1 Color system (OKLCH-first)

All colors are declared in OKLCH for perceptually uniform lightness and stable
hue interpolation. sRGB fallbacks are emitted via `@supports` for legacy
browsers (Safari < 15.4, Chromium < 111). Every token is a CSS custom property
under the `--st-` namespace.

#### 1.1.1 Canvas & surfaces (the layered greys)

Strata is dark-mode-first. Light mode is a planned v1.1 deliverable, not v1.0.
Building two themes from day one dilutes both; ship the canonical experience
first.

```css
:root {
  /* The void. The deepest layer. Never a literal #000 — pure black flattens
     depth perception and reads as "off." Slight blue undertone for cool
     wealth. */
  --st-canvas:           oklch(15% 0.012 250);  /* ~#0B0E12 */
  --st-canvas-deep:      oklch(11% 0.010 250);  /* ~#070A0E — letterbox / underscroll */

  /* Mica tiers (opaque, tinted). These are the primary panel surfaces. */
  --st-surface-1:        oklch(19% 0.012 250);  /* ~#13171C — base panel */
  --st-surface-2:        oklch(23% 0.013 250);  /* ~#1A1F26 — raised panel */
  --st-surface-3:        oklch(28% 0.014 250);  /* ~#222831 — inset / well */
  --st-surface-4:        oklch(33% 0.014 248);  /* ~#2B323C — active / focused */
  --st-surface-5:        oklch(40% 0.014 246);  /* ~#363E49 — hover lift */

  /* Inks (text and iconography). Four tiers, never more. */
  --st-ink-1:            oklch(98% 0.005 240);  /* primary text, headlines, KPIs */
  --st-ink-2:            oklch(82% 0.008 240);  /* body text, labels */
  --st-ink-3:            oklch(62% 0.010 240);  /* secondary labels, captions */
  --st-ink-4:            oklch(45% 0.012 240);  /* disabled, decorative dividers */

  /* Edges (borders, dividers). Three tiers. */
  --st-edge-1:           oklch(100% 0 0 / 0.06);  /* hairline — barely there */
  --st-edge-2:           oklch(100% 0 0 / 0.10);  /* standard divider */
  --st-edge-3:           oklch(100% 0 0 / 0.16);  /* emphasized edge / focus */
}
```

**sRGB fallback pattern** (emitted by your build, not hand-written):

```css
:root {
  --st-canvas: #0B0E12;
}
@supports (color: oklch(0% 0 0)) {
  :root {
    --st-canvas: oklch(15% 0.012 250);
  }
}
```

#### 1.1.2 Accents (the wealth palette)

Three accents. No more. Each has a specific role and a strict usage budget.

```css
:root {
  /* PRIMARY — Emerald. Refined, deep, slightly cool. Reads "money" without
     reading "Xbox" or "Robinhood." Used for primary CTAs, active state,
     positive deltas. Budget: ~3% of any panel by area. */
  --st-accent-emerald:        oklch(68% 0.16 162);   /* ~#1FB87A */
  --st-accent-emerald-hover:  oklch(74% 0.17 162);
  --st-accent-emerald-press:  oklch(62% 0.15 162);
  --st-accent-emerald-mute:   oklch(68% 0.16 162 / 0.16);  /* tints, halos */
  --st-accent-emerald-ink:    oklch(12% 0.04 162);    /* text on emerald */

  /* SECONDARY — Champagne. The wealth signal. Used sparingly for premium
     accents: account tier badges, milestone celebrations, the "vault" panel.
     Budget: ~1% of any panel by area. Never on body text. */
  --st-accent-champagne:        oklch(82% 0.09 85);   /* ~#D6B871 */
  --st-accent-champagne-hover:  oklch(86% 0.10 85);
  --st-accent-champagne-press:  oklch(76% 0.09 85);
  --st-accent-champagne-mute:   oklch(82% 0.09 85 / 0.14);
  --st-accent-champagne-ink:    oklch(18% 0.04 85);

  /* TERTIARY — Cyan. Informational, neutral. Used for tags, info badges,
     selection highlights on charts, links. Budget: ~2% of any panel by area. */
  --st-accent-cyan:        oklch(74% 0.12 215);   /* ~#5AB8D9 */
  --st-accent-cyan-hover:  oklch(80% 0.13 215);
  --st-accent-cyan-press:  oklch(68% 0.11 215);
  --st-accent-cyan-mute:   oklch(74% 0.12 215 / 0.16);
  --st-accent-cyan-ink:    oklch(14% 0.04 215);
}
```

#### 1.1.3 Semantics (only where they earn it)

```css
:root {
  /* Positive — same emerald, semantically aliased. Up-deltas, gains, success. */
  --st-pos:        var(--st-accent-emerald);
  --st-pos-mute:   var(--st-accent-emerald-mute);

  /* Negative — oxblood, not fire-engine. Wealthy palettes never use saturated
     reds; they use deep, controlled ones. Down-deltas, losses, destructive
     actions. */
  --st-neg:        oklch(58% 0.18 22);    /* ~#C03A3A */
  --st-neg-hover:  oklch(64% 0.19 22);
  --st-neg-mute:   oklch(58% 0.18 22 / 0.16);
  --st-neg-ink:    oklch(98% 0.01 22);

  /* Warning — honey amber. Approaching budget, pending review. */
  --st-warn:       oklch(76% 0.14 70);    /* ~#D6A04A */
  --st-warn-mute:  oklch(76% 0.14 70 / 0.16);
  --st-warn-ink:   oklch(16% 0.04 70);

  /* Info — alias of cyan. Tooltips, neutral notifications. */
  --st-info:       var(--st-accent-cyan);
  --st-info-mute:  var(--st-accent-cyan-mute);
}
```

#### 1.1.4 Data viz palette

Categorical scale for portfolio breakdowns, expense categories, etc. Six hues,
perceptually balanced in OKLCH chroma so no single category visually dominates.
Order matters: assign by frequency, not alphabetically.

```css
:root {
  --st-viz-1:  oklch(70% 0.14 162);  /* emerald — primary holding */
  --st-viz-2:  oklch(72% 0.12 215);  /* cyan — secondary */
  --st-viz-3:  oklch(78% 0.10 85);   /* champagne */
  --st-viz-4:  oklch(66% 0.14 305);  /* mauve */
  --st-viz-5:  oklch(70% 0.13 35);   /* coral */
  --st-viz-6:  oklch(74% 0.10 130);  /* sage — neutral filler */
}
```

For sequential scales (heatmaps, time-series intensity), use a single hue and
vary lightness in OKLCH steps of 8%. For diverging scales (over/under budget),
use emerald → neutral → oxblood with neutral at oklch(45% 0.005 240).

### 1.2 Typography

Three families. No exceptions. Adding a fourth dilutes the voice.

| Role          | Family                | Why                                                                                |
|---------------|------------------------|------------------------------------------------------------------------------------|
| Display / UI  | **Inter Tight**        | Modern, tight, variable. Reads premium at large sizes; reads precise at small.    |
| Body          | **Inter**              | Workhorse. Same family as Display = visual cohesion, distinct optical role.       |
| Numerics      | **Geist Mono**         | Best free monospace for tabular figures. Slashed zero. Beautiful at small sizes.  |

**Why not a serif?** Serifs are a finance cliché (every robo-advisor in 2023
used IBM Plex Serif for "trust"). We get gravitas from spacing and weight, not
from a typeface. If you ever need a single editorial moment (a milestone
celebration, an annual summary cover), reach for **Instrument Serif** as a
*one-off accent only*. Never in the system.

**Font loading.** Self-host all three (variable WOFF2). Use `font-display: swap`
with a critical subset (Latin, basic punctuation, currency symbols, the digits
`0-9` with their tabular variants pre-cached). Total font weight budget:
≤ 80KB after Brotli compression. No external font CDNs — adds DNS lookup and
TLS handshake to LCP.

```css
@font-face {
  font-family: "Inter Tight";
  src: url("/fonts/inter-tight-var.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
  /* Subset to currency + digits + Latin */
  unicode-range: U+0020-007F, U+00A3, U+00A5, U+20AC, U+20BF, U+2212;
}
```

#### 1.2.1 Type scale

A modular scale at ratio 1.250 (major third) from 12px → 64px, with three
special display sizes above for hero numerics. All sizes use `rem` for user
font-size respect.

```css
:root {
  /* Display — hero numerics only. Tabular figures always. */
  --st-fs-display-xl:  4.500rem;   /* 72px — single number hero (net worth) */
  --st-fs-display-lg:  3.250rem;   /* 52px — panel hero KPI */
  --st-fs-display-md:  2.500rem;   /* 40px — secondary KPI */

  /* Headings */
  --st-fs-h1:          1.875rem;   /* 30px */
  --st-fs-h2:          1.500rem;   /* 24px */
  --st-fs-h3:          1.250rem;   /* 20px */
  --st-fs-h4:          1.000rem;   /* 16px — uppercased label */

  /* Body */
  --st-fs-body-lg:     1.125rem;   /* 18px */
  --st-fs-body:        1.000rem;   /* 16px */
  --st-fs-body-sm:     0.875rem;   /* 14px */
  --st-fs-caption:     0.750rem;   /* 12px */
  --st-fs-micro:       0.6875rem;  /* 11px — eyebrows, metadata */

  /* Line heights — tight at display, loose at body */
  --st-lh-display:     0.95;
  --st-lh-heading:     1.15;
  --st-lh-body:        1.55;
  --st-lh-tight:       1.25;

  /* Tracking — display tightens, micro loosens */
  --st-tracking-display: -0.022em;
  --st-tracking-heading: -0.012em;
  --st-tracking-body:     0;
  --st-tracking-micro:    0.06em;   /* eyebrows, uppercased labels */
}
```

#### 1.2.2 Numerical typography (the most important spec in this document)

In a finance app, numbers are the product. Every number on screen MUST:

```css
.st-numeric {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums slashed-zero;
  font-feature-settings: "tnum" 1, "zero" 1, "ss01" 1;
  letter-spacing: -0.01em;     /* mono fonts are wide; tighten subtly */
}
```

- **Tabular figures** so digits don't shift width across rows (`$1,234.56`
  aligns with `$9,876.43`).
- **Slashed zero** to disambiguate from O at small sizes (critical at
  `--st-fs-caption` and below).
- **Currency symbols** use the same monospace family — never mix proportional
  `$` with mono digits.

**Sign convention.** Use a true minus glyph (`U+2212` "−"), not a hyphen.
Positive deltas get a true plus (`+`); negative gets `−`. Never use parentheses
for negatives in a consumer-facing finance UI — that's accountant convention
and feels antiquated. Color carries the semantic; the glyph carries the math.

```
✅  +$1,234.56   /  −$432.10
❌  ($432.10)    /  -$432.10  (hyphen)   /   $1,234.56▲
```

#### 1.2.3 Weight scale

Variable fonts let us be precise. The system uses **five weights**, no more:

| Weight | Token             | Use                                       |
|--------|-------------------|--------------------------------------------|
| 350    | `--st-fw-light`   | Display numerics only. Reads expensive.   |
| 400    | `--st-fw-regular` | Body text.                                |
| 500    | `--st-fw-medium`  | UI labels, button text.                   |
| 600    | `--st-fw-semibold`| Headings, emphasized labels.              |
| 700    | `--st-fw-bold`    | Reserved for one element per panel.       |

Note that **350 is the display weight**, not 700. Wealth reads thin and
generous. A net-worth number at weight 700 looks like a sports score; at 350,
it looks like a private bank statement.

### 1.3 Spacing & sizing

4px base unit. Powers of the base unit, plus key half-steps. Spacing is a
language; if you can't express it in a token, the design is wrong.

```css
:root {
  --st-space-0:   0;
  --st-space-1:   0.25rem;  /* 4px  */
  --st-space-2:   0.50rem;  /* 8px  */
  --st-space-3:   0.75rem;  /* 12px */
  --st-space-4:   1.00rem;  /* 16px */
  --st-space-5:   1.50rem;  /* 24px */
  --st-space-6:   2.00rem;  /* 32px */
  --st-space-7:   3.00rem;  /* 48px */
  --st-space-8:   4.00rem;  /* 64px */
  --st-space-9:   6.00rem;  /* 96px */
  --st-space-10:  8.00rem;  /* 128px — panel padding on wide viewports */
}
```

### 1.4 Radii

Strata uses **deliberate** radius. Tiles are slightly rounded (premium), not
sharp (gamer) and not pillowy (consumer-friendly). One radius scale, four
tiers, used semantically.

```css
:root {
  --st-radius-0:    0;          /* full-bleed elements only */
  --st-radius-sm:   0.375rem;   /* 6px  — inputs, small badges */
  --st-radius-md:   0.625rem;   /* 10px — buttons, sub-tiles */
  --st-radius-lg:   1.000rem;   /* 16px — primary tiles */
  --st-radius-xl:   1.500rem;   /* 24px — panel containers */
  --st-radius-full: 9999px;     /* pills, avatars */
}
```

Never mix tile radii within a panel. Pick one tier per panel composition.

### 1.5 Layout grid

The Stage (the scroll viewport) is fixed at `100dvh × 100dvw`. Each Panel
inside the stage uses the same internal grid:

- **12-column grid** with 24px gutters at viewport ≥ 1280px
- **8-column grid** with 20px gutters at 768–1279px
- **4-column grid** with 16px gutters at <768px (mobile collapses to vertical
  card list — see §5.6)
- **Panel padding**: clamped — `clamp(1.5rem, 4vw, 8rem)` left/right, `clamp(2rem, 6vh, 6rem)` top/bottom
- **Max content width**: 1440px centered. Wider viewports get larger gutters,
  not stretched content.

---

## 2. Materials (the Strata layers)

Borrowed from Fluent (Mica, Acrylic, Smoke, Reveal) and re-tuned for our
palette. **Material is non-negotiable for hierarchy**: never use flat color
alone to distinguish surfaces.

| Layer       | Token                | Material      | Use                                              |
|-------------|----------------------|---------------|--------------------------------------------------|
| **L0**      | `--st-mat-canvas`    | Canvas        | The void. Stage background.                      |
| **L1**      | `--st-mat-mica`      | Mica          | Primary panel surface. Opaque, subtly tinted.    |
| **L2**      | `--st-mat-acrylic`   | Acrylic       | Overlays, popovers, command bar.                 |
| **L3**      | `--st-mat-reveal`    | Reveal        | Interactive surfaces (hovered, focused tiles).   |
| **L4**      | `--st-mat-smoke`     | Smoke         | Modal scrim.                                     |
| **L5**      | `--st-mat-bullion`   | Bullion       | The wealth surface — milestone, vault, premium.  |

### 2.1 Canvas (L0)

The deepest layer. A radial gradient from `--st-canvas` at the focal point of
the active panel to `--st-canvas-deep` at the edges. Add a subtle, tileable
SVG noise texture at 2% opacity to kill banding. Without noise, OLED displays
will show visible quantization steps on dark gradients.

```css
.st-stage {
  background:
    radial-gradient(
      ellipse 80% 60% at 50% 40%,
      var(--st-canvas) 0%,
      var(--st-canvas-deep) 100%
    ),
    var(--st-canvas-deep);
}

.st-stage::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.02 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  z-index: 0;
  mix-blend-mode: overlay;
}
```

### 2.2 Mica (L1) — the primary surface

Mica is the workhorse panel material. Opaque, subtly tinted from a desktop
wallpaper image (we use the canvas gradient instead since there's no user
wallpaper). Defined by a **noise-textured solid surface with a 1px top
highlight** to imply edge-lit glass.

```css
.st-mica {
  background-color: var(--st-surface-1);
  border-radius: var(--st-radius-xl);
  position: relative;
  isolation: isolate;
  /* Top highlight — 1px gradient stroke implying light from above */
  box-shadow:
    inset 0 1px 0 0 var(--st-edge-2),
    inset 0 0 0 1px var(--st-edge-1),
    0 8px 32px -8px rgba(0, 0, 0, 0.5);
}
```

### 2.3 Acrylic (L2) — frosted overlay

Acrylic is the **transient** material: command bar, popovers, dropdowns,
context menus. Real `backdrop-filter` blur with a tinted layer on top. The
classic mistake is making the tint too transparent — it loses contrast and
fails AA. Strata's acrylic is **84% opaque tint + blur**.

```css
.st-acrylic {
  background-color: oklch(22% 0.013 250 / 0.84);
  backdrop-filter: blur(40px) saturate(140%);
  -webkit-backdrop-filter: blur(40px) saturate(140%);
  border-radius: var(--st-radius-lg);
  box-shadow:
    inset 0 1px 0 0 var(--st-edge-3),
    inset 0 0 0 1px var(--st-edge-1),
    0 16px 48px -12px rgba(0, 0, 0, 0.6);
}

/* Fallback for browsers without backdrop-filter (≈2% of users in 2026) */
@supports not (backdrop-filter: blur(1px)) {
  .st-acrylic {
    background-color: oklch(22% 0.013 250);
  }
}
```

**Performance rule**: Acrylic is expensive. Budget **two visible acrylic
surfaces per frame, maximum**. Never apply acrylic to a tile that lives inside
a scrolling container — composite cost explodes.

### 2.4 Reveal (L3) — the interactive material

The Xbox signature: when you hover or focus a tile, a soft light follows your
cursor across the surface. This is the single biggest "console feel" tell. We
implement it with a CSS-only conic gradient that tracks cursor position via
custom properties (no JS until you need keyboard tracking).

```css
.st-reveal {
  --mx: 50%;
  --my: 50%;
  background-color: var(--st-surface-2);
  border-radius: var(--st-radius-lg);
  position: relative;
  isolation: isolate;
  transition: background-color 200ms var(--st-ease-out);
}

.st-reveal::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(
    220px circle at var(--mx) var(--my),
    oklch(100% 0 0 / 0.08),
    transparent 60%
  );
  opacity: 0;
  transition: opacity 240ms var(--st-ease-out);
  pointer-events: none;
}

.st-reveal:hover::before,
.st-reveal:focus-visible::before {
  opacity: 1;
}

/* Edge reveal — light grazes the perimeter on hover */
.st-reveal::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: conic-gradient(
    from 0deg at var(--mx) var(--my),
    transparent 0deg,
    oklch(100% 0 0 / 0.24) 90deg,
    transparent 180deg
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  opacity: 0;
  transition: opacity 240ms var(--st-ease-out);
  pointer-events: none;
}

.st-reveal:hover::after,
.st-reveal:focus-visible::after {
  opacity: 1;
}
```

Cursor tracking (one tiny pointermove listener, throttled with rAF):

```javascript
// strata-reveal.js — drop-in, vanilla, ~30 lines
const reveals = document.querySelectorAll('.st-reveal');
let rafId = null;

const trackReveal = (el, e) => {
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
};

reveals.forEach(el => {
  el.addEventListener('pointermove', (e) => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      trackReveal(el, e);
      rafId = null;
    });
  });
});
```

### 2.5 Smoke (L4) — modal dimmer

Plain darkening scrim plus a strong blur. Used behind dialogs, sheets,
command palette.

```css
.st-smoke {
  position: fixed;
  inset: 0;
  background-color: oklch(8% 0.01 250 / 0.72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: var(--st-z-modal-scrim);
}
```

### 2.6 Bullion (L5) — the wealth surface

The signature material. Reserved for one use per panel, never more than two
visible on screen at once. A subtle champagne-tinted gradient with a faint
diagonal sheen. Used for milestones, premium tier indicators, the "Vault"
panel (savings goals reached), high-value account cards.

```css
.st-bullion {
  background:
    linear-gradient(
      135deg,
      oklch(28% 0.04 85) 0%,
      oklch(22% 0.025 85) 40%,
      oklch(26% 0.035 85) 100%
    );
  border-radius: var(--st-radius-lg);
  position: relative;
  isolation: isolate;
  box-shadow:
    inset 0 1px 0 0 var(--st-accent-champagne-mute),
    inset 0 0 0 1px oklch(82% 0.09 85 / 0.18),
    0 8px 32px -8px oklch(40% 0.08 85 / 0.4);
}

.st-bullion::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    115deg,
    transparent 30%,
    oklch(100% 0.04 85 / 0.06) 50%,
    transparent 70%
  );
  pointer-events: none;
}
```

---

## 3. Elevation

Five elevation levels. Each combines a material with a shadow. Never freelance
shadows.

```css
:root {
  /* Standard shadow scale */
  --st-elev-0:  none;
  --st-elev-1:  0 1px 2px 0 rgb(0 0 0 / 0.40);
  --st-elev-2:  0 4px 12px -2px rgb(0 0 0 / 0.45);
  --st-elev-3:  0 8px 32px -8px rgb(0 0 0 / 0.50);
  --st-elev-4:  0 16px 48px -12px rgb(0 0 0 / 0.55);
  --st-elev-5:  0 24px 64px -16px rgb(0 0 0 / 0.60);

  /* Focus ring — separate from elevation, additive */
  --st-focus-ring:
    0 0 0 2px var(--st-canvas),
    0 0 0 4px var(--st-accent-emerald);

  /* Accent halo — for primary CTAs */
  --st-glow-emerald:
    0 0 0 1px var(--st-accent-emerald-mute),
    0 8px 24px -6px oklch(68% 0.16 162 / 0.4);
}
```

| Level | Material   | Shadow         | Use                                     |
|-------|------------|----------------|------------------------------------------|
| 0     | Canvas     | none           | Stage                                    |
| 1     | Mica       | `--st-elev-1`  | Inline panels, embedded                  |
| 2     | Mica       | `--st-elev-2`  | Standard tiles                           |
| 3     | Mica/Bullion | `--st-elev-3`| Hero tiles, focused tile                 |
| 4     | Acrylic    | `--st-elev-4`  | Popovers, dropdowns                      |
| 5     | Acrylic    | `--st-elev-5`  | Modals, command palette                  |

---

## 4. Motion system

Motion is choreographed, not decorative. Every animation must have:

1. **A reason** (state change, attention, spatial transition).
2. **A duration tier** (see below — no freelance durations).
3. **A motivated easing** (entrances ease out; exits ease in; spatial moves
   use the standard curve).
4. **A reduced-motion fallback** (instant or 80ms crossfade).

### 4.1 Easing tokens

```css
:root {
  /* Standard — for spatial transitions, panel snap settle. Fluent-derived. */
  --st-ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);

  /* Entrance — decelerate. For elements appearing. */
  --st-ease-out:      cubic-bezier(0.0, 0.0, 0.2, 1);

  /* Exit — accelerate. For elements leaving. */
  --st-ease-in:       cubic-bezier(0.4, 0.0, 1.0, 1);

  /* Spring — subtle overshoot. For tile snap, button press release. */
  --st-ease-spring:   cubic-bezier(0.34, 1.30, 0.64, 1);

  /* Linear — only for continuous, scroll-driven effects */
  --st-ease-linear:   linear;
}
```

### 4.2 Duration tiers

```css
:root {
  --st-dur-instant:  80ms;    /* state changes that should feel immediate */
  --st-dur-fast:     160ms;   /* hover, focus, small UI */
  --st-dur-base:     240ms;   /* default — tile reveal, dropdown */
  --st-dur-slow:     400ms;   /* panel transitions, sheet open */
  --st-dur-stately:  600ms;   /* hero entrances, milestone celebration */
  --st-dur-grand:    900ms;   /* once-per-session moments (welcome) */
}
```

### 4.3 Choreography rules

- **Stagger increment**: 40ms between sibling elements in an entrance
  sequence. Six items maximum in a stagger — beyond that, batch.
- **Z-axis depth**: When two layers animate together, the further layer moves
  ~40% less than the closer layer (parallax).
- **Direction follows intent**: Forward navigation animates left-to-right /
  top-to-bottom. Back animates the reverse.
- **One hero per scene**: A panel may have one animated focus moment.
  Everything else holds still or moves subtly.

### 4.4 Reduced motion

Mandatory. Every animation has an explicit reduced-motion variant.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Snap stays — it's a layout primitive, not motion */
  .st-stage {
    scroll-snap-type: y mandatory;
  }
}
```

For `anime.js`, gate the entire engine:

```javascript
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduceMotion) {
  // run anime.js choreography
} else {
  // jump to end state, no animation
}
```

---

## 5. The Stage — scroll architecture

This is the structural innovation. The viewport is fixed; content moves
through it as a sequence of discrete, snap-aligned panels. Console UX
grammar, web technology.

### 5.1 The pattern

```html
<main class="st-stage" data-panel-index="0">
  <section class="st-panel" data-panel="overview" aria-label="Overview">
    <!-- Hero content for this panel -->
  </section>

  <section class="st-panel" data-panel="accounts" aria-label="Accounts">
    <!-- ... -->
  </section>

  <section class="st-panel st-panel--scrollable" data-panel="transactions">
    <!-- Panel content overflows; uses internal scroll -->
    <div class="st-panel__scroller">
      <!-- Long list -->
    </div>
  </section>
</main>

<nav class="st-blade" aria-label="Stage navigation">
  <!-- Right-rail dot/blade navigation, fixed -->
</nav>
```

### 5.2 The CSS

```css
.st-stage {
  /* The viewport-locked container */
  block-size: 100dvh;
  inline-size: 100dvw;
  overflow-y: scroll;
  overflow-x: hidden;
  scroll-snap-type: y mandatory;     /* discrete stops at panel boundaries */
  overscroll-behavior-y: contain;    /* no scroll chaining to <html> */
  scroll-behavior: smooth;
  scrollbar-width: none;             /* hide chrome (we have our own indicator) */
  scroll-padding-block: 0;
}
.st-stage::-webkit-scrollbar { display: none; }

.st-panel {
  block-size: 100dvh;
  inline-size: 100%;
  scroll-snap-align: start;
  scroll-snap-stop: always;          /* don't skip panels on fast scroll */
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  column-gap: var(--st-space-5);
  padding:
    clamp(2rem, 6vh, 6rem)
    clamp(1.5rem, 4vw, 8rem);
  position: relative;
  isolation: isolate;
  /* Each panel gets its own stacking context for parallax layering */
}

/* A scrollable panel — internal scroller, no snap on the inside */
.st-panel--scrollable {
  /* The outer panel still snaps. The inner scroller handles overflow. */
  display: flex;
  flex-direction: column;
}
.st-panel__scroller {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--st-edge-3) transparent;
}
```

### 5.3 Why mandatory + scroll-snap-stop:always

`scroll-snap-stop: always` is the difference between "feels like a website
with snap" and "feels like a console." Without it, a fast scroll can blow
through three panels at once. With it, each scroll gesture commits to exactly
one panel transition — the console grammar.

### 5.4 Keyboard navigation

Native scroll-snap doesn't natively respond to arrow keys with snap semantics
in all browsers. We add a 15-line handler:

```javascript
const stage = document.querySelector('.st-stage');
const panels = Array.from(stage.querySelectorAll('.st-panel'));

const panelIndex = () => {
  const y = stage.scrollTop;
  return Math.round(y / window.innerHeight);
};

const goTo = (i) => {
  const clamped = Math.max(0, Math.min(panels.length - 1, i));
  panels[clamped].scrollIntoView({ behavior: 'smooth', block: 'start' });
};

stage.addEventListener('keydown', (e) => {
  const i = panelIndex();
  switch (e.key) {
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
      e.preventDefault(); goTo(i + 1); break;
    case 'ArrowUp':
    case 'PageUp':
      e.preventDefault(); goTo(i - 1); break;
    case 'Home':
      e.preventDefault(); goTo(0); break;
    case 'End':
      e.preventDefault(); goTo(panels.length - 1); break;
  }
});
```

`tabindex="0"` on the stage to make it focusable. Each panel gets an `aria-label` describing its content for screen reader navigation.

### 5.5 Mouse wheel & trackpad

Native scroll-snap handles wheel events well in modern browsers; no JS needed.
**Do not** override `wheel` events with custom interpolation — you will break
trackpad inertia and feel worse than native, guaranteed.

### 5.6 Mobile fallback

Below 768px, the console metaphor breaks down — small screens don't have
spatial real estate for fixed-viewport panels. **Switch the metaphor**:

```css
@media (max-width: 767px) {
  .st-stage {
    scroll-snap-type: none;
    block-size: auto;
    inline-size: 100%;
    overflow: visible;
  }
  .st-panel {
    block-size: auto;
    min-block-size: 60dvh;
    scroll-snap-align: none;
    padding: var(--st-space-5);
    grid-template-columns: repeat(4, 1fr);
  }
}
```

Mobile becomes a single vertical scroll with panels as sections. No snap, no
fixed viewport — but the same materials, the same typography, the same
hierarchy.

### 5.7 The Blade (navigation rail)

A vertical rail on the right edge showing one indicator per panel. Active
panel's indicator extends into a label. Tap/click to jump.

Anatomy and CSS — see §7.3.


---

## 6. anime.js v4 integration

anime.js is **not** the scroll engine — native scroll-snap is. anime.js is for
*choreography*: panel entrances, number tickers, focus reticles, sparkline
draws, and milestone celebrations. Use the tree-shakeable v4 imports; never
import the full bundle.

### 6.1 Setup

```javascript
// strata-motion.js
import { animate, createTimeline, stagger, onScroll } from 'animejs';

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const dur = (ms) => REDUCE ? 0 : ms;
const ease = {
  standard: 'cubicBezier(0.2, 0.8, 0.2, 1)',
  out:      'cubicBezier(0.0, 0.0, 0.2, 1)',
  in:       'cubicBezier(0.4, 0.0, 1.0, 1)',
  spring:   'cubicBezier(0.34, 1.30, 0.64, 1)',
};
```

### 6.2 Pattern: panel entrance choreography

When a panel scrolls into view, its tiles stagger in. We trigger this via
`IntersectionObserver` because `onScroll` from anime.js is designed for
scroll-progress-bound animation (parallax-style), not one-shot triggers.

```javascript
const choreographPanel = (panel) => {
  if (panel.dataset.entered === 'true') return;
  panel.dataset.entered = 'true';

  const tiles = panel.querySelectorAll('[data-tile]');
  const heroNumber = panel.querySelector('[data-hero-number]');

  // Tiles: opacity + subtle Y translate, staggered
  animate(tiles, {
    opacity: [0, 1],
    translateY: [24, 0],
    scale: [0.98, 1],
    duration: dur(560),
    ease: ease.standard,
    delay: stagger(40, { from: 'first' }),
  });

  // Hero number ticker
  if (heroNumber) tickerize(heroNumber);
};

const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting && e.intersectionRatio > 0.6) {
      choreographPanel(e.target);
    }
  });
}, { threshold: [0, 0.6, 1] });

document.querySelectorAll('.st-panel').forEach(p => io.observe(p));
```

### 6.3 Pattern: number ticker (the wealth count-up)

The signature finance animation. A net-worth number counts up on panel entry.
Critical implementation rules:

- **Tabular figures locked** — width must not change during count
- **Easing must decelerate hard** — ease.standard, not linear (linear feels
  cheap, like a slot machine)
- **Skip on subsequent reveals** — only ticker on first entry per session,
  or after a real value change
- **No ticker on negative numbers** — counting up to a loss is tonally wrong

```javascript
const tickerize = (el) => {
  const target = parseFloat(el.dataset.value);
  const formatter = new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: el.dataset.currency || 'AUD',
    maximumFractionDigits: 2,
  });

  if (REDUCE) {
    el.textContent = formatter.format(target);
    return;
  }

  const obj = { v: 0 };
  animate(obj, {
    v: target,
    duration: dur(900),
    ease: ease.standard,
    onUpdate: () => {
      el.textContent = formatter.format(obj.v);
    },
  });
};
```

For very large numbers (e.g. portfolio in the millions), start the ticker
from 92% of the target value, not from zero. Counting from zero on a $2M
number takes too long and feels gauche.

### 6.4 Pattern: focus reticle

When keyboard navigation moves focus to a tile, an animated outline ring
draws around it. This is the keyboard equivalent of the cursor reveal — it
must be just as satisfying, or keyboard users feel like second-class
citizens.

```javascript
const reticle = document.createElement('div');
reticle.className = 'st-reticle';
document.body.appendChild(reticle);

const positionReticle = (target) => {
  const r = target.getBoundingClientRect();
  animate(reticle, {
    translateX: r.left - 4,
    translateY: r.top - 4,
    width: r.width + 8,
    height: r.height + 8,
    opacity: 1,
    duration: dur(280),
    ease: ease.standard,
  });
};

document.addEventListener('focusin', (e) => {
  if (e.target.matches('[data-tile], button, [role="button"]')) {
    positionReticle(e.target);
  }
});

document.addEventListener('focusout', () => {
  animate(reticle, { opacity: 0, duration: dur(160), ease: ease.in });
});
```

```css
.st-reticle {
  position: fixed;
  top: 0;
  left: 0;
  border-radius: var(--st-radius-lg);
  pointer-events: none;
  opacity: 0;
  z-index: var(--st-z-overlay);
  box-shadow:
    0 0 0 2px var(--st-canvas),
    0 0 0 4px var(--st-accent-emerald),
    0 0 24px 0 var(--st-accent-emerald-mute);
  will-change: transform, width, height, opacity;
}
```

### 6.5 Pattern: scroll-driven parallax (native CSS, not JS)

For tile parallax tied to scroll progress within a panel, use native CSS
**scroll-driven animations**. Chromium and Firefox (behind flag, shipping
2026) support this; for Safari, we degrade gracefully to no parallax. Do
not polyfill with JS — the cost is not worth it.

```css
@supports (animation-timeline: scroll()) {
  .st-tile[data-depth="background"] {
    animation: parallax-back linear;
    animation-timeline: scroll(root block);
  }
  .st-tile[data-depth="foreground"] {
    animation: parallax-fore linear;
    animation-timeline: scroll(root block);
  }
  @keyframes parallax-back {
    from { transform: translateY(0); }
    to   { transform: translateY(-40px); }
  }
  @keyframes parallax-fore {
    from { transform: translateY(0); }
    to   { transform: translateY(-12px); }
  }
}
```

**Do not** chain `onScroll` to every tile. That recreates `scrollEvent`
listeners under the hood and tanks your INP score.

### 6.6 Pattern: sparkline draw-in

When a chart tile enters view, the sparkline path draws from left to right.
Use SVG `stroke-dasharray` + `stroke-dashoffset`:

```javascript
const drawSparkline = (svgPath) => {
  const length = svgPath.getTotalLength();
  svgPath.style.strokeDasharray = length;
  svgPath.style.strokeDashoffset = length;
  animate(svgPath, {
    strokeDashoffset: 0,
    duration: dur(720),
    ease: ease.out,
  });
};
```

### 6.7 What NOT to use anime.js for

- **Scroll-snap transitions.** Native CSS handles this.
- **Hover state colors.** CSS transitions are cheaper.
- **Page transitions on route change.** Use View Transitions API.
- **Continuous ambient animation** (e.g. floating particles). Use CSS `@keyframes` with `animation-iteration-count: infinite` — runs on the compositor, doesn't block the main thread.

---

## 7. Components

Each component below lists: anatomy, tokens, states, accessibility notes. Code
samples are minimal — they show the canonical structure, not a full
implementation.

### 7.1 Tile (the hero element)

The console-grammar building block. A tile occupies a defined grid area and
contains a single coherent unit of content: an account, a budget, a metric, a
chart, an action.

**Anatomy:**

```
┌─────────────────────────────────────┐
│  EYEBROW (micro, uppercased)        │  ← optional, --st-fs-micro
│                                     │
│  Hero content                       │  ← KPI number, chart, or action
│  ($ 124,532.18)                     │
│                                     │
│  Body label                         │  ← --st-fs-body-sm, ink-2
│                                     │
│  ┌──────────────────────────────┐  │
│  │ Footer area (delta, action)  │  │  ← --st-fs-caption, ink-3
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Token: tile**

```css
.st-tile {
  /* Inherits Reveal material */
  background-color: var(--st-surface-2);
  border-radius: var(--st-radius-lg);
  padding: var(--st-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--st-space-3);
  min-block-size: 160px;
  box-shadow:
    var(--st-elev-2),
    inset 0 1px 0 0 var(--st-edge-2),
    inset 0 0 0 1px var(--st-edge-1);
  /* + Reveal pseudo-elements from §2.4 */
  cursor: pointer;
  transition:
    transform var(--st-dur-fast) var(--st-ease-out),
    box-shadow var(--st-dur-fast) var(--st-ease-out);
}

.st-tile:hover {
  transform: translateY(-2px);
  box-shadow:
    var(--st-elev-3),
    inset 0 1px 0 0 var(--st-edge-3),
    inset 0 0 0 1px var(--st-edge-2);
}

.st-tile:active {
  transform: translateY(0);
  transition-duration: var(--st-dur-instant);
}
```

**Sizes** — by grid span:

| Variant      | Cols × Rows | Use                                 |
|--------------|-------------|--------------------------------------|
| `--span-1x1` | 3 × 1       | Sub-metric, action shortcut          |
| `--span-2x1` | 6 × 1       | Standard account / category          |
| `--span-2x2` | 6 × 2       | Chart tile                           |
| `--span-3x2` | 9 × 2       | Hero tile (net worth)                |
| `--span-full`| 12 × var.   | Section header tile, transactions list |

**States**: default, hover, focus-visible (reticle), active, disabled, loading
(skeleton — see §7.12).

**Accessibility**: If the tile is interactive, wrap content in a `<button>` or
add `role="button"`, `tabindex="0"`, and keyboard handlers for Enter/Space. If
the tile contains a heading, use `<h2>` or `<h3>` inside; don't make the tile
itself a heading.

### 7.2 Panel

A panel is a snap stop. It must be exactly `100dvh` tall, must have an
`aria-label`, and must contain exactly one "scene" — one composition of tiles
that tells one story.

**Standard panel layout:**

```html
<section class="st-panel" aria-label="Net worth overview">
  <header class="st-panel__header">
    <p class="st-panel__eyebrow">Overview</p>
    <h1 class="st-panel__title">Net worth</h1>
  </header>

  <div class="st-panel__grid">
    <article class="st-tile st-tile--3x2" data-tile>
      <!-- hero -->
    </article>
    <article class="st-tile st-tile--2x1" data-tile>
      <!-- supporting -->
    </article>
    <!-- ... -->
  </div>

  <footer class="st-panel__footer">
    <!-- optional commands -->
  </footer>
</section>
```

The eyebrow + title pattern is the panel's identity. Don't let tile content
duplicate it. Eyebrow tells you *where you are*; title tells you *what this is*.

### 7.3 Blade (navigation rail)

A thin vertical rail on the right edge of the stage. One indicator per panel.
Active indicator expands into a labeled pill. Click any indicator to jump.

The "Blade" name is a direct nod to Xbox 360's blade UI — but visually,
nothing in common. It's a precise, restrained dot column.

**Anatomy:**

```
                                ╮
        ●  Overview             │  ← active: dot expands to pill with label
        ·                       │
        ·                       │
        ·                       │
        ·                       │  ← inactive: 4px dot
                                ╯
```

```css
.st-blade {
  position: fixed;
  inset-block: 50%;
  inset-inline-end: var(--st-space-5);
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: var(--st-space-3);
  z-index: var(--st-z-nav);
}

.st-blade__item {
  display: flex;
  align-items: center;
  gap: var(--st-space-3);
  background: transparent;
  border: 0;
  padding: var(--st-space-2);
  cursor: pointer;
  color: var(--st-ink-3);
  transition:
    color var(--st-dur-fast) var(--st-ease-out),
    transform var(--st-dur-fast) var(--st-ease-out);
}

.st-blade__dot {
  inline-size: 4px;
  block-size: 4px;
  border-radius: var(--st-radius-full);
  background-color: var(--st-ink-3);
  transition:
    inline-size var(--st-dur-base) var(--st-ease-standard),
    background-color var(--st-dur-base) var(--st-ease-standard);
}

.st-blade__label {
  font-size: var(--st-fs-micro);
  font-weight: var(--st-fw-medium);
  letter-spacing: var(--st-tracking-micro);
  text-transform: uppercase;
  color: var(--st-ink-1);
  opacity: 0;
  transform: translateX(-8px);
  transition:
    opacity var(--st-dur-base) var(--st-ease-out),
    transform var(--st-dur-base) var(--st-ease-out);
}

.st-blade__item[aria-current="true"] .st-blade__dot {
  inline-size: 32px;
  background-color: var(--st-accent-emerald);
}

.st-blade__item[aria-current="true"] .st-blade__label {
  opacity: 1;
  transform: translateX(0);
  color: var(--st-ink-1);
}

.st-blade__item:hover .st-blade__label {
  opacity: 1;
  transform: translateX(0);
}
```

`aria-current="true"` is set by the IntersectionObserver as panels pass the
center of the viewport. Each item is a button that uses `scrollIntoView` on
its target panel.

### 7.4 Numerical readout

The display element for any monetary value. Three sizes; consistent
typography rules throughout.

```html
<output class="st-readout st-readout--hero" data-hero-number data-value="124532.18" data-currency="AUD">
  <span class="st-readout__currency">A$</span>
  <span class="st-readout__integer">124,532</span><!--
  --><span class="st-readout__decimal">.18</span>
</output>
```

```css
.st-readout {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums slashed-zero;
  color: var(--st-ink-1);
  line-height: var(--st-lh-display);
  letter-spacing: var(--st-tracking-display);
  display: inline-flex;
  align-items: baseline;
}

.st-readout--hero {
  font-size: var(--st-fs-display-xl);
  font-weight: var(--st-fw-light);  /* 350 — reads expensive */
}

.st-readout--lg {
  font-size: var(--st-fs-display-lg);
  font-weight: var(--st-fw-light);
}

.st-readout--md {
  font-size: var(--st-fs-display-md);
  font-weight: var(--st-fw-regular);
}

/* Currency symbol — slightly smaller, ink-2 to demote */
.st-readout__currency {
  font-size: 0.55em;
  color: var(--st-ink-2);
  margin-inline-end: 0.1em;
  font-weight: var(--st-fw-regular);
}

/* Decimal — demoted both in size and weight */
.st-readout__decimal {
  font-size: 0.62em;
  color: var(--st-ink-2);
  font-weight: var(--st-fw-regular);
}
```

The decimal demotion (smaller, ink-2) is the single most valuable typographic
move in this system. It makes the integer feel like the meaningful number and
the cents feel like precision — which is the right hierarchy for human money
intuition.

### 7.5 Trend indicator (delta pill)

```html
<span class="st-trend st-trend--pos">
  <svg class="st-trend__icon" aria-hidden="true"><!-- caret-up --></svg>
  <span class="st-trend__value">+2.4%</span>
  <span class="st-trend__period">30d</span>
</span>
```

```css
.st-trend {
  display: inline-flex;
  align-items: center;
  gap: var(--st-space-2);
  padding: var(--st-space-1) var(--st-space-3);
  border-radius: var(--st-radius-full);
  font-size: var(--st-fs-caption);
  font-family: "Geist Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-weight: var(--st-fw-medium);
  line-height: 1;
}

.st-trend--pos {
  background-color: var(--st-pos-mute);
  color: var(--st-accent-emerald);
}

.st-trend--neg {
  background-color: var(--st-neg-mute);
  color: var(--st-neg);
}

.st-trend--flat {
  background-color: var(--st-edge-1);
  color: var(--st-ink-3);
}

.st-trend__icon {
  inline-size: 12px;
  block-size: 12px;
}

.st-trend__period {
  color: currentColor;
  opacity: 0.7;
  margin-inline-start: var(--st-space-1);
}
```

Icons: caret-up (pos), caret-down (neg), em-dash (flat). Color carries the
state but the icon is mandatory for accessibility — color is not the only
indicator.

### 7.6 Button

Four variants, three sizes. Always.

```css
.st-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--st-space-2);
  font-family: "Inter Tight", system-ui, sans-serif;
  font-weight: var(--st-fw-medium);
  letter-spacing: -0.005em;
  border-radius: var(--st-radius-md);
  border: 0;
  cursor: pointer;
  user-select: none;
  transition:
    background-color var(--st-dur-fast) var(--st-ease-out),
    transform var(--st-dur-instant) var(--st-ease-spring),
    box-shadow var(--st-dur-fast) var(--st-ease-out);
}

.st-btn:active { transform: scale(0.97); }

/* Sizes */
.st-btn--sm { padding: var(--st-space-2) var(--st-space-3); font-size: var(--st-fs-body-sm); block-size: 32px; }
.st-btn--md { padding: var(--st-space-3) var(--st-space-4); font-size: var(--st-fs-body); block-size: 40px; }
.st-btn--lg { padding: var(--st-space-3) var(--st-space-5); font-size: var(--st-fs-body-lg); block-size: 48px; }

/* Primary — emerald */
.st-btn--primary {
  background-color: var(--st-accent-emerald);
  color: var(--st-accent-emerald-ink);
  box-shadow: var(--st-glow-emerald);
}
.st-btn--primary:hover { background-color: var(--st-accent-emerald-hover); }
.st-btn--primary:active { background-color: var(--st-accent-emerald-press); }

/* Secondary — mica with border */
.st-btn--secondary {
  background-color: var(--st-surface-3);
  color: var(--st-ink-1);
  box-shadow: inset 0 0 0 1px var(--st-edge-2);
}
.st-btn--secondary:hover { background-color: var(--st-surface-4); box-shadow: inset 0 0 0 1px var(--st-edge-3); }

/* Ghost — text only, no fill */
.st-btn--ghost {
  background-color: transparent;
  color: var(--st-ink-2);
}
.st-btn--ghost:hover { background-color: var(--st-surface-2); color: var(--st-ink-1); }

/* Destructive — oxblood */
.st-btn--destructive {
  background-color: var(--st-neg-mute);
  color: var(--st-neg);
  box-shadow: inset 0 0 0 1px var(--st-neg);
}
.st-btn--destructive:hover { background-color: var(--st-neg); color: var(--st-neg-ink); }
```

### 7.7 Input

```css
.st-input {
  font-family: "Inter Tight", system-ui, sans-serif;
  font-size: var(--st-fs-body);
  color: var(--st-ink-1);
  background-color: var(--st-surface-1);
  border: 0;
  box-shadow: inset 0 0 0 1px var(--st-edge-2);
  border-radius: var(--st-radius-md);
  padding: var(--st-space-3) var(--st-space-4);
  inline-size: 100%;
  block-size: 44px;
  transition:
    box-shadow var(--st-dur-fast) var(--st-ease-out),
    background-color var(--st-dur-fast) var(--st-ease-out);
}

.st-input::placeholder {
  color: var(--st-ink-4);
}

.st-input:hover {
  background-color: var(--st-surface-2);
  box-shadow: inset 0 0 0 1px var(--st-edge-3);
}

.st-input:focus-visible {
  outline: 0;
  background-color: var(--st-surface-2);
  box-shadow:
    inset 0 0 0 1px var(--st-accent-emerald),
    0 0 0 3px var(--st-accent-emerald-mute);
}

/* Amount input — auto-applies numeric typography */
.st-input--amount {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums slashed-zero;
  text-align: end;
  letter-spacing: -0.01em;
}
```

### 7.8 Command bar (top-of-stage)

A fixed Acrylic strip at the top of the stage. Contains: brand mark (left),
panel breadcrumb (center, optional), command palette trigger (right),
account/avatar (far right). 56px tall.

```css
.st-command-bar {
  position: fixed;
  inset-block-start: 0;
  inset-inline: 0;
  block-size: 56px;
  padding-inline: var(--st-space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--st-space-5);
  z-index: var(--st-z-nav);
  /* Acrylic material */
  background-color: oklch(15% 0.012 250 / 0.72);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border-block-end: 1px solid var(--st-edge-1);
}
```

The command bar must not block panel content — panels account for its height
via `padding-block-start`.

### 7.9 Command palette (⌘K)

Acrylic modal. Spawns at the vertical center, 640px wide, 480px tall. Contains
a fuzzy search input and a list of actions, accounts, transactions, and
navigation targets. The single keyboard entry point to everything in the app.

```css
.st-cmdk {
  position: fixed;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  transform: translate(-50%, -50%);
  inline-size: min(640px, 90vw);
  max-block-size: 480px;
  /* Inherits .st-acrylic with elevation 5 */
  z-index: var(--st-z-modal);
}
```

### 7.10 Modal sheet

Used for destructive confirmations, settings, transaction details. Slides up
from the bottom on mobile; centers on desktop. Backed by `.st-smoke`. Single
focus trap; `Escape` to close.

### 7.11 Toast

Inline status notifications. Bottom-right anchored, max 3 stacked, 5-second
auto-dismiss for non-critical, manual dismiss for errors. Mica material,
elevation 4, animated in with translateX from off-screen.

### 7.12 Skeleton

Loading state for any data-bearing component. **Not a shimmer animation** —
shimmers are exhausted; they read as "lazy designer." Instead, use a pulsing
opacity on a flat rounded rectangle in `--st-surface-2`.

```css
.st-skeleton {
  background-color: var(--st-surface-2);
  border-radius: var(--st-radius-md);
  animation: st-skeleton-pulse 1.6s var(--st-ease-standard) infinite;
}

@keyframes st-skeleton-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1.0; }
}

@media (prefers-reduced-motion: reduce) {
  .st-skeleton { animation: none; opacity: 0.8; }
}
```

### 7.13 Empty state

```
┌─────────────────────────────────────┐
│                                     │
│             [icon, 48px]            │  ← ink-3
│                                     │
│       No transactions yet           │  ← h3, ink-1
│   Your activity will appear here    │  ← body, ink-2
│         once you connect a          │
│         payment source.             │
│                                     │
│       [ Connect account ]           │  ← btn primary
│                                     │
└─────────────────────────────────────┘
```

Empty states are for *direction*, not mood. State what's missing and the next
action. No illustrations of empty boxes or sad clouds.

---

## 8. Iconography

**Library**: Lucide (open source, MIT, actively maintained, comprehensive).
Strata uses 24×24 grid icons with 1.5px stroke width, rounded caps and joins.
No filled icons (filled icons compete with the wealth-thin typography).

Sizes: 16, 20, 24, 32. Color always `currentColor`. Never apply a separate
color to an icon's stroke — inherit from the parent text element.

```css
.st-icon {
  inline-size: 1.25em;        /* scales with parent font-size */
  block-size: 1.25em;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
  stroke: currentColor;
  vertical-align: -0.125em;
}
```

**Currency icons**: never use the generic Lucide `dollar-sign`. Instead, use
the typographic glyph for the user's locale (`$`, `€`, `£`, `¥`, `A$`) in
Geist Mono. Currency is text, not an icon.

---

## 9. Data visualization

### 9.1 Chart anatomy rules

- **Y-axis**: zero baseline always visible. No truncated axes (this is a hill
  to die on — truncated y-axes are how finance apps lie).
- **Grid lines**: `--st-edge-1` only. No labels at every gridline; label every
  other one max.
- **Tick labels**: `--st-fs-micro`, `--st-ink-3`, Geist Mono if numeric.
- **Data line stroke**: 2px. Color = `--st-viz-N`. Solid for primary; dashed
  (4 2) only for "projected" / "forecast" data.
- **Area fill below line**: gradient from `var(--st-viz-N)` at 0.24 opacity to
  `transparent` at 60% height. Never solid fill — competes with grid.
- **Hover tooltip**: Acrylic, follows cursor with 8px offset, contains exact
  values in Geist Mono.

### 9.2 Sparkline

Inline mini chart, 80×24px default. No axes, no labels, single line, optional
area fill. Used in tile footers to show 30-day trend.

```svg
<svg class="st-sparkline" viewBox="0 0 80 24" preserveAspectRatio="none">
  <defs>
    <linearGradient id="sl-fill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="currentColor" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="M0,18 L13,14 L26,16 L40,8 L53,11 L66,5 L80,2 L80,24 L0,24 Z"
        fill="url(#sl-fill)"/>
  <path d="M0,18 L13,14 L26,16 L40,8 L53,11 L66,5 L80,2"
        fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### 9.3 Donut chart (category breakdown)

Strata uses donut, not pie. Center hole holds the total amount in Geist Mono.
Slice colors from `--st-viz-1..6`. Animate by drawing slices clockwise from
12 o'clock on entry, 80ms stagger between slices.

**Hard rule**: never use a donut for >6 categories. Beyond 6, switch to a
horizontal bar chart. Comprehension on a 12-slice donut is roughly zero.

---

## 10. Accessibility

### 10.1 Contrast

All text must meet WCAG AA. The system tokens are designed so that:

- `--st-ink-1` on any `--st-surface-N` ≥ 4.5:1 ✓
- `--st-ink-2` on `--st-surface-1` through `--st-surface-3` ≥ 4.5:1 ✓
- `--st-ink-3` on `--st-surface-1` through `--st-surface-2` ≥ 4.5:1 ✓
- `--st-ink-4` is decorative only — never used for meaningful text
- `--st-accent-emerald` on `--st-surface-1` ≥ 4.5:1 ✓ (tested at oklch(68%))
- `--st-accent-champagne` on `--st-surface-1` ≥ 4.5:1 ✓

Validate any token *change* against the canonical surface set before shipping.

### 10.2 Focus visibility

Every interactive element must have a visible focus indicator. Default is the
focus reticle from §6.4 (for tiles) or the in-component focus ring (for
inputs, buttons). Never `outline: none` without a replacement.

### 10.3 Keyboard nav (the full map)

| Key                    | Action                                          |
|------------------------|--------------------------------------------------|
| `↓` / `PageDown` / `Space` | Next panel                                  |
| `↑` / `PageUp`         | Previous panel                                  |
| `Home`                 | First panel                                     |
| `End`                  | Last panel                                      |
| `Tab` / `Shift+Tab`    | Cycle tiles within current panel                |
| `Enter` / `Space`      | Activate focused tile                           |
| `Escape`               | Close modal / popover / collapse expanded tile  |
| `⌘K` / `Ctrl+K`        | Open command palette                            |
| `/`                    | Focus search (if visible)                       |
| `?`                    | Show keyboard shortcuts overlay                 |

### 10.4 Screen reader

- The stage announces panel changes via an `aria-live="polite"` region
  containing the current panel's title.
- Number tickers should announce only the *final value*, not the count-up.
  Wrap ticker output in `aria-live="off"` and add an offscreen
  `aria-live="polite"` span with the final value.
- Trend indicators must include sr-only descriptive text:
  `"<span class="sr-only">Up 2.4 percent over 30 days. </span>"`
- Charts must have an associated `<table>` (visually hidden) with the data.

### 10.5 Motion

`prefers-reduced-motion: reduce` honoured throughout. Scroll-snap remains
because it's structural, not decorative. All anime.js animations gated by
the `REDUCE` flag (§6.1). All CSS animations have reduced fallbacks.

### 10.6 Internationalisation

- All currency formatting via `Intl.NumberFormat` — never hand-formatted.
- All dates via `Intl.DateTimeFormat`.
- `dir="rtl"` supported: layout uses logical properties
  (`inline-start`/`block-end`), not directional ones (`left`/`top`).
- The Blade rail flips to the inline-start edge in RTL.

---

## 11. Performance budget

Strata is built to feel like hardware. Hardware doesn't lag.

### 11.1 Core Web Vitals targets

| Metric | Target (P75) | Hard limit |
|--------|--------------|------------|
| LCP    | < 1.5s       | < 2.5s     |
| INP    | < 100ms      | < 200ms    |
| CLS    | < 0.05       | < 0.1      |

### 11.2 Asset budget

- **Initial JS** (parsed + executed before first paint): ≤ 80KB gzipped.
- **anime.js v4 modular import**: ~12KB gzipped (animate + timeline + stagger + onScroll).
- **Total fonts** (Brotli): ≤ 80KB.
- **Total CSS**: ≤ 32KB gzipped.
- **First-panel hero image** (if any): ≤ 60KB WebP/AVIF.

### 11.3 Animation discipline

- Animate **only** `transform` and `opacity`. Never `width`, `height`, `top`,
  `left`, `margin` on hot paths. (Width/height for the focus reticle is
  exempt — it's one element, rare.)
- `will-change` is applied only to elements *currently animating*, removed
  after. Never blanket-applied.
- `backdrop-filter` is the single most expensive property in this system.
  Budget: 2 surfaces visible per frame.
- The stage has `contain: strict` on each panel:

```css
.st-panel { contain: strict; }
```

This isolates rendering work per panel and is the single biggest perf win
for the snap-scroll architecture.

### 11.4 Image strategy

- Account logos: SVG sprites, single fetch.
- Avatars: `<img loading="lazy" decoding="async">`, served from a CDN with
  AVIF + WebP fallbacks via `<picture>`.
- No background-image where an inline `<img>` would do — backgrounds aren't
  lazy-loaded by browsers.

### 11.5 Font loading

- Self-host. No Google Fonts. No font CDN.
- `font-display: swap` always.
- Preload the body and numerics fonts in `<head>`:

```html
<link rel="preload" href="/fonts/inter-tight-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/geist-mono-var.woff2" as="font" type="font/woff2" crossorigin>
```

---

## 12. Z-index scale

Never freelance z-indices.

```css
:root {
  --st-z-base:         0;
  --st-z-panel:        1;
  --st-z-tile-hover:   10;
  --st-z-nav:          50;
  --st-z-blade:        60;
  --st-z-overlay:      100;     /* focus reticle */
  --st-z-toast:        200;
  --st-z-popover:      300;
  --st-z-modal-scrim:  400;
  --st-z-modal:        410;
  --st-z-cmdk:         500;
  --st-z-tooltip:      600;
}
```

---

## 13. File structure

```
strata/
├── tokens/
│   ├── colors.css          # all --st-canvas / surface / ink / accent / semantic
│   ├── typography.css      # font-face, scale, weights, tracking
│   ├── spacing.css         # space, radii
│   ├── motion.css          # ease, dur, choreography helpers
│   ├── elevation.css       # elev shadows, focus, glows
│   ├── z-index.css         # z scale
│   └── index.css           # @imports all of the above into :root
├── materials/
│   ├── canvas.css
│   ├── mica.css
│   ├── acrylic.css
│   ├── reveal.css          # + reveal.js for cursor tracking
│   ├── smoke.css
│   └── bullion.css
├── components/
│   ├── stage.css           # the scroll viewport + panel
│   ├── tile.css
│   ├── blade.css
│   ├── readout.css
│   ├── trend.css
│   ├── button.css
│   ├── input.css
│   ├── command-bar.css
│   ├── command-palette.css
│   ├── modal.css
│   ├── toast.css
│   ├── skeleton.css
│   └── chart.css
├── motion/
│   ├── strata-motion.js    # anime.js setup, ease constants
│   ├── panel-entrance.js   # IntersectionObserver choreography
│   ├── ticker.js           # number count-up
│   ├── reticle.js          # keyboard focus ring
│   ├── reveal.js           # cursor tracking for L3 material
│   └── sparkline.js        # SVG path draw-in
├── a11y/
│   ├── keyboard.js         # arrow keys, ⌘K, ?, /
│   └── announce.js         # aria-live region for panel changes
├── utils/
│   ├── format.js           # Intl.NumberFormat wrappers
│   └── reduce-motion.js    # the REDUCE flag
└── index.css               # @imports tokens, materials, components
```

---

## 14. Anti-patterns (the "do not" list)

The shortest section. The most important.

1. **Don't use multiple accent colors in one panel.** One accent per panel,
   period. If a panel needs to show three categories, use `--st-viz-N` for the
   categorical scale, not the accents.

2. **Don't animate `width`/`height` for resize transitions.** Use `transform: scale()` and adjust on settle. The one exception is the focus reticle (one element, rare).

3. **Don't put `backdrop-filter` inside a scrolling list.** It composites every frame. Use opaque tints.

4. **Don't truncate a y-axis to "make the chart look better."** This is the lie. Strata charts always show zero.

5. **Don't use loading spinners.** Skeletons reserve layout. Spinners imply you don't know how long it'll take, which on a finance app is alarming.

6. **Don't use red for any non-loss state.** Not for errors that aren't financial losses, not for warnings, not for "delete" confirms (use the destructive button style, which uses oxblood-mute, not full red).

7. **Don't use the Bullion material more than twice on screen.** It loses its
   meaning. The whole point of Bullion is scarcity.

8. **Don't use emoji in numerals.** `📈 $1,234` looks like a Discord bot. The
   trend indicator pattern (§7.5) is the right answer.

9. **Don't animate something just because you can.** "Inevitable motion"
   means: if you remove the animation, the UX should feel broken. If it still
   feels fine, the animation was decoration.

10. **Don't ship without testing keyboard nav and screen reader.** A console-feel
    web app with broken keyboard navigation is a console-feel web app that
    fails 8% of users.

---

## 15. Versioning

This spec is **v1.0**. Breaking changes bump major. Token additions or new
components bump minor. Bug fixes bump patch.

**v1.1 roadmap** (not in scope here):

- Light mode (`[data-theme="light"]` overrides)
- High-contrast mode (`forced-colors`)
- Print stylesheet for statements
- A "Boardroom" density variant (denser spacing for power users)
- Spatial audio cues for snap transitions (Web Audio, opt-in)

---

*Strata — pairs with Quartz. Mineral system. Built quietly.*