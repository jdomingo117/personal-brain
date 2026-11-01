# R01 forecast visual evidence

These captures use fictional disposable data and the production Budget UI. They are affected-view engineering evidence, not owner acceptance or a release authorization. See `BUDGET_R01_SPENDING_FORECAST.md` in the project root for calculation, coverage, security and regression evidence.

The responsive forecast disclosure is exercised at 320, 390, 768 and 1440 pixels, in light and dark themes. Keyboard Enter opens its native summary; each case includes an axe WCAG scan and page overflow check. The exact month dates and denominators are visible in the disclosure. Eight additional `threshold-*.png` captures verify the final Within plan/sub-threshold explanation alongside a separate pending warning; `owner-preview.png` shows the actual retained user tab. The final candidate directory contains a separate refreshed seven-state/five-width/two-theme matrix; the BUI-10 baseline is retained separately.

To review the retained preview, open `http://127.0.0.1:57300/budget` and use the fictional R01 forecast account. Its credentials are held in the preview runner’s private temporary session file, not this documentation. On Overview, find **A few things to check**, then **How this budget may finish**. Check the projected finish against the allowance, the separate pending warning, and **See forecast dates, method and fixed bills**. The monthly rent example should show one matched charge and zero still expected. The historical month totals, exact remaining days, local as-of date and method are inspectable.

The preview remains available only while its exact disposable runner is alive. Do not start another isolated runner on the same ports without positively identifying and stopping this one. Personal and hosted databases remain outside this workflow.
