# BUI-05b production commitment disclosures

The authenticated fixture includes a partly paid bill, an unconfigured bill,
a paused bill, an upcoming reserve with opening rights and a planned transfer.
All fixture writes run within the guarded fresh disposable provisioner:

```sh
cd app
SUPABASE_CLI=/absolute/path/to/supabase node scripts/test-budget-durable.mjs --commitments-only --workspace
```

The test checks stable saved line IDs, keyboard disclosure, no command on inspection,
existing adjust/match/setup forms, exact occurrence dates and partial payments,
changed source claims, coverage and invalid account scope. It captures open details
at 320, 390, 768, 1024 and 1440px in both themes and the unavailable state.

See [BUDGET_BUI_05B_COMMITMENTS.md](../../../BUDGET_BUI_05B_COMMITMENTS.md)
for final target identities, test counts and next phase. Automated scans and
engineering image review do not substitute for final human validation.
