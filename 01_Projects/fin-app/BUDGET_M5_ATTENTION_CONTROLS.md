---
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: attention-controls-implemented-m5-gates-open
project: Halcyon
created: 2026-10-22
updated: 2026-10-22
related:
  - "[[BUDGET_M5_LIFECYCLE_CONTROL]]"
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_FEATURE_SPEC]]"
---

# Budget M5 — attention, review and snooze

## User contract

**A few things to check** is a counted, prioritised queue in the authenticated Budget workspace.
It initially shows three active checks, with access to every check, including earlier reviews and
snoozes. Unfunded/date-sensitive obligations and resource gaps come before actual overspend, then
evidence/setup issues; stable ties use date and issue identity.

The initial reasons use existing authoritative inputs: current/continuing funding gaps, signed
everyday/category/Other/reserve/fixed remainders, scheduled bill amounts not fully matched, dated
goal/reserve target shortfalls, changed matches, unassigned credits, uncategorised spending and
missing/unavailable/manual account history. An unmatched payment is explicitly **not proof a bill
is unpaid**. Target coverage is a budget-plan estimate, not a forecast bank balance.

Flexible-spend finish forecasts, pending-overage prediction, late-income alerts without an explicit
expected pay date, and detector-driven price-change queue integration are not fabricated here.
The existing M4 bill proposal/update flow remains available. Those reasons need their complete
calculation inputs/production adapters; M6 assisted/pacing work and wider M5 integration gates remain.

### Available choices

- **I've reviewed this:** quiet this issue until the selected budget ends, unless a material change
  brings it back sooner. The issue is not marked fixed or financially resolved.
- **Remind me on a date I choose:** show it again on that local date, strictly after today and no
  later than this period's exclusive end. An empty, past or out-of-window date cannot save.
- **Show this again now:** remove the quiet state without changing money.
- **Undo last review preference:** append the prior preference as a new event, provided the latest
  attention version, financial version and source evidence remain compatible.

Only the owner can change preferences; viewers can inspect. Current-period preferences are
editable even while budget generation is paused. Earlier/future checks remain readable, not
editable. No external notifications, recurring jobs, automatic allocations or automatic transfers
are introduced.

Reviewed/snoozed monetary issues remain in **These gaps still remain**, as signed amounts. The
copy warns that parent and category amounts overlap and must not be added together. Existing
allowance and activity views retain their arithmetic. Quiet reminders never imply better finances,
verified savings, money available or paid bills. Missing history remains a separate check, not an
unsupported all-clear state.

## Materiality and evidence rules

Preferences are scoped by tenant, plan, saved period and stable reason identity. No ordinary
refresh or unrelated tenant source-version bump alone resets them.

| Change since review | Presentation |
| --- | --- |
| Gap rises by at least `max(2500 cents, ceil(saved available allowance / 20))` | Active again |
| Due date changes | Active again; a rescheduled bill occurrence has a new date-specific identity |
| Account scope/completeness, purpose/archival state, relevant match interpretation or target terms change | Active again |
| Previously relevant source disappears or its account/date/kind/taxonomy interpretation changes | Active again |
| Ordinary new spending below materiality, or an unrelated import | Keep prior preference |
| Named snooze/review expiry arrives | Active again |
| No longer an issue in the current facts | Absent from the current queue; immutable preference history remains |

The threshold uses the allowance at the time of review, with exact SQL numeric cents. This avoids
moving the reopening threshold after acceptance. A new explicit review establishes a new baseline.
Sub-threshold changes accumulate against that saved baseline, not against each refresh.

Source interpretation maps compare already-reviewed relevant sources. New ordinary sources do
not alone trigger reopening; their financial effect is governed by the threshold. Merchant display
text and amount changes alone are not semantic reclassification. Existing source removal,
kind/date/taxonomy/account changes and changed claim validity remain meaningful. Unavailable
inputs never become a zero gap. There is no fabricated persistent "resolved" episode written by
reads; the live queue is derived and preferences expire at the period boundary.

## Durable boundary and financial isolation

Migration `20261022060000_budget_attention_controls.sql` adds append-only
`budget_attention_events`, member SELECT RLS, no browser mutation grants, an anonymisable actor,
and a deferred tenant-scoped operation FK. The separate monotonic attention version serialises
preferences. **Financial plan versions, allocations, templates, claims, source revisions, reviews
and saved frequency intent are not modified by a preference.**

