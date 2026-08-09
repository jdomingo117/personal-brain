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

**Current status: real data end-to-end, with a real backend behind it.**
As of **2026-08-05** every view (Dashboard, Accounts, Income, Expenses, Ingestion, Settings) reads
through [contexts/DataContext.tsx](app/src/contexts/DataContext.tsx) — the mock dataset
([app/src/data.ts](app/src/data.ts)) has been retired to an empty shell kept only for its types and
formatters (`fmt`/`fmtCents`, `Txn`/`Account`). The auth loop works end-to-end (sign up → onboarding
→ dashboard → sign out → sign in) against a local Supabase stack with RLS enforced (§4.1, §7).
Beyond auth, the backend now also covers CSV ingestion with dedupe, AI merchant categorisation
(Gemini, cached, user-correctable), and internal-transfer detection (the "Osko" linker) — see §7 and
[INDEX.md](INDEX.md) for the file-level map.

`DataContext` exposes a `loading` flag, consumed at the route level by `Guards.tsx`. There's a real
test suite: unit/corpus tests under `app/src` (`npm test`, vitest) plus integration harnesses in
`app/scripts/` that drive a live local stack (RLS isolation, edge-function auth, ingestion dedupe,
categorisation, transfer linking). The one genuine gap left in this area: **no per-view loading/
error/empty states** — Dashboard/Accounts/Income/Expenses render straight through once the
route-level gate clears, with no skeleton or error UI of their own yet (see §7, §8).

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

### 4.1 Running the backend (required for anything past the login screen)

`app/.env` points at a **local** Supabase stack, so it must be up or **every auth call fails with
a network error and the login screen appears broken**. Docker Desktop must be running first.

```bash
npx supabase start          # from 01_Projects/fin-app/ — boots Postgres/GoTrue/PostgREST/Studio
npx supabase functions serve # separate shell — onboarding calls the upsert-account Edge Function
```

`supabase start` prints the local keys and Studio URL (`http://127.0.0.1:54323`). Email
confirmation is **off** locally (`enable_confirmations = false`), so sign-up returns a session
immediately. If `supabase start` reports it is "already running" but the DB container has exited,
run `npx supabase stop` first.

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
  data.ts         ★ types, taxonomy constants, and formatters (fmt/fmtCents) — the mock arrays
                  it used to export are retired empty shells; all resource data comes from
                  DataContext now
  index.css       ★ design tokens: @theme (light) + :root + .dark + .glass/.micro/.scene-wash
  components/     Shell Boot Tile Stat CapacityMeter Ledger AccountRow AllocationDonut
                  ObjectiveRing HeroCard MilestoneToast ThemeToggle Controls Screen motion.ts
                  SegmentedTabs AnalyzerFilters HeroMetric TransactionsPanel
                  ExpenseTrendCard ExpenseFlowCard ExpensePacingCard ExpenseScopeBar
                  RecurringHub RecurringDirectory BillingCalendar
                  charts/ Area Bar Donut
  views/          Landing Dashboard Accounts Income Expenses Ingestion Settings
  three/          SceneBackground.tsx  (2D canvas lattice — misnamed, NOT WebGL)
  hooks/          useScramble  useCountUp  useChartReveal (anime.js firewall)  usePeriodRange
                  useScrollIdle
  lib/            period.ts  (range presets · month bucketing · `txnIso` · date labels)
                  stats.ts   (★ mean/stdev/cv/median + STEADY_CV — the ONE definition of
                             "fixed cost", shared by the pacing rail and the recurring detector)
                  cadence.ts (Cadence vocabulary + tables. Imports NOTHING — `data.ts` needs
                             `Cadence` and `period.ts` imports `data`, so any import here
                             would close a cycle.)
                  pacing.ts  (category volatility + pacing model — see DesignSystem §8.15)
                  recurring.ts (recurrence detection + billing projection — DesignSystem §8.17)
                  expenseSelection.ts  (the Expenses cross-filter — DesignSystem §8.16)
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

**Backend — first slice done (2026-07-25).** `supabase/` holds the schema
([migrations/20260718000000_initial_schema.sql](supabase/migrations/20260718000000_initial_schema.sql):
`profiles`/`accounts`/`transactions`/`static_profiles`, RLS on all four via `auth.uid()`, a trigger
that auto-creates a `profiles` row on signup) plus three Zod-validated Edge Functions
(`upsert-account`, `upsert-profile`, `upsert-transactions`). Frontend: Supabase Auth in
[App.tsx](app/src/App.tsx), [views/Login.tsx](app/src/views/Login.tsx),
[views/Onboarding.tsx](app/src/views/Onboarding.tsx), and a
[DataContext](app/src/contexts/DataContext.tsx) fetch layer. Sign-out lives in Settings.
**Verified end-to-end against the local stack**, RLS included (an anon request returns `[]`).

