---
tags: [halcyon, budgeting, forecast, verification]
type: implementation-checkpoint
status: engineering-complete-human-review-pending
project: Halcyon
created: 2026-10-27
updated: 2026-10-28
related:
  - "[[BUDGET_FEATURE_SPEC]]"
  - "[[BUDGET_M7_RELEASE_VERIFICATION]]"
  - "[[CURRENT_STATUS]]"
---

# R01 — Date-aware spending forecast

28 October 2026. Engineering complete; affected human review remains pending and release remains No-Go.

R01 implements the frozen Budget feature specification §9.4. On 27 October 2026 the owner explicitly chose **“Median of three monthly daily averages (recommended)”**: calculate each covered month’s gross flexible spending divided by its calendar days, select the median of the three rates, retain that exact rational rate, and round only the final projected cents. Zero-spend days therefore remain in the denominator without erasing irregular spending.

## Delivered behavior

The workspace read returns method `budget-forecast-v1`, bound to the exact source revision, plan version, saved period, local calculation date and checked timestamp. The financial `budget_details` payload and immutable review snapshots are not extended with forecasts. The forecast is derived under the tenant gate, with no new financial writes or background jobs.

Flexible finish is current-period settled net flexible spending plus the historical daily gross rate × remaining local calendar days. Today is included in actuals; remaining days start tomorrow. A fortnight uses its actual saved boundaries, not half a monthly estimate. The three most recent sufficiently covered complete calendar months are chosen from the intersection of coverage across the selected activity-account set, including older covered months when recent history is absent. Missing history is excluded; a fully covered month with no spending is a real zero. Month lengths include leap February. History dates, gross amounts, denominators and the selected median month are visible in the method disclosure.

Historical source treatment follows the canonical ledger: split children replace their parent, pending and transfers are excluded, durable rejected derived transfers become ordinary expenses again, and exceptional expenses remain unless explicitly mapped. Saved non-flexible source mappings and valid non-flexible claims exclude their effects from the historical flexible pool. Current actuals retain dated account membership. Only explicitly linked flexible refunds reduce flexible net spending; unassigned credits do not free capacity. Historical credits never lower the gross future rate.

Fixed bills use matched net charges plus remaining scheduled occurrences. A matched occurrence is counted once; unmatched past dates remain **expected**, without asserting unpaid. Incomplete fixed schedules prevent a flexible Within plan estimate. Reserves retain their existing target, reserve and actual contribution/deadline checks; contributions retain recorded-versus-planned funding checks. Neither is linearly paced as expenses or added to a fictitious cash forecast.

A sub-threshold projected excess is explained beside its amount: the forecast can be over the allowance yet below the specified material warning trigger. This avoids an unexplained Within plan label. Settled excess of one cent is Exceeded. Likely to exceed requires a projected excess **strictly greater than** the larger of $25 or the rounded-up 5% threshold. Separate flexible and fixed projected issues use the existing attention acknowledgment/snooze/reopen controller. Pending flexible charges can create a separate conditional warning; they change neither settled spending nor the historical finish estimate. Reviewed projected/pending gaps are excluded from the UI’s real-money shortfall tally.

Fewer than three complete months, incomplete current coverage, unresolved transfers/changed matches, invalid account scope, incomplete fixed schedules and unsafe exact-cent bounds suppress the estimate or require Check data. Future periods are explicitly provisional with no fabricated actuals. Completed periods do not receive a new retrospective forecast. Client guards suppress stale local dates, source/version/period mismatch, refresh failures and incomplete or unsafe evidence. The UI explicitly says that a spending estimate is not a bank balance or proof of affordability; no confidence interval is invented.

## Implementation

- Forward migration 96: `supabase/migrations/20261027000000_budget_spending_forecast.sql`; read-only forecast facts and workspace/attention composition. Internal functions have explicit PUBLIC/anon/authenticated execute revocation and service-role grants.
- `app/src/lib/budgetForecast.ts` and tests: typed facts, exact revision binding, complete-month and safe-cent validation.
- `app/src/components/budget/BudgetForecast.tsx`: scoped native disclosure inside the checks card, with fixed-date breakdown, pending qualifier and explanatory basis.
- Existing attention source identity, receipt replay, preference history, financial Undo, reserve/deadline and contribution controllers remain in use.
- `app/scripts/test-budget-forecast.mjs`: independent integer-rational reference cases, disposable integration and responsive keyboard/axe checks.
- `app/scripts/preview-budget-forecast.mjs`: an additional fictional forecast account in the retained manual preview.

## Verification

Separate guarded runs passed:

