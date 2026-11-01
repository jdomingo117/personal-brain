---
type: runbook
status: prepared-not-exposure-authorized
project: Halcyon
updated: 2026-10-29
---

# Budget — private exposure, monitoring and recovery

**Operational owner:** project owner. **Technical responder:** project maintainer working in this repository/chat. **Frequency:** each authorized migration/exposure, each incident, and during an explicitly staffed private pilot. **Last verified:** 29 October 2026 on disposable projects only.

This packet supports M7.7. It does not authorize deployment, personal migration, live provider calls, infrastructure creation or an unattended pilot. The release decision remains No-Go until the open gates in [[BUDGET_M7_RELEASE_VERIFICATION]] are reconciled. No hosted alerts, external log drain or on-call rota has been created. An unfamiliar human has not independently rehearsed this runbook; the automated local steps have engineering evidence only.

## Prerequisites and ownership

Before touching a persistent target, the owner must identify and authorize that exact target and scope. Record API/project/database identity without secrets; use the [[SYSTEM_INTEGRITY]] preflight. Rehearsal archives under `backups/budget-m7/` contain fictional fixtures and are not personal backups. Obtain a new protected auth+application backup and verify a restore on a separate recovery target for the actual migration.

The deployment operator must have the target's protected deployment configuration, existing platform roles/extensions and separate JWT/provider/encryption secret recovery sources. Keep credentials and raw financial input out of logs, screenshots, chat, source control and public evidence. Assign an actual responder and observation window before any private pilot; if no responder is available, leave exposure off.

## Step 1 — reproduce the isolated engineering checks

Use `app/` in a fresh installation of the validated package/lock, with Docker available and a Supabase CLI on PATH or selected through `SUPABASE_CLI`. The retained primary preview and its installed dependencies are intentionally unchanged; its runner cleans up fixture data on frontend exit. Follow [[BUDGET_M7_CANDIDATE_OPERATIONS]] before retiring that process or reinstalling the primary checkout. A validated isolated installation is retained for continued candidate work.

```sh
npm ci --ignore-scripts
npm test
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.budget-workspace.json
npm run test:browser:typecheck
npm run build
npm run test:budget:release
npm run test:golden:budget-candidate
```

Expected: tests/types/build pass; both integration commands generate a distinct disposable project, print its target identity and initially verify an empty database. Budget candidate uses API 57521 / DB 57522 / browser 57600. Golden candidate uses API 55421 / DB 55422 / browser 55300. Neither may reuse the personal 54321/5300 stack or the retained 57421/57300 preview. Other default Budget suites share secondary database ports; run them sequentially. The documented `--candidate-alternate` profile reserves API 57721 / DB 57722 / browser 57800. Every candidate uses its own Vite optimizer cache.

`test:golden:budget-candidate` defaults to **provider disabled**: no Gemini credential is copied or used. It exercises imports/transfers/ledger/contracts and explicitly omits live AI classification/fresh-review assertions. The live-provider variant requires separate explicit authorization for credential use and transmission of fixture descriptions; it is not part of these default commands.

If a port is occupied, preserve the existing process, inspect its ownership and use the provisioner's reserved alternative. Never kill an unrelated process, reuse a personal URL or weaken the isolated-only guard. If a test fails, preserve its safe diagnostics, correct the bounded cause and rerun the affected suite. CLI/trace artifacts can contain sessions or raw statement data; publish only reviewed, content-free evidence.

## Step 2 — verify the actual target's financial and security baseline

For an authorized persistent target, record migration count, auth/profile/default-tenant/member bindings, account/transaction counts and SQL sums of signed ledger cents and canonical income/expense/refund/transfer amounts. Include manual splits/rules, legacy limits, saved drafts, operation receipts, reviews, reserve movements and source revisions. Compare by tenant/account rather than only whole-database totals.

Expected: no decrease or unexplained change after migration. Budget uses the new model alongside `public.budgets`; do not invent old period/reserve meaning. Confirm Budget tables have RLS, anon has no access, authenticated clients have no mutation grants and no direct Budget function execution, definer functions pin search paths and the restricted Budget analytics view has invoker security. `private` is exposed to the service role by PostgREST configuration, so its no-client-grant/no-client-USAGE boundary must also remain intact.

