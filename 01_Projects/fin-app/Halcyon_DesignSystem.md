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
--color-muted:   #868d95;   /* labels, captions */
--color-faint:   #c0c5cb;   /* inactive numerals, hints */

--color-accent:     #11b596;  /* mint — used sparingly */
--color-accent-ink: #0a7d67;  /* mint that meets contrast on light */

--color-pos:  #149a66;   /* income, gains, healthy */
--color-warn: #cf8a2b;   /* approaching limit */
--color-neg:  #d44a44;   /* over budget, loss */

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
```

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
  --color-muted: #7c8690; --color-faint: #4a525c;
  --color-bar: #0b0e12;       /* darker than the workspace → frame still reads */
  --color-accent: #16c7a4;    /* luminous mint */  --color-accent-ink: #3ad9bd;
  --color-pos: #36cf93;  --color-warn: #d9a23f;  --color-neg: #e0635c;

  --hair: rgba(255,255,255,0.12);     --hair-soft: rgba(255,255,255,0.07);
  --glass-fill: rgba(255,255,255,0.05); --glass-bd: rgba(255,255,255,0.09);
  --accent-wash: rgba(22,199,164,0.16);
  --track: rgba(255,255,255,0.09);    --toast-bg: rgba(28,33,40,0.92);
  --input-bg: rgba(255,255,255,0.06); --switch-off: rgba(255,255,255,0.16);
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

### 8.5 Account / stream row (`AccountRow.tsx`)
Accent bar (3px) + name (600) + type (micro) + balance (tabular; `neg` if negative).

### 8.6 Allocation donut + legend (`AllocationDonut.tsx`, `charts/Donut.tsx`)
SVG donut (stroke 13, rounded caps, `var(--track)` rail, animated dash over ~1s) with a tabular
centre value; legend rows of `dot · label · value`.

### 8.7 Objective ring (`ObjectiveRing.tsx`)
SVG progress ring (rounded cap, animated dashoffset over ~1.2s) with a tabular percentage
centred; value + label beneath.

### 8.8 Charts (`charts/Area.tsx`, `charts/Donut.tsx`)
Hand-built SVG. **Area/line:** animated stroke draw-on, subtle gradient fill, hairline
gridlines, tabular ticks. **Donut:** as above. Palette keys map to tokens
(`accent / pos / warn / neg / blue / gold`). No glow.

### 8.9 Forms (`Controls.tsx`)
Inputs/selects: `var(--input-bg)` fill, `hair` border, rounded, `min-height ~46px`; focus →
`accent` border + `accent-wash` ring. **Chips** for single-select (active = mint wash + accent
border). Min tap target 44px.

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

- **Contrast:** ink on surface is high-contrast in both themes; mint *text* uses `accent-ink`.
  Body text never relies on the raw `accent` for contrast.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` collapses durations; an in-app
  motion toggle additionally gates the scene and decorative motion.
- **Targets:** interactive controls meet a 44px minimum on touch.
- **Semantics:** nav items use `aria-current="page"`; switches are real buttons with
  `aria-checked`; the toast mount is an `aria-live` region.
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
      Controls (Button/Chip/Switch)  Screen (Screen/ViewHeader/Grid)  motion.ts
      charts/ Area  Donut
    views/              Landing Dashboard Accounts Income Expenses Ingestion Settings
    three/              SceneBackground.tsx   (2D canvas lattice + network; misnamed, not WebGL)
    hooks/              useScramble  useCountUp  useChartReveal (anime.js firewall)
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
