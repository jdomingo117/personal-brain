# Overview simplification study 01

Review `http://127.0.0.1:57300/budget-overview-study.html`. Desktop/Phone, scenario and theme controls are outside the proposed product. Production `/budget` remains in its original tab.

The hierarchy and implementation boundaries are recorded in `BUDGET_OVERVIEW_SIMPLIFICATION_STUDY.md` at the project root. The 30 captures cover five fictional states × 320/390/1440px × light/dark. `owner-desktop.png` is the actual review tab; `owner-phone-mode.png` shows its Phone control. `verification.json` records zero axe WCAG violations, page overflow and runtime errors, local dialog/focus/keyboard checks, zero financial API requests and all 447 R01 source hashes unchanged. The final phone funding-gap message is verified to appear above the allowance.

For a direct comparison, start with `pending-1440-light.png` and `pending-390-light.png`. Then inspect `funding-390-light.png` and `history-390-light.png`; these guard against a calm-looking design concealing a shortfall or implying a forecast from missing history.

Run the read-only study harness while the preview is available: `node app/scripts/test-budget-overview-study.mjs`. It uses no credentials or database fixtures. Its state arithmetic illustrates hierarchy, not a second financial implementation. Source: `app/budget-overview-study.html`. Owner design feedback remains pending.
