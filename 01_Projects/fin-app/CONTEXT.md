---
aliases:
  - Halcyon Context
  - Handoff
  - Start Here
tags:
  - halcyon
  - projects/fin-app
  - finance
type: handoff
status: canonical
project: Halcyon
related:
  - "[[MVP_SCOPE]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[System requirements - SRD]]"
  - "[[MIGRATION_PLAN]]"
  - "[[app/README|App README]]"
---

# Halcyon — Context & Handoff

> **Start here.** This file orients a new developer or AI session on what Halcyon is, the state
> it's in, the decisions already locked, and exactly where to pick up. Read this, then the docs
> in §3.

## 1. What this is (and its honest status)

Halcyon is a **personal finance webapp** — a light, editorial interface (frosted glass, a single
mint accent, a cinematic letterbox frame, heavy display type) inspired by premium product
showcases, with a landing → dashboard structure and 6 views.

**Current status: a polished _frontend prototype_ — not yet a product.** Everything runs on a
**mock dataset** ([app/src/data.ts](app/src/data.ts)). There is **no backend, no auth, no
data-fetching layer, no async (loading/error) states, and no tests.** The visual/design layer and
motion system are mature and handoff-ready; the data + backend layer does not exist yet. The next
phase is making it real (see §7–8).

## 2. Canonical decisions (locked — do not relitigate)

These were decided deliberately. The SRD originally predated them; it has since been **reconciled
to these decisions** (the deltas below are now reflected in the SRD itself):

- **Halcyon (this app) is the canonical product.** Keep **Vite + React SPA**, the **light-editorial
  design language + mint `#11b596` + dark mode**, and the **view-router** navigation.
- **Backend = Supabase-direct** (Supabase Auth + Postgres + RLS + Edge Functions). There is **no
  Next.js** — the SRD's Next.js/NextAuth/middleware plan is replaced. Bonus: Supabase Auth issues
  the JWT that RLS reads natively, so the NextAuth↔RLS friction is gone.
- **The SRD's 4-Pillar Security Matrix and Technical Laws are retained**, re-homed to Supabase
  (auth → Supabase Auth, RLS → Postgres policies, validation → Zod in Edge Functions, rate
  limiting → Upstash/edge). The Nothing-OS aesthetic, Google Stitch dependency, `#FF007F` accent,
  and "infinite canvas" navigation are **dropped** in favour of Halcyon. This reconciliation has
  been applied to the SRD; [MVP_SCOPE.md](MVP_SCOPE.md) §6 records the deltas.

## 3. Documents (read in this order)

1. **CONTEXT.md** — this file.
2. **[MVP_SCOPE.md](MVP_SCOPE.md)** — the ruthless thin-slice MVP and what's deferred. The plan of record.
3. **[Halcyon_DesignSystem.md](Halcyon_DesignSystem.md)** — the definitive design system (tokens,
   components, motion, dark mode, the two-library animation split, file architecture).
4. **[System requirements - SRD.md](System%20requirements%20-%20SRD.md)** — the full product vision +
   security model. Strong on vision/security/AU-domain; **reconciled** to §2 above, but still
   **missing a data model + API contract** (the key gap).
5. **[MIGRATION_PLAN.md](MIGRATION_PLAN.md)** — historical (the vanilla→React port, already done).

## 4. How to run

```bash
cd app
npm install        # Node 20+
npm run dev        # → http://localhost:5300
npm run build      # → app/dist/  (static)
```

Fonts load from Google Fonts; no other external assets. App starts in **light mode** on first
visit; the theme choice (toggle dark from Settings or the floating bottom-right button) is
**persisted in `localStorage`** under `halcyon-theme` and restored on return. Wired into the
preview tooling as the `halcyon-app` launch config.

## 5. Architecture & stack

**Stack:** Vite 6 · React 18 (**no StrictMode**) · TypeScript · Tailwind v4 (CSS-first `@theme`) ·
Framer Motion 11 · anime.js 3 (chart motion only).

```
app/src/
  main.tsx        createRoot — no StrictMode
  App.tsx         boot gate · view state · dark state · toast · AnimatePresence
  router.tsx      View type · NAV order · ViewContext / useView
  data.ts         ★ typed MOCK dataset (this is what the backend will replace)
  index.css       ★ design tokens: @theme (light) + :root + .dark + .glass/.micro/.scene-wash
  components/     Shell Boot Tile Stat CapacityMeter Ledger AccountRow AllocationDonut
                  ObjectiveRing HeroCard MilestoneToast ThemeToggle Controls Screen motion.ts
                  charts/ Area Bar Donut
  views/          Landing Dashboard Accounts Income Expenses Ingestion Settings
  three/          SceneBackground.tsx  (2D canvas lattice — misnamed, NOT WebGL)
  hooks/          useScramble  useCountUp  useChartReveal (anime.js firewall)
```

