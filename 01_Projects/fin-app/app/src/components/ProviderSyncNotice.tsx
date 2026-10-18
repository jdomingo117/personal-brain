import { useCallback, useEffect, useState } from 'react'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabaseClient'
import { providerSyncNoticeDetail } from '../lib/providerSyncStatus'
import { BackgroundOperationNotice } from './OperationStatus'

type RunningSync = {
  account_id: string
  connection_id: string
  pages_fetched: number
  rows_seen: number
  rows_inserted: number
  rows_updated: number
}

/**
 * A durable notice for provider work which may have been started by this or
 * another view. It derives its message from the server's running sync record;
 * it never pretends that a client-side request is the source of truth.
 */
export default function ProviderSyncNotice() {
  const { accounts } = useData()
  const [runs, setRuns] = useState<RunningSync[]>([])

  const load = useCallback(async () => {
    const connectedAccountIds = accounts.filter((account) => account.connectionId).map((account) => account.id)
    if (!connectedAccountIds.length) { setRuns([]); return }

    const { data: connections, error: connectionError } = await supabase
      .from('account_connections')
      .select('account_id, connection_id')
      .in('account_id', connectedAccountIds)
    if (connectionError || !connections?.length) { setRuns([]); return }

    const accountIdByConnectionId = new Map(connections.map((connection) => [connection.connection_id, connection.account_id]))
    const { data } = await supabase
      .from('sync_runs')
      .select('connection_id, pages_fetched, rows_seen, rows_inserted, rows_updated')
      .in('connection_id', connections.map((connection) => connection.connection_id))
      .eq('status', 'running')
      .order('started_at', { ascending: false })
    setRuns((data ?? []).flatMap((run) => {
      const accountId = accountIdByConnectionId.get(run.connection_id)
      return accountId ? [{ ...run, account_id: accountId } as RunningSync] : []
    }))
  }, [accounts])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => { void load() }, 10_000)
    return () => window.clearInterval(interval)
  }, [load])

  if (!runs.length) return null

  const detail = providerSyncNoticeDetail(
    runs.map((run) => ({ accountId: run.account_id, pagesFetched: run.pages_fetched, rowsSeen: run.rows_seen, rowsInserted: run.rows_inserted, rowsUpdated: run.rows_updated })),
    new Map(accounts.map((account) => [account.id, account.name])),
  )

  return <div className="fixed bottom-[58px] right-4 z-40 w-[min(24rem,calc(100vw-2rem))] sm:right-8"><BackgroundOperationNotice title="Provider sync in progress" detail={detail} /></div>
}