If identities, totals or grants differ unexpectedly, stop exposure and investigate the captured delta. Do not fix a mismatch by reseeding, replacing an account, deleting history or reversing an applied migration. The M7.6 separate-restore procedure is in [[BUDGET_M7_MIGRATION_RECOVERY]].

## Step 3 — verify the write controls before exposure

The server enforces `BUDGET_V1_ENABLED==='true'`; absent/false disables new Budget commands. The frontend independently requires `VITE_BUDGET_V1_ENABLED==='true'` for write affordances. A frontend flag is not authority to bypass the server. Reads and interrupted-save recovery remain available with writes off.

For the authorized deployment, set server flag false through its protected environment configuration and restart/redeploy that target's Edge runtime. A local long-lived runtime can retain old environment values; changing a file alone is not sufficient. Do not stop a runtime by a broad Docker name pattern. Match the exact captured project label and container ID.

Expected with writes disabled:

- A genuinely new owner command is rejected with 503/`disabled`.
- A known already-committed same-key request returns its original receipt.
- `query-budget` operation lookup still returns that outcome.
- Snapshot/workspace/draft reads continue; workspace reports `write_enabled=false`.
- Plans, allocations, drafts, immutable reviews, reserve movements and operation counts remain identical. Transport audit/session records may legitimately append and are not financial changes.

If these fail, retain writes off and escalate to the maintainer. After all release gates and explicit target/exposure authorization, enable the server flag and frontend build for the agreed private cohort. Verify observed source inputs against snapshots, matches, carry and recorded reviews before widening exposure. Record the exact build/source manifest and rollback configuration. This pilot has not been started.

## Step 4 — inspect content-free telemetry

Both Budget endpoints emit one `budget.request.v1` JSON sample for each non-OPTIONS response. Fields are exactly `event`, fixed `endpoint`, HTTP `status`, fixed `outcome` and nonnegative `duration_ms`. No action payload, names, amounts, URLs/query strings, tokens, actor/tenant/account IDs or raw errors belong in this schema. Duration covers Edge middleware/handler work, including its Auth/database calls; it excludes gateway/network travel and browser rendering, so it is not the end-to-end API latency measured by M7.5. The wrapper neither reads response bodies nor changes outcomes if logging fails.

Outcomes: HTTP 2xx/3xx `success`, 401/403 `denied`, 409 `conflict`, 429 `rate_limited`, other 4xx `rejected`, 5xx `unavailable`. These are transport categories, not a claim that each 200 is a new commit: retries and operation lookups are successes too. Correlate actual saves through owner-authorized durable receipts. Generic middleware error logs are separately redacted on Budget endpoints; audit transport errors are detected and redacted without failing committed financial operations.

For the saved local security evidence, aggregate only its fixed-schema samples:

```sh
node scripts/summarize-budget-telemetry.mjs ../docs/budget-m7/candidate/telemetry-samples.json
```

For an explicitly identified disposable runtime, first verify the exact project label. Use only the captured runtime name, never a default target or broad filter:

```sh
: "${BUDGET_TEST_PROJECT:?Set the captured disposable Budget project ID}"
docker inspect --format '{{index .Config.Labels "com.supabase.cli.project"}}' "supabase_edge_runtime_${BUDGET_TEST_PROJECT}"
```

Proceed only when the returned label exactly equals the captured isolated project. Then stream logs through the content-free summarizer without saving or printing raw runtime logs:

```sh
docker logs "supabase_edge_runtime_${BUDGET_TEST_PROJECT}" 2>&1 | node scripts/summarize-budget-telemetry.mjs -
```

Expected: `budget.aggregate.v1` with accepted/rejected sample counts and per-endpoint/outcome count, status counts, nearest-rank p50/p95 and maximum duration. Unknown fields and inconsistent samples are rejected and never echoed. Zero samples means absent/expired/not-yet-emitted input, not zero errors or zero latency. Snapshot exports can overlap; do not add overlapping windows or sampled local fixtures to production totals.

For a future hosted pilot, route only this fixed schema through the target's approved log/metrics facility and verify retention/access controls. Hosted collection/alerts are pending; local Docker evidence is not proof of a configured hosted monitoring service. Do not export raw logs/financial payloads as a workaround.

