---
aliases:
  - Migration Plan
tags:
  - halcyon
  - projects/fin-app
  - finance
type: plan
status: historical
project: Halcyon
up: "[[CONTEXT]]"
related:
  - "[[CONTEXT]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[app/README|App README]]"
---

# Halcyon — Migration Plan

**From** zero-build vanilla HTML/CSS/JS
**To** Vite + React + TypeScript + Tailwind v4 + Framer Motion (+ optional react-three-fiber)

This plan turns the validated [`react-poc/`](react-poc/README.md) slice into a full re-platform. The
**design carries over 1:1** — what changes is the plumbing. The vanilla prototype stays the source of
truth until the React build reaches visual parity, then becomes the reference archive.

---

## 1. Why migrate (recap)

The POC proved the payoff and surfaced the real tradeoffs:

- **Declarative, lifecycle-aware motion** — the `render()/paint()/build()` + `innerHTML` + manual
  `gsap.globalTimeline.progress(1)` flushing is replaced by `AnimatePresence` + variants.
- **Shared-element transitions** — the card→net-worth-tile morph (`layoutId`) is impractical in vanilla,
  trivial here. This alone is the creative unlock the user signed off on.
- **Tokens as a system** — the design language becomes a Tailwind `@theme` config instead of living in a
  1,400-line stylesheet and in my head.
- **Build hygiene** — Vite HMR + hashed assets delete the `?v=N` cache-busting and the
  `setTimeout(launch, 2700)` boot safety-net hacks.
- **Free path to dark mode** (Tailwind `dark:`) — relevant given Halcyon's dark-HUD lineage.

**Non-goals:** no backend, no real data, no auth, no SSR. This stays a static, single-user, client-only
concept app deployable to any static host (`vite build` → `dist/`).

---

## 2. Target stack

| Concern | Choice | Notes |
|---|---|---|
| Build/dev | **Vite 6** | HMR, hashed assets, `dist/` static output |
| Language | **TypeScript 5** (strict) | types for data model + component props |
| UI | **React 18** | (18 over 19 for max ecosystem stability; trivial to bump later) |
| Styling | **Tailwind v4** (`@tailwindcss/vite`, CSS-first `@theme`) | tokens encoded once |
| Motion | **Framer Motion 11** | `motion`, `AnimatePresence`, `layout`/`layoutId`, variants, `useMotionValue`, `useScroll` |
| 3D | **Three.js r128** wrapped imperatively → *optionally* **react-three-fiber** later | preserve the tuned look first |
| Lint/format | ESLint + Prettier | optional but recommended |

**Routing:** a lightweight **state-based router** (a `view` state + context), **not** react-router.
Halcyon's transitions are bespoke shared-layout choreography; an off-the-shelf router's outlet fights the
`layoutId` morph. Optionally sync `view` to `location.hash` for deep-linking later.

---

## 3. File → module mapping

| Vanilla | Becomes | Strategy |
|---|---|---|
| `index.html` (shell) | `index.html` (Vite entry) + `App.tsx` + `Shell.tsx` | shell becomes components |
| `styles.css` (~1,400 lines) | `src/index.css` `@theme` + Tailwind utilities per component | tokens → config; rules → className |
| `data.js` | `src/data.ts` (typed) | add interfaces for the dataset |
| `background.js` (Three.js scene) | `src/three/SceneBackground.tsx` | imperative `useRef`+`useEffect` wrapper |
| `card3d.js` (Three.js card) | `src/three/HeroCard3D.tsx` | imperative wrapper (or R3F later) |
| `charts.js` (SVG) | `src/components/charts/{Area,Donut,Spark}.tsx` | pure SVG → JSX, animate with FM |
| `app.js` (boot, router, views, scramble, toast) | `src/App.tsx`, `src/views/*`, `src/hooks/*`, `src/components/*` | split by responsibility |

### Target folder structure
```
src/
  main.tsx
  App.tsx                 ← router state + AnimatePresence
  index.css               ← Tailwind @theme tokens + base
  data.ts                 ← typed mock dataset
  router.tsx              ← View type, ViewContext, useView()
  components/
    Shell.tsx  TopBar.tsx  IndexRail.tsx  StatusBar.tsx  Boot.tsx
    GlassTile.tsx  StatBlock.tsx  CapacityMeter.tsx  Ledger.tsx
    AccountRow.tsx  AllocationDonut.tsx  ObjectiveRing.tsx
    Chip.tsx  Button.tsx  Switch.tsx  MilestoneToast.tsx
    charts/ Area.tsx  Donut.tsx  Spark.tsx
  views/
    Landing.tsx  Dashboard.tsx  Accounts.tsx  Income.tsx
    Expenses.tsx  Ingestion.tsx  Settings.tsx
  three/
    SceneBackground.tsx   HeroCard3D.tsx
  hooks/
    useScramble.ts  useCountUp.ts  useView.ts
```

