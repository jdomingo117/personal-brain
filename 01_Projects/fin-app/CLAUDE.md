# Halcyon — agent orientation

Personal finance webapp. Vite + React + TypeScript SPA in `app/`, Supabase (Postgres + Auth + RLS
+ Deno Edge Functions) backend in `supabase/`. No Next.js, no other server. Local dev stack via
`npx supabase start` (from repo root) + `npx supabase functions serve --no-verify-jwt --env-file
supabase/.env.local` (separate shell) + `cd app && npm run dev`.

This file is short on purpose — it orients and points, it doesn't explain. Read the linked doc
before touching that area; don't guess from this file alone.

## Where to look

| Need | Read |
|---|---|
| Frontend conventions, testing, animation rules | [app/CLAUDE.md](app/CLAUDE.md) — auto-loads when working in `app/` |
| Backend conventions, RLS/migration patterns, the "Laws" | [supabase/CLAUDE.md](supabase/CLAUDE.md) — auto-loads when working in `supabase/` |
| File-by-file system map, current known bugs | [INDEX.md](INDEX.md) — **read this first** for anything touching architecture or an unfamiliar area |
| Full history, rationale, dated diary of past fixes | [CONTEXT.md](CONTEXT.md) — the human/Obsidian handoff doc; more thorough than this file, less current-by-default |
| Design tokens, components, motion spec | [Halcyon_DesignSystem.md](Halcyon_DesignSystem.md) — reference only, load when doing UI/visual work |
| Full product vision + security model | [System requirements - SRD.md](System%20requirements%20-%20SRD.md) |
| What's in scope now vs. deferred | [MVP_SCOPE.md](MVP_SCOPE.md) |

## Rules that apply everywhere

- **Money is always integer cents**, end to end — DB columns, `DataContext`, every analytics lib.
  Convert to dollars in exactly one place per surface (`fmt()`/`fmtCents()` in `app/src/data.ts`).
  This bug has recurred *five times* from inline formatting — see `CONTEXT.md`'s 2026-08-05 entry.
- **Sign convention:** transaction `amount` is positive = inflow, negative = outflow. Never invert
  this per-view; if a view needs "spend" as a positive number, negate at display time only.
- **RLS is never optional.** Every table needs a policy keyed on tenant membership
  (`is_tenant_member`/`has_tenant_role`), not `auth.uid() = user_id` — this app is multi-tenant
  even though each user currently owns exactly one personal tenant. See `supabase/CLAUDE.md`.
- **Application-data mutations never go directly from the browser to PostgREST or an RPC.** They
  must use a Zod-validated Edge Function (`_shared/withAuth.ts`); direct reads remain RLS-scoped.
  The sole client-side mutation exception is `supabase.auth.*` for GoTrue identity/session lifecycle
  (sign-in, password/email changes, OAuth/OTP exchange, and sign-out), not Halcyon application data.
- **Aggregates in SQL, matching in O(N).** Don't `.reduce()` over thousands of fetched rows for a
  total; don't nest loops when matching/deduping — see `supabase/CLAUDE.md` Laws 2–3.

## Keeping docs current — read this before ending a task

If you added a table, migration, Edge Function, top-level component/view, or changed the schema:
**update [INDEX.md](INDEX.md)'s relevant section before concluding the task.** This is the one
step that has actually gone missing before — `INDEX.md` and two spec docs described the
transfer-linker as unbuilt "Phase 4" work for a while after it shipped, because the update
instruction used to live in a file (`.agents/rules/maintain_index.md`) nothing ever loaded. It
lives here now specifically so it's actually read.

Also append one line to **Recent changes** below (date + what shipped, one line, no detail — the
detail belongs in `INDEX.md` or `CONTEXT.md`). Keep this log capped at 10 entries; when adding an
11th, drop the oldest. It exists so an agent gets a cheap "what's new since I last worked here"
signal without re-reading `CONTEXT.md`'s full diary.

If you're not sure whether the docs are in sync with the code at all — not just after your own
task, but in general — run `/docs-audit`. It's the automated version of what a human had to do by
hand to find the transfer-linker gap.

## Recent changes

- 2026-08-15 — Added six repeatable Playwright Ledger regressions covering mixed/impact semantics, cross-page and 500-row selection, safe attributes/protection, grouped undo and modal focus restoration.

- 2026-08-15 — Added reusable focus trapping and opener/fallback restoration across all Ledger dialogs, including animated drawer exit and completed bulk-selection flows.

- 2026-08-15 — Added safe Ledger bulk kind/attribute editing with per-field mixed/tri-state semantics, exact reporting previews, atomic grouped undo, 500-row enforcement and live browser/RLS validation.

- 2026-08-15 — Added capped Ledger “select all matching,” enforced a visible 500-row UI/API boundary, fixed oversized visibility-query URLs, and validated exact 500 update/undo plus 501 rejection.

- 2026-08-15 — Made Ledger cross-page selection observable and self-clearing after completed bulk work, with scoped counts/actions, stale-ID pruning, retained undo, and a 57-row browser regression.

- 2026-08-15 — Added exact Ledger bulk impact previews for current mixes, label/provenance counts, clearing, derived classification and reporting deltas, with explicit-change gating and browser validation.

- 2026-08-14 — Made Ledger bulk correction field-safe with shared/Mixed states, explicit partial updates, mandatory category-pair choices, heterogeneous undo, and full live/browser validation.

- 2026-08-14 — Repaired expense metric integrity: equal-day prior windows, correct daily denominators, rejected-transfer reporting precedence, strict TypeScript health, and database/browser reconciliation.

- 2026-08-14 — Shipped Phase 5 classification refinement: exact-cent split reporting/undo, tenant custom subcategories, merchant-rule management, persisted confidence policy, and full RLS/browser validation.

- 2026-08-14 — Shipped Phase 4 transaction classification: first-class kind and focused attributes, correct contra-expense semantics, ledger edit/filter/undo UX, kind-based matching/analytics, and live RLS/browser validation.
