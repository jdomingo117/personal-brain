---
type: release-decision
status: local-owner-pilot-live
project: Halcyon
created: 2026-11-09
updated: 2026-11-10
related:
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[BUDGET_OPERATIONS_RUNBOOK]]"
  - "[[SYSTEM_INTEGRITY]]"
---

# M7.8 — Budget V1 release decision

**Current decision: Budget V1 is live for the configured owner on the local main app.** The release excludes hosted deployment and wider access. The original 9 November decision was No-Go before the target, audience and remaining evidence were established.

## 10 November 2026 — local owner-only release

The owner reported that the independent beginner checks passed and directed release to the main app. This release treats observed screen-reader testing as deferred for the local owner-only pilot. Observed assistive-technology validation and hosted performance qualification remain open.

The release target is the local main app at `http://127.0.0.1:5300/budget`, Supabase project `fin-app`, API `http://127.0.0.1:54321` and database `127.0.0.1:54322/postgres`. Only the verified existing Auth identity with the owner role is configured for Budget. The maintainer observed the release smoke check in this chat. Both Edge endpoints denied anonymous requests before and after enabling.

A fresh protected backup was taken from one exported PostgreSQL snapshot in `backups/budget-m7/fin-app-owner-pilot.Aoyfqa25/`. The disconnected restore matched all 72 Auth and application tables and exact financial aggregates. The rehearsal applied all 48 pending migrations and preserved those records. The same 48 forward migrations were applied on the live target with Budget writes off, reaching migration `20261110010000` and 108 applied migrations. The live pre-exposure comparison confirmed the same data and financial aggregates, the verified owner binding and the Budget access grants.

The signed-in owner workspace loaded with both setup actions disabled before exposure. After enabling, both setup actions were enabled and the manual setup form opened. The smoke test used an empty unsaved setup and committed no Budget operations. Sign-in triggered the app's existing stale investment-price refresh. The changed investment balance caches matched the latest valuations, and the ledger, its totals and the other account fields matched the protected snapshot. The protected release folder contains the final source manifest and smoke record.

For rollback, turn `BUDGET_V1_ENABLED` off in the protected local Edge configuration and restart the exact `fin-app` Edge runtime, keeping the configured owner binding for read and receipt recovery. Turn the frontend flag off if the interface should also hide write affordances.

**R09 follow-up:** [[BUDGET_R09_HISTORY_COVERAGE]] closes the isolated engineering finding. The date confirmation task is now reachable before and after plan activation.

## 10 November 2026 — local main app preflight

The owner approved release after the automated walkthrough. That walkthrough passed 595 lifecycle/workspace checks and 399 forecast/assistance/candidate checks, including 78 automated accessibility scans. The main app at `http://127.0.0.1:5300` was verified against local Supabase project `fin-app`, API `http://127.0.0.1:54321`, and database `127.0.0.1:54322/postgres`. It is a persistent target and had 60 applied migrations.

A fresh, Git-ignored Auth and application backup was saved in `backups/budget-m7/fin-app-pre-release-20261110.pjGZ8aLx/`. Its checksum and archive catalog passed. A strict restore in a separate PostgreSQL container with networking disabled matched all 72 existing Auth and application tables and the account, ledger and analytics aggregates. All 46 pending forward migrations passed in the copy, including the recurring-series and planning prerequisites and both R09 migrations. After replay, all 72 pre-existing table contents and financial aggregates still matched, Budget access checks passed, and no plans or coverage confirmations had been backfilled. The recovery container and its temporary volumes were removed. The main database remains on its original migration version.

The local app and API listen beyond loopback, Auth allows sign-ups, and Budget write flags are deployment-wide. The owner chose a server-enforced owner-only restriction. The candidate now checks the verified Auth user ID and owner role on both Budget endpoints. Migration 107 removes the direct database read path around those checks. The focused owner access suite passed 27 integration checks. Regression testing also found that identical account-scope impact items could arrive in a different order and produce a different preview hash. Migration 108 gives those items a stable order.

All 48 pending migrations passed on a disconnected restore of the protected snapshot. All 72 existing Auth and application tables and financial aggregates matched the restored pre-migration baseline. The final lifecycle and signed-in workspace suite passed 596 checks with zero browser runtime errors. The forecast and Overview suite passed 399 checks after the owner restriction and before the impact-order fix. The main app still needs the updated release candidate and a verified owner binding before exposure.

At the preflight checkpoint, observed accessibility and independent beginner checks still lacked participant results. See the release entry above for the owner-reported beginner pass and local pilot scope.

## Original release scope

The change under review is Budget V1: manual and assisted planning, monthly/fortnightly periods, goals, forecasts and history within the existing authenticated app. The eventual first release is private and staffed. Existing Ledger and ingestion remain in scope for compatibility; the release decision does not authorize infrastructure purchases or extend the previously authorized Gemini fixture run.

## Evidence at the original M7.8 decision

