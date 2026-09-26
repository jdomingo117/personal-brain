import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtCents, type Txn } from '../data'
import { supabase } from '../lib/supabaseClient'
import {
  buildCategorizationReviewImpact, buildReviewAssignments, categorizationPreviewPages, suggestedReviewIds,
  type CategorizationReviewResponse, type CategorizationReviewRow,
} from '../lib/categorizationReview'
import { KIND_LABELS } from '../lib/classification'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { Button } from './Controls'

const pair = (category: string, subcategory: string | null) =>
  subcategory ? `${category} · ${subcategory}` : category

const confidence = (value: number | null) => value == null ? 'Not recorded' : `${Math.round(value * 100)}%`

function statusLabel(row: CategorizationReviewRow) {
  if (row.status === 'protected') return row.protection_reason ?? 'Protected'
  if (row.status === 'unresolved') return 'No safe suggestion'
  if (row.status === 'unchanged') return 'No change recommended'
  return 'Suggested change'
}

function delta(label: string, cents: number) {
  if (cents === 0) return null
  return `${label} ${cents > 0 ? 'increases' : 'decreases'} by ${fmtCents(Math.abs(cents))}`
}

export default function CategorizationReviewDialog({
  transactions, onClose, onChanged,
}: {
  transactions: Txn[]
  onClose: (clearSelection?: boolean) => void
  onChanged: () => Promise<void>
}) {
  const [response, setResponse] = useState<CategorizationReviewResponse | null>(null)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [operationId, setOperationId] = useState<string | null>(null)
  const [updated, setUpdated] = useState<number | null>(null)
  const dialogRef = useDialogFocus()
  const completed = updated !== null && updated > 0
  const transactionKey = transactions.map((transaction) => transaction.id).join(',')

  const close = () => onClose(completed)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    const load = async () => {
      const pages: CategorizationReviewResponse[] = []
      for (const transactionIds of categorizationPreviewPages(transactions)) {
        const { data, error: previewError } = await supabase.functions.invoke('review-categorization', {
          body: { action: 'preview', transaction_ids: transactionIds },
        })
        if (cancelled) return
        if (previewError) {
          setLoading(false)
          setError(previewError.message || 'Could not generate categorisation suggestions.')
          return
        }
        pages.push(data as CategorizationReviewResponse)
      }
      if (cancelled) return
      const next: CategorizationReviewResponse = {
        rows: pages.flatMap((page) => page.rows),
        stats: pages.reduce((total, page) => ({
          requested: total.requested + page.stats.requested,
          fromCache: total.fromCache + page.stats.fromCache,
          fromBank: total.fromBank + page.stats.fromBank,
          fromAi: total.fromAi + page.stats.fromAi,
          geminiCalls: total.geminiCalls + page.stats.geminiCalls,
          selected: total.selected + page.stats.selected,
          eligible: total.eligible + page.stats.eligible,
        }), { requested: 0, fromCache: 0, fromBank: 0, fromAi: 0, geminiCalls: 0, selected: 0, eligible: 0 }),
      }
      setLoading(false)
      setResponse(next)
      setAcceptedIds(suggestedReviewIds(next.rows))
    }
    void load()
    return () => { cancelled = true }
  }, [transactionKey])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) close() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [completed, saving, onClose])

  const suggested = response?.rows.filter((row) => row.status === 'suggested') ?? []
  const impact = useMemo(
    () => buildCategorizationReviewImpact(transactions, response?.rows ?? [], acceptedIds),
    [transactions, response, acceptedIds],
  )

  const toggle = (id: string) => setAcceptedIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const apply = async () => {
    if (!response) return
    const assignments = buildReviewAssignments(response.rows, acceptedIds)
    if (!assignments.length) return
    setSaving(true); setError('')
    const { data, error: applyError } = await supabase.functions.invoke('review-categorization', {
      body: { action: 'apply', assignments },
    })
    if (applyError) setError(applyError.message || 'Could not apply the accepted suggestions.')
    else {
      setOperationId(data.updated > 0 ? data.operation_id : null)
      setUpdated(data.updated)
      await onChanged()
    }
    setSaving(false)
  }

  const undo = async () => {
    if (!operationId) return
    setSaving(true); setError('')
    const { error: undoError } = await supabase.functions.invoke('update-transaction-category', {
      body: { action: 'undo_operation', operation_id: operationId },
    })
    if (undoError) setError(undoError.message || 'Could not undo this categorisation review.')
    else {
      setOperationId(null); setUpdated(null)
      await onChanged()
    }
    setSaving(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) close() }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="categorization-review-title" className="max-h-[calc(100vh-2rem)] w-full max-w-[760px] overflow-y-auto rounded-2xl border border-[var(--hair)] bg-surface p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Selected transactions</p>
            <h2 id="categorization-review-title" className="mt-1 font-display text-[24px] font-black text-ink">Review with categorisation engine</h2>
            <p className="mt-1 text-[12px] text-muted">Fresh suggestions are previews only. Manual corrections, user rules, bank classifications and reconciliation entries stay protected.</p>
          </div>
          <button type="button" aria-label="Close categorisation review" disabled={saving} onClick={close} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-[var(--hair)] disabled:opacity-40">×</button>
        </header>

        {loading && <p role="status" aria-live="polite" className="mt-6 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4 text-[12.5px] text-muted">Asking the current engine for fresh suggestions…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-[var(--color-neg)] p-3 text-[12.5px] text-neg">{error}</p>}

        {response && !completed && <>
          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            {([
              ['Suggested', suggested.length],
              ['Unchanged', response.rows.filter((row) => row.status === 'unchanged').length],
              ['Protected', response.rows.filter((row) => row.status === 'protected').length],
              ['Unresolved', response.rows.filter((row) => row.status === 'unresolved').length],
            ] as const).map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-3"><div className="text-[10px] uppercase tracking-[0.1em] text-muted">{label}</div><div className="mt-1 font-display text-[22px] font-black tabular-nums text-ink">{value}</div></div>)}
          </div>

          {suggested.length > 0 && <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-muted">{acceptedIds.size} of {suggested.length} suggestions accepted</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAcceptedIds(suggestedReviewIds(response.rows))} className="min-h-11 px-3 text-[11px] font-semibold text-accent-ink">Accept all suggestions</button>
              <button type="button" onClick={() => setAcceptedIds(new Set())} className="min-h-11 px-3 text-[11px] font-semibold text-muted">Clear</button>
            </div>
          </div>}

          <div className="mt-3 divide-y divide-[var(--hair-soft)] rounded-xl border border-[var(--hair)]">
            {response.rows.map((row) => {
              const selectable = row.status === 'suggested' && Boolean(row.proposed)
              return <div key={row.transaction_id} className="grid gap-2 p-3 sm:grid-cols-[44px_minmax(120px,0.8fr)_minmax(0,1.6fr)] sm:items-center">
                <label className={`grid min-h-11 min-w-11 place-items-center ${selectable ? 'cursor-pointer' : 'opacity-35'}`} aria-label={selectable ? `Accept suggestion for ${row.merchant}` : `${row.merchant} is not selectable`}>
                  <input type="checkbox" disabled={!selectable} checked={acceptedIds.has(row.transaction_id)} onChange={() => toggle(row.transaction_id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                </label>
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-semibold text-ink">{row.merchant}</div>
                  <div className="text-[11px] tabular-nums text-muted">{row.date}</div>
                  <div className={`mt-1 text-[10.5px] font-semibold ${row.status === 'suggested' ? 'text-accent-ink' : row.status === 'protected' ? 'text-warn' : 'text-muted'}`}>{statusLabel(row)}</div>
                </div>
                <div className="grid gap-1 text-[11.5px] sm:grid-cols-[1fr_18px_1fr] sm:items-center">
                  <div className="rounded-lg bg-[var(--input-bg)] p-2"><span className="block text-[9.5px] uppercase tracking-[0.08em] text-muted">Current</span><strong className="text-ink2">{pair(row.current.category, row.current.subcategory)}</strong><span className="block text-[10px] text-muted">{confidence(row.current.confidence)}</span></div>
                  <span className="hidden text-center text-muted sm:block">→</span>
                  <div className="rounded-lg bg-[var(--accent-wash)] p-2"><span className="block text-[9.5px] uppercase tracking-[0.08em] text-muted">Proposed</span><strong className="text-ink2">{row.proposed ? pair(row.proposed.category, row.proposed.subcategory) : 'No suggestion'}</strong><span className="block text-[10px] text-muted">{row.proposed ? confidence(row.proposed.confidence) : '—'}</span></div>
                </div>
              </div>
            })}
          </div>

          <div className="mt-4 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4 text-[12px] text-ink2" aria-live="polite">
            <p className="font-semibold uppercase tracking-[0.08em] text-ink">Accepted impact</p>
            {impact.accepted === 0 ? <p className="mt-2 text-muted">Choose at least one suggestion to apply.</p> : <ul className="mt-2 grid gap-1.5">
              <li><strong>{impact.accepted}</strong> transaction{impact.accepted === 1 ? '' : 's'} will be marked Manual.</li>
              <li>{impact.categoryChanges} categor{impact.categoryChanges === 1 ? 'y' : 'ies'} and {impact.subcategoryChanges} subcategor{impact.subcategoryChanges === 1 ? 'y' : 'ies'} will change; {impact.reviewFlagsCleared} review flag{impact.reviewFlagsCleared === 1 ? '' : 's'} will clear.</li>
              {impact.kindTransitions.map((transition) => <li key={`${transition.from}-${transition.to}`}>{transition.count} derived kind: {KIND_LABELS[transition.from]} → {KIND_LABELS[transition.to]}</li>)}
              {impact.subscriptionChanges > 0 && <li>{impact.subscriptionChanges} derived subscription flag{impact.subscriptionChanges === 1 ? '' : 's'} will change.</li>}
              {delta('Expense reporting', impact.expenseDeltaCents) && <li>{delta('Expense reporting', impact.expenseDeltaCents)}.</li>}
              {delta('Earned income', impact.earnedIncomeDeltaCents) && <li>{delta('Earned income', impact.earnedIncomeDeltaCents)}.</li>}
            </ul>}
          </div>
        </>}

        {completed && <div className="mt-6 rounded-xl border border-[var(--color-pos)] bg-[var(--input-bg)] p-4"><p className="font-semibold text-pos">Applied {updated} accepted suggestion{updated === 1 ? '' : 's'}.</p><p className="mt-1 text-[12px] text-muted">The changes share one guarded undo operation. Closing clears the Ledger selection.</p></div>}

        <div className="mt-5 flex flex-wrap gap-2">
          {!completed && <Button onClick={() => void apply()} disabled={loading || saving || impact.accepted === 0}>{saving ? 'Applying…' : `Apply accepted (${impact.accepted})`}</Button>}
          {operationId && <Button variant="ghost" onClick={() => void undo()} disabled={saving}>Undo review</Button>}
          <Button variant="ghost" onClick={close} disabled={saving}>{completed ? 'Done and clear selection' : 'Cancel'}</Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
