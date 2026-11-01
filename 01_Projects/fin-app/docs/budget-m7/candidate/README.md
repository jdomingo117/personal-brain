# M7.7 — final candidate evidence

See `../../../BUDGET_M7_CANDIDATE_OPERATIONS.md` and `../../../BUDGET_OPERATIONS_RUNBOOK.md` for the result, operating procedure, retained-installation constraint and open gates.

Final verification uses the compatible security-patched installation (Vite 6.4.5 / Vitest 4.1.12) with independent per-project Vite caches:

| Evidence | Scope |
| --- | --- |
| `lifecycle.log` | 560 passing assertions; project `halcyon-budget-m2-44b18408f7d940c3`, schema104, real desktop/phone flows and write-disable outcome recovery |
| `forecast-candidate.log` | 391 passing assertions; `halcyon-budget-m2-8f9e548c44364dbe`, schema104, R01/R02–R05 and 70 candidate + eight forecast WCAG scans |
| `golden-provider-disabled.log` | Eight passing tests; `halcyon-golden-isolated-1793253162033`; real CSV import/transfer/ledger boundaries. Live AI classification and fresh review explicitly untested |
| `unit.log` | 609 passes / 14 existing skips in the patched installation |
| `types.log`, `focused-types.log`, `browser-types.log`, `build.log` | Passing full/focused/browser TypeScript and production build; existing main-chunk advisory |
| `patched/visual/` | 88 final screenshots and the seven-state candidate manifest; no earlier UI evidence overwritten |
| `patched/halcyon-budget-m2-44b18408f7d940c3/security.json` | Final 26-table/97-function security inventory and actual fixed-field Edge samples |
| `schema-permissions.json` | Anonymous/authenticated public CREATE and private USAGE all denied, same final lifecycle project |
| `telemetry-samples.json`, `telemetry-aggregate.json`, `telemetry-summary-unit.log` | Content-free observed samples, endpoint/outcome count/status/latency aggregation and eight summary assertions |
| `dependency-audit-before.json`, `dependency-production-audit-before.json`, `dependency-audit-after.json`, `dependency-production-audit-after.json` | Initial 17 affected dev package entries (14 high/3 moderate), zero runtime-only findings; final fresh patched installation zero full findings |
| `dependency-changes.json` | Twenty dev-only version updates verified against the deliberately retained prior installation; no runtime package version change |
| `bundle-secret-check.json` | Patched build checked for configured private values, with no credential values retained |
| `source-manifest.json` | 563 executable/config source hashes, all104 unchanged migrations, both golden statement-input hashes; environment files excluded |
| `cleanup.json`, `summary.json` | Independent zero-resource verification for all14 attempt projects, preserved schema96 preview and compact final results |

The totals overlap across suites and are not added as unique assertions. Engineering WCAG scans do not close observed human accessibility or independent comprehension. Default golden candidate mode excludes general personal environment files and does not use a Gemini key. The owner subsequently authorized live-provider credential/fixture transmission. `live-provider/` records two isolated attempts, corrected explicit real-AI test coverage, passing browser TypeScript and complete cleanup. Gemini generation returns HTTP402 / RESOURCE_EXHAUSTED because prepayment credits are depleted; live classification/fresh-review is still unpassed. See [[BUDGET_M7_LIVE_CATEGORIZATION]]. `source-manifest-pre-live.json` preserves the earlier suite source binding; the current manifest differs only for the golden test.

Earlier root project directories and earlier directories under `patched/` hold scoped supporting security evidence from intermediate attempts. Their metrics/fixture totals must not be added to final runs. Failed attempts exposed test-fixture interference, missing save synchronization, runtime readiness and parallel optimizer-cache concerns; the final runs retain the strict financial/input assertions. Sensitive authenticated browser traces and raw runtime logs were not copied here.

The current primary `app/node_modules` and long-lived preview are intentionally unchanged. The source package/lock is patched and was tested through a fresh separate installation. Follow the report before retiring that preview or synchronizing the primary installation; its runner cleans up fixture data when the frontend exits. No personal/hosted migration, deployment, monitoring service or private pilot was performed. Release remains **No-Go**.
