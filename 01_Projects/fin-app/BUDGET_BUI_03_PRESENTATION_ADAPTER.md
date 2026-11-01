---
tags: [halcyon, budgeting, design, engineering]
type: implementation-checkpoint
status: complete
project: Halcyon
created: 2026-10-25
updated: 2026-10-25
related:
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
  - "[[BUDGET_BUI_01_REFERENCE_MAP]]"
  - "[[BUDGET_BUI_02_TASK_PANEL]]"
---

# BUI-03 — canonical presentation adapter

**BUI-03 Complete — 25 October 2026. Next: BUI-04 header and hero.**

## Contract and production wiring

`app/src/lib/budgetPresentation.ts` maps one authoritative `Snapshot` and explicit
client read/write-result status to bounded display models. It has no fetches, storage,
commands, ledger-feed input, injected/fixed clock, currency conversion or alternate
financial calculations. It does not sum source pages or derive balances by subtracting
visible rows. Returned models cover period/provenance, income, actuals, everyday,
category/Other, separate goal/commitment facts, existing attention and history facts.

Every `BudgetValue` distinguishes known integer cents from unavailable (which has
no `cents` property). Each independently carries basis, coverage, freshness,
provisional status, reason codes and tenant/plan/period/source/method provenance.
Known zero and signed negative values survive. Missing, null, fractional, non-finite,
string and unsafe cents are unavailable. Provisional figures may also be stale.

The current recorded-totals and everyday/category sections now consume the adapter
through `BudgetValue.tsx`. Shared `fmtCents` performs the single display conversion.
Reason text is available to assistive technology and as a title; visible existing
section warnings qualify incomplete/manual/future/stale/invalid-chain amounts.
The overall layout and task entry points are retained; BUI-04 builds the new header/hero.
The existing active-plan editor and all financial request constructors remain intact.

`BudgetContext` now tracks read status independently from its command error text:
initial/loading, ready, history preparation, failed read and invalidated facts.
An ordinary rejected command does not automatically mark a successful read stale.
Explicit server `budget_stale_source/plan/method` conflicts do invalidate it; a
successful fresh read clears the qualification. Pending write outcomes separately
qualify the previous snapshot until the original request is resolved. No Save/Undo/
recovery receipt, retry key, owner gate or write-admission rule changes.

## Field authority and decisions

| Surface | Mapping / decision |
| --- | --- |
| Everyday | Item `planned_cents`, `used_cents`, `remaining_cents`, `opening_carry_cents`, `reallocated_cents`. Remaining is never planned minus used. Saved allocation is a plan-only fallback when details are missing/incompatible, never a fallback for a malformed present item amount |
| Income/gaps | `revision.income_cents`, separate `drawdown_cents`, actual earned income, signed `unallocated_cents`, separate future-template gap. No resource/ledger total reconstructed |
| Categories/Other | Stable limit and taxonomy scope IDs. Child overages remain signed even in a positive pool. Other reads scalar `other_flexible_remaining_cents` for both rollover states; missing/null remains unavailable |
| Manual plan | Saved plan inputs remain known. Recorded income/spending are unavailable without an intersecting activity membership. Canonical budget room can remain known, explicitly provisional and not verified cash |
| Incomplete coverage | Known activity remains numeric with partial/provisional qualification; not silently zero or complete |
| Invalid scope/chain | Plan-only inputs remain; invalid-scope observations and dependent balances are unavailable. An invalid history chain invalidates carried balances even when the current period's activity itself is valid |
| Future | Plan/budget figures are provisional; received income and recorded spending are unavailable. Server lifecycle determines state; no client wall clock substituted |
| Retained read | Failed/refreshing/preparing/invalidated/pending-outcome figures remain qualified as stale rather than replaced by temporary zero |
| Goals | Reserve, net purchases, bank evidence and user confirmation are separate values. No combined confirmed total or completion date is invented. Unknown target remains unknown; later goal composition must retain these distinctions |
| History | Original/latest plan facts and immutable recorded-review payload remain separate, with changed-review status. No fabricated historical series |
| Limits off | Single pool; no invented full category-observation list or feed aggregation |
| Viewer/paused writes | Read qualification does not depend on permission to mutate; existing restrictions remain owned by the provider/server |

Detail-derived facts must match the snapshot source and plan versions. Missing or
incompatible details cannot be combined with an otherwise valid saved snapshot.
Period models preserve exact dates, exclusive end, timezone and lifecycle `as_of`.
Days-left copy/arithmetic belongs to BUI-04 using the existing local-date helpers.

## Wire audit

`BudgetItem.remaining_cents` is now `number | null`.
`BudgetDetails.other_flexible_remaining_cents?: number | null` now describes the
already-shipped scalar field; optionality accommodates partial/older reads without
coercing a missing property to zero. No migration or server calculation was needed.

Relevant chain:

- `20261022000000_budget_period_reviews.sql:71–80`: lifecycle wraps M4 facts,
  nulls item balances/reserves when the history chain is invalid, and supplies the
  scalar Other remainder even with category rollover off.
- `20261022020000_budget_frequency_changes.sql:27–36` and
  `20261022030000_budget_account_policies.sql:162–170`: compose frequency/account
  metadata without replacing financial fields.
