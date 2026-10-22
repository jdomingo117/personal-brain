---
aliases:
  - Budget Concept Approval
  - Budget Frozen Initial Scope
tags:
  - halcyon
  - projects/fin-app
  - budgeting
type: scope-baseline
status: approved-frozen
project: Halcyon
created: 2026-10-20
updated: 2026-10-22
related:
  - "[[BUDGET_FEATURE_SPEC]]"
  - "[[BUDGET_SUGGESTIONS_PROPOSAL]]"
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
---

# Budget V1 — concept approval and frozen scope

**Baseline ID: BUDGET-V1-2026-10-20 · Approved by the owner, 20 October 2026.**

The owner reviewed the concept positively and explicitly requested recording concept approval,
freezing the initial scope and creating a technical implementation plan. This records product/design
approval, not production readiness, independent usability validation or permission to migrate data.
This task authorizes documentation/planning only; production implementation is a subsequent step.

## 1. Approved references and precedence

- Behaviour/accounting: **BUDGET_FEATURE_SPEC.md v1.5**, B01–B10 and AC01–AC49.
- Assisted setup: **BUDGET_SUGGESTIONS_PROPOSAL.md S1**, G01–G09, S01–S11 and SG01–SG09.
- Language/inputs: **BUDGET_GUIDANCE_AND_GOALS.md**, including the comprehension refinements.
- Design reference: the current `/budget-concept.html` and **BUDGET_CONCEPT_REVIEW.md** walkthrough.
- Build sequence/contracts: **BUDGET_IMPLEMENTATION_PLAN.md**, proposed engineering plan.

This scope record governs inclusion/exclusion. The behavioural specification governs calculations;
the interactive prototype illustrates interaction rather than overriding those rules. A prototype
shortcut, missing error state or hardcoded fixture is not permission to ship an incomplete engine.
“Budget V1” is this feature's first complete release, not a rewrite of the older app-wide MVP cut.

## 2. Included in the initial release

| Area | Frozen requirement |
| --- | --- |
| Destination | Authenticated **Budget** page at `/budget`, immediately after Expenses, in the real Halcyon shell |
| Ownership/currency | One active personal budget per tenant; owner-authorized changes; AUD only; existing tenant isolation |
| Timing | Calendar-month and anchored 14-local-date budgets, independent pay schedules, exact dates, current/past/future navigation |
| Plan | Expected versus received income, bills/regular payments, upcoming-cost reserves, longer-term contributions and one everyday-spending pool |
| Optional detail | Category limits within that pool, signed overages, explicit reallocation and no duplicate parent/child accounting |
| Getting started | Manual/no-bank setup, resumable drafts, estimates/help/defer where appropriate, simple default plan and explicit activation |
| Assisted setup | Covered-history suggestions with approved gates, editable evidence-labelled values, manual fallback and one optional user-chosen what-if |
| Personal goals | Named purchase/experience goals, price estimates, existing savings, amount/date planning, separate planned/confirmed progress, adjustment/pause/release and purchase/refund lifecycle |
| Real activity | Complete split-aware ledger aggregates, canonical transfer/repayment/refund handling, dated recurring occurrences and explicit source assignment/matching |
| Control | Current/future edit scope, preview before consequential changes, guarded undo, no hidden rebalance, sweeps or bank transfers |
| Period end/history | Explicit rollover policy, real carry application, review snapshots, late-source recalculation and changed-review indication |
| Frequency changes | Future-effective switch in both directions, preserved history/reserves, short monthly-alignment bridge when needed, reviewed initial and continuing plan amounts |
| Comprehension | Adjacent headline meanings, optional five-step guide, setup-ready guidance, planned/confirmed goal distinction and understandable period-end choices |
| Truthful states | Partial/missing/stale evidence, source conflicts, failure/retry and signed funding gaps; plan remaining is not spendable bank cash |
| Access | Desktop/phone, light/dark, keyboard/touch, labelled controls, focus management, reduced motion and accessible alternatives to charts |
| Engineering | Durable persistence, tenant-safe APIs, atomic/revision-guarded writes, complete reconciliation, audit trail, isolated verification and safe migration |