**Two bugs fixed while verifying this** — worth knowing because both are easy to reintroduce:
1. All three Edge Functions called `supabase.auth.getUser()` with **no argument**. That reads the
   session from *client storage*, which doesn't exist in Deno, so every call failed
   `Auth session missing!` → **401**. They now pass the JWT explicitly:
   `getUser(authHeader.replace('Bearer ', ''))`.
2. `Login.tsx` greeted users with `data.operator.callsign` from the **mock** — and the mock's
   `operator` has since been zeroed out (`callsign: ''`), so the greeting was blank. Landing and
   Settings had the same mock-greeting bug. All three now read `profile` from `DataContext`.

**Still not started:** per-view loading/error/empty states in Dashboard/Accounts/Income/Expenses
(route-level loading exists via `Guards.tsx`; the views themselves render straight through with
nothing shown while `DataContext` is fetching or if a fetch fails).

**Cents-vs-dollars bug — FIXED (2026-08-05).** This was exactly as predicted below: invisible
while every balance was `$0`, and it stayed invisible through the whole auth rebuild for the same
reason. It finally surfaced the moment a real CSV import gave an account a real balance — net worth
rendered as `$12,989,791` for an actual `$129,897.91`. The bug was never in the data (accounts and
transactions were always correctly stored/summed in cents); it was in the last step, formatting.
`fmt()`/`fmtCents()` in [data.ts](app/src/data.ts) took a raw cents integer and printed it with a
`$` and no `/100`. Found to be duplicated **four more times** as independent inline formatters —
`CapacityMeter.tsx` (budget shields), `useCountUp.ts`'s default formatter (Landing's net-worth
counter), the shared `formatChartVal`/`formatChartTick` in `charts/Area.tsx` + `charts/Bar.tsx`
(every trend chart), and `AllocationDonut.tsx`'s `centerFmt` (donut center label, dividing by 1,000
instead of 100,000). All five fixed; every consumer across the app was already passing raw cents
with zero pre-division, so no call site needed to change.

A second, compounding bug in the same pass: [views/Accounts.tsx](app/src/views/Accounts.tsx)
filtered transactions with `t.account === selectedAccount.id` — but `t.account` is the account's
**name** (`DataContext` maps `account_id` → name at fetch time) while `.id` is a UUID, so the
comparison could never match. `txns` was silently `[]` for every account, which flattened the
Accounts page's trend chart to a dead horizontal line and zeroed its period stats, category donut,
and ledger table. Fixed to compare `t.account_id`.

**Two more display bugs found, not fixed** (same investigation, out of scope of the above):
1. Dashboard's Asset Allocation only buckets accounts of type `Liquid`/`Invest`
   ([views/Dashboard.tsx](app/src/views/Dashboard.tsx) `liquidSum`/`investSum`) — `Savings`,
   `Debt`, `Credit Card` and `Loan` accounts fall through to an empty allocation, rendering `$0`
   total and `NaN%`.
2. `views/Income.tsx`'s account filter (`const [accounts, setAccounts] = useState<string[]>([])`)
   defaults to an empty selection, so every figure reads `$0` and "no inflow for the current
   filters" until the user manually picks an account — despite the UI showing "All linked accounts"
   as if that were already the active state.

**Data-model problems — FIXED** (the mock's old blob shape has been superseded by the real backend
schema): stable UUIDs, ISO dates, integer-cents amounts all come from Postgres via `DataContext`
now; `glow` moved out to a presentation map computed in `DataContext` rather than stored. Currency
is still unaddressed — every account is implicitly AUD, no `currency` field is threaded through.

**The ledger sparsity is FIXED — `transactions` was backfilled 53 → 391 rows** (2026-07-17) to build
the Recurring hub (DesignSystem §8.17), which was undetectable against the old fixture. This is the
fix this section used to prescribe: the ledger carried rent in 8 months, power in 3, and internet /
mobile / streaming in **1 each**, so σ/μ marked genuinely fixed costs "erratic" and the rail reported
Power as "+100%, pacing over" on a bill already paid in full. *The maths was right; the fixture was
fiction.*

