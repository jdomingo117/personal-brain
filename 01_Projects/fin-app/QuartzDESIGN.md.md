---
tags:
  - Project
  - finance
  - projects/fin-app/project-doc
---
# Quartz — A Design System

> Industrial monochrome meets refractive depth.
> Nothing's restraint, Apple's material.

**Version:** 1.0
**Status:** Specification
**Scope:** Web app (responsive), mobile-first

---

## 1. Thesis

Two design languages, one substrate.

**Nothing OS** is monochrome, typographic, and structural. Color is an event, not a default. The grid is exposed. Type does the work. Dot-matrix iconography references early industrial computing (IBM mainframe era, 1980s) — technology that felt deliberate and human-scale.

**Liquid Glass** is Apple's 2025 material system — a translucent layer that refracts, reflects, and lenses surrounding content. It floats. It responds. It is designed to let content lead and controls recede.

These are usually presented as opposites. They are not. They are complements, and the seam between them solves both of their biggest flaws:

| Liquid Glass weakness (well-documented) | Nothing's contribution |
|---|---|
| Contrast drops below WCAG AA when stacked over busy/colorful content | Monochrome canvas — there is no colorful content to refract |
| Translucent panes create visual noise when overused | Three-layer hierarchy enforces one primary glass per view |
| Layered glass on glass produces "frosted soup" | Type-first hierarchy means glass is structural, not decorative |
| GPU cost is real on low-end devices | Restrained use means fallback to flat tinted surface is graceful |

| Nothing weakness | Liquid Glass's contribution |
|---|---|
| Pure monochrome can feel inert, flat, datasheet-like | Specular edges and live refraction give surfaces life without color |
| Sharp edges and dot-matrix can read as "retro gimmick" | Concentric radii and fluid morph state make it feel current |
| Static UI lacks tactile feedback | Press states with lensing feel physical |

The combined system is called **Quartz**. Quartz is crystalline, monochrome, used in precision instruments (watches, oscillators), and refracts light without color. The name does the work the system does.

---

## 2. First Principles

These are non-negotiable. Every token, component, and pattern in this document descends from these.

1. **Monochrome is the canvas. Color is signal.** Red is the only accent, reserved for live/critical/destructive states. Any other color in the UI is data, not chrome.
2. **One glass surface per view.** Apple's own HIG. Stacking glass kills hierarchy and torches GPUs. If you need two, one is wrong.
3. **The dot grid is the substrate, not a decoration.** It lives behind everything at low opacity. Glass refracts the dots, not arbitrary imagery — this is what keeps contrast WCAG-compliant.
4. **Type does the hierarchy.** Three layers — Display, Body, Metadata — established by scale and weight, not color or borders.
5. **Concentricity.** Inner radii nest inside outer radii at consistent offsets. Glass corners match container corners match viewport corners. This is the discipline that separates this system from generic glassmorphism.
6. **Motion is functional, not ornamental.** Tab bars shrink on scroll. Glass thickens on press. Nothing moves "to be delightful."
7. **Reduce-transparency is a first-class mode**, not an afterthought. Every glass component has a tokenised flat fallback bound to `prefers-reduced-transparency` and an in-app toggle.

---

## 3. Design Tokens

All tokens are CSS custom properties. Dark mode (OLED black) is the default; light mode is fully designed, not derived.

### 3.1 Colour

```css
:root {
  /* — Surface (monochrome canvas) — */
  --canvas:            #000000;   /* True OLED black */
  --surface-1:         #0A0A0A;   /* Raised, e.g. cards */
  --surface-2:         #141414;   /* Modal/sheet base before glass */
  --surface-3:         #1F1F1F;   /* Press states, dividers */

  /* — Ink (text + iconography) — */
  --ink-primary:       #FAFAFA;   /* Display + primary body */
  --ink-secondary:     #A8A8A8;   /* Secondary body */
  --ink-tertiary:      #6E6E6E;   /* Metadata, captions */
  --ink-disabled:      #3A3A3A;

  /* — Glass tint backplates (see §3.4) — */
  --glass-tint:        rgba(20, 20, 20, 0.55);  /* Dark mode glass backplate */
  --glass-edge:        rgba(255, 255, 255, 0.10);
  --glass-specular:    rgba(255, 255, 255, 0.18);

  /* — Signal (the only colour in the system) — */
  --signal-red:        #FF3B30;   /* Live, critical, destructive */
  --signal-red-dim:    #B3291F;   /* Pressed/visited red */

  /* — Data encoding palette (charts only — NOT chrome) — */
  --data-1:            #FAFAFA;
  --data-2:            #A8A8A8;
  --data-3:            #6E6E6E;
  --data-4:            #3A3A3A;
  --data-accent:       var(--signal-red);
}

@media (prefers-color-scheme: light) {
  :root {
    --canvas:          #F5F4F0;   /* Warm off-white, not pure white */
    --surface-1:       #ECEBE6;
    --surface-2:       #E2E1DC;
    --surface-3:       #D6D5D0;
    --ink-primary:     #0A0A0A;
    --ink-secondary:   #4A4A4A;
    --ink-tertiary:    #7A7A7A;
    --ink-disabled:    #B8B8B8;
    --glass-tint:      rgba(245, 244, 240, 0.55);
    --glass-edge:      rgba(0, 0, 0, 0.08);
    --glass-specular:  rgba(255, 255, 255, 0.40);
  }
}
```