`budget_workspace_details` composes financial details and attention under the same source gate.
It deliberately does not extend financial `budget_details` payloads: presentation changes must
not mark immutable financial reviews changed or contaminate rollback-only policy previews.
`budget_attention_facts` derives complete SQL aggregates; raw source maps/private baselines are
not sent in the public workspace response. Reads insert no acknowledgement/resolution events.

Strict Edge `set_attention` carries the issue key/hash, expected source/financial/attention
versions and explicit choice/date. SQL recomputes the current issue before writing. Stale issues,
versions and dates fail closed. Event, operation and idempotent receipt commit atomically;
exact receipt replay precedes disabled-write/version checks. The original financial Undo remains
discoverable because attention operations deliberately omit `after_state.plan_version`, storing
their financial guard separately. Compatible attention Undo is append-only and independently
versioned; a dependent change prevents destructive compensation.

`BudgetAttention.tsx` uses existing theme tokens, native radio/date/checkbox controls, 44px targets,
visible errors, explicit consequence copy, focused review headings and return focus. The UX-copy
skill guided the distinction between **reviewed**, **snoozed** and **resolved**. Source/version
refreshes keep local choices but invalidate acceptance; saving requires review of the latest check.
Unsaved period navigation and leave actions ask before discarding the choice. Financial correction
actions reuse the existing plan editor, allowance inspection, Ledger and account/import workflows.

## Verification and phase boundary

Verification completed:

- **388 full isolated SQL/Edge/browser checks across 80 migrations passed** via
  `npm run test:budget:lifecycle`, including the prior financial lifecycle, policy, goal, source-lock,
  feature-disable and receipt-recovery regressions.
- After final inspection/navigation/copy adjustments, **40 focused SQL/Edge/browser checks passed**
  through `node scripts/test-budget-durable.mjs --attention-only --workspace`. This uses the same
  fresh-project target/identity guards, migration replay and exact-project cleanup—not an alternative
  connection to the personal stack. Counts are separate suites, not added together as unique tests.
- `test-budget-attention.mjs` covers owner/viewer/foreign authority, public-baseline privacy,
  side-effect-free reads, one-winner concurrency, exact-key disabled-write replay, unchanged signed
  money/plan/template/financial Undo, separate attention Undo, unrelated-source quieting,
  sub-threshold accumulation, exact materiality, percentage rounding, semantic reclassification,
  stale hashes/versions/dates, show-again, expiry, immutable history and atomic final-write failure.
  It also checks readable parent-category labels, separate funding/dated-goal gaps and preserved pending frequency intent.
- Expiry uses an explicitly seeded expired immutable event in the disposable fixture, not a
  production clock override or a claim that the browser waited through a real day boundary.
- `test-budget-attention-interactions.mjs` runs actual signed-in Edge mutations on phone/desktop:
  review/reload, persistent signed gap, show-again, bounded date entry, stale refresh with retained
  choices, separate renewed acceptance, dirty period navigation, snooze/Undo, everyday/category inspection,
  cancelled exit, focus return, non-monetary copy, no page overflow and no browser runtime errors.
- **496 unit tests passed / 14 existing skips**; focused Budget TypeScript and production build
  passed. Full-app TypeScript retains the existing unrelated `StrategicProjections.tsx:252`
  PlanningMetric/ProjectionMetric mismatch; the known main-chunk size warning remains.
- Inspected captures: `/tmp/halcyon-budget-attention-phone.png` (390px) and
  `/tmp/halcyon-budget-attention-desktop.png` (1440px). Theme tokens/native controls and plain
  reviewed-versus-resolved copy carry the UI; no new notification or gamification surface exists.
- Full target `halcyon-budget-m2-ad4757a0f19c4cdc` and focused target
  `halcyon-budget-m2-dbc35e3ae9ac4004` used API57421/DB57422. Captured fixture identities,
  accounts/transactions, plans and source gates were cleared. Exact-project containers, volumes
  and networks were removed; earlier failed runs also executed scoped teardown. No personal query,
  migration, feature flag enablement or live deployment occurred.

This closes the authorised M5 attention acknowledgement/snooze/materiality slice. Wider M5
temporal/goal/policy integration and realistic complete-chain performance/resumption remain open.
M6/M7 gates are unchanged; independent beginner/accessibility review, backup/restore, persistent
migration and rollout are not claimed complete by this automation.