- `20261022040000_budget_category_rollover.sql:115–130`: replaces limit/Other
  carry/remainder with canonical partition-chain parts when rollover is enabled.
- `20261022050000_budget_lifecycle_controls.sql:46–60`: applies signed control
  rights before lifecycle/rollover composition; `:113–121` appends control metadata.
- `20261022060000_budget_attention_controls.sql:125–131` and history-preparation
  wrappers expose these complete facts at the workspace boundary. Later aggregate
  and prefix-reuse implementations retain nullable chain balances and field names.

The frontend types already guarded most nullable uses. The adapter additionally
checks exact cents/availability at its display boundary and never casts a null
into money. Generic old task forms are not rewritten in this burst.

## Verification

`budgetPresentation.test.ts` adds **43 semantic cases**, included in the focused
Budget TypeScript configuration. Cases cover canonical carry/rights/Other, signed
gaps/child overages, zero/unknown/exact extremes, no-bank/destination/expired scope,
future/incomplete/stale/invalid-chain and mismatched detail versions, independent
provisional carry versus received income, separate overlapping goal evidence,
preserved historical facts/provenance and non-mutation of deeply frozen input.

Fresh static checks: full/focused/browser TypeScript, **559 unit tests passed / 14
existing skips**, runner syntax and production build pass; existing chunk advisory
remains. No package/lockfile changes were made by this burst.

The guarded focused command (from `app/`) is:

```sh
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --presentation-only --workspace
```

Focused run: **32 isolated checks across 91 migrations**, target
`halcyon-budget-m2-1aead0460fcf4364`, API `127.0.0.1:57421`, DB
`127.0.0.1:57422/postgres`, frontend `127.0.0.1:57300`. Includes existing assistance
prerequisite checks, not an additive count to previous milestone runs. Fixture
identity/account/transaction cleanup and exact-project removal passed.

Authenticated proof includes the $290/$350 everyday/Other example and a signed $60
child overage; releasing $50 reserve rights changes parent/Other to $340/$400 while
planned $1,800 and used $1,510 remain unchanged. Failed refresh retains and marks
those values stale; retry restores freshness. Revoked coverage qualifies known
activity; invalid account currency hides dependent values; manual and future
plans do not show recorded zeroes. No runtime errors. Four fresh axe scans cover
390/1440px light/dark, plus 320px unavailable-value overflow proof.

Seven authenticated production captures are in `docs/budget-ui/bui-03/captures/`.
Desktop light and manual phone dark were visually inspected; the existing composition
is intentionally retained. These scans/captures are scoped evidence, not replacement
of the full M7 audit or owner/human acceptance.

Existing item/workspace regression: **208 isolated checks across 91 migrations**
passed in separate target `halcyon-budget-m2-5d29677e98c34111`, using the same dedicated
port set. This is a separate non-additive run total. It verifies the established
SQL/Edge/authenticated setup, assistance, item, matching, source/plan rejection,
read-failure, goal, Undo and disabled-write/receipt-recovery paths. Runtime errors:
zero. Fixture counts/cascades and exact project cleanup passed. This burst does
not claim a new full lifecycle/performance/human release audit.

## Handback

No personal data query/migration, feature exposure, rollout, backend contract change
or new forecast. R01–R05 and broader M7 gates remain open. Existing unrelated working
changes are preserved. Next after verification: **BUI-04 — header and hero**, using
this adapter and its qualified value models. Preserve the BUI-02 task coordinator.

## Delivery checkpoint

Burst / status: BUI-03 — Complete.

Behavior and visual change: canonical read-only display models and qualified values
wired into existing totals/everyday/category sections; missing/invalid/future observed
values no longer look like zero. Manual budget room stays explicitly provisional.
Other's scalar remainder is exposed; overall composition remains for BUI-04 onward.

Files changed: `budgetPresentation.ts` and semantic tests; `BudgetValue.tsx`;
`budgetItems.ts`/`budgetWorkspace.ts` wire/status types; `BudgetContext.tsx` read status;
existing `Budget.tsx`/`BudgetItems.tsx` consumers; focused type configuration;
presentation harness and two guarded dispatch points; this record and handoff/index/
resume/capture documents. The type/provider/consumer changes form one coherent
read-only extraction; no financial command or kernel was extracted or rewritten.

Commands / target / actual results: 32 focused and 208 item/workspace isolated checks
(separate targets/totals), 559 unit passes/14 skips, full/focused/browser TypeScript,
runner syntax, build and scoped diff whitespace checks pass. Four fresh axe scans,
seven captures and narrow overflow proof. Exact targets above removed; no personal
database target used.

Visual captures and review decision: engineering inspection only. This is truthful
current-layout wiring, not owner acceptance of the new overview or human a11y proof.

Known failures or unchanged release findings: R01–R05, final changed-flow M7 and
owner review gates remain; combined confirmed goal progress remains unproven and
must not be drawn as a summed total. Existing chunk advisory remains.

Exact next burst: BUI-04 only. Compose the compact period header/navigation and
hero/income using these values; preserve canonical balances and BUI-02 navigation/
pending guards, keep lower sections reachable, show unavailable/provisional/signed
states next to amounts, and request owner review using actual desktop/phone captures.
