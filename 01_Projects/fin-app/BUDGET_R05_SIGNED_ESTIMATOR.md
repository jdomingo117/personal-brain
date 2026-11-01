---
tags: [halcyon, budgeting, engineering, verification]
type: correctness-checkpoint
status: engineering-complete
project: Halcyon
created: 2026-10-26
updated: 2026-10-26
related:
  - "[[BUDGET_R04_INPUT_REVIEW]]"
  - "[[BUDGET_R03_READINESS]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[BUDGET_UI_IMPLEMENTATION_HANDOFF]]"
---

# R05 — signed observations and explicit planning amounts

R05 reconciles the assistance estimator with the frozen signed expense/refund
rules. Historical observations retain their sign. A planning allowance remains
nonnegative and requires a separate user choice when the observed median is negative.

## Calculation and presentation

Forward migration `20261026030000_budget_assistance_signed_estimator.sql` (95)
removes the per-period zero floor from everyday net expense. For example, the six
cent observations `[-300, -200, -100, 200, 300, 10000]` have a median of 50 cents.
The former floor produced 100 cents. The outlier stays in the sample; the UI shows
the signed median and range with the complete comparable period details.

The median uses exact integer cents. For even samples, half-cent ties round away
from zero: +0.5 cent becomes +1 cent and −0.5 becomes −1. Empty history returns
unknown, while a genuinely covered zero-activity period contributes a real zero.
All serialized money and estimator samples are checked against the JavaScript
safe-integer ceiling before conversion. The transaction row's existing int32
storage limit is distinct from the supported larger exact aggregate.

Each historical period exposes gross expense, credits, signed recurring expense
and signed everyday expense. Gross minus credits reconciles to net expense;
recurring plus everyday reconciles to the same total. Canonical split children
replace their parent once. Own transfers and card repayments stay excluded;
rejected derived transfers restore expense. A loan payment remains expense until
an actual reviewed principal/interest split exists. Credits stay in their receipt
period and are not earned income. Pending activity remains separate; deduplicated
imports and replacement sources count once.

A negative observed median yields no automatic everyday proposal. The historical
replacement control is disabled. The user can retain an existing reviewed amount
or enter an explicit nonnegative allowance, including zero, without changing the
historical observation. Selective R04 merges and manual fallback preserve that
choice, protected allocations, goal intent, reserves and top-up.

Current setup has no reviewed transaction matching yet. Its redirection guard
therefore counts all settled gross expense, including unmatched regular costs,
and exposes unassigned credits separately. A refund cannot manufacture current
Flex room or income. This strengthens R03's target-usage semantics to follow the
frozen unassigned-credit rule; signed historical net expense is evidence, not
current spending capacity. Unknown coverage/integrity still suppresses room.

## Durable compatibility

The estimator method and fingerprint move to `budget-assist-v2`. Older automatic
v1 drafts remain readable with their amounts and goals intact, but require a new
history/input review or explicit manual conversion before activation. Explicit
manual v1 drafts remain valid. Existing command receipts retain their original
idempotent replay behavior. No stored draft or receipt is rewritten.

Migration 95 retains fixed search paths, timeouts, service-only execution grants,
tenant/source locks, R02's independent calendar/fortnight gates and R04's atomic
activation and concurrent receipt recheck. This is an additive isolated migration;
no personal database migration or feature rollout has been performed.

## Verification

- A separate 94-migration red target passed 21 diagnostic checks, demonstrating
  the old 100-cent result versus the signed 50-cent reference.
- The final 95-migration reference/browser suite passed **73 checks**, including
  signed/zero/missing periods, exact rounding, boundaries, leap-day fortnights,
  canonical ledger-kernel parity, principal/interest and refund splits, actual
  transfer links, rejected derived transfers, repayments, pending activity,
  recurring refunds, deduplication and replacement, current unassigned credits,
  v1/manual compatibility and the explicit allowance UI.
- The R02–R04 dependency rerun passed **98 checks** on a separate fresh target,
  including protected drafts, current gross-room boundaries and the forced
  concurrent activation/receipt race.
- Full lifecycle regression passed **472 checks across 95 migrations** on a
  separate fresh target, including activation, policies, lifecycle and receipt recovery.
- **586 unit tests pass, with 14 existing skips.** Full, focused and browser
  TypeScript and production build pass. The existing bundle advisory remains.
- The reference suite includes four WCAG scans and four phone/desktop light/dark
  captures. These scoped automated results do not close M7's human gates.

One initial vector attempted an unsupported int32-sized transaction row and was
correctly rejected by existing storage. The fixture now distinguishes row storage
from aggregate arithmetic: two maximum int32 rows produce a larger exact total.
No production arithmetic or storage guard was relaxed to accommodate the test.

Verified commands from `app/`, with the installed CLI supplied as `SUPABASE_CLI`:

- `node scripts/test-budget-durable.mjs --estimator-only --workspace`
- `node scripts/test-budget-durable.mjs --input-review-only --workspace`
- `node scripts/test-budget-durable.mjs --items --lifecycle --workspace`

Each command provisions its own disposable project on API 57421/DB 57422 and must
never target the personal stack or a retained preview. Completed targets:

| Purpose | Exact disposable project |
| --- | --- |
| Red baseline | `halcyon-budget-m2-5b48d14fac60425a` |
| Initial green smoke | `halcyon-budget-m2-39bc256646f94259` |
| Initial vector/storage fixture | `halcyon-budget-m2-e1f983e14f814c5b` |
| Final reference/browser | `halcyon-budget-m2-0d897e54c23c467f` |
| R02–R04 dependencies | `halcyon-budget-m2-2e4c754dc1584b56` |
| Full lifecycle | `halcyon-budget-m2-17b3b54e4ec84bc8` |

Exact container, volume and network label audits confirm all six completed test
projects and the retired R04 preview are clean. The new retained preview is
separate from every test target.


## Retained review site

Historical preview: disposable project `halcyon-budget-m2-880c033143ee46e5`, runner PID 43805,
served `http://127.0.0.1:57300/budget` (API/DB 57421/57422). All seven fictional
accounts passed real password sign-in and their sample/setup/history/eligibility/
readiness/individual-input/signed-estimator controls. The existing in-app tab is
signed into the signed-estimator account through normal login. Its observations
show a −$0.51 median, −$3.00 to $0.20 range and −$8.00 unassigned current credits.
The user-chosen planning inputs are separately $100 expected income, 15 October
pay and $25 everyday allowance. “Use this draft” is enabled, but no draft was
saved or plan activated. The browser is left at the signed observations.

Screenshots: `/private/tmp/halcyon-r05-ready.png` and
`/private/tmp/halcyon-r05-allowance.png`. Runtime credentials remain in the runner's
mode-0600 `manual-preview.json`, outside documentation. Availability lasts while
this exact runner remains alive; stop and verify cleanup before conflicting
isolated tests. Never reuse the retained preview as a destructive test target.
The prior R04 preview was positively identified, stopped and cleaned. Personal
app/API 5300/54321 remain untouched.

## Position in the implementation

R02–R05 correctness work is complete with the verification above.
Next engineering is **BUI-09b assistance presentation/finalization**, followed by
BUI-10 candidate verification and BUI-11 owner handback. The UI count remains
**14 of 17 bursts** because this is separate correctness work. R01 forecasting
remains open, as do M7 human accessibility/comprehension, capacity, persistent
migration rehearsal, security/candidate and rollout gates. Release remains No-Go.

The R05 retained preview was positively identified, stopped and cleaned for BUI-09b. The replacement and current next task are recorded in [[BUDGET_BUI_09B_ASSISTANCE]].
