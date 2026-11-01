---
type: verification-record
status: local-candidate-verified-live-provider-blocked-credits
project: Halcyon
created: 2026-10-29
updated: 2026-10-29
---

# M7.7 — Candidate regression, security and operations

**The local candidate, security controls, privacy-safe telemetry and operational packet are verified.** Final checks use the corrected dependency lock in a fresh isolated installation: **560 lifecycle assertions**, **391 forecast/assistance/responsive-candidate assertions**, **eight provider-disabled golden tests**, **609 unit passes / 14 existing skips**, **eight standalone telemetry-summary assertions**, full/focused/browser TypeScript and a production build. These are separate suites with overlapping assertions, not an additive unique total.

M7.7 retains one external qualification: **the authorized live Gemini categorization/fresh-review test is blocked by depleted provider prepayment credits**. The owner authorized the previously rejected credential/fixture egress. Two isolated attempts ran; a bounded generation probe returned HTTP402 / RESOURCE_EXHAUSTED. No live AI classification or fresh UI review passed. [[BUDGET_M7_LIVE_CATEGORIZATION]] records the diagnosis and explicit real-AI fixture correction. The eight provider-disabled golden passes remain scoped to imports/transfers/ledger contracts.

Release remains **No-Go**. M7.3 observed human accessibility, M7.4 independent beginner comprehension, M7.5 hosted/cold/load qualification and M7.8 release/target-exposure decision remain open. No persistent migration, deployment or private pilot occurred.

## Final candidate evidence

| Check | Final target / environment | Result |
| --- | --- | --- |
| Full Budget lifecycle, real authenticated desktop/phone, security and disabled-write recovery | `halcyon-budget-m2-44b18408f7d940c3`; API 57521 / browser 57600 | **560 assertions pass**, 104 migrations; strict blank-input, draft retention, unknown outcomes, goals/refunds, temporal carry, account policies, rollover, lifecycle controls and reminders |
| R01 forecast, R02–R05 assistance and assembled candidate | `halcyon-budget-m2-8f9e548c44364dbe`; API 57721 / browser 57800 | **391 assertions pass**, 104 migrations; seven candidate states × five widths × two themes, plus eight forecast width/theme cases |
| Ingestion/transfer/ledger golden, provider disabled | `halcyon-golden-isolated-1793253162033`; API 55421 / browser 55300 | **Eight tests pass** |
| Automated accessibility in the forecast/candidate suite | 320/390/768/1024/1440 candidate widths, both themes; four forecast widths, both themes | **78 passing WCAG-tagged scans**, 88 captures; engineering evidence, not observed screen-reader or beginner evidence |
| Unit/static/build | Isolated install of the published package/lock | **609 pass / 14 existing skips**; all typechecks/build pass; existing large-main-chunk advisory remains |
| Telemetry summary | Fixed-schema real Edge samples + injected invalid/private records | **Eight assertions pass**; aggregate contains only endpoint/outcome/count/status/latency statistics |
| Dependency security | Fresh isolated installation of the new lock | **Zero npm audit findings**, full and runtime-only graph; runtime package versions unchanged |

Final logs, security inventories, safe telemetry samples/aggregates, before/after dependency reports, package delta, captures, source hashes and cleanup are in `docs/budget-m7/candidate/`. The final 560/391 logs are named `lifecycle.log` and `forecast-candidate.log`. Golden stdout states the provider-disabled qualification explicitly.

All sixteen M7.7 project IDs (including the two authorized live attempts) from the attempt logs were independently checked for **zero remaining labelled containers, volumes and networks**. The retained preview remains `halcyon-budget-m2-c65dd04871874dcb`, schema 96, at `http://127.0.0.1:57300/budget`. Its parent process, credentials, database and existing `node_modules` were preserved. The personal 54321 stack was not inspected or mutated.

## Security and telemetry changes

The final schema inventory covers **26 Budget tables and 97 public Budget functions**. All tables retain RLS, deny anonymous access and deny authenticated client mutation privileges. All Budget functions deny direct anon/authenticated execution; definer functions pin search paths. The restricted `public.budget_transactions_analytic` view is invoker-secure and denies client reads. Anonymous/authenticated roles cannot create objects in `public` or use `private`, preventing search-path object injection and private-credential schema access.

Real Edge probes reject absent/forged auth, foreign Origin, non-POST methods, invalid JSON, oversized bodies and unknown fields. The write limiter counts ten invalid authenticated requests and rejects the eleventh with 429 and bounded Retry-After guidance. Owner draft reads remain private, duplicate requests retain one authoritative operation, and transport audits contain only action/operation references. Existing lifecycle suites exercise viewer/member denial, foreign rows, direct table/RPC denial, source/version conflicts, rollback and compatible undo.

A release-requirement gap was corrected:

- `_shared/budgetTelemetry.ts` wraps both Budget endpoints and emits only `event`, fixed `endpoint`, HTTP `status`, fixed `outcome` and nonnegative `duration_ms`. It excludes OPTIONS, never reads request/response content and preserves the original response when the log sink fails.
- Budget routes opt into `_shared/withAuth.ts` unexpected-error redaction. Raw errors/URLs are omitted. Returned PostgREST audit errors are now detected, logged and contained, preserving committed outcomes; a middleware test verifies this path.
- `summarize-budget-telemetry.mjs` accepts the strict schema and produces per-endpoint/outcome counts, status counts, nearest-rank p50/p95 and maximum durations. Unknown/private fields are rejected without echoing them. Actual Edge samples cover success, denial, rejection, conflict and throttling; unavailable classification and log-sink failure are covered by unit tests.

