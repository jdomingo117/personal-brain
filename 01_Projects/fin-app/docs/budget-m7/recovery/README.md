# M7.6 — isolated migration and recovery evidence

Final result: **164 integration assertions pass**, plus **25 separate focused workspace unit tests**. See `../../../BUDGET_M7_MIGRATION_RECOVERY.md` for the procedure, limitations, archive catalog/checksums and release implications.

- `halcyon-budget-m2-579045036283479e/verification.json`: final populated schema64→104 run, both archive identities, 81/108-table canonical SQL count/hash manifests, sequences, SQL money aggregates, two separate restores, original-password authentication, RLS and disable/re-enable outcomes.
- `integration.log`: final integration output and captured cleanup result.
- `workspace-unit.log`: focused client flag/recovery unit output.
- `source-manifest.json`: 464 source hashes. Compared with the R06 baseline, only existing `app/package.json` and `app/scripts/test-budget-durable.mjs` changed; the new recovery module and backup-ignore rule are also bound. No production application, Edge or migration source changed.
- `cleanup.json`: independent zero-container/volume/network check for all three attempt projects; retained preview database still running. Preview HTTP was also verified as 200.
- `summary.json`: compact final result.

The earlier `halcyon-budget-m2-b8da0df2fad04fef/verification.json` records the simpler 157-assertion rehearsal. It is historical supporting evidence, not the final fixture/source binding, and its total must not be added to 164. The intermediate project `halcyon-budget-m2-eeff7681c9f04655` stopped on a test assertion that incorrectly expected a reserve-transfer record from opening intent; final code explicitly makes a reserve release. It did not produce post-Budget recovery evidence, and its resources are verified removed.

Raw database dumps/catalogs remain private and ignored in `backups/budget-m7/<project>/`, outside the transient Supabase and Docker paths. Public evidence contains only fictional fixture IDs, counts, hashes, cents and outcome metadata; generated passwords and platform secrets are not retained here. These are fictional rehearsal archives, not personal-data backups.

Restores used separate empty databases within the disposable Supabase cluster and its existing roles/extensions. Hosted/new-host recovery, external secrets/storage, personal migration and deployment were not performed. Human gates, hosted/cold/load qualification and M7.7/M7.8 remain open; overall release **No-Go**.
