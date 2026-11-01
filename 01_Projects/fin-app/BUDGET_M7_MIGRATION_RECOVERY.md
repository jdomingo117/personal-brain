---
type: verification-record
status: isolated-rehearsal-complete
project: Halcyon
created: 2026-10-29
updated: 2026-10-29
---

# M7.6 — Budget migration and recovery rehearsal

**M7.6's isolated local rehearsal is complete.** The final run passes **164 assertions** across a populated, forward-only migration, two real database restores, original-account password authentication and server-side write-disable/re-enable preservation. A separate focused workspace unit run passes **25 tests**, including client flag/recovery behavior. These totals are separate suites; the integration total includes per-table preservation assertions.

This is evidence for the migration/recovery procedure, not authorization to migrate the personal database or deploy Budget. Release remains **No-Go**: M7.3/M7.4 human observations, M7.5 hosted/cold/load qualification, M7.7 final cross-feature/security/operations review and M7.8 release decision remain open. Next engineering phase: **M7.7**.

## Exact targets and procedure

Final disposable project: `halcyon-budget-m2-579045036283479e`, API `http://127.0.0.1:57521`, database `127.0.0.1:57522/postgres`. The guarded provisioner generated this project itself, verified its Docker project label and initially empty identities/financial tables, and rejected the personal API port. It copied source migrations/functions without copying personal environment files.

1. Start with the **64 pre-Budget migrations**. Create two fictional accounts using normal Auth sign-up, retaining generated credentials only in process memory. Populate two tenants/accounts, eight signed-cent transactions, four manual split children, two user merchant rules, two legacy Budget limits and audit entries.
2. Quiesce the source Auth service and capture a full custom-format Postgres backup, catalog, SHA-256, table count/content manifest, sequence positions and SQL financial aggregates. The archive includes Auth and application data, schema definitions, ownership/grants, constraints, migration history and sequence state.
3. Apply the remaining **40 forward migrations** with `supabase migration up --local`, reaching **104**. Every one of the **81 pre-existing auth/public/private table** counts and canonical content digests remains identical. Legacy limits remain and no arbitrary V1 plan, historic period or reserve is backfilled. Financial aggregates remain exact; constraints, RLS, invoker-view security and direct-command grants pass.
4. Sign in again using the original credentials/IDs. With Budget server writes disabled, a fresh command returns 503. Enable writes in the isolated Edge runtime and create the new fixture through authenticated, Zod-validated Edge commands: active plan, configured funded goal, explicit reserve release, recorded completed-period review, next contiguous period and another owner's twice-saved unactivated draft. Qualify the review as incomplete rather than fabricate coverage.
5. Quiesce Auth/functions and take a second full backup. Restore **both** archives atomically into separate, newly created empty databases; never restore over source `postgres`.
6. Compare every auth/public/private table's count and canonical row digest, sequence definitions/positions and exact SQL aggregates before recovery sign-in. Run isolated GoTrue instances against each recovered database and sign in with each original fictional password. Verify original IDs, default tenants, owner memberships and account RLS; login does not change financial totals.
7. Verify the recovered Budget operation lookup returns the exact original activation receipt and the recovered edited draft equals the saved input. Verify neither restore altered source tables.
8. Disable source Budget writes again. New writes return 503; committed same-key retries and durable outcome lookup return the original receipt; snapshot/workspace/draft reads continue and workspace reports `write_enabled=false`. Public authoritative application tables and financial aggregates remain identical. Re-enable and verify reads/retries preserve those same tables without duplicate operations.
9. Delete only captured fixture identities/tenants; remove only positively labelled disposable resources. All three M7.6 attempt projects have zero remaining labelled containers, volumes and networks. Private archives remain outside Docker/transient work directories.

## Recovery evidence

| Recovery point | Recovery database | Auth/application tables compared | Result |
| --- | --- | --- | --- |
| Before Budget | `budget_m7_restore_fc5a0ad0e6d7` | 81 | Counts, canonical row hashes, sequences, original-user sign-in, tenant ownership/RLS and aggregates match |
| After Budget | `budget_m7_restore_e3ac441868da` | 108 | Same proof, plus exact committed receipt and edited draft |

The post-Budget archive includes nonempty data in `budget_plans` (1), `budget_periods` (2), `budget_revisions` (5), `budget_allocations` (10), `budget_operations` (8), `budget_drafts` (2), `budget_draft_revisions` (3), `budget_item_revisions` (1), `budget_period_reviews` (1) and `budget_reserve_moves` (1), alongside both unchanged legacy limits. It also includes derived history facts; those do not replace authoritative history.

For **each fictional tenant**, source/migrated/restored/disabled/re-enabled facts agree: four ledger transactions total **569,500 signed cents**, with income **600,000**, gross expense **12,000**, refund **1,500** and transfer **−20,000** cents. Account fixture balance **123,456** cents is preserved independently of transaction totals; the fixture does not invent an opening balance to make them equal. Manual split children total exactly their parent. SQL performs all money aggregation.

