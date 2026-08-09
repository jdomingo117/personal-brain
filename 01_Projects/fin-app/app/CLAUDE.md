# Halcyon frontend — agent notes

Vite 6 + React 18 (**no StrictMode** — double-invokes effects, breaks the imperative canvas scene)
+ TypeScript + Tailwind v4 (CSS-first `@theme`) + Framer Motion 11 + anime.js 3. Run: see
`app/README.md`. Root orientation: [../CLAUDE.md](../CLAUDE.md).

## Design system

[../Halcyon_DesignSystem.md](../Halcyon_DesignSystem.md) is the human-readable spec; `src/index.css`
(`@theme` block + `:root` + `.dark` override) is the machine source of truth for every token. Author
against tokens, never hardcode a colour where one exists. Load the design doc when doing UI/visual
work; don't load it for pure logic/data work — it's ~7,000 words and mostly irrelevant there.

## Two animation libraries, strict boundary

**Framer Motion** owns layout, view routing, the shared-element hero morph (`layoutId="hero"`),
tile entrance. **anime.js owns chart internals only** (SVG draw-on, dashoffset, counters), and only
through the `src/hooks/useChartReveal.ts` firewall (scoped to the chart's root, motion-aware,
self-cleaning tear-down). No element is animated by both — this has never needed to be broken, and
breaking it is the most likely way to reintroduce a real bug here.

Animated colours must be `rgba`/hex, never Tailwind colour utilities — Tailwind v4 emits `oklab()`,
which Framer Motion can't interpolate.

## Data flow

`contexts/DataContext.tsx` is the fetch layer — components read from `useData()`, they don't call
`supabase.from(...)` directly except inside a small number of contained components (`OskoLinker.tsx`,
account modals) that manage their own local state alongside the global one. `contexts/AuthContext.tsx`
holds `session`, `user`, `tenantId`, `role` — `DataContext` consumes it, not the other way round.

**Money is always integer cents.** Convert to a display string in exactly one place: `fmt()` /
`fmtCents()` in `data.ts`. Never format a raw amount inline — this bug has recurred five separate
times across different components (chart tick formatters, donut center label, count-up default).
The one deliberate exception is the pre-commit CSV staging preview (`components/CSVUploader.tsx`,
`components/ingest/StagingTable.tsx`), which needs its own local money helpers before a row has an
`id` to look up.

## Ingestion library (`src/lib/csv/`)

Pure, UI-free, unit-tested — both the staging preview and the server share this logic (the server
copy lives in `supabase/functions/_shared/`, kept in sync by convention, not by import — see
`supabase/CLAUDE.md`). Two rules that matter if you touch this:
- `parseDate.ts`/`parseAmount.ts` return `null` on a value that can't be trusted — **never** a
  guess (never today's date, never `$0.00`). A blocked row surfaces in the staging table instead.
- `normalizeMerchant.ts` values stability over prettiness: over-normalising **merges distinct
  merchants**, which is worse than a slightly ugly cache key. Don't "improve" it without reading
  its docblock first.

`src/lib/transfers/` (the transfer-matching engine) follows the same pure/mirrored-server pattern
— see `supabase/CLAUDE.md` for the mirroring convention and the O(N) constraint it exists to satisfy.
`src/lib/investments/cashMatch.ts` follows that pattern for exact-value cross-ledger
purchase/redemption reconciliation; distributions and non-cash activity are intentionally outside
its vocabulary.

## Testing

`npm test` (vitest, run from `app/`) — unit + corpus tests, several running over the real files in
`Sample datasets/` rather than synthetic fixtures. Corpus tests assert structural invariants (no
duplicate matches, no same-account pairing, etc.), not pinned score values — a scoring/weight
change shouldn't need touching them.

`app/scripts/*.mjs` are integration harnesses against a live local stack (not run by `npm test`).
Need the stack up, `SUPABASE_ANON_KEY` set, and
`npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local` in a separate shell.
One file per concern: RLS isolation, edge-function auth middleware, the auth token broker, CSV
column-mapping quality, ingestion dedupe, categorisation, transfer linking. If you add a new
Edge Function or a new cross-cutting invariant, add or extend a script here rather than only
covering it with a unit test — the unit tests can't catch an RLS policy gap or a cross-tenant leak.

## Component conventions

`components/Controls.tsx` has the shared form primitives (`Button`, `Chip`, `Select`, `DateInput`,
`MultiSelect`, `DateRangePicker`, `Switch`) — reach for these before writing a new input from
scratch. `components/Tile.tsx` is the glass-panel wrapper every dashboard card uses. `components/
Screen.tsx` provides the scroll-chrome shell (`Screen`, `ViewHeader`, `Grid`) every view is built
inside.