---

## 4. Design tokens → Tailwind `@theme`

Encode the full token set once (POC already did the core). Mapping:

| CSS var (vanilla) | Tailwind `@theme` | Utility |
|---|---|---|
| `--surface #eceef1` | `--color-surface` | `bg-surface` |
| `--ink #15181c` | `--color-ink` | `text-ink` |
| `--ink-2` | `--color-ink2` | `text-ink2` |
| `--muted` / `--faint` | `--color-muted` / `--color-faint` | … |
| `--accent #11b596` | `--color-accent` | `bg-accent` |
| `--accent-ink` / `--accent-wash` | `--color-accent-ink` / arbitrary | `text-accent-ink` |
| `--pos/--warn/--neg` | `--color-pos/warn/neg` | semantic |
| `--bar #0b0d11` (+ `--bar-*`) | `--color-bar` (+ keep `--bar-*` raw) | `bg-bar` |
| glass fill/shadow | `--shadow-glass` | `shadow-glass` |
| `--hair/--hair-soft` | raw vars (for borders) | `border-[…]` |
| `--font-display/body` | `--font-display/body` | `font-display` |
| `--ease` | `--ease-halcyon` | transitions |

**Policy — animated colors:** Tailwind v4 emits `oklab`/`oklch`, which **Framer Motion cannot
interpolate**. Any color that animates in a variant must be authored as `rgba()`/hex in the variant
object, never a Tailwind color utility. (Discovered on the scroll-cue ring in the POC.)

---

## 5. Component inventory (parity targets)

Mostly straight ports of the documented design-system components:

- **Shell:** `TopBar` (letterbox), `IndexRail` (number + scramble label + spring `layoutId` indicator),
  `StatusBar` (letterbox strip), `Boot` (init sequence).
- **Data:** `GlassTile`, `StatBlock`, `CapacityMeter` (single bar, status color), `Ledger`,
  `AccountRow`, `AllocationDonut`, `ObjectiveRing`.
- **Charts (SVG → JSX):** `Area` (animated stroke draw-on via `pathLength`), `Donut`, `Spark`.
- **Controls:** `Button`, `Chip`, `Switch`, `MilestoneToast`.
- **3D:** `SceneBackground`, `HeroCard3D`.
- **Hero (morph):** `HeroCard` DOM element carrying `layoutId="hero"` (landing card ↔ net-worth tile).

---

## 6. Motion migration (GSAP → Framer Motion)

| Moment (vanilla) | Framer Motion replacement |
|---|---|
| `boot()` count + scramble + safety-net timeout | `<Boot>` with `useCountUp` + `useScramble`; unmount on `ready` state via `AnimatePresence`. The rAF safety-net hack is gone — exit is lifecycle-driven. |
| `scramble(el, text)` | `useScramble(text, active)` hook → drives rail labels + boot status |
| `render/paint/build` + `instant` flag | `<AnimatePresence mode="sync">` over the `view` switch |
| view transition | per-view `motion.div` (`absolute inset-0`, `exit` fade) + the `layoutId` hero morph |
| tile stagger build | parent `variants` with `staggerChildren` |
| counter count-ups | `useCountUp` (`useMotionValue` + `animate` + `useTransform`) |
| meter fill / objective ring | `motion.div` width / `motion.circle` `pathLength` with spring |
| 3D card drag/idle | stays in Three.js (imperative) — see §7 |
| milestone toast | `<AnimatePresence>` + spring slide |
| letterbox reveal (new) | `TopBar`/`StatusBar` spring-in on mount |
| **card → tile morph (new)** | shared `layoutId="hero"` — **requires `AnimatePresence`**, views overlaid `absolute` |

**Reduced motion:** replace the manual `data-motion` gating with `useReducedMotion()` + the in-app toggle
feeding a `MotionConfig`/context that zeroes transitions.

---

## 7. The Three.js question (the one real decision)

Two paths for `background.js` + `card3d.js`:

- **A — Imperative wrappers (recommended first).** Port each almost verbatim into a component:
  `useRef` for the canvas, `useEffect(() => { init(); return () => destroy() }, [])`, and expose
  `shift(view)` via context. **Preserves the exact tuned visuals** (the matte clear-coat card, the colour
  fields, the per-view `lookAt` lift) with minimal risk. **Guard against React StrictMode double-mount**
  (it double-invokes effects in dev → two WebGL contexts on one canvas): either disable StrictMode or add
  an init guard.
- **B — react-three-fiber (later).** Declarative `<Canvas>`; camera/card animate with `framer-motion-3d`
  springs — the `lookAt` lift and card drag become the same spring vocabulary as the DOM. More idiomatic,
  but a rewrite of working 3D. Defer to a Phase 5.

