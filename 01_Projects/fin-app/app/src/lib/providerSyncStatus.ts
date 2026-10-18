export interface ProviderSyncCheckpoint {
  accountId: string
  pagesFetched: number
  rowsSeen: number
  rowsInserted: number
  rowsUpdated: number
}

/**
 * Convert only durable provider-sync checkpoints into concise user-facing
 * status copy. Missing checkpoints remain unknown rather than becoming a
 * fabricated percentage or estimate.
 */
export function providerSyncNoticeDetail(
  runs: readonly ProviderSyncCheckpoint[],
  accountNames: ReadonlyMap<string, string>,
): string {
  const names = [...new Set(runs.map((run) => accountNames.get(run.accountId)).filter((name): name is string => Boolean(name)))]
  const pages = runs.reduce((sum, run) => sum + run.pagesFetched, 0)
  const records = runs.reduce((sum, run) => sum + run.rowsSeen, 0)
  const changes = runs.reduce((sum, run) => sum + run.rowsInserted + run.rowsUpdated, 0)
  const accountLabel = names.length ? names.join(', ') : `${runs.length} connected account${runs.length === 1 ? '' : 's'}`

  return [
    `Checking ${accountLabel}.`,
    pages > 0 ? `${pages} page${pages === 1 ? '' : 's'} received.` : 'This may take a moment.',
    records > 0 ? `${records} transaction${records === 1 ? '' : 's'} checked.` : null,
    changes > 0 ? `${changes} change${changes === 1 ? '' : 's'} recorded.` : null,
  ].filter(Boolean).join(' ')
}