The 6 views map 1:1 to the SRD's pages, so the information architecture is already aligned.

## 6. Key patterns & gotchas (hard-won — don't trip on these)

- **No `StrictMode`** — it double-invokes effects and double-inits the imperative canvas scene.
- **Shared-element hero morph:** the landing card and dashboard net-worth tile share
  `layoutId="hero"`; this requires `<AnimatePresence mode="sync">` + views positioned
  `absolute inset-0`. Don't remove either.
- **Animated colours must be `rgba`/hex, never Tailwind colour utilities** — Tailwind v4 emits
  `oklab()`, which Framer Motion can't interpolate.
- **Two animation libraries, strict boundary:** Framer Motion owns layout / view morph / the tile
  blur-focus entrance; **anime.js owns chart internals only** (SVG draw-on + counters), and only
  ever runs through the **[useChartReveal.ts](app/src/hooks/useChartReveal.ts) firewall** (scoped to
  each chart's root, skips when motion is off, tears down on unmount). No element is animated by
  both. (The Area chart's traveling dot uses a nested `<g>`+`<circle>` so translate and scale never
  collide on one transform.)
- **Dark mode** is a `.dark` class on `<html>` that swaps CSS-variable tokens — most of the app
  flips for free. Keep authoring against tokens. The choice persists in `localStorage`
  (`halcyon-theme`); an inline script in [index.html](app/index.html) re-applies the class before
  first paint so there's no flash of the wrong mode.
- **Scroll chrome** ([Screen.tsx](app/src/components/Screen.tsx)): a scroll-position-driven
  top/bottom mask (content dissolves into the letterbox bars) + an auto-hiding scrollbar.

## 7. Current state: done vs. not

**Done (mature):** all 6 views + landing, the design system + dark mode, Framer Motion choreography
(boot, letterbox reveal, hero morph, blur-focus tile entrance), anime.js chart motion (area/bar/donut/
rings/meters — satisfies the SRD's "staggered SVG timeline" requirement), scroll chrome, responsive,
reduced-motion + motion toggle. Builds clean.

**Not started:** backend, auth/session, any data-fetching, async/loading/error/empty states,
tests, env/config.

**Data-model problems to fix** (the mock is not backend-shaped — [data.ts](app/src/data.ts)): it's
one monolithic blob; entities have **no stable IDs**; dates are **display strings** (`'06.14'`);
amounts are **floats** (should be integer cents); there's **no currency**; and **`glow` (a UI
colour) is baked into the data** — that's a presentation concern and must move out.

## 8. Where to start next (the agreed path)

1. **Data model + API contract** (the missing bridge artifact — neither the SRD nor the app has it):
   Supabase/Prisma schema + RLS policies + Edge Function endpoints with Zod shapes. *This is the
   immediate next deliverable.*
2. **Frontend-readiness refactor:** reshape the mock into per-resource types (IDs, ISO dates,
   integer cents, currency; move `glow`/colour into a presentation map); introduce a **data-access
   seam** (`api/` + per-resource hooks returning `{data, loading, error}`) with the mock as the
   default adapter, swappable for the Supabase client so components stop importing `data` directly;
   add loading/error/empty states (the glass tiles make natural skeletons).
3. **Build Phase 1 MVP** per [MVP_SCOPE.md](MVP_SCOPE.md): auth + RLS + Zod + rate limiting · manual
   account CRUD · **CSV ingestion via the Static Profiler only (no AI)** · default categories +
   manual re-categorization · the existing Dashboard/Accounts/Expenses/Settings views wired to real
   data.

## 9. Explicitly deferred (NOT MVP)

AI categorization & insights, projections, deep analytics → Phase 2. Bank/neobank APIs (AU CDR /
Basiq), live ticker valuation, investment cost-basis, AI ingestion fallback, AES-256-GCM credential
storage → Phase 3. Recurring hub + Osko reconciliation → Phase 4. Admin portal → Phase 5.

## 10. Intentional — do not "fix" these

- Light mode is the **default on first visit**; the theme choice then persists in `localStorage`
  (`halcyon-theme`).
- The mint accent is **live-retintable** from Settings (sets `--color-accent`).
- `three/` is a folder name only — the scene is a **2D canvas**, not WebGL. (`three` is **not** a
  dependency.)
- The Ingestion view is currently a **simulator** (no real mutation yet).

## 11. Left behind in the original prototype folder (superseded — intentionally not carried)

The vanilla HTML/CSS/JS prototype (`index.html`, `styles.css`, `app.js`, `card3d.js`,
`background.js`, `charts.js`, `data.js`), the `react-poc/` proof-of-concept, the `_explore_*.html`
scratch files, and `HalcyonHUD_DesignSystem.md` (the original dark "console HUD" concept). If you
ever want the lineage, it's in the source `DesignTests/halcyon-prototype` folder; none of it is
needed to move forward.