| Gate | Decision and evidence |
| --- | --- |
| M7.1–M7.2, engineering baseline and automated accessibility | Complete in recorded scope. The later assembled candidate also passed 78 WCAG-tagged scans; this does not establish spoken screen-reader behavior or independent comprehension. |
| M7.3, observed accessibility | Open. Owner visual and R01 walkthrough acceptance are recorded. Actual assistive-technology observations on the final flows remain pending; use [[BUDGET_M7_HUMAN_VALIDATION]]. |
| M7.4, independent beginner comprehension | Open. No independent participant outcomes for AC30, AC33, goal distinctions or SG09. The AI critique and owner presentation review are supporting evidence. |
| M7.5 / R06, capacity | Pass for local repeat reads; hosted and broader cold/load checks remain open and were deferred by the owner. At 1m rows, warm workspace API max was 835 ms and assistance API max was 2,635 ms; the first derived-checkpoint rebuild took 4,325.854 ms in SQL alone. Do not infer a hosted first-load guarantee. |
| M7.6, migration and recovery | Isolated rehearsal complete: 164 assertions, two separate restores with original-user sign-in, financial parity and disable/re-enable preservation. An actual persistent target still needs its own baseline, protected backup, separate verified restore and forward migration plan. |
| M7.7 / R07 / R08, final candidate | Complete in recorded scope. 560 lifecycle and 391 forecast/assistance/candidate assertions, 609 unit passes, types/build, the candidate security audit, and all eight live Gemini golden tests passed. The sanitized evidence and source binding are in `docs/budget-m7/candidate/`. |
| R01–R05, original implementation findings | Engineering fixes and affected regression are recorded. Owner R01 walkthrough acceptance is documented; the independent human and assistive-technology checks above still apply. |
| R09 / SG02, real history coverage | Was open at M7.8. The isolated follow-up now verifies owner-confirmed coverage through the real app, and withdrawal/source deletion fallback. See [[BUDGET_R09_HISTORY_COVERAGE]]. |
| Target and exposure | Open. No exact environment/project, pilot audience, observation window or release operator is bound to the approval. The current feature flags apply at the build/runtime level. Tenant roles protect financial data; those flags do not restrict exposure to a selected cohort on a shared deployment. |

Read-only verification for this decision: all **563 source/configuration hashes** and **two fixture hashes** match the M7.7 manifest. Its SHA-256 is `0d1cbe2089817ff8ca5919e16e9b4e7b9e1bd47081952ec5f8fbcb8e53a9bc60`. No application source changed during M7.8; the existing regression evidence was reused, and no integration suite or personal data check was run for this decision.

## R09 — Original finding and closure criteria

The candidate's `account_activity_coverage` table records account/date range, provenance, confirmer, revision and revocation. Assistance and forecast SQL use only active evidence. The R05 estimator proves a covered zero-spend sample remains zero, and the durable suite inserts explicit confirmation fixtures and proves provider remapping and relevant source deletion revoke them without erasing the old proof. These tests cover consuming and invalidating evidence. They create it with fixture SQL.

The source review found no application, Edge or migration path that creates those evidence rows from a real import/provider range or a user's explicit coverage confirmation. An ordinary account can have transactions but no eligible evidence, leaving history-based suggestions/forecasts unavailable and manual setup usable. First and last transaction dates must never be substituted for coverage. See the Budget spec's coverage rule and G02/SG02 in [[BUDGET_SUGGESTIONS_PROPOSAL]].

**Closure:** implement a supported, authenticated way to record a bounded account/date range with accurate provenance. The smallest useful candidate is explicit owner confirmation labelled as user-confirmed; add statement/provider provenance only when a trusted upstream range can be proved. In a fresh isolated end-to-end test, start with no coverage and show the manual fallback, create evidence through the supported path, prove coverage/eligibility for the right accounts and periods including a covered zero-spend sample, then invalidate the evidence through a supported source change and prove the fallback returns. Verify owner/tenant boundaries, audit preservation and stale-preview rejection. Do not seed production coverage by SQL or change the financial calculation to hide missing evidence.

## Release sequence and rollback

1. R09 is verified in isolation. Use its new schema 105 manifest and regression record for subsequent candidate work; the original M7.7 manifest remains historical.
2. Run the observed accessibility and independent beginner tasks on fictional data. Record actual behavior and fix blockers before retesting. Run hosted cold/load checks against an identified isolated hosted environment when one is available; the earlier no-hosting instruction remains in effect. Avoid testing with personal data.
3. Bind the exact first target, audience, candidate, operator and staffed review window. Prefer a separate private environment for the first pilot unless cohort access has been verified independently of the feature flags. For a persistent target, follow [[SYSTEM_INTEGRITY]] and [[BUDGET_OPERATIONS_RUNBOOK]]: verify identity, capture pre-change counts and signed-cent totals, back up Auth and application data and verify a separate restore. Apply forward migrations with Budget writes disabled. Reconcile security grants, counts, aggregates, drafts, reviews, and operation receipts, and exercise disabled writes and receipt lookup before enabling anything.
4. Once the gates and scoped authorization are recorded, enable for the agreed private audience. Have the maintainer observe the first use and share the result in this task. Verify snapshots, matches, carry, saved history and receipts against observed inputs; watch content-free errors, conflicts and latency. Review results with the owner before considering wider access. No widening is automatic.

**Stop and rollback:** pause new writes on the exact target immediately for any cross-tenant disclosure, unexplained count/cent difference, duplicate commit, lost durable state or repeated failures whose commit outcome cannot be established. Set `BUDGET_V1_ENABLED=false` and reload that target's Edge runtime; remove write affordances with the corresponding frontend build/flag. Verify a new write is rejected while known receipt replay, operation lookup and saved data remain available. Preserve the current volume, plans, drafts, reviews and audit history. If restore is necessary, verify it separately before any switch. Do not reverse applied migrations or drop Budget data to disable exposure.

Any future decision to widen access or release to a hosted target requires its own scoped release review and evidence.