**The morph caveat:** a `<canvas>` can't participate in a DOM `layoutId` morph. Options for the
landing→dashboard card:
1. **DOM hero morphs, canvas cross-fades** *(POC approach, recommended)* — the morphing hero is a styled
   DOM card (`layoutId="hero"`); the Three.js card fades out behind it on exit. Best of both: real 3D on
   the landing, real morph into the tile.
2. Accept a non-morph transition for the 3D card (lift-off, as today).

---

## 8. Phased rollout

Each phase is independently runnable and visually verifiable against the vanilla app.

### Phase 0 — Foundation  *(~0.5–1 day)*
Promote `react-poc/` (or scaffold `app/`). Port the **full** token set into `@theme`. Stand up the Shell
(letterbox bars + rail + status) with no views. **Done when:** empty framed shell renders, bars spring in.

### Phase 1 — Static views  *(~2–3 days)*
Type and port `data.ts`. Build all parity components (§5) and the SVG charts. Assemble all **7 views** as
static React (instant rail switching, no transitions yet). **Done when:** every view matches the vanilla
layout side-by-side.

### Phase 2 — Motion layer  *(~2–3 days)*
Add Framer Motion across the board (§6): `AnimatePresence` routing, the **hero card→tile morph**, tile
stagger, `useScramble` rail + boot, count-ups, meter/ring springs, toast, letterbox reveal, boot sequence.
**Done when:** motion parity + the new morph, no `oklab`/AnimatePresence pitfalls.

### Phase 3 — 3D integration  *(~1–2 days)*
Port `SceneBackground` and `HeroCard3D` as imperative wrappers (§7A); wire `shift(view)` via context;
resolve the card-morph handoff (§7, option 1). **Done when:** full visual parity including the 3D scene.

### Phase 4 — Polish & a11y  *(~1–2 days)*
Responsive breakpoints, `useReducedMotion` + motion toggle, Settings (accent retint via CSS var, switches),
focus states, `aria` on rail/switches/toast, keyboard nav. **Done when:** accessibility + responsive parity.

### Phase 5 — Creative upgrades (optional, post-parity)
The reason we migrated — see §9.

**Total to parity (Phases 0–4): ~7–11 focused days.**

---

## 9. Creative upgrades unlocked (Phase 5 backlog)

What the framework makes newly cheap:

- **Scroll-scrub landing → dashboard** (`useScroll` + `useTransform`) — the long-open thread: card recedes,
  welcome fades, tiles assemble tied to scroll, fully interruptible.
- **Hero card→tile morph** ✓ (POC) — promote to production.
- **Shared-layout rail** — active mint line springs between items (`layoutId`, already in POC).
- **Gestural 3D card** — drag with momentum/inertia; spring-settle.
- **Magnetic / spring CTAs**, **scroll-reveal** on long ledgers, **drag-to-reorder** dashboard tiles.
- **Dark mode** — Tailwind `dark:` over the existing tokens; the cinematic bars imply it'd be striking.
- **Per-view scene choreography** — the `lookAt` lift becomes a spring; bespoke camera moves per route.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `oklab` colors break animated FM colors | Policy §4: animated colors as `rgba`/hex in variants |
| `layoutId` morph jumps | Always wrap view swap in `AnimatePresence`, overlay views `absolute` (§6) |
| StrictMode → double WebGL context | Disable StrictMode or guard 3D init (§7A) |
| Visual drift from the tuned vanilla look | Side-by-side screenshot parity each phase; port CSS values exactly |
| Scope creep into creative work pre-parity | Phases 0–4 are parity-only; creativity is Phase 5 |
| Bundle size (React+FM+Three) | Fine for a concept app; code-split the 3D + route chunks if needed |

---

## 11. Verification

Per phase: run the Vite dev server and screenshot each view **side-by-side against the vanilla app on
:8772**. Parity is a visual-diff judgment, not a test suite (this is a design prototype). Keep the vanilla
build alive until Phase 4 signs off, then archive it as reference.

---

## 12. Decisions needed before Phase 0

1. **Location** — promote `react-poc/` in place, or a fresh `app/` (vanilla kept as sibling)? *(Recommend: fresh `app/`, archive vanilla.)*
2. **Router** — state-based *(recommended)* vs react-router.
3. **3D** — imperative-first *(recommended)* vs react-three-fiber now.
4. **Card transition** — DOM-card morph + canvas cross-fade *(recommended)* vs keep 3D lift-off.
5. **React 18 vs 19**, **StrictMode on/off** (off simplifies 3D).
6. **Deploy target** — any static host (Vercel/Netlify/GH Pages); `vite build` output.

---

## 13. Open doc debt (carried from the vanilla app)

`Halcyon_DesignSystem.md` §6 still documents the old light header (pre-letterbox). Fold the dark
letterbox + status strip + `--bar-*` tokens into the spec as part of Phase 0 so the React build ports from
an accurate source.