These are content-free Edge-processing samples, not an installed hosted metrics service or an end-to-end network latency guarantee. No external log drain, alerts, automation or infrastructure were created. Hosted collection/shared-limiter configuration requires target-specific validation. The full operating procedure and response policy are in [[BUDGET_OPERATIONS_RUNBOOK]].

No financial SQL, migration, frontend component/copy, request schema, receipt payload or money rule changed in M7.7. All **104 migrations** remain identical to the M7.6 source binding. The new telemetry/audit logging behavior is the production runtime delta; framework updates affect development/build tooling only.

## R07 — development dependency advisories, corrected in the candidate

The initial full npm audit reported **17 affected package entries: 14 high and three moderate**, including transitive chains. The production-only audit reported zero. The tooling paths include Vite/Vitest, PostCSS/source maps and browser-target resolution. Maintainer advisory records list compatible fixes within the existing majors, including [Vite's file-serving advisory](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) and [Vitest's mock-path advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9); [Vite's release policy](https://vite.dev/releases) retains the 6.4 security branch.

A dependency-only trial resolved a compatible patch set, then a fresh installation and all final checks above verified it before publishing the package files. The source now requires Vite `^6.4.4` and Vitest `^4.1.12`, with the tested lock resolving **Vite 6.4.5 / Vitest 4.1.12**. Twenty development-only package versions changed; runtime package versions did not. No forced major upgrade, dependency override or lifecycle install script was used.

Selected transitive updates: PostCSS 8.5.15→8.5.32, nanoid 3.3.13→3.3.20, browserslist 4.28.2→4.29.5, baseline-browser-mapping 2.10.38→2.11.34 and source-map-js 1.2.1→1.2.2. Both the new lock and its fresh installed graph report zero npm findings. The npm audit scope is the app's npm dependency graph; it does not independently certify Deno remote imports or the hosted platform.

**Retained-installation qualification:** the primary checkout's existing `app/node_modules` and long-lived preview were intentionally not replaced. They retain the previous Vite/Vitest installation. The preview runner treats frontend exit as a signal to clean up its fictional database, so casually restarting that child would destroy the retained checkpoint. Retire that preview deliberately only when its fixture data is no longer needed; then use `npm ci --ignore-scripts` to synchronize the primary install. Use a fresh patched install for release/candidate work. The successful isolated installation is retained at `/var/folders/9x/g5gs98n95kj0m53j3g8dcypw0000gn/T/halcyon-m77-patched-source-b_vxbgaq/app`; executable sources and dependency files there match the published candidate. It contains no copied personal environment files. R07 is corrected for the locked release candidate; the old preview is historical rehearsal infrastructure and is not the release build.

## Reproduction and test isolation

From `app/` in a fresh installation of the published source/lock, with Docker and a Supabase CLI available (`SUPABASE_CLI` may select the installed executable):

```sh
npm ci --ignore-scripts
npm test
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.budget-workspace.json
npm run test:browser:typecheck
npm run build
node scripts/test-budget-telemetry-summary.mjs
npm audit --json
npm run test:budget:release
node scripts/test-budget-durable.mjs --release-candidate --secondary-ports --candidate-alternate --forecast-only --candidate-only --workspace --assistance-backend
npm run test:golden:budget-candidate
```

The generated target guard, project-label/empty-data checks and ID-scoped cleanup remain enforced. No command accepts a personal/retained target. The alternate profile reserves API 57721 / DB 57722 / browser 57800; the main candidate uses 57521 / 57522 / 57600. Each Vite server now gets a generated config with a **project-local optimizer cache**, preserving the production Vite config and preventing shared-cache interference between parallel profiles. Golden candidates omit `.env`/CLI metadata during source copy and default to provider disabled.

Harness corrections retained from this audit: current Add account label; separate assistance-backend and blank-browser fixtures; wait for confirmed saved drafts before reading their SQL state; require query-budget's own 401/Unauthorized response for Edge readiness rather than permissive OPTIONS; use exact project labels for cleanup. An intermittent patched parallel run failed the strict blank-input assertion; the final isolated-cache parallel run passes the same assertion and all other checks. Cache interference was a test-isolation concern; no financial input assertion was weakened and no product money-field change was made.

Failed/pre-patch attempt totals remain historical and are not added to final results. Failed browser traces can contain authenticated fixture state and were not copied into public evidence. No new visual-owner acceptance or human accessibility score is implied.

## External qualification and next decision

The owner authorized `--release-candidate --live-provider`, including narrow credential use and fixture transmission. Execution is blocked by Gemini generation HTTP402 / RESOURCE_EXHAUSTED, explicitly reporting depleted prepayment credits; model metadata returns HTTP200. Stop generation retries until the owner restores credits on the billing account linked to the configured key. No credit purchase or billing modification was attempted. Existing authorization covers the rerun after restoration. Default candidate mode stays provider disabled.

The live test now explicitly requests a real cold AI assignment, imports the actual returned assignment, and checks a fresh uncached review plus preview/cancel nonmutation. This test-only change passes browser TypeScript; its live assertions remain unpassed. The original source binding is preserved in `source-manifest-pre-live.json`; the current binding differs only for `app/e2e/golden-pass.spec.ts`. Earlier suite totals are historical results for their recorded source, not new reruns.

After that qualification (or an explicit documented release exception), reconcile M7.3/M7.4/M7.5 and assemble M7.8's Go/No-Go decision. Current decision remains **No-Go**. Persistent target selection, backup/restore preflight and exposure authorization are still separate from source implementation and local testing.