It now runs in two layers: **12 recurring series** on fixed days (rent, power, water, internet,
mobile, streaming, software, auto-invest, a transit pass, a gym membership, a quarterly insurance
premium, and a parking debit that stops in January — the dormant case), plus **discretionary** spend
on irregular days across rotating merchants. Volumes track
[concept/pacingData.ts](app/src/concept/pacingData.ts), so the ledger now **agrees** with
`cashflow.expense` and `shields` at ~$5.5k/month, where it used to contradict them 3:1 ($1.8k). Rent
steps 2050 → 2100 in March — that price creep is deliberate, and the hub's run-rate card reports it.
Two invariants the array must keep are documented at its head: **reverse-chronological** (Dashboard
slices `[0,5)` positionally, and it can't be sorted at module load — `txnIso` lives in `period.ts`,
which imports `data`) and **nothing dated after 07.17** (`txnIso` would resolve it to a *future*
charge).

Consequences, all intended: the 12-month outflow total went **$21.8k → $66.4k**, so every
Expenses/Dashboard figure moved (the 3M hero reads $16,466, was $9,548). **Rent is now `steady`
(cv 1.2%)** and its "+100%" false alarm is gone.

**Two follow-ups this did NOT close:**
1. **Power still reads "pacing over" (+77%)** on a bill paid in full on the 3rd. It is correctly
   `variable` (cv 15%) — real power bills do swing seasonally, and flattening the fixture to flatter
   the tile would be the same "fixture is fiction" sin — but `landingFor` only projects *steady* rows
   to their baseline and straight-lines everything else. Volatility was always a *proxy* for "does
   this arrive in one lump?"; [lib/recurring.ts](app/src/lib/recurring.ts) now answers that
   directly, so the rail could ask it instead of guessing.
2. **Payroll is still fiction** — 8 deposits across 12 months where `Biweekly` implies 26. Out of the
   hub's scope (inflows aren't commitments), but it will bite the Income view.

**Up Bank API sync — shipped (2026-08-06).** A user can connect Up via a read-only Personal Access
Token and have their ledger stay current without CSV imports. `provider_connections`/
`account_connections`/`sync_runs` schema, AES-256-GCM credential storage, four Edge Functions
(`connect`/`map`/`sync`/`disconnect-provider`) plus `rotate-provider-keys` for key rotation,
`ConnectBankModal`/`EditAccountModal` UI. CSV and API can coexist on one account via a per-account
`cutover_date` (CSV owns history before it, API owns forward). Pending (HELD) transactions are
stored and shown but excluded from every aggregate until settled. Up's own `transferAccount`
relationship is consumed as ground truth for transfer linking, outranking the fuzzy matcher
entirely when it resolves — see [INDEX.md](INDEX.md) for the full file map. Known gap: verified via
real HTTP calls to Up's production API (deliberately-invalid tokens, real 401s) and direct SQL
seeding, but never against a genuine Up account/token — no real backfill has been run end-to-end.

## 8. Where to start next (the agreed path)

1. ~~**Data model + API contract**~~ — **done 2026-07-18/25.** Schema, RLS and the three Zod'd Edge
   Functions are in `supabase/`; see §7. What it still lacks is the **cents/dollars convention being
   honoured on the client** (§7) and any documented API contract *doc* — the contract currently only
   exists as code.
2. **Frontend-readiness refactor** — mostly done. Stable IDs, ISO dates, integer cents, and
   `glow`-as-presentation (computed in `DataContext`, not stored) all shipped alongside the real
   backend. Two pieces remain: a **data-access seam** — today there's one monolithic
   `DataContext.refreshData()` rather than per-resource hooks (`useAccounts`/`useTransactions`-style,
   returning `{data, loading, error}`) — and **per-view loading/error/empty states** (the glass tiles
   make natural skeletons; nothing renders one yet).
3. ~~**Build Phase 1 MVP**~~ — **substantially done**, and exceeded in places. Auth + RLS + Zod +
   rate limiting, manual account CRUD, and the existing views wired to real data are all built. CSV
   ingestion shipped *with* AI categorisation (Gemini-backed, cached, user-correctable) rather than
   the "Static Profiler only, no AI" MVP scope — see [INDEX.md](INDEX.md) for the categorisation
   tiering. What remains is the data-access seam and per-view loading states from step 2 above.

## 9. Explicitly deferred (NOT MVP)