Full parity is measured before recovered Auth logins because successful sign-ins legitimately append sessions and update sign-in metadata. Disable preservation compares public application tables while excluding transport audit/rate-limit records; no authoritative Budget operation, revision, draft, review, allocation, reserve movement or ledger row is excluded. In this schema the actual excluded public table is `audit_log`. Private/auth table content preservation is independently covered by both complete restores. Final evidence is in `docs/budget-m7/recovery/halcyon-budget-m2-579045036283479e/verification.json`.

## Backup catalog and retention

Raw archives and complete catalogs remain private and ignored under:

`backups/budget-m7/halcyon-budget-m2-579045036283479e/`

The project directory is mode **0700**, archives/catalogs **0600**. `git check-ignore` is asserted before an archive is written; `.gitignore` excludes the entire M7 directory. Auth hashes, generated credentials, platform secrets and raw dumps are not public evidence. The generated fictional passwords were not logged or persisted. These archives contain fictional rehearsal data, not a backup of personal data.

| Archive | Size | Catalog entries | SHA-256 |
| --- | --- | --- | --- |
| `before-budget.dump` | 955,996 bytes | 1,486 | `484f9faa4664beb7f899e6c3c76883e7c2ba034727023e90725149e5907fae9b` |
| `after-budget.dump` | 1,763,894 bytes | 2,218 | `b23b62e23c76560ac0aadecc5a8b5abd422a5eb89c5b8f34a9d98fc3ec36f1b6` |

The restores used `pg_restore --exit-on-error --single-transaction`, with no `--create` and an allowlisted fresh database name. Both recovery databases lived in the disposable Supabase Postgres cluster, using its existing platform roles/extensions. This proves database/schema/data recovery in that platform environment. It does **not** prove recovery onto a new host or hosted project: platform role provisioning, JWT/provider/encryption secrets, external storage and deployment configuration require their own protected recovery sources. A database dump cannot substitute for those secrets. Neither archive is a physical backup/PITR or a measured production recovery-time guarantee.

## Exposure rollback and later persistent migration

For an authorized target, the first rollback is **disable writes**, preserving all tables and data. Set server `BUDGET_V1_ENABLED=false` and restart/redeploy that target's Edge runtime so the environment actually takes effect. Verify a genuinely new request is rejected and a known committed request still replays; check operation lookup, workspace reads and `write_enabled=false`. The frontend `VITE_BUDGET_V1_ENABLED=false` build flag also removes write affordances while keeping saved-data/recovery access; it is not the server enforcement boundary. The real server toggle is rehearsed here; the focused existing unit suite covers the client flag/recovery helpers. No new browser flag-toggle run is claimed.

Do not roll back by dropping Budget tables, deleting drafts/reviews or reversing applied migrations. Preserve original operation IDs/request IDs and saved browser recovery input. Restore, if required, into a separate recovery target and reconcile before switching users. Re-enable only after verifying source/plan compatibility and exact known receipts; never replace an original account to recover its tenant.

Before any **persistent** migration, obtain explicit target authorization and perform the `SYSTEM_INTEGRITY.md` preflight again on that actual target: identity/row inventory, protected auth+application backup, checked catalog/checksum and verified separate restore, baseline signed-cent aggregates, forward migration/constraints/RLS/grants and documented exposure rollback. The retained fictional browser preview remains at schema 96; the personal stack was neither inspected nor migrated. Hosted staging was not created, per the owner's earlier instruction.

## Reproduce and inspect

From `app/`, with Docker available and the Supabase CLI supplied through `SUPABASE_CLI` if it is not on PATH:

```sh
npm run test:budget:recovery
npx vitest run src/lib/budgetWorkspace.test.ts
node --check scripts/test-budget-durable.mjs
node --check scripts/test-budget-recovery.mjs
```

`test:budget:recovery` always provisions its own secondary-port project; it does not accept an existing personal or preview target. Do not run it alongside another secondary-port Budget suite. The harness protects backup contents and stops only captured/project-labelled resources.

Public evidence: final integration log, focused unit log, source manifest, cleanup record and per-run count/hash/aggregate evidence under `docs/budget-m7/recovery/`. The original 157-assertion rehearsal is supporting evidence; its total is not added to the final 164. The intermediate expanded fixture failed its reserve-record assertion before post-Budget backup; the final run corrects the test by making an actual reserve release. No production bug or migration change resulted from that fixture correction.

Only test harness/package-script/backup-ignore/documentation files changed in M7.6. All existing application and Edge source files and all 104 migrations are byte-identical to the R06 baseline. No production build or broad cross-feature rerun is implied; final candidate regression remains M7.7.
