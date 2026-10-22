---
aliases:
  - Budget Calculation Foundation
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: m1-complete
project: Halcyon
created: 2026-10-20
updated: 2026-10-20
related:
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_M0_CONTRACTS]]"
  - "[[BUDGET_SCOPE_BASELINE]]"
---

# Budget M1 — calculation foundation

**20 October 2026 · Pure calculation foundation implemented; M2 durable boundary is next.**

Implements M1 of the approved plan, without a production route, database migration, source adapter
or data mutation. Both browser and server copies are UI/network/storage independent. Product scope
remains **BUDGET-V1-2026-10-20**. The standalone concept is unchanged.

## Modules and contracts

Browser source: `app/src/lib/budget/`. Deno-safe mirror:
`supabase/functions/_shared/budget/`. All imports are explicit local `.ts` imports. `index.ts`
exports the foundation; every production module is byte-identical across the two directories.

| Module | Implemented behavior |
| --- | --- |
| `types.ts` | Local dates, injected clock, monthly/fortnightly configurations, half-open periods, contribution schedules, bounded line aggregates, separate global/custom taxonomy IDs, funding provenance and goal lifecycle inputs; stable calculation error codes |
| `money.ts` | Safe integer-cent validation, checked bigint-to-JSON conversion, exact intermediate arithmetic, bounded-input sums, subtraction and ceiling division; no inline dollar formatting |
| `periods.ts` | Strict Gregorian date validation (0001–9999), leap/century years, local-date day/month arithmetic, preserved desired month day, IANA-timezone clock, period containment, tomorrow-based remaining days, bridge/full-period transitions and actual inclusive contribution dates |
| `plan.ts` | New resources versus new allocations and signed funding gap; spending-line remaining; conserved two-line reallocation previews; non-overlapping Flex partitions and Other; removal merges allocation/carry/activity; signed carry and default rollover policies |
| `reserves.ts` | Signed reserve after net expense; distinct planned/bank-observed/user-confirmed contribution progress; bounded movement-capacity checks; purchase-plus-reserve goal coverage; dated contribution suggestions; conditional goal timing and 12-calendar-month suggestion horizon |

### Important arithmetic choices

- Money stays integer cents. BigInt intermediates prevent precision loss, including a final safe
  result whose intermediate addition exceeds JS safe-number range. Unrepresentable output raises
  an explicit error; it is not rounded, saturated or silently converted into zero.
- Resource summary accepts new allocations only, once per stable line ID. Opening carry and
  existing reserves are not fresh income. Flex children are partitions of their parent, not more
  allocations. Callers must not also pass those children as independent resource allocations.
- Missing aggregate inputs fail validation rather than becoming zero. Completeness/freshness
  gates remain the responsibility of M0's authoritative adapters and later snapshot boundary.
- A line can have negative remaining/reserve/carry. Refund effects are signed. Rollover off retains
  the prior period's variance; it does not rewrite history. `carryForward` calculates an existing
  policy, not a policy-change action. Changing rollover with accumulated carry still needs M5's
  explicit disposition/release preview and durable operation.
- `moveAllocation` previews spending/reserve/everyday rights only. Contribution releases require
  the later evidence-aware plan operation, not conversion of recorded savings into spare spending.
- Contribution evidence never increases reserve twice. Both bank-transfer legs must resolve to
  one authoritative movement ID upstream. This helper checks divisions within the supplied set;
  it cannot establish cross-goal exclusivity or concurrency without M2/M4 SQL locks and matches.
- Goal coverage is `reserve remaining + net qualifying purchases`, not a bank-balance promise.
  A matched refund moves value back from purchases to reserve without increasing total coverage.
  Purchase-recorded/archived/paused/draft goals do not auto-start contributions. Unpriced and
  zero-contribution goals do not receive invented completion dates.
- Due-date suggestions exclude scheduled dates already reflected in the available reserve and
  include only real dates on/before the deadline. No remaining dates means the gap is due now,
  with no division by zero. Ceil rounding is used only for the final cent contribution.
- Fortnights advance 14 local dates, including before the anchor. Monthly/fortnightly transition
  helpers return separate initial/bridge and continuing windows. They never prorate money or
  overwrite a plan. Stable persisted IDs, reviewed templates and atomic scheduling belong to M2/M5.
- Contribution schedule expansion has an explicit 10,000-date safety bound. Exceeding it fails
  visibly rather than truncating history. This is not a silent limit on persisted goals or periods.

## Verification

`foundation.test.ts` runs the same golden/property vectors against **both** implementations and
checks every mirrored file for exact equality. It also rejects prototype imports, storage/client
dependencies and implicit current-time calls in the production modules.

Verified results:

- **61 Budget foundation tests pass**. Loop-based properties additionally cover hundreds of date
  windows and allocation/carry combinations per implementation; test counts do not pretend these are
  independently observed users or live financial fixtures.
- **422 app unit tests pass; 14 existing tests skipped**.
- Focused TypeScript check covering browser modules, server mirror and foundation tests passes.
- Native Node TypeScript server-module smoke check passes without Vite transformation. Deno CLI
  is not installed here, so a native Deno runtime check is **not claimed**; Edge deployment/runtime
  verification remains a later gate.
- Production Vite build passes, with the existing large-chunk warning.
- Full app `tsc --noEmit` still fails at `StrategicProjections.tsx:252`, the documented
  `PlanningMetric` / `ProjectionMetric` mismatch (`net_worth` vs `netWorth`). It is unchanged and
  must not be described as a green full-app typecheck.
- `git diff --check` passes. No database or browser fixture harness was needed for this pure layer.

Reproduce from `app/`:

```sh
npm test -- src/lib/budget/foundation.test.ts
npx tsc --noEmit -p tsconfig.budget-foundation.json
npm test
npm run build
```

## Boundary and next milestone

M1 is a tested calculation library, not a live Budget engine or release. It does not claim complete
SQL actuals, coverage verification, automatic recurring bills, durable drafts, match exclusivity,
idempotent writes, guarded undo, actual period-close carry application, forecasts, suggestion gates
or a production UI. Those remain assigned to M2–M7 in the technical plan.

**M2 next:** translate the reviewed M0 schema/API/source-gate contracts into additive isolated
migrations, tenant/owner security, durable drafts/revisions, atomic idempotent commands, outcome
recovery and compatible undo. Prove real source invalidation and concurrency there before
connecting a live page. This phase authorizes no migration of the personal stack.