## Step 5 — respond to adverse signals

Use the following initial investigation policy for an authorized, staffed private pilot. These are proposed operating thresholds, not measured hosted SLOs or active alerts.

| Signal | Response |
| --- | --- |
| Any cross-tenant disclosure, duplicate financial commit or unexplained count/cent change | Disable new writes immediately, preserve volume/receipts/input and escalate to owner + maintainer |
| Any redacted unhandled Budget error or missing audit transport signal | Inspect protected server diagnostics and durable operation lookup; determine whether the command committed before retrying |
| Repeated 5xx/unavailable or outcome-unknown reports | Preserve the same request ID, check outcome, inspect database/runtime health; pause writes if integrity/outcome cannot be established |
| Increasing 409 conflicts | Ask users to refresh/review stale source/plan/preview state; do not auto-overwrite choices or mint a new request for an uncertain prior save |
| 429s | Honour Retry-After; avoid polling loops. Budget limits are 10 writes and 30 reads per authenticated user per trailing 60 seconds |
| Read latency exceeds the recorded local matrix | Investigate complete-history preparation/checkpoint misses/source invalidation and query plans. Do not hide missing history, raise caps or silently change financial semantics |
| Rate limiter backend unavailable | With configured Upstash, Budget is fail-closed. Verify that target's protected configuration/availability; do not disable the limiter |
| No configured shared limiter | The fallback is per-isolate memory and not a distributed guarantee; require target-specific review before wider exposure |

M7.5's local repeated-read targets are workspace SQL p95 <1s, workspace API <2s, assistance API <3s. The recorded first million-row checkpoint rebuild was 4.326s SQL; local API repetitions were warm. Hosted/cold/load qualification remains pending by owner instruction. Never label these numbers a proven hosted first-load guarantee.

## Recovery and rollback

First pause new writes; retain reads, durable outcomes, saved client request checkpoints and all database history. Do not roll back by dropping tables, removing reviews/drafts, deleting source gates or replaying arbitrary old requests with new IDs. For unknown outcomes, the existing client checks the original operation and retries the same request; a confirmed receipt takes precedence over a lost response. A definitive conflict requires fresh review rather than overwriting source state.

If database recovery is required, preserve the current volume and inspect a protected backup in a separate recovery target. Verify original auth IDs/password sign-in, tenant ownership/RLS, all relevant row contents/sequences and financial aggregates before switching anything. Original CSVs cannot restore auth identity, manual decisions or Budget history. Re-enable only after compatibility and known receipt replay are verified and the owner authorizes the target change.

## Escalation and history

| Situation | Decision owner | Method |
| --- | --- | --- |
| Data integrity, cross-tenant exposure, unexplained committed outcome | Project owner + maintainer | Stop exposure, present a sanitized incident record in this project/chat; retain protected evidence separately |
| Hosted infrastructure, secret recovery or live-provider fixture transmission | Project owner | Obtain explicit scope/target authorization before using those services or credentials |
| Human accessibility/comprehension evidence and final release exceptions | Project owner and actual participants | Follow [[BUDGET_M7_HUMAN_VALIDATION]] and record observations/decisions; do not replace them with AI scores |

29 October 2026: M7.6 verifies isolated backup/restore/disable-preservation; M7.7 adds request telemetry, security checks and an operational packet. Private exposure and hosted recovery/monitoring have not been authorized by this packet. The owner separately authorized the live-provider golden test; two isolated attempts are recorded in [[BUDGET_M7_LIVE_CATEGORIZATION]] and blocked by depleted Gemini prepayment credits.


## Gemini generation blocked by prepayment credits

The authorized M7.7 follow-up receives HTTP200 for model metadata but HTTP402 / RESOURCE_EXHAUSTED for generation, with a depleted-prepayment message. Model listing is not proof that generation is available. Stop generation retries; the project owner must restore credits to the billing account linked to the configured API key using [Google’s prepay instructions](https://ai.google.dev/gemini-api/docs/billing#prepay). Do not automatically buy credits or alter billing. Once restored, rerun the already-authorized isolated live golden variant from the patched install, retaining narrow protected credential handling and labelled cleanup. Require actual cold AI classification and fresh uncached UI-review/nonmutation assertions before closing this qualification. No live-provider pass is currently recorded.
