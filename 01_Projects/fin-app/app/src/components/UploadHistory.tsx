import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'

type Props = {
  accountId: string
}

export default function UploadHistory({ accountId }: Props) {
  const { transactions, refreshData } = useData()
  const [loadingBatchId, setLoadingBatchId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const batches = useMemo(() => {
    const accountTxs = transactions.filter(t => t.account_id === accountId && t.upload_batch_id)
    const grouped = accountTxs.reduce((acc, tx) => {
      const id = tx.upload_batch_id!
      if (!acc[id]) {
        acc[id] = { id, count: 0, date: tx.date }
      }
      acc[id].count++
      // Keep the most recent date of the batch (simplification)
      if (tx.date > acc[id].date) {
        acc[id].date = tx.date
      }
      return acc
    }, {} as Record<string, { id: string, count: number, date: string }>)

    return Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, accountId])

  const handleUndo = async (batchId: string) => {
    if (!confirm('Are you sure you want to undo this upload? This will remove all associated transactions.')) return
    
    setError('')
    setLoadingBatchId(batchId)
    try {
      const { error: fnError } = await supabase.functions.invoke('delete-upload-batch', {
        body: { upload_batch_id: batchId, account_id: accountId }
      })
      
      if (fnError) throw fnError

      await refreshData()
    } catch (err: any) {
      setError(err.message || 'Failed to undo upload')
    } finally {
      setLoadingBatchId(null)
    }
  }

  if (batches.length === 0) return null

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="text-[12px] font-semibold text-ink2 uppercase tracking-wide">Recent Uploads</div>
      {error && <div className="text-[12px] text-red-500 font-medium">{error}</div>}
      <div className="flex flex-col gap-2">
        {batches.slice(0, 5).map(batch => (
          <div key={batch.id} className="flex items-center justify-between bg-surface border border-[var(--hair)] rounded-lg px-3 py-2">
            <div className="flex flex-col">
              <span className="text-[12.5px] font-medium text-ink">CSV Upload</span>
              <span className="text-[11px] text-muted">{batch.date} • {batch.count} transactions</span>
            </div>
            <button
              onClick={() => handleUndo(batch.id)}
              disabled={loadingBatchId === batch.id}
              className="micro px-2.5 py-1 text-[11px] font-semibold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingBatchId === batch.id ? 'Undoing...' : 'Undo'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
