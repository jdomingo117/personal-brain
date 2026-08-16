import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'

type Props = {
  accountId: string
  refreshKey?: number
}

type UploadBatch = {
  id: string
  file_name: string
  source_row_count: number
  inserted_count: number
  skipped_count: number
  blocked_count: number
  reconciliation_amount: number | null
  created_at: string
  undone_at: string | null
  removed_count: number
}

const when = (iso: string) => new Intl.DateTimeFormat('en-AU', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(iso))

export default function UploadHistory({ accountId, refreshKey = 0 }: Props) {
  const { refreshData } = useData()
  const [batches, setBatches] = useState<UploadBatch[]>([])
  const [loadingBatchId, setLoadingBatchId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadBatches = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('upload_batches')
      .select(`
        id, file_name, source_row_count, inserted_count, skipped_count,
        blocked_count, reconciliation_amount, created_at, undone_at, removed_count
      `)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10)

    if (loadError) {
      setError('Upload history is temporarily unavailable.')
      return
    }
    setBatches((data ?? []) as UploadBatch[])
  }, [accountId])

  useEffect(() => {
    setError('')
    void loadBatches()
  }, [loadBatches, refreshKey])

  const handleUndo = async (batch: UploadBatch) => {
    if (!confirm(
      `Undo “${batch.file_name}”? This removes its imported transactions and recalculates the account balance.`,
    )) return

    setError('')
    setLoadingBatchId(batch.id)
    try {
      const { error: fnError } = await supabase.functions.invoke('delete-upload-batch', {
        body: { upload_batch_id: batch.id, account_id: accountId },
      })
      if (fnError) throw fnError

      await Promise.all([refreshData(), loadBatches()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo upload.')
    } finally {
      setLoadingBatchId(null)
    }
  }

  if (batches.length === 0 && !error) return null

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="text-[12px] font-semibold text-ink2 uppercase tracking-wide">Recent uploads</div>
      {error && <div className="text-[13px] font-medium text-[var(--color-neg)]" role="alert">{error}</div>}
      <div className="flex flex-col gap-2">
        {batches.slice(0, 5).map((batch) => {
          const canUndo = batch.inserted_count > 0 || batch.reconciliation_amount !== null
          return (
            <div key={batch.id} className="flex items-center justify-between gap-3 bg-surface border border-[var(--hair)] rounded-lg px-3 py-2">
              <div className="min-w-0 flex flex-col">
                <span className="truncate text-[12.5px] font-medium text-ink">{batch.file_name}</span>
                <span className="text-[12.5px] text-ink2">
                  {when(batch.created_at)} · {batch.inserted_count} imported
                  {batch.skipped_count > 0 && ` · ${batch.skipped_count} skipped`}
                  {batch.blocked_count > 0 && ` · ${batch.blocked_count} blocked`}
                </span>
                {batch.undone_at && (
                  <span className="text-[12.5px] text-ink2">Undone · {batch.removed_count} ledger rows removed</span>
                )}
              </div>
              <button
                onClick={() => handleUndo(batch)}
                disabled={loadingBatchId === batch.id || Boolean(batch.undone_at) || !canUndo}
                title={!canUndo ? 'This upload made no ledger changes' : undefined}
                className="micro min-h-11 shrink-0 rounded bg-[var(--color-neg)]/5 px-3 py-2 text-[11px] font-semibold text-[var(--color-neg)] transition hover:bg-[var(--color-neg)]/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingBatchId === batch.id ? 'Undoing…' : batch.undone_at ? 'Undone' : 'Undo'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
