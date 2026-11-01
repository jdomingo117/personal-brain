---
type: implementation-record
status: engineering-verified
project: Halcyon
updated: 2026-10-28
---

# Budget Overview — approved copy refinement

The owner authorized the first three recommendations from the AI beginner-perspective critique. The production page now says “Pending charges could put you $10.00 over your allowance”, labels the projection “Estimated everyday spending”, and keeps warning-threshold policy inside the existing explanation. Available forecasts identify the selected period's end date next to their over/below amount. Future forecasts retain provisional wording; stale/unavailable values retain their suppression guards.

Only `app/src/components/BudgetAttention.tsx` and `app/src/components/budget/BudgetForecast.tsx` changed from the pass-three source manifest. The pending sentence displays the existing positive canonical gap through fmtCents; it does not change signed backend facts or other attention kinds. No financial calculation, server status, threshold, action controller or layout changed.

Verification: full app TypeScript and production build pass; six read-only browser cases at 320/390/1440px in light/dark have no axe WCAG violations or horizontal overflow. Assertions verify the genuine pending gap and projected amount, the end-date caption, threshold explanation retained behind details, provisional future label and stale suppression. Zero Budget writes and runtime errors. Source binding and seven captures, including the actual owner tab, are in `docs/budget-ui/copy-refinement/`. No new lifecycle run or unit-test count is claimed; prior engine/workflow evidence remains in [[BUDGET_OVERVIEW_PASS_3_VERIFICATION]].

Preview: http://127.0.0.1:57300/budget. The separate study remains historical and intentionally retains its original wording. No deployment, migration, personal database change or commit occurred. Human validation remains pending in [[BUDGET_M7_HUMAN_VALIDATION]], and operational/release gates remain open / No-Go. The remaining AI suggestions about expanded explanation density and disclosure labels have not been implemented.