**Rationale on the warm white:** Pure `#FFFFFF` against a true black dark mode creates whiplash when users switch modes and reads as clinical. A 4–6% warm shift (toward IBM mainframe paper, deliberate) reads as the same product, just rotated. This is taken from Nothing's own light-mode treatment.

### 3.2 Typography

Nothing's proprietary fonts (NDot 57, NType 82) are not licensable for general use. Quartz uses high-fidelity open-source surrogates:

- **Display + numeric**: `JetBrains Mono` (monospaced, technical, dot-matrix DNA in its geometric construction). Fall back to system monospace.
- **Body + UI**: `Inter Tight` (industrial sans, optimised for screens, supports tabular numerals and the technical aesthetic Nothing's NType 82 chases).

```css
:root {
  --font-display: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --font-body:    'Inter Tight', -apple-system, system-ui, sans-serif;

  /* Type scale — strict three-tier hierarchy */
  --type-display-lg:  clamp(2.5rem, 4vw + 1rem, 4.5rem);   /* 40–72px */
  --type-display-md:  clamp(1.75rem, 2vw + 1rem, 2.5rem);  /* 28–40px */
  --type-body-lg:     1.125rem;   /* 18px */
  --type-body:        1rem;       /* 16px */
  --type-body-sm:     0.875rem;   /* 14px */
  --type-meta:        0.75rem;    /* 12px */
  --type-micro:       0.6875rem;  /* 11px — uppercase labels */

  /* Line heights */
  --leading-display: 1.05;
  --leading-body:    1.5;
  --leading-meta:    1.3;

  /* Letter spacing */
  --tracking-display: -0.02em;
  --tracking-body:    0;
  --tracking-meta:    0.08em;    /* Uppercase labels */
}
```

**Three-tier hierarchy rule (from Nothing):** Every screen has exactly three importance layers — *Display*, *Body*, *Metadata*. Not two, not five. Squint test: if you can't tell what's most important at a squint, two things are competing — shrink, fade, or reflow one of them.

**Numerals are always tabular.** Use `font-variant-numeric: tabular-nums`. This is a hill to die on — drifting digits in a dashboard make data unreadable.

### 3.3 Spacing, Grid, Radii

Built on an 8-point grid with a 4-point sub-grid for tight UI work.

```css
:root {
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   24px;
  --space-6:   32px;
  --space-7:   48px;
  --space-8:   64px;

  /* Concentric radii — each step nests inside the next with consistent gap */
  --radius-xs:  6px;     /* Chips, tags */
  --radius-sm:  10px;    /* Inputs, buttons */
  --radius-md:  16px;    /* Cards */
  --radius-lg:  22px;    /* Glass panels, sheets */
  --radius-xl:  28px;    /* Full-screen modal containers */
  --radius-pill: 9999px; /* Pills, segmented controls */
}
```

**Concentricity rule:** When nesting a component inside another, the inner radius equals the outer radius minus the gap. A 16px card with 8px padding around an input → input radius is 16 − 8 = 8 → use `--radius-sm` (10px, close enough; round up for visual ease). Apple's HIG calls this rhythm; Nothing calls it "structure is ornament." Same idea.

### 3.4 The Dot Grid Substrate

This is the system's signature and the thing that makes the glass work.

```css
.canvas {
  background: var(--canvas);
  background-image:
    radial-gradient(circle, var(--ink-tertiary) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: 0 0;
  /* Critical: low opacity layer to keep dots faint */
  background-blend-mode: normal;
  position: relative;
}

.canvas::before {
  content: "";
  position: absolute; inset: 0;
  background: var(--canvas);
  opacity: 0.92;        /* Dots bleed through at ~8% */
  pointer-events: none;
}
```

Why this matters: when a Liquid Glass surface refracts what's behind it, it needs *something* to refract or it looks like flat opacity. A faint dot grid gives glass real texture to bend without introducing colour noise that would destroy contrast. **This is the seam where the two design languages weld together.**

### 3.5 Glass — The Material

The single most important component. Read this section twice.

```css
:root {
  /* Glass elevation system — pick ONE level per view */
  --glass-blur-sm:  16px;   /* Chips, pills, inline controls */
  --glass-blur-md:  28px;   /* Nav bars, toolbars */
  --glass-blur-lg:  44px;   /* Sheets, modals, command palette */

  --glass-saturation: 180%; /* Slight saturation boost — adds life */
  --glass-shadow-md:
    0 4px 16px rgba(0, 0, 0, 0.32),
    0 1px 2px rgba(0, 0, 0, 0.24);
  --glass-shadow-lg:
    0 16px 48px rgba(0, 0, 0, 0.45),
    0 2px 4px rgba(0, 0, 0, 0.32);
}

.glass {
  /* The tinted backplate — non-negotiable. This is what guarantees WCAG. */
  background: var(--glass-tint);

  /* Refraction */
  backdrop-filter: blur(var(--glass-blur-md)) saturate(var(--glass-saturation));
  -webkit-backdrop-filter: blur(var(--glass-blur-md)) saturate(var(--glass-saturation));

  /* Edge — the specular hairline that gives glass its "edge lit" quality */
  border: 1px solid var(--glass-edge);
  border-radius: var(--radius-lg);

  /* Depth */
  box-shadow: var(--glass-shadow-md);
  position: relative;
  isolation: isolate;
}

/* Specular highlight — single subtle gradient on the top edge */
.glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    var(--glass-specular) 0%,
    transparent 30%,
    transparent 100%
  );
  opacity: 0.6;
  pointer-events: none;
  mix-blend-mode: plus-lighter; /* Apple's own technique for specular */
}

/* Reduce-transparency fallback */
@media (prefers-reduced-transparency: reduce) {
  .glass {
    background: var(--surface-2);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .glass::before { display: none; }
}
```

**Why the tinted backplate is non-negotiable:** Research consistently shows pure `backdrop-filter: blur()` over arbitrary content falls below the 4.5:1 WCAG contrast minimum. The 55% opacity tinted backplate enforces a deterministic minimum contrast against *any* background. You sacrifice ~20% of the "see-through" effect; you gain readable text everywhere. This is the right trade. The community fix proposed in the Liquid Glass criticism literature (a "Thin/Regular/Thick" material tier) is essentially this same idea.

### 3.6 Motion

```css
:root {
  /* Easing — physics-leaning, not ornamental */
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);     /* Decisive exits */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* Glass morph (mild overshoot) */
  --ease-glass:  cubic-bezier(0.4, 0, 0.2, 1);      /* Tab bar shrink/expand */

  /* Durations */
  --dur-instant: 80ms;
  --dur-fast:    160ms;
  --dur-normal:  240ms;
  --dur-slow:    400ms;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Three motion patterns, all functional:

1. **Scroll-responsive nav** — top app bar shrinks (`--dur-normal`, `--ease-glass`) when content scrolls, reclaiming vertical space. Lifted directly from Liquid Glass.
2. **Press lensing** — glass thickens (`backdrop-filter: blur(44px)`) and slightly scales (`scale: 0.98`) on press, `--dur-instant`. The tactile feedback Nothing's flat UI lacks.
3. **Status pulse** — `--signal-red` elements pulse opacity 0.6 → 1.0 on a 1.6s cycle when live. The Glyph DNA, distilled.

Nothing else moves. No parallax. No hover wobble. No "delight" animations.

---

## 4. Components

### 4.1 Tab Bar / Top Navigation

A single piece of glass that floats above content. Shrinks on scroll, expands on scroll-up. Tab labels use `--type-meta` uppercase with `--tracking-meta`. Active state is a pill-shaped glass-on-glass element — except this is the **one permitted exception** to the single-glass rule, because the parent bar uses no backdrop and only the active indicator does.

### 4.2 Cards

Solid `--surface-1` on the dot canvas. **Cards do not use glass** by default — glass is reserved for floating/transient surfaces. A grid of glass cards is the most common failure mode in glassmorphism systems. Cards are flat, calm, structured. Glass is for the *one* element drawing attention.

### 4.3 Buttons

Three variants, three only:

- **Primary** — solid `--ink-primary` background, `--canvas` text. `--radius-sm`.
- **Secondary** — `1px solid var(--ink-tertiary)`, transparent fill, `--ink-primary` text.
- **Glass** — `.glass` modifier, used only in floating contexts (over imagery, over the dot canvas in hero areas, inside sheets).

Destructive actions inherit `--signal-red` as text/border only — never as fill. Red fill is reserved for "live" status badges.

### 4.4 Segmented Controls

A Nothing signature. A pill-shaped container with hairline dividers, the active segment lifted with a tinted glass indicator that slides between positions on `--ease-spring`. The slide *is* the affordance — no fade.

### 4.5 Data Visualisation

The system extends naturally to dashboards (which matters for Power BI / analytics work):

- Charts use the **monochrome data ramp** (`--data-1` through `--data-4`), with `--signal-red` reserved for the single most important series or threshold breach.
- Gridlines: `--ink-tertiary` at 0.15 opacity.
- Tick labels: `--font-display`, `--type-meta`, `--tracking-meta`, uppercase.
- Series labels: `--font-body`, `--type-body-sm`.
- **No legend boxes.** Direct-label the lines. Saves a layer, kills a layer of cognitive overhead.
- Hover/focus tooltips are glass (one of the few legitimate glass uses in a dashboard).

### 4.6 Icons

Outline icons only, stroke width 1.5px, 24px grid. No filled icons except for status indicators (filled red circle = live). The whole system shares one stroke discipline. Lucide is the recommended off-the-shelf set.

---

## 5. Anti-Patterns

These are the things that look like the system but break it. If you catch yourself doing any of these, stop.

1. **Glass on glass on glass.** One per view. The active-segment exception in §4.1 is the only legitimate exception, and it's an indicator, not a surface.
2. **Glass over photographs.** This is the documented WCAG failure mode. If you must, increase the tinted backplate to 75% opacity and you've effectively built a flat tinted card with a faint blur — fine, but call it that.
3. **Coloured glass tints.** No blue glass, no purple glass. The tint backplate is canvas-coloured. The accent is red, and red appears as content (text, indicators), never as material.
4. **Bullet-point UI.** If your screen has more than three bullet lists, you've failed the three-layer hierarchy.
5. **Hover animations on non-interactive elements.** Card hover-lift is a tell of a generic design system. Quartz doesn't do it.
6. **Drop shadows under flat cards.** Cards sit on the canvas. The dot grid is the depth. Shadows belong to glass.
7. **Replacing the dot grid with a different texture.** The grid is the substrate that makes the glass legible. Swapping it for a gradient or a noise texture breaks the contrast guarantee.
8. **More than one red.** `--signal-red` and `--signal-red-dim`. That's the system. Adding orange or amber for warning is a tempting Stack Overflow move — don't.

---

## 6. Accessibility — Hard Rules

These are not guidelines. They are gates.

1. **Contrast** — every text/background pair must hit WCAG 2.2 AA (4.5:1 for body, 3:1 for large text). The tinted-backplate glass system is designed so this holds across any underlying content; verify per-component with Stark or axe.
2. **`prefers-reduced-transparency`** — every glass surface ships with a flat fallback. Tested.
3. **`prefers-reduced-motion`** — all transitions collapse to 0.01ms. The scroll-responsive nav still functions, just instantly.
4. **Focus states** — 2px outline in `--ink-primary` (dark mode) or `--canvas` inverse, offset 2px. Never rely on glass press states alone for keyboard focus.
5. **Touch targets** — 44 × 44px minimum (Apple HIG) for any interactive element. Pills and segmented controls cheat this with invisible padding hitboxes — fine.
6. **Tabular numerals** — enforced on all numeric data display.
7. **Colour-blind safety** — never encode information in red alone. Red always pairs with an icon (filled circle, exclamation, etc.) or label.

---

## 7. Implementation Notes

- **Browser support:** `backdrop-filter` is universally supported in evergreen browsers as of 2025. The `@supports` query for `(backdrop-filter: blur(1px))` should gate the glass effect with a graceful degradation to the flat fallback.
- **Performance budget:** maximum 2 elements with active `backdrop-filter` on screen at any time. Profile on a mid-range Android device, not your MacBook Pro.
- **Dark mode is the default.** Light mode is fully designed, not an inversion. Both ship; the user picks; the system respects `prefers-color-scheme`.
- **Fonts:** Self-host `JetBrains Mono` and `Inter Tight` (both SIL Open Font License). No Google Fonts CDN — the FOUT/CLS cost violates the discipline.
- **The dot grid is the body background**, applied at the `<body>` level, not per-component. This guarantees consistency and lets glass refract correctly regardless of which view is mounted.

---

## 8. The Test

If you can answer yes to all of these on any given screen, you've stayed in the system:

- [ ] Is there exactly one piece of glass on this screen?
- [ ] Can I name the three hierarchy layers without thinking?
- [ ] Is the only colour either ink, the dot grid, or red?
- [ ] Do the radii nest concentrically?
- [ ] Does the layout still work with `prefers-reduced-transparency` on?
- [ ] Is every number set in tabular figures?
- [ ] If I squint, do I know what to look at first?

Anything else is decoration, and decoration is what this system exists to avoid.