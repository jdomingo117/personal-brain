---
tags:
  - halcyon
  - budgeting
  - engineering
type: implementation-record
status: engineering-complete
project: Halcyon
created: 2026-10-22
updated: 2026-10-22
related:
  - "[[BUDGET_IMPLEMENTATION_PLAN]]"
  - "[[BUDGET_SUGGESTIONS_PROPOSAL]]"
  - "[[BUDGET_FEATURE_SPEC]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# M6 — assisted setup

## Outcome and boundary

**M6 is engineering-complete.** Migration 91,
`20261022170000_budget_assisted_setup.sql`, implements the approved deterministic assisted-setup
path inside the authenticated Budget setup flow. It is an optional starting draft, not a second
budget engine, a persistent scenario manager, an AI feature, or an activation shortcut.

The path derives suggestions only from tenant-scoped, canonical, complete historical facts.
It exposes the evidence, applies component-level gates, permits the existing manual flow at every
point, and offers one bounded reallocation what-if. **Use this draft** saves an ordinary draft;
the existing reviewed, version-guarded activation remains the only way to create an active plan.
No personal database was read or migrated, no feature flag was enabled, and no public rollout
occurred.

## Implemented contract

- Service-only assistance derives account coverage ranges, complete monthly or anchored-fortnightly
  windows, exact-cent medians, recurring identities, source fingerprints and method provenance.
  Foreign, invalid, or incomplete scope fails closed rather than presenting a monetary estimate.
- Historical everyday totals exclude only canonical activity for the same confirmed recurring
  identity. A future bill therefore cannot remove unrelated historical spending, and ordinary
  transfers, repayments, split children, refunds and pending activity continue to follow the
  existing canonical rules.
- The inline `BudgetAssistance` control reuses the normal setup review fields. It presents evidence
  and limitations, recent-change confirmation, a no-write preview and a bounded single
  source-to-goal (or still-to-plan) change. The user can abandon assistance and retain a usable
  manual route without fabricated zero values.
- Assistance provenance survives the existing versioned draft boundary. A source/frequency/scope
  change invalidates it; explicit stale conversion retains user intent while relabelling affected
  values as manual estimates. An optional named goal, target/date and future contribution become
  the matching existing M4 goal/reserve intent only during normal activation.
- `query-budget` remains read-only for suggestions and uses strict request validation. The browser
  receives no new table-write authority; existing authenticated command, RLS, source-version,
  atomic receipt and activation safeguards remain the authority boundary.

## Acceptance traceability

| Requirement | Verified M6 evidence |
| --- | --- |
| AC02 | Complete date-window evidence is named; incomplete windows are excluded; phone preview creates neither draft nor plan. |
| AC10, AC11, AC20, AC21 | Actual recurring occurrences are retained; changed evidence becomes a proposal/manual conversion; limited history suppresses unsupported outcomes. |
| SG01 | Monthly and anchor-aligned fortnightly source calculations, exact-cent medians and deterministic evidence output pass isolated SQL/Edge tests. |
| SG02 | Insufficient history, missing coverage, invalid/foreign scope and no-bank setup retain the immediate manual path and never invent zero. |
| SG03, SG04 | Recent evidence/source changes require review; canonical transfers, repayments, splits, refunds and recurring separation reconcile exactly. |
| SG05, SG06 | One-change preview conserves allocation, preserves protected intent and emits only bounded, date-aware goal outcomes; it creates no funding claim, reserve credit or Planning event. |
| SG07 | Assistance does not activate a plan; source staleness converts explicitly to manual while retaining named goal intent, and ordinary activation persists it atomically. |
| SG08 (technical) | Labelled desktop/phone/dark journeys, focus on the assistance region, 390px overflow checks and browser-runtime-error checks pass. Human screen-reader and comprehension validation remain M7. |

SG09 is intentionally **not** closed by engineering evidence. Independent beginners must still
explain the evidence, the one change, and that no money moved; that is part of M7 alongside the
broader AC30/AC33 human checks.

## Verification

M6 verification used only the guarded disposable provisioner and uniquely labelled Supabase
projects on API 57421 / DB 57422. The final broad lifecycle run passed **472 durable-boundary
SQL/Edge/browser checks across all 91 migrations**. It included source/RLS/tenant denial,
read-only assistance, canonical historical evidence, monthly and fortnightly journeys, stale
conversion, draft save/reload, final activation and named-goal preservation, as well as the prior
M2–M5 lifecycle, frequency, policy, rollover, attention and disabled-write regressions.

The final application suite passed **516 unit tests with 14 existing skips**. Focused Budget
TypeScript and browser-test TypeScript checks passed, as did the production build. Browser
journeys had no runtime errors; the 390px assisted setup had no horizontal overflow and its dark
rendering was inspected during the authenticated workspace run. The runner removed only the exact
disposable project and fixtures after success.

The full-repository TypeScript command still reports the pre-existing unrelated
`StrategicProjections.tsx:252` `net_worth`/`netWorth` metric-name mismatch. The production build
also retains its existing large main-chunk advisory. Neither was introduced by M6; both remain
release-gate items rather than a claim of a clean full-app typecheck.

## Closeout and M7 handoff

All M6 engineering requirements are closed: gated deterministic suggestions, evidence-labelled
editable draft values, bounded what-if, stale/manual conversion, goal-intent preservation and
explicit final activation. The proposal remains the product contract; this record is its
production implementation and technical-evidence record.

M7 is now the next milestone. It must close the remaining release gates without weakening M6:

- independent beginner comprehension for AC30, AC33 and SG09;
- human accessibility review for screen reader, keyboard, contrast/zoom and reduced motion;
- hosted realistic-data performance/capacity measurement and recorded limits;
- additive migration/backup/restore rehearsal and rollback-exposure verification;
- full traceability review, private staged exposure and rollout authorisation.

M6 closeout does not authorize any personal-stack migration, feature exposure, production data
inspection or public release.