~~AI categorization~~ **shipped** (Gemini-backed, cached, user-correction-outranks-AI) —
see [INDEX.md](INDEX.md). Insights engine, projections, deep analytics remain Phase 2.
~~Bank/neobank APIs~~ **Up Bank shipped** (direct read-only Personal Access Token, AES-256-GCM
credential storage, chunked resumable sync, transfer-linking via Up's own `transferAccount` signal —
see [INDEX.md](INDEX.md)); broader aggregator coverage (AU CDR / Basiq, for banks without their own
API) remains Phase 3, along with live ticker valuation, investment cost-basis, and AI ingestion
fallback. **Recurring hub — the read-only half (detection, commitments directory, 30-day billing
calendar) shipped early**, see [Halcyon_DesignSystem.md](Halcyon_DesignSystem.md) §8.17, **and so
did the Osko same-day linker** (`link-transfers`/`decide-transfer` Edge Functions, `OskoLinker.tsx`
— see [INDEX.md](INDEX.md)); only recurring write-back (edit/cancel/remind) remains Phase 4. Admin
portal → Phase 5.

## 10. Intentional — do not "fix" these

- Light mode is the **default on first visit**; the theme choice then persists in `localStorage`
  (`halcyon-theme`).
- The mint accent is **live-retintable** from Settings (sets `--color-accent`).
- `three/` is a folder name only — the scene is a **2D canvas**, not WebGL. (`three` is **not** a
  dependency.)

## 11. Left behind in the original prototype folder (superseded — intentionally not carried)

The vanilla HTML/CSS/JS prototype (`index.html`, `styles.css`, `app.js`, `card3d.js`,
`background.js`, `charts.js`, `data.js`), the `react-poc/` proof-of-concept, the `_explore_*.html`
scratch files, and `HalcyonHUD_DesignSystem.md` (the original dark "console HUD" concept). If you
ever want the lineage, it's in the source `DesignTests/halcyon-prototype` folder; none of it is
needed to move forward.

## 12. Managed-fund accounts — shipped 2026-08-08

The first scalable managed-investment vertical slice is live. Vanguard Personal Investor is an
adapter and catalogue seed, not a hardcoded account path: the schema separates global instruments
and prices from tenant-owned holdings, activities, valuations and tax-workflow records. The supplied
anonymized High Growth export is now a regression corpus (9 activities, 21,492.49 units, $45,715.00
external purchases, $1,662.59 DRP). Imports are reviewed, unit-reconciled and content-deduplicated;
only the account suffix is stored.

Official Vanguard NAV history drives set-based daily valuations and a cached account balance. Both
scheduled and on-open/manual refresh paths preserve the real price date, serialize concurrent runs,
replay provider corrections and retain the last good value on failure. Purchases are recorded as
external flows rather than performance, so funding an investment does not falsely erase or create
net worth; `net_worth_monthly` combines cash reconstruction with investment snapshots.

The Invest account UI replaces bank-centric analytics with current value, precise units, net
contributions, DRP, contribution-neutral return, NAV status, performance history and its own ledger.
Australian FY summaries flag disposals and track AMMA statement status through an audited mutation;
they explicitly do not claim to calculate tax, CGT or AMMA components. Remaining investment scope is
parcel-level cost-base/disposal accounting and additional provider/instrument adapters.

**Priced duplicate-import bug fixed the same day.** The first implementation correctly skipped all
duplicate activity rows but then unconditionally reset `accounts.balance` to zero and cleared
`balance_as_of`. Because stale NAV refresh is deduped once per account per browser session, the zero
could persist even though valuation snapshots were still intact. A zero-row import is now a strict
monetary no-op and reports the preserved value/date. Genuine new activity calls the service-only
`rebuild_investment_account_valuations(account_id)` operation against stored NAVs, avoiding both a
live provider dependency and a global all-tenant rebuild. The regression test follows the real user
sequence—import → price → identical re-import—and asserts cached value, price date and snapshot count
remain unchanged.

**Bank-to-investment reconciliation shipped.** `investment_cash_links` now joins bank transactions
to purchase/redemption activities without merging the ledgers or inventing synthetic rows. Matching
is exact-value, four-day, bounded and order-independent; the four supplied Vanguard funding pairs
auto-link, including Friday-to-Monday settlement. Suggestions and automatic matches are reviewable,
linked bank legs are excluded from cash-flow analytics, and content-keyed decisions survive
delete/re-import. DRP and other non-cash activity are ineligible, while cash distributions remain
investment income. See `MANAGED_INVESTMENTS.md` for the contract, remaining split/combined-cash
scope and validation matrix.
