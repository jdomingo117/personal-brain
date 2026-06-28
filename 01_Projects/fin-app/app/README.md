---
aliases:
  - Halcyon App
  - App README
tags:
  - halcyon
  - projects/fin-app
  - finance
type: readme
status: current
project: Halcyon
up: "[[CONTEXT]]"
related:
  - "[[MIGRATION_PLAN]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[CONTEXT]]"
---

# Halcyon — App (React re-platform)

The production re-platform of Halcyon onto **Vite 6 · React 18 · TypeScript · Tailwind v4
(CSS-first `@theme`) · Framer Motion 11 · anime.js 3**, following
[`../MIGRATION_PLAN.md`](../MIGRATION_PLAN.md). This is the **shipping product**; everything is
here to hand off and reproduce.

> **Two animation libraries, strict boundary:** Framer Motion owns layout / view morph / tile
> entrance; anime.js owns **chart internals only** (SVG draw-on + counters), wired through the
> `src/hooks/useChartReveal.ts` firewall (scoped, motion-aware, self-cleaning). No element is
> animated by both.

Self-contained and portable — copy this directory anywhere and it runs.

> **Design system:** the human-readable spec is [`../Halcyon_DesignSystem.md`](../Halcyon_DesignSystem.md).
> The **machine source of truth for every token** (light + dark) is [`src/index.css`](src/index.css)
> — change a token there and it propagates across both themes.
>
> (`three` is listed in `package.json` but is **unused** — the ambient scene is a pure 2D canvas.
> It's safe to remove.)

## Run

```bash
cd app
npm install         # requires Node 20+
npm run dev         # → http://localhost:5300  (strict port)
npm run build       # → dist/  (static; deploy to any host)
npm run preview     # serve the production build locally
```

Fonts load from Google Fonts (Archivo + Hanken Grotesk) via `index.html`; no other external
assets. The app starts in **light mode** on first visit; the theme choice is **persisted in `localStorage`** (under the `halcyon-theme` key) and restored on return (toggled from Settings → Dark mode or the floating ThemeToggle button). (Also wired into the preview tooling as the `halcyon-app` launch config.)

## Status vs the plan

| Phase | Scope | State |
|---|---|---|
| 0 Foundation | scaffold, full token `@theme`, shell (letterbox bars + scramble rail + status), boot | ✅ |
| 1 Static views | typed `data.ts`, all 7 views, glass tiles, SVG charts, ledger, donut, rings, meters | ✅ |
| 2 Motion | AnimatePresence routing, **card→tile morph**, tile stagger, scramble, count-ups, toast, letterbox reveal, boot | ✅ |
| 3 3D | `SceneBackground` ported imperatively; hero card is an interactive 3D-tilt DOM card | ✅ scene + tilt card |
| 4 Polish | responsive (desktop/tablet/mobile), reduced-motion, motion toggle, accent retint, redact, `aria-current`, gear icon | ✅ |

### The hero card decision
The landing card is a **DOM card with pointer-parallax 3D tilt + idle float** (Framer Motion
motion-values), *not* a Three.js mesh. Two reasons: (1) only a DOM element can do the `layoutId`
morph into the net-worth tile, and (2) the user found the literal Three.js card "too 3D / fake"
during the vanilla phase. The tilt card keeps the tactile premium feel, the morph, and their taste.
Porting `card3d.js` and cross-fading it remains an *option*, not a requirement.

### Phase 5 — creative (in progress)
- ✅ **Diamond lattice × living network** (`three/SceneBackground.tsx`, now a 2D canvas) — a
  Halo Reach–style diamond grid (architecture) with a slow, sparse drifting node network on top,
  an **occasional mint pulse** that sweeps the diamonds, cursor interaction (nearby nodes/cells
  brighten mint), mouse + per-view parallax. The ambient mint/azure/gold colour wash sits behind
  it as CSS (`.scene-wash`). Chosen after a 6-option showcase, then a 3-way lattice×network
  showcase. (Note: `three` is now an unused dependency — removable.)
- ✅ **Cursor-parallax depth** on the landing (copy and card move on opposing layers).
- ✅ **Wheel-to-advance** — scrolling down on the landing triggers the morph to the dashboard;
  the scroll cue bobs.
- ✅ **Dark mode — "Slate + luminous"** — a warm-charcoal workspace with the bars kept *darker*
  than it (so the letterbox frame still reads), dark frosted glass, and a brighter/glowing
  lattice + colour wash for the Halo-HUD feel. Implemented as a `.dark` token swap on `<html>`
  (most of the app flips for free) + a handful of var-ised hardcoded spots (glass border,
  meter/ring/donut tracks, toast, inputs, switch, primary button, scroll-cue, profile avatar)
  + a theme-aware scene. Wired to a **Settings → Dark mode** toggle *and* a floating ThemeToggle (starts light;
  persists in `localStorage` under `halcyon-theme`). The hero card uses the shared `.glass` so it adapts too.
- ⏳ Remaining: gesture drag-spin on the card, scroll-scrubbed (not just triggered) landing.

## Architecture

```
src/
  main.tsx            no StrictMode (avoids double WebGL context)
  App.tsx             boot gate · view state · dark state · toast · AnimatePresence
  router.tsx          View type, NAV, ViewContext / useView
  data.ts             typed mock dataset + formatters
  index.css           Tailwind v4 @theme tokens + .glass / .micro + base
  components/
    Shell  Boot  Tile  Stat  CapacityMeter  Ledger  AccountRow
    AllocationDonut  ObjectiveRing  HeroCard  MilestoneToast  ThemeToggle
    Controls (Button/Chip/Select/DateInput/MultiSelect/DateRangePicker/Switch)
    SegmentedTabs  Screen (Screen/ViewHeader/Grid)  motion.ts
    charts/ Area  Bar  Donut
  views/              Landing Dashboard Accounts Income Expenses Ingestion Settings
  three/              SceneBackground.tsx
  hooks/              useScramble  useCountUp  useChartReveal (anime.js firewall)
```

## Key patterns (and the gotchas they encode)

- **Shared-element morph** (`HeroCard`, `layoutId="hero"`) bridged by `<AnimatePresence mode="sync">`
  in `App.tsx`; views are `absolute inset-0` so the morph doesn't cause layout shift.
- **Animated colors are `rgba`/hex**, never Tailwind utilities — Tailwind v4 emits `oklab`, which
  Framer Motion can't interpolate.
- **Boot has a `setTimeout` safety net** — FM's rAF pauses on backgrounded tabs, so the boot tween
  is never the only path forward (same lesson as the vanilla build, kept).
- **Scene is imperative** (`useRef` + `useEffect` init/cleanup) with a double-mount guard.
- **Accent retint** works live because Tailwind v4 utilities reference `var(--color-accent)` — the
  Settings swatch just sets that CSS variable.
