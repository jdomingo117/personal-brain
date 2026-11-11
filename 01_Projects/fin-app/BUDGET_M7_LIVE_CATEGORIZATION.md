---
type: verification-record
status: verified-live-provider
project: Halcyon
created: 2026-10-29
updated: 2026-11-09
---

# M7.7 — authorized live categorization follow-up

**All eight live-provider golden tests passed on 9 November 2026.** The owner restored the Gemini credits and requested the rerun. The synthetic generation probe returned HTTP200. The browser suite in `halcyon-golden-isolated-1794145158491` passed in 1.8 minutes, including actual cold classification, a fresh uncached Ledger suggestion, and a transaction and merchant-cache comparison after closing the preview. Browser TypeScript passed; the rerun matched all 563 candidate source hashes and both statement fixture hashes. No executable code changed on 9 November.

Three earlier launches that day stopped before the live classification assertions due to a stalled Docker credential helper, the macOS Chromium sandbox restriction, and missing fixtures in the temporary source copy. The successful run used a temporary public-image Docker configuration, the permissions required to launch Chromium, and both verified fixtures. All four targets have zero labelled containers, volumes and networks, and the temporary provider environment was removed. Sanitized evidence is in `docs/budget-m7/candidate/live-provider/2026-11-09/`.

## October attempts and diagnosis

| Check | Observed result |
| --- | --- |
| First golden attempt, `halcyon-golden-isolated-1793256035206` | Imports/transfers completed, then an obsolete test assumption failed: no statement row had `category_source='ai'`. One failed test, seven did not run; not a live-provider pass |
| Explicit cold-classification attempt, `halcyon-golden-isolated-1793256415844` | Real `categorize-merchants` request returned generic Edge HTTP400 before an AI assignment could be imported. One failed test, seven did not run |
| Read-only model metadata using the configured key | HTTP200; `gemini-2.5-flash`, the implementation's model, is listed |
| One tiny synthetic JSON generation probe, no financial input | **HTTP402**, provider status **RESOURCE_EXHAUSTED**, message states prepayment credits are depleted |
| Cleanup | Both new projects have zero labelled containers/volumes/networks; temporary allowlisted credential file removed; retained preview database running and Budget HTTP200 |

Google's [Gemini prepay documentation](https://ai.google.dev/gemini-api/docs/billing#prepay) describes HTTP402 when the billing account's prepay balance reaches zero. The October generation response independently confirmed that condition. Generation retries stopped until the owner reported restored credits.

The earlier local candidate remains verified within its recorded scope: 560 lifecycle assertions, 391 forecast/assistance/candidate assertions, eight provider-disabled golden tests, 609 unit passes/14 existing skips, 78 WCAG scans and patched npm audit zero. The November live suite is separately recorded above.

## Test correction

The live branch of `app/e2e/golden-pass.spec.ts` now deliberately exercises the missing dependency instead of depending on a statement import incidentally producing an AI-origin row:

1. Submit one synthetic grocery merchant through the authenticated `categorize-merchants` endpoint. Require actual `geminiCalls>=1`, one AI assignment and `fromAi=1`.
2. Import that real returned assignment through authenticated `upsert-transactions` into a dedicated disposable fixture account, preserving the original statement-account assertions.
3. Open the current Ledger **Review selected (1)** action and require a real fresh `review-categorization` response with `geminiCalls>=1`, `fromCache=0` and an AI-origin proposal.
4. Close the preview and compare transaction and merchant-cache state to prove preview/cancel does not reclassify rows or teach the cache.

No AI classification is fabricated or seeded as proof. All four steps passed live on 9 November. Current Review selected/Close preview labels replace stale selector text. The patched installation's browser TypeScript check passes after this test-only change. No production source or financial assertion was weakened.

The pre-follow-up source binding is preserved in `docs/budget-m7/candidate/source-manifest-pre-live.json`; the current source manifest binds the corrected test. Only `app/e2e/golden-pass.spec.ts` changed among those executable/config sources. Older local suite totals are retained as historical evidence, not claimed as fresh reruns.

## Credential and evidence handling

The patched isolated installation was used. Only `GEMINI_API_KEY` / optional `GEMINI_MODEL` lines were copied into an exclusively created mode0600 temporary environment file. Each run provisioned a new labelled project on API55421 / DB55422 / browser55300, verified initially empty identities/data and used the existing guarded cleanup. The temporary credential file was removed in `finally` after each run.

Public evidence in `docs/budget-m7/candidate/live-provider/` contains sanitized test output, metadata/generation status, authorization scope, source-change identity and cleanup. API keys, raw runtime logs and authenticated browser traces are excluded. The original configured credential file is unchanged. The primary installed tools and schema96 preview remain preserved.

## Next step and release status

**M7.7 live-provider qualification and R08 are closed. Release remains No-Go.** M7.3 observed accessibility, M7.4 independent comprehension, M7.5 hosted/cold/load qualification and M7.8 owner release/exposure decision remain open. No deployment or persistent migration was performed.
