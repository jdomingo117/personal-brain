# R06 local performance verification

See `BUDGET_M7_R06_OPTIMIZATION.md` at the project root for interpretation, exact scope and reproduction commands. Final admission is in the three named capacity/history/backend runs; exploratory profiles and failed runs are not passing admission evidence.

The 1m SQL first checkpoint miss is 4,325.854ms; the 20-sample SQL p95 is 744.926ms and five checkpoint-warm API samples have an 835ms maximum. Do not present the warm figures as first-load or hosted guarantees. API intent-based client throttling is outside the request timer; server limits remain active and no retries are hidden.

`source-manifest.json` binds final candidate sources. `runs.json` records all fourteen uniquely identified optimization projects and exact-label cleanup. `verification.json` records separate, overlapping suite totals and static/unit scope. Final raw timing samples/plans are in `../r06-capacity/measurements.json`; the earlier failed baseline stays in `../capacity-local/`.
