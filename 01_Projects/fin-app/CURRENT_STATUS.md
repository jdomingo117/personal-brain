---
aliases:
  - Halcyon current status
  - Halcyon resume point
tags:
  - halcyon
  - projects/fin-app
  - finance
type: handoff
status: current
project: Halcyon
updated: 2026-09-21
related:
  - "[[README]]"
  - "[[INDEX]]"
  - "[[SYSTEM_INTEGRITY]]"
  - "[[TAXONOMY_AND_LEDGER_PLAN]]"
---

# Halcyon — Current status

## Resume here

Halcyon is a working personal-finance SPA: Vite/React/TypeScript on the client,
with Supabase Auth, Postgres/RLS and validated Deno Edge Functions on the backend.
The earlier implementation run ended **2026-08-17**; work resumed with the
selected categorisation-review slice on **2026-09-17**. Gate 1 isolated-stack
validation completed on **2026-09-20**, followed by representative-CSV Gate 2
validation on **2026-09-21**. This document is the concise current handoff as at
that date.

The application has moved well beyond the original thin MVP. Its major completed
capabilities are:

- authenticated, tenant-scoped accounts and a real-data dashboard, income,
  expenses, ingestion, settings and ledger experience;
- reviewed CSV ingestion with saved mappings, atomic batches, durable history,
  deduplication and merchant classification;
- direct read-only Up Bank connection, resumable sync, historical CSV cutover
  protection and bank-transfer review;
- a 13-category taxonomy with stable identities, user rules, custom
  subcategories, confidence policy, classification attributes and exact-cent
  transaction splits;
- a cross-page Ledger workflow with capped bulk correction, impact previews,
  guarded undo and browser-level accessibility coverage;
- an implemented selected-row “Review with categorisation engine” workflow that produces
  fresh non-mutating AI suggestions, protects manual/user-rule/bank/system
  decisions, applies individually accepted heterogeneous results atomically,
  rejects stale previews and provides grouped guarded undo (unit/type/build plus
  isolated migration, Edge Function, live-provider and rendered-browser Gate 1
  verification plus representative-CSV Gate 2 quality validation are green); and
- Vanguard managed-investment activity import, NAV valuation, performance/tax
  awareness and bank-to-investment cash-link review.

The detailed architectural map is [INDEX.md](INDEX.md). The original decision and
implementation diary is [CONTEXT.md](CONTEXT.md); it is useful background but is
not the live backlog.

## Important operational state

The default local Supabase database was reset during validation in August. The
owner has since recreated the account through normal sign-up, and a verified
custom-format backup captured a clean zero-row baseline. It currently contains
no restored financial history. Do not run reset-based validation or use this
database for destructive test fixtures.

Before any migration, recovery, live integration test or re-import, read and
follow [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md). In particular, use a positively
identified isolated project for destructive test flows.

## Verified state at the last implementation pass

The August verification passed the unit suite, strict TypeScript check,
production build, live Phase 4/5 checks, database invariants and authenticated
Ledger browser checks. The selected categorisation-review slice passes 290 unit
tests with 12 environment-dependent skips, frontend and browser-suite
TypeScript checks, and a production build. On 2026-09-20 its migration applied
cleanly to a positively identified disposable Supabase project; the isolated
contract harness passed 13/13 checks, including a real Gemini preview that did
not mutate the transaction or teach the durable merchant cache. Authenticated
rendered validation then covered a mixed bank/AI selection, protection and
impact presentation, keyboard focus wrapping and Escape, atomic apply and
grouped undo. The personal local database was not used or modified.

Gate 2 then reset only that positively identified disposable stack and imported
all five representative bank CSVs through the production staging,
categorisation and atomic-ingestion path: 793 transactions across 167 merchants,
with 137 bank-sourced and 656 AI-sourced rows. The final run left 6 rows needing
review, including 3 unresolved. A cache-bypassing fresh review sampled 676 rows
and returned 618 unchanged, 38 actionable suggestions and 20 protected bank
rows; it made no transaction changes and added no merchant-cache entries. Gate
2 found and fixed two defects: nullable Lifestyle subcategories could derive a
NULL `is_subscription` into a NOT NULL column, and Gemini confidence was not
required by the response schema, causing every answer to fall back to 0.5. The
full migration chain and Gate 2 harness passed after both repairs. The personal
local database remained untouched.

## Sensible next directions

Choose one of these deliberately; they represent different kinds of work rather
than a single mandatory sequence.

1. **Restore confidence in the fresh environment (recommended first).** Follow
   the integrity runbook, confirm account/tenant/RLS health, re-import a small
   known-safe data sample and reconcile the resulting metrics. This is the
   prerequisite for work that depends on real history.
2. **Classification review workflow — Gates 1 and 2 complete.** The Ledger
   now previews and applies fresh suggestions for an intentional selection of
   up to 500 rows, with protected decisions, impact preview, atomic application
   and guarded undo. Its isolated migration/API/browser gate and five-file,
   793-row representative CSV quality gate are green. Remaining product scope
   is the safe unresolved default, an
   all-eligible runner, and durable/resumable review runs only if their usage
   justifies persistence. The contract is in
   [TAXONOMY_AND_LEDGER_PLAN.md](TAXONOMY_AND_LEDGER_PLAN.md).
3. **Ingestion hardening.** Close the known ingestion follow-ups: align the
   5,000-row cap with reconciliation rows, chunk categorisation beyond 300
   merchants, validate taxonomy pairs server-side, and add live coverage for
   overlap/cutover/profile edge cases. See [INGESTION_REVIEW.md](INGESTION_REVIEW.md).
4. **Investment expansion.** Add parcel-level cost base/disposal accounting or
   another provider/instrument adapter. The Vanguard vertical slice is designed
   as an adapter boundary, so this extends an existing model rather than starts
   a parallel one.
5. **Product polish.** Continue the deferred planning experience: recurring
   write-back (edit/cancel/remind), multi-year cadence detection, or the
   projections/insights work described in [MVP_SCOPE.md](MVP_SCOPE.md).

## First commands when resuming

```bash
# From the project root; read SYSTEM_INTEGRITY.md before doing anything destructive.
npx supabase start
npx supabase functions serve --no-verify-jwt --env-file supabase/.env.local

# In another terminal
cd app
npm test
npm run build
```

Run browser and live integration harnesses only against an isolated, explicitly
acknowledged target; their safety guard intentionally refuses the personal local
database.