| Run | Exact disposable project | Result |
| --- | --- | --- |
| Full `--items --lifecycle --workspace` | `halcyon-budget-m2-d2f5c284485a479e` | 472 checks; 96 migrations |
| `--forecast-only --workspace --candidate-only` | `halcyon-budget-m2-63df588076894109` | 243 combined checks; eight forecast plus 70 candidate WCAG scans, zero violations |
| Final `--forecast-only --workspace` after pending-evidence refinement | `halcyon-budget-m2-a66902243a7d48a2` | 79 checks; includes eight refreshed forecast WCAG scans, exact 5%/$25 boundary cases, leap/older covered months, fixed mapping/matching, future/past/fortnight and failed-refresh suppression |

All three projects logged exact fixture/auth/account/transaction/source-gate cleanup and removal of only their own labelled disposable resources. The 472-check run preceded final forecast copy/guard polish and the narrow pending-evidence refinement; the final focused run covers those affected paths. The 243-check run records candidate recovery/error states before that final backend-only pending-identity refinement. Counts overlap and are not additive unique test cases. A migration-local execute-grant assertion was subsequently added; the retained preview replays that final migration and exercises actual authenticated reads/sign-in.

Final unit suite: **589 passed, 14 existing skips** across 63 passing/two skipped files. Full app TypeScript, focused Budget TypeScript, browser TypeScript, modified script syntax and production build pass. The existing chunk-size advisory remains. The last focused run specifically proves that ordinary added pending holds below materiality stay reviewed, while changed or replaced prior pending evidence reopens without a larger total and stale submissions are rejected.

Source/capture evidence is in `docs/budget-ui/r01/`: eight forecast width/theme captures, a separate 70-state candidate manifest and 80 candidate captures (healthy body views included), and a final source manifest. BUI-10 evidence is retained unchanged. The earlier 69-check focused pass is superseded by the final 79-check run.

No personal or hosted database was inspected or migrated. All database checks use the guarded disposable provisioner on API 57421/database 57422, and frontend 57300. Test failures uncovered an ambiguous unused SQL local variable and two fixture/test issues (volatile generation timestamp comparison and coverage invalidation after a transfer decision); these were corrected rather than weakening the product checks.

## Remaining gates

The 17 BUI presentation bursts and previous owner visual acceptance remain recorded. R01 adds new presentation that requires its own affected-flow human review. Automated axe/keyboard checks do not complete M7.3 observed assistive-technology work or M7.4 independent beginner comprehension. Capacity/query-plan, authorized persistent migration/restore, ingestion/ledger/security/operational verification and explicit release authorization remain open under M7.5–M7.8. No deployment, personal migration, commit or public exposure is implied by R01 engineering completion.

## Final visual refinement and retained preview

The owner preview exposed a small projected excess below the warning threshold. A final explanatory sentence now states both the excess and the threshold beside the projection, while retaining the frozen status rule. After this copy-only refinement, a separate real-password-sign-in check on the positively identified preview exercised 320/390/768/1440 pixels in both themes: **eight additional WCAG/fit cases passed**, zero browser runtime errors, and zero Budget writes. `threshold-manifest.json` and eight captures record this otherwise-uncovered Within plan/sub-threshold state, alongside the previous Likely to exceed cases. Final source hashes include this sentence. Thus the affected matrices cover 86 distinct state/width/theme scans (78 combined plus eight threshold cases); the final focused run's eight repeated scans are not added again.

The final preview is **`halcyon-budget-m2-8a23491eb36a470c`, runner PID 19901**, with frontend `http://127.0.0.1:57300/budget`, API 57421 and database 57422. Its project label and runner command were positively verified. It replayed all 96 migrations, including the migration-local execute-privilege assertion, and all eight fictional accounts passed normal password sign-in and their intended routes/controls. The existing user tab is signed into the dedicated R01 account, with projected spending, a separate pending warning and matched rent. `owner-preview.png` is the final visible review checkpoint. Runtime credentials remain only in the mode-0600 temporary session file and are not copied into project documentation.

The preview is intentionally retained for review; the completed test projects listed above are cleaned. Positively identify this exact runner before stopping it for another conflicting disposable test. Stopping it cleans only its own fictional resources. No working-tree changes were staged or committed.

## Owner walkthrough and usability follow-up — 28 October 2026

The owner reported “These all pass” for the proposed R01 visual/wording and keyboard/zoom walkthrough checks, then flagged the amount of text and competing directions as overwhelming. This is not observed screen-reader or independent beginner evidence. The owner authorized a hierarchy and desktop/phone mockup pass in [[BUDGET_OVERVIEW_SIMPLIFICATION_STUDY]]. Its standalone proposal leaves R01 calculations and production UI untouched; review and any agreed presentation implementation precede resumed M7 human walkthroughs.
