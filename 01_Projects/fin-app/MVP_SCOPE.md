---
aliases:
  - MVP Scope
  - Plan of Record
tags:
  - halcyon
  - projects/fin-app
  - finance
type: plan
status: current
project: Halcyon
up: "[[CONTEXT]]"
related:
  - "[[System requirements - SRD]]"
  - "[[Halcyon_DesignSystem]]"
  - "[[MIGRATION_PLAN]]"
---

# Halcyon — MVP Scope Cut

> Companion to `System requirements - SRD.md`. The SRD defines the full product vision;
> **this document defines the ruthless thin-slice MVP** and what is explicitly deferred.
> Where the two disagree, the canonical decisions below win. (The SRD has since been
> reconciled to these decisions — see §6 for the applied deltas.)

## 1. Canonical decisions (locked)

- **Frontend is canonical = Halcyon as built.** Vite + React SPA, light-editorial design
  language, mint `#11b596` accent + dark mode, the view-router (not an infinite canvas),
  `Halcyon_DesignSystem.md` + `index.css` as the design source of truth.
- **No Next.js** → **backend is Supabase-direct**: Supabase Auth + Postgres + RLS + Edge
  Functions (Deno). This is the natural backend for a Vite SPA and removes the NextAuth↔RLS
  friction.
- **Retained from the SRD unchanged:** the 4-Pillar Security Matrix, all Technical Laws
  (DB-level aggregations, O(N²) ban → `Map`, AES-256-GCM, async-only AI), the two-tier
  ingestion *concept*, anime.js chart motion (**already built**).

### Security pillars, re-homed to Supabase
| Pillar | Next.js (SRD) | Supabase (MVP) |
|---|---|---|
| Authentication | NextAuth JWT | **Supabase Auth** (JWT) |
| Row-Level Security | RLS + passed JWT | **Postgres RLS** via `auth.uid()` (native) |
| Server-side validation | Zod in API routes | **Zod in Edge Functions** (all mutations route through them) |
| Rate limiting | Next middleware + Upstash | **Upstash/Edge limiter** on auth + ingestion functions |

## 2. MVP principle

One **thin vertical slice** that proves the product end-to-end: *a user signs in, gets their
real data in (manually + CSV), and sees a secured, consolidated net-worth dashboard.* No AI, no
bank APIs, no live pricing. If it isn't on the path from "log in" to "see my real net worth," it
is deferred.

## 3. Phase 1 — MVP (must-have)

**Auth & security foundation**
- Supabase Auth (email/password), protected routes, session handling.
- RLS policies on **every** table (`userId = auth.uid()`).
- Zod validation on every write, via Edge Functions.
- Rate limiting on auth + ingestion.

**Data in**
- **Accounts** — manual CRUD: name, type (liquid/credit/investment), currency, opening balance.
- **Transactions** — manual entry **+ CSV ingestion via the Static Profiler only** (deterministic
  native parsing; map columns once, save profile, re-run with zero AI). **No AI fallback in MVP.**
- **Categories** — fixed default taxonomy + manual re-categorization (no AI tagging).

**Data out** (maps 1:1 to existing Halcyon views/charts)
- **Dashboard** — net worth (SQL/Prisma aggregation), 30-day income, 30-day expense, allocation
  donut, net-worth-over-time (computed from transaction history).
- **Accounts view** — per-account balance + transaction list.
- **Expenses view** — ledger with basic filters: date range, type (debit/credit), keyword, category;
  pagination (10/page).
- **Settings** — profile, password rotation, theme (dark mode already built).

**Frontend readiness refactor** (prerequisite, from the earlier audit)
- Reshape the data model out of the mock blob: per-resource types, **stable IDs**, **ISO dates**,
  **integer-cents amounts**, **currency**, and **move `glow`/colour out of data** into a
  presentation map.
- Introduce a **data-access seam** (`api/` + per-resource hooks returning `{data, loading, error}`)
  with the mock behind it as the default adapter, swappable for the Supabase client.
- Add **loading / error / empty states** to every view (the glass tiles make natural skeletons).

## 4. Explicitly deferred (NOT in MVP)

| Phase | Scope |
|---|---|
| **2 — Intelligence & deep analytics** (no external integrations) | AI async categorization (Gemini background); Insights engine (**deterministic math**, AI only phrases the bulletin); Income Analyser advanced cards; Expenses analytics (daily-spikes, hierarchy flow, top-10 merchants, volatility/pacing); Strategic Projections + goal-horizon forecast (deterministic) |
| **3 — Automation & external data** | Bank/neobank sync (AU CDR / Basiq — regulated, large); live valuation engine (ticker APIs + background workers); investment cost-basis tracking; **AI-parsing ingestion fallback**; AES-256-GCM credential storage (needed only once third-party tokens exist) |
| **4 — Recurring & reconciliation** | Recurring Hub (detection + 30-day billing calendar); Osko same-day linker |
| **5 — Admin & ops** | Hidden admin portal; platform metrics; user/role directory |

## 5. Already satisfied by Halcyon (no MVP work needed)

- Information architecture: the 6 views map to the SRD pages (Dashboard, Accounts, Income,
  Expenses, Ingestion, Settings). SRD tabs (Income: Analyser/Projections; Expenses:
  Analytics/Recurring) are **Phase 2** additions.
- **anime.js chart motion** — the SRD's "staggered SVG timeline animations" requirement is done.
- Dark mode, motion toggle, reduced-motion, the design-system tokens & components.

## 6. SRD reconciliation — applied ✅ (Halcyon-canonical deltas)

These deltas have been **applied to `System requirements - SRD.md`** (it now reads as the canonical
build); kept here as the record of what changed:

- Stack: Next.js 15 → **Vite + React SPA**; backend → **Supabase-direct** (Auth/RLS/Edge Fns).
- Aesthetic: Nothing OS monochrome + `#FF007F` → **Halcyon light-editorial + mint + dark mode**.
- Navigation: infinite canvas → **view-router** (resolves the canvas-vs-page-specs contradiction).
- Design source: Google Stitch / `.stitch/DESIGN.md` → **`Halcyon_DesignSystem.md` + `index.css`**
  (drop the Stitch dependency, Law 6 rewrite).
- AI: tighten "Days Until Reached calculated via AI" → **deterministic calc; AI phrasing only**.

## 7. Still missing before backend can start

The MVP above is buildable once the **data model + API contract** exists (Prisma schema / RLS
policies / Edge Function endpoints + Zod shapes). That is the next bridge artifact — neither the
SRD nor the prototype contains it yet.

## 8. Open decisions to confirm

1. **Backend host:** Supabase-direct (recommended above) vs a separate API server (Hono/Fastify)
   alongside the SPA.
2. **Mutation path:** all writes through **Edge Functions** (for Zod + rate limiting) vs direct
   PostgREST with DB constraints. Recommended: Edge Functions for anything that needs validation
   or limiting; PostgREST reads are fine under RLS.
