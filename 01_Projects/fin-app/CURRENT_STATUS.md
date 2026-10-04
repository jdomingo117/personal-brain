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
updated: 2026-10-04
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
validation on **2026-09-21** and safe forward migration of the personal local
stack on **2026-09-26**. Real statement-import testing resumed on
**2026-09-30**. A full isolated golden-pass browser harness was added and passed
on **2026-10-01**. This document is the concise current handoff as at that date.

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
custom-format backup captured a clean zero-row baseline. On 2026-09-26 it contained one user/profile,
one tenant/member, three accounts and zero transactions. A pre-migration backup
was catalog-verified at
`backups/halcyon-pre-categorization-migrations-20260926.dump` (SHA-256
`4da3ab92f986fd7a4d725aa7036b6f842b538ec99b51f8964bb0dd7f87755322`), then
the Gate 1/2 migrations `20260917000000` and `20260921000000` were applied with
forward-only `migration up`. Post-migration counts were unchanged. Do not run
reset-based validation or use this database for destructive test fixtures.

Real-data testing has now moved beyond that zero-row checkpoint. On 2026-09-30
the personal stack held 799 transactions from two durable upload batches and
203 suggested transfer links. Attempting to confirm the whole account-pair
group exposed a client/server cap mismatch: the UI selected 203 although the
validated Edge/SQL boundary permits 200 per atomic decision. The request was
rejected before execution and left zero transfer decisions. The client now
selects a deterministic maximum of 200, visibly defers the remainder to the
next action and has an exact 203-item regression. Preserve this imported state;
it is evidence, not a reason to reset.
A post-import custom-format backup was catalog-verified at
`backups/halcyon-post-test-import-20260930.dump` (SHA-256
`93e0b4f5214a4d191c0972bfd34995d40ec394094ae639c3260001d125f01c5c`).

Before any migration, recovery, live integration test or re-import, read and
follow [SYSTEM_INTEGRITY.md](SYSTEM_INTEGRITY.md). In particular, use a positively
identified isolated project for destructive test flows.

## Verified state at the last implementation pass

The August verification passed the unit suite, strict TypeScript check,
production build, live Phase 4/5 checks, database invariants and authenticated
Ledger browser checks. The current suite passes 301 unit tests with 14
environment-dependent skips, frontend and browser-suite
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

On 2026-10-01 the new `npm run test:golden` harness passed against a fresh,
positively identified disposable Supabase project on dedicated ports. It
replayed every migration, served the real Edge Functions, created both accounts
through the rendered workflow, imported the current 565-row Macquarie
transaction and 234-row Macquarie savings CSVs, exercised live categorisation,
matched 203 transfer links (202 review plus one automatic), confirmed the safe
200-row batch and remaining decisions, generated a fresh categorisation-review
preview, and asserted 799 source rows, two upload batches, final balances and
zero browser errors. It then deleted only its fixture tenant/user and stopped
the disposable stack. The personal database was neither targeted nor modified.

## Sensible next directions

Choose one of these deliberately; they represent different kinds of work rather
than a single mandatory sequence.

1. **Keep the golden pass as the release gate.** Run `npm run test:golden`
   after changes to migrations, ingestion, transfer review or categorisation.
   It now provides the repeatable confidence check that was previously missing.
2. **Classification review workflow — Gates 1 and 2 complete.** The Ledger
   now previews and applies fresh suggestions for an intentional selection of
   up to 500 rows, with protected decisions, impact preview, atomic application
   and guarded undo. Its isolated migration/API/browser gate and five-file,
   793-row representative CSV quality gate are green. Remaining product scope
   is the safe unresolved default, an
   all-eligible runner, and durable/resumable review runs only if their usage
   justifies persistence. The contract is in
   [TAXONOMY_AND_LEDGER_PLAN.md](TAXONOMY_AND_LEDGER_PLAN.md).
3. **Ingestion hardening.** Phases 1–3 are complete: a 5,000
   physical-source-row cap fails closed before browser staging, in the Edge
   Function and in atomic SQL; categorisation retains successful ≤300-merchant
   batches when a later request fails and flags only unresolved rows for
   review; imports resolve active global and tenant-custom category pairs
   before entering the atomic write. Isolated golden coverage proves the
   source cap/anchor/zero-write boundary, server batch cap and taxonomy
   isolation. Phase 4 is complete: isolated golden coverage verifies
   sequential partial-overlap/reconciliation, atomic rollback, connected
   cutover and saved-profile persistence; it also bounds a hung categorisation
   chunk and verifies project-scoped test-container cleanup. A forward
   security migration removes the legacy browser-direct transaction-mutation
   path. The unit/build/browser-typecheck gate, real-AI golden rerun and
   six-file (2,850-row, 605-merchant) Gate 2 corpus are green; the non-mutating
   fresh review made no transaction writes or merchant-cache changes. The
   implementation workflow, phased contract and isolated-test gates are in
   [INGESTION_HARDENING_PLAN.md](INGESTION_HARDENING_PLAN.md); the original
   audit remains in [INGESTION_REVIEW.md](INGESTION_REVIEW.md).
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
npm run test:golden  # self-provisions and tears down an isolated local stack
```

Run browser and live integration harnesses only against an isolated, explicitly
acknowledged target; their safety guard intentionally refuses the personal local
database.
