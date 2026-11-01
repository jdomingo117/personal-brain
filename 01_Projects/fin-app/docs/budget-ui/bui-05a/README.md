# BUI-05a production everyday rows

Authenticated production fixtures run only on a freshly provisioned disposable
Supabase project via `--everyday-only --workspace`. See
[BUDGET_BUI_05A_EVERYDAY_ROWS.md](../../../BUDGET_BUI_05A_EVERYDAY_ROWS.md)
for target identities and final validation results.

`captures/` contains ten category-row screenshots at 320, 390, 768, 1024 and 1440px
in both themes, one limits-off screenshot, one retained stale-result screenshot,
and two manual-plan screenshots. The fixture proves a -$60 category shortfall,
$350 Other remainder and $290 positive pool; these are canonical server values.

The tests inspect keyboard disclosure, no-write inspection, real limit removal,
activity/move entry points, released rights, unavailable/future and stale states.
Owner acceptance and human assistive-technology validation are recorded separately.
