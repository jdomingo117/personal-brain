# Scheduled investment price sync

Deploy this function with JWT verification disabled; it authenticates the
server-to-server request by comparing the bearer token to the project service
role secret and accepts no user payload.

Configure Supabase Cron to POST to this function at `0 7 * * 1-5` UTC (after
Vanguard's normal Australian publication window). A second `0 22 * * 1-5`
retry catches delayed publication. Send `Authorization: Bearer <service role
key>` from a Supabase Vault secret; never place the key in migration SQL.

Interactive app loads retain a once-per-session stale refresh as a fallback if
a scheduled run is delayed or unavailable.

