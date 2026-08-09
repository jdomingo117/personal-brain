---
aliases:
  - Managed Investments
  - Managed Fund Accounts
tags:
  - halcyon
  - investments
  - architecture
type: technical-reference
status: current
project: Halcyon
up: "[[CONTEXT]]"
related:
  - "[[INDEX]]"
  - "[[MVP_SCOPE]]"
  - "[[System requirements - SRD]]"
---

# Managed investments

This document is the implementation and operating reference for Halcyon's managed-investment
accounts. The feature is scalable rather than tied to one user's account: Vanguard Personal
Investor and Vanguard High Growth Index Fund are the first provider adapter and catalogue entry,
while the storage, valuation, performance and tax-awareness layers are provider- and
instrument-neutral.

## Shipped scope

- `Invest` accounts own one or more `investment_holdings`; holdings reference a global
  `investment_instruments` catalogue.
- Provider CSVs are parsed through explicit adapters. The first adapter recognizes Vanguard
  Personal Investor managed-fund exports, validates the APIR code, preserves decimal unit
  precision, and maps source rows into a generic activity vocabulary.
- Import is previewed before commit, reconciles calculated units, and stores only the source
  account's final four digits. Server-side content identity makes repeated imports idempotent while
  retaining genuinely repeated source rows through an occurrence index.
- `investment_activities` is a separate immutable activity ledger. Supported activity types are
  purchase, redemption, distribution reinvestment, cash distribution, fee, opening units, unit
  adjustment and cost-base adjustment.
- Official daily fund prices are normalized into `instrument_prices`. On-demand, stale-on-open and
  scheduled refresh paths share the same provider adapter, retain the provider's publication date,
  replay a correction window, serialize concurrent syncs and preserve the last good value on error.
- Set-based valuation snapshots derive units, current value, external flows, distributions and
  market movement. The current account balance is valuation-owned and cannot be overwritten by an
  ordinary account edit.
- Investment account UI shows current value, precise units, contributions, reinvested
  distributions, contribution-neutral performance, NAV status/history and the activity ledger.
- Australian financial-year summaries flag potential disposal records and support an audited AMMA
  record-status workflow and CSV record summary. This is record awareness, not tax, CGT or AMMA
  calculation or advice.
- `net_worth_monthly` combines reconstructed cash accounts with investment valuation snapshots, so
  moving cash into a fund does not create or destroy consolidated net worth.

## Import and valuation invariants

1. The browser parses and reviews the file, but the server revalidates identity, activity types,
   dates, units and money before writing.
2. Decimal unit/price strings are never converted through binary floating-point arithmetic.
3. A byte-identical repeat import inserts no activities and is a strict monetary no-op: it does not
   change the cached account value, `balance_as_of`, or valuation snapshots.
4. A genuine new activity rebuilds only the affected account from already-stored prices. Import is
   not coupled to a live provider request or an all-tenant rebuild.
5. Price synchronization updates valuations only after a valid normalized response; a failed or
   empty response leaves the last known value intact and visibly stale.
6. Tenant-owned holdings, activities, valuations, sync state and tax-workflow records are protected
   by membership RLS. Global instrument metadata and prices are readable reference data, but tenant
   clients cannot publish them.

The priced duplicate regression fixed on 2026-08-08 is covered explicitly: import, price, re-import
the identical file, then assert that the cached balance, price date and snapshot count are unchanged.

## User experience

An Invest account deliberately does not reuse bank-account spending analytics. Its detail view
centres the information a personal investor needs: what is held, what it is worth, the valuation
date, the source and freshness of that value, contributions versus market movement, and a readable
activity history. Import reports inserted and skipped rows, requires unit reconciliation, and keeps
provider/source details visible enough to diagnose an incorrect file without exposing a full
account identifier.

Unavailable or stale prices remain explicit rather than displaying a fabricated daily change.
Tax-oriented wording consistently directs the user to retain provider records and seek qualified
advice where needed.

## Testing and operational validation

The normal verification stack is:

```bash
cd app
npm test
npm run build
node scripts/test-investments.mjs
```

The unit suite covers decimal arithmetic, Vanguard activity parsing, official-price normalization,
deduplication and UI-facing investment calculations. The integration harness uses the anonymized
Vanguard corpus and validates exact units/cents, unpriced and priced duplicate imports,
account-scoped revaluation, balance ownership, official price history, contribution-neutral
performance, mixed net worth, Australian financial-year boundaries, AMMA mutation security/audit
and tenant isolation. Scheduled-price-sync setup and verification are documented in
`supabase/functions/sync-investment-prices-cron/README.md`.

## Bank-to-investment cash reconciliation — shipped 2026-08-08

Managed-fund purchases and bank transactions remain in their correct separate ledgers, joined by
`investment_cash_links` rather than synthetic transaction rows. A linked purchase or redemption
makes its bank leg a transfer in `transactions_analytic`, so contributions do not appear as spending
and redemption proceeds do not appear as income. Investment valuation and consolidated net worth
are unchanged by the link.

Matching runs after bank CSV import, provider sync, investment import and manual transfer rescan, so
import order does not matter. The exact-value matcher is bounded by amount buckets, requires opposite
cash direction and a four-day settlement window, and uses dates, weekend settlement, platform names,
bank category and investment language as evidence. Unique high-confidence pairs link automatically;
lower-confidence or ambiguous pairs are suggestions for review.

The supplied anonymized corpus is the acceptance fixture:

| Bank outflow date | Fund purchase date | Amount | Expected result |
|---|---|---:|---|
| 2025-06-10 | 2025-06-11 | $10,000 | Auto-linked investment funding |
| 2025-07-09 | 2025-07-10 | $3,715 | Auto-linked investment funding |
| 2025-10-03 | 2025-10-06 | $2,000 | Auto-linked across a weekend |
| 2025-10-13 | 2025-10-13 | $30,000 | Auto-linked same day |

`investment_cash_decisions` stores content identity rather than depending on live row IDs. A user's
confirmation or rejection therefore survives deleting and re-importing either source. The newest
human decision across the bank-to-bank and investment-cash systems outranks category heuristics.
Only the validated `decide-investment-cash-link` Edge Function may mutate decisions; direct browser
writes are denied and every decision is audited.

The Transfer review UI shows suggested pairs with Confirm/Not a match actions and automatic pairs
in a collapsible list with Undo. The investment activity ledger shows the linked bank account and
state beside each purchase or redemption. Import completion reports automatic and suggested counts.

DRP, cash distributions, fees, opening units, unit adjustments and cost-base adjustments are never
eligible. Cash distributions deliberately remain investment income. Current matching is one-to-one
and exact-value; split funding, combined purchases and cash left sitting in an intermediary platform
cash account remain explicit future scope rather than being guessed with subset matching.

Integrity coverage includes the four corpus pairs, bank-first import, idempotent rescans,
delete/re-import decision survival, DRP exclusion, redemption direction and brokerage, ambiguous
duplicates, direct-write denial, cross-tenant isolation, analytics exclusion, distribution-income
retention, audit evidence, unchanged mixed net worth and the pre-existing bank-to-bank regression
suite.