All these are release scope. Phased development may expose a private incomplete slice for testing;
it must not silently redefine V1 as just a screen with saved category limits.

## 3. Explicitly excluded

- **BG-L01 — Your progress:** wider multi-period gratification/resilience dashboard; accepted post-V1 backlog.
- AI coaching, AI-generated money math, predictive optimisation and conversational financial advice.
  Existing upstream categorisation may continue; Budget must not require AI to function.
- A persistent named scenario manager, investment-return modelling or a duplicate Planning engine.
- Weekly/arbitrary/custom user-defined budget periods. A system-generated alignment bridge is included.
- Reconciled “safe to spend now” estimates, bank transfers, automatic savings sweeps or bill cancellation.
- Fully cash-backed zero-based envelopes, shared-household editing/roles and multi-currency/FX support.
- Receipt/retailer ingestion, debt repayment optimisation, external notifications and gamification/streaks.
- Additional design directions or feature exploration as a prerequisite to building this approved baseline.

## 4. Approved prototype boundaries that must not leak into production

The prototype has fictional accounts/history, fixed dates, device-only storage, illustrative bill
matching and manual confirmations. It does not close/reconcile live periods, implement source
conflicts/security, prove historical coverage, review a full template after every bridge, or migrate
legacy budgets. The technical plan explicitly replaces those shortcuts. Concept browser/unit tests
are regression references, not evidence of production financial correctness or independent usability.

## 5. Scope control

Any new capability, removed safeguard or changed money meaning needs an owner-visible change record:
what changes, why, affected requirements, implementation/test impact and explicit approval before
expanding or reducing this baseline. Correctness/security fixes and completing already-agreed edge
states do not need a new product feature decision; record their engineering rationale normally.

If a source/data dependency is unavailable, show the approved limited/manual state. Do not fabricate
evidence, lower suggestion gates or mark unavailable functionality complete. If that dependency makes
a required V1 capability impossible, surface the impact for an explicit release decision.

## 6. Next authorised deliverable

The technical plan is prepared alongside this record. Next implementation work, once requested,
starts with **M0 — source contracts and readiness proofs**, followed by the shared calculation model.
Subsequently authorized work completed M0 and M1 on 20 October 2026; evidence is recorded in
`BUDGET_M0_CONTRACTS.md` and `BUDGET_M1_FOUNDATION.md`. M2 durable boundaries were subsequently
authorized and implemented; `BUDGET_M2_DURABLE_BOUNDARY.md` records isolated evidence. The technical
plan subsequently authorized M3 manual UI integration, recorded in `BUDGET_M3_MANUAL_WORKSPACE.md`.
The frozen scope is unchanged. M4 bills/reserves/goals and its remaining adapter/interaction gates
are engineering-complete; `BUDGET_M4_BILLS_RESERVES_GOALS.md` records the 187-check isolated result,
production recurring/investment adapters and acceptance traceability. M5 is next once authorized.
This is not a personal-stack migration or public rollout.
This progress changes no frozen product requirement and grants no personal migration authority.
No production schema, data or application code is changed by recording this approval.

The owner subsequently authorized M5 lifecycle/control and its closeout. M5 is engineering-complete;
[[BUDGET_M5_LIFECYCLE_CONTROL]] and [[BUDGET_M5_IMPACT_PREPARATION]] record all closure gates,
the final 451-check broad regression and 145-check focused run across 90 migrations. The owner
then authorized M6 assisted setup; [[BUDGET_M6_ASSISTED_SETUP]] records its deterministic
covered-history suggestions, one bounded what-if, stale/manual conversion and explicit activation
boundary, plus the final 472-check broad regression across 91 migrations. M0–M6 are engineering-
complete and the frozen scope is unchanged. M7 human/accessibility, hosted performance,
backup/restore/migration rehearsal and rollout remain. This is not a personal-stack migration or
public-release authorization.
