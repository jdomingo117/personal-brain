import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ALL_CATEGORIES, FULL_TAXONOMY, fmtCents, type Txn } from '../data'
import { supabase } from '../lib/supabaseClient'
import { useData } from '../contexts/DataContext'
import {
  buildCategorizationReviewImpact, buildReviewAssignments, categorizationPreviewPages, categorizationPreviewProgress, reviewTarget, suggestedReviewIds,
  type CategorizationReviewResponse, type CategorizationReviewRow, type CategorizationReviewScope, type ReviewChoice, type ReviewStatus,
} from '../lib/categorizationReview'
import { KIND_LABELS } from '../lib/classification'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { Button } from './Controls'
import { InlineActivity, OperationProgress, OperationStatusPanel, OperationSteps } from './OperationStatus'

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
  transactions, scope = 'selected', scopeCandidateCount, scopeTruncated = false, suspended = false, invalidated = false, batch, onPreviewComplete, onNextBatch, onOpenTransaction, onClose, onChanged,
}: {
  transactions: Txn[]
  scope?: CategorizationReviewScope
  /** Candidate count before the shared 500-row atomic boundary is applied. */
  scopeCandidateCount?: number
  scopeTruncated?: boolean
  suspended?: boolean
  invalidated?: boolean
  batch?: { index: number; total: number; skipped: number; nextSize?: number }
  onPreviewComplete?: () => void
  onNextBatch?: () => void
  onOpenTransaction: (id: string) => void
  onClose: (clearSelection?: boolean) => void
  onChanged: () => Promise<void>
}) {
  const { customSubcategories } = useData()
  const [response, setResponse] = useState<CategorizationReviewResponse | null>(null)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set())
  const [choices, setChoices] = useState<Map<string, ReviewChoice>>(new Map())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftCategory, setDraftCategory] = useState('')
  const [draftSubcategory, setDraftSubcategory] = useState('')
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('suggested')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingAction, setSavingAction] = useState<'apply' | 'undo' | null>(null)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const [completedPreviewPages, setCompletedPreviewPages] = useState(0)
  const [operationId, setOperationId] = useState<string | null>(null)
  const [updated, setUpdated] = useState<number | null>(null)
  const [confirmNext, setConfirmNext] = useState(false)
  const dialogRef = useDialogFocus({ active: !suspended, fallbackSelector: '[data-category-review-trigger], [data-dialog-focus-fallback]' })
  const completed = updated !== null && updated > 0
  const saving = savingAction !== null
  const transactionKey = transactions.map((transaction) => transaction.id).join(',')
  const previewPages = useMemo(() => categorizationPreviewPages(transactions), [transactionKey])
  const previewProgress = categorizationPreviewProgress(previewPages.length, completedPreviewPages)
  const scopeLabel = scope === 'unresolved' ? 'Unclassified transactions'
    : scope === 'eligible' ? 'Check existing categories' : 'Selected transactions'

  const close = () => onClose(completed)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setCompletedPreviewPages(0)
    const load = async () => {
      const pages: CategorizationReviewResponse[] = []
      try {
        for (const [pageIndex, transactionIds] of previewPages.entries()) {
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
          setCompletedPreviewPages(pageIndex + 1)
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
        const returnedIds = new Set(next.rows.map((row) => row.transaction_id))
        if (transactions.length > 0 && transactions.every((transaction) => returnedIds.has(transaction.id))) onPreviewComplete?.()
      } catch (previewError) {
        if (cancelled) return
        setLoading(false)
        setError(previewError instanceof Error ? previewError.message : 'Could not generate categorisation suggestions.')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [transactionKey, retryToken])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving && !suspended) close() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [completed, saving, suspended, onClose])

  const suggested = response?.rows.filter((row) => row.status === 'suggested') ?? []
  const impact = useMemo(
    () => buildCategorizationReviewImpact(transactions, response?.rows ?? [], acceptedIds, choices),
    [transactions, response, acceptedIds, choices],
  )
  const transactionById = useMemo(() => new Map(transactions.map((transaction) => [transaction.id, transaction])), [transactions])
  const missingPreviewRows = response ? transactions.length - new Set(response.rows.filter((row) => transactionById.has(row.transaction_id)).map((row) => row.transaction_id)).size : 0
  const visibleRows = (response?.rows ?? []).filter((row) => {
    const transaction = transactionById.get(row.transaction_id)
    const text = `${row.merchant} ${transaction?.originalDescription ?? ''} ${transaction?.account ?? ''}`.toLocaleLowerCase()
    return (filter === 'all' || row.status === filter) && text.includes(search.trim().toLocaleLowerCase())
  })

  const toggle = (id: string) => setAcceptedIds((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const apply = async () => {
    if (!response) return
    if (invalidated) return
    const assignments = buildReviewAssignments(response.rows, acceptedIds, choices)
    if (!assignments.length) return
    setSavingAction('apply'); setError('')
    const { data, error: applyError } = await supabase.functions.invoke('review-categorization', {
      body: { action: 'apply', assignments },
    })
    if (applyError) setError(applyError.message || 'Could not apply the accepted suggestions.')
    else {
      setOperationId(data.updated > 0 ? data.operation_id : null)
      setUpdated(data.updated)
      await onChanged()
    }
    setSavingAction(null)
  }

  const undo = async () => {
    if (!operationId) return
    setSavingAction('undo'); setError('')
    const { error: undoError } = await supabase.functions.invoke('update-transaction-category', {
      body: { action: 'undo_operation', operation_id: operationId },
    })
    if (undoError) setError(undoError.message || 'Could not undo this categorisation review.')
    else {
      setOperationId(null); setUpdated(null)
      await onChanged()
    }
    setSavingAction(null)
  }

  const retryPreview = () => {
    if (loading) return
    setResponse(null)
    setAcceptedIds(new Set())
    setChoices(new Map())
    setExcludedIds(new Set())
    setError('')
    setRetryToken((current) => current + 1)
  }

  const setChoice = (row: CategorizationReviewRow, choice: ReviewChoice) => {
    setChoices((current) => new Map(current).set(row.transaction_id, choice))
    setAcceptedIds((current) => new Set(current).add(row.transaction_id))
  }

  const openTransaction = (id: string) => {
    setExcludedIds((current) => new Set(current).add(id))
    setAcceptedIds((current) => { const next = new Set(current); next.delete(id); return next })
    onOpenTransaction(id)
  }

  const previewSteps = [
    { id: 'prepare', label: 'Preparing a no-write preview', detail: 'No transaction changes are being made.', state: 'complete' as const },
    {
      id: 'review',
      label: previewProgress.activePage === null
        ? 'Combining completed merchant groups'
        : `Reviewing merchant group ${previewProgress.activePage} of ${previewProgress.totalPages}`,
      detail: previewProgress.completedPages === 0
        ? 'Sending the first bounded preview request.'
        : `${previewProgress.completedPages} group${previewProgress.completedPages === 1 ? '' : 's'} complete.`,
      state: 'current' as const,
    },
    { id: 'combine', label: 'Preparing suggestions for review', state: 'upcoming' as const },
  ]

  if (suspended) return null

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) close() }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="categorization-review-title" className="max-h-[calc(100vh-2rem)] w-full max-w-[760px] overflow-y-auto rounded-2xl border border-[var(--hair)] bg-surface p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">{scopeLabel}</p>
            <h2 id="categorization-review-title" className="mt-1 font-display text-[24px] font-black text-ink">Review with categorisation engine</h2>
            <p className="mt-2 body-copy">Fresh suggestions are previews only. Manual corrections, user rules, bank classifications and reconciliation entries stay protected.</p>
          </div>
          <button type="button" aria-label="Close preview" disabled={saving} onClick={close} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-[var(--hair)] disabled:opacity-40">×</button>
        </header>

        {batch && batch.total > 1 && <p className="mt-4 text-[14px] font-semibold text-ink2">Batch {batch.index + 1} of {batch.total} · {transactions.length} available to preview{batch.nextSize !== undefined ? ` · ${batch.nextSize} originally in the next batch` : ''}</p>}
        {batch && batch.skipped > 0 && <p role="status" className="mt-3 rounded-xl border border-warn/40 bg-[var(--input-bg)] p-4 body-copy">{batch.skipped} transaction{batch.skipped === 1 ? ' is' : 's are'} no longer available for this review and will be skipped. Other transactions are checked again when the preview is prepared.</p>}
        {missingPreviewRows > 0 && <p role="status" className="mt-3 rounded-xl border border-warn/40 bg-[var(--input-bg)] p-4 body-copy">The preview did not return {missingPreviewRows} transaction{missingPreviewRows === 1 ? '' : 's'}. They were not included in these results or any changes.</p>}

        {loading && <OperationStatusPanel className="mt-6" state="working" title="Preparing your review" description="Fresh suggestions are a preview only. No transaction changes are being made.">
          <OperationSteps steps={previewSteps} label="Categorisation preview stages" />
          {previewProgress.totalPages > 0 && <div className="mt-4"><OperationProgress label="Merchant groups reviewed" progress={{ kind: 'determinate', current: previewProgress.completedPages, total: previewProgress.totalPages }} detail={`${previewProgress.completedPages} of ${previewProgress.totalPages} bounded merchant groups complete.`} /></div>}
        </OperationStatusPanel>}
        {!loading && !response && error && <OperationStatusPanel className="mt-6" state="failed" title="Couldn’t prepare suggestions" description={<><span>No transaction changes were made. Check the connection and retry the complete preview.</span><span className="mt-2 block detail-copy">{error}</span></>} action={<Button className="!min-h-10" onClick={retryPreview}>Try preview again</Button>} />}
        {response && error && <p role="alert" className="mt-4 rounded-lg border border-[var(--color-neg)] p-4 text-[14px] leading-6 text-neg">{error}</p>}

        {scopeTruncated && <p className="mt-4 rounded-xl border border-warn/40 bg-[var(--input-bg)] p-4 text-[14px] leading-6 text-ink2" role="status">
          This review contains the first {transactions.length} of {scopeCandidateCount ?? transactions.length} matching rows. The {transactions.length}-row limit keeps preview, apply and undo atomic. Select a different set when you are ready to review more.
        </p>}

        {response && !completed && <>
          {invalidated && <p role="alert" className="mt-5 rounded-xl border border-warn/40 bg-[var(--input-bg)] p-4 body-copy">The Ledger changed or a transaction is no longer available. Your other choices are preserved here, but this preview can no longer be applied safely. Close it and start a fresh review before applying.</p>}
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter review results">
            {([['all', 'All'], ['suggested', 'Suggested'], ['unresolved', 'Unresolved'], ['protected', 'Protected'], ['unchanged', 'Unchanged']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-lg border px-3 text-[13px] font-semibold ${filter === value ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] text-ink2'}`}>{label} ({value === 'all' ? response.rows.length : response.rows.filter((row) => row.status === value).length})</button>)}
          </div>
          <label className="mt-4 block text-[13px] font-semibold text-ink2">Search review<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Merchant, description or account" className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[14px] text-ink" /></label>
          <p className="mt-3 detail-copy">Category choices here are staged until you apply them. Opening a transaction in Ledger excludes it from this preview; edits saved there take effect immediately.</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="detail-copy">{impact.accepted} selected for apply · {suggested.length} engine suggestion{suggested.length === 1 ? '' : 's'} initially preselected</p>
            <div className="flex gap-2">
              <button type="button" disabled={invalidated} onClick={() => setAcceptedIds((current) => new Set([...current, ...[...suggestedReviewIds(response.rows)].filter((id) => !excludedIds.has(id))]))} className="min-h-11 px-3 text-[13px] font-semibold text-accent-ink disabled:opacity-40">Select all suggestions</button>
              <button type="button" onClick={() => setAcceptedIds(new Set())} className="min-h-11 px-3 text-[13px] font-semibold text-muted">Clear selection</button>
            </div>
          </div>

          <div className="mt-3 divide-y divide-[var(--hair-soft)] rounded-xl border border-[var(--hair)]">
            {visibleRows.length === 0 && <p className="p-4 body-copy">{filter === 'suggested' && suggested.length === 0 && !search.trim()
              ? 'No suggested changes. Use the other filters to inspect unresolved, protected or unchanged transactions.'
              : 'No transactions match this filter.'}</p>}
            {visibleRows.map((row) => {
              const transaction = transactionById.get(row.transaction_id)
              const choice = choices.get(row.transaction_id)
              const target = reviewTarget(row, choices)
              const excluded = excludedIds.has(row.transaction_id)
              const selectable = Boolean(target) && !excluded && !invalidated
              const canEdit = row.status !== 'protected' && !excluded && !invalidated
              const subcategories = [...(FULL_TAXONOMY[draftCategory] ?? []), ...customSubcategories.filter((item) => item.category === draftCategory).map((item) => item.displayName)].filter((item) => !(draftCategory === 'Transfer' && item === 'Reconciliation'))
              return <article key={row.transaction_id} className="p-4 sm:p-5">
                <div className="flex items-start gap-2">
                  <label className={`grid min-h-11 min-w-11 place-items-center ${selectable ? 'cursor-pointer' : 'opacity-40'}`} aria-label={`Select change for ${row.merchant}, ${row.date}, ${transaction?.account ?? 'unknown account'}`}>
                    <input type="checkbox" disabled={!selectable} checked={acceptedIds.has(row.transaction_id) && !excluded} onChange={() => toggle(row.transaction_id)} className="h-4 w-4 accent-[var(--color-accent)]" />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[15px] font-semibold text-ink">{row.merchant}</h3><strong className="text-[15px] tabular-nums text-ink">{transaction ? fmtCents(transaction.amount) : 'Amount unavailable'}</strong></div>
                    <p className="mt-1 detail-copy">{transaction?.account ?? 'Unknown account'} · {row.date}</p>
                    {transaction?.originalDescription && transaction.originalDescription !== row.merchant && <p className="mt-1 break-words detail-copy">{transaction.originalDescription}</p>}
                    <p className="mt-2 text-[13px] font-semibold text-ink2">{excluded ? 'Opened in Ledger — excluded from this preview' : statusLabel(row)}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-[var(--input-bg)] p-3"><span className="block text-[12px] text-muted">Current · {row.current.source ?? 'Unknown source'}</span><strong className="text-[14px] text-ink">{pair(row.current.category, row.current.subcategory)}</strong></div>
                      <div className="rounded-lg bg-[var(--accent-wash)] p-3"><span className="block text-[12px] text-muted">Engine suggestion{row.proposed ? ` · ${confidence(row.proposed.confidence)}` : ''}</span><strong className="text-[14px] text-ink">{row.proposed ? pair(row.proposed.category, row.proposed.subcategory) : 'No suggestion'}</strong></div>
                    </div>
                    {choice && <p className="mt-3 text-[13px] font-semibold text-ink">Your choice: {pair(choice.category, choice.subcategory)}</p>}
                    {row.status === 'protected' && <p className="mt-2 detail-copy">Protected from engine changes. For an intentional manual correction, open this transaction in the Ledger. System reconciliation entries remain locked.</p>}
                    {editingId === row.transaction_id && canEdit && <div className="mt-4 grid gap-3 rounded-lg border border-[var(--hair)] p-3 sm:grid-cols-2">
                      <label className="text-[13px] font-semibold text-ink2">Category<select aria-label="Review category" value={draftCategory} onChange={(event) => { setDraftCategory(event.target.value); setDraftSubcategory('') }} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[14px] text-ink">{ALL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
                      <label className="text-[13px] font-semibold text-ink2">Subcategory<select aria-label="Review subcategory" value={draftSubcategory} onChange={(event) => setDraftSubcategory(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[14px] text-ink"><option value="">No subcategory</option>{subcategories.map((subcategory) => <option key={subcategory}>{subcategory}</option>)}</select></label>
                      <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="button" onClick={() => { setChoice(row, { category: draftCategory, subcategory: draftSubcategory || null }); setEditingId(null) }} className="min-h-11 rounded-lg bg-ink px-4 text-[13px] font-semibold text-surface">Use this category</button><button type="button" onClick={() => setEditingId(null)} className="min-h-11 px-3 text-[13px] font-semibold text-muted">Cancel</button></div>
                    </div>}
                    <div className="mt-3 flex flex-wrap gap-x-4">
                      {canEdit && <button type="button" onClick={() => { const initial = choice ?? row.proposed ?? row.current; setDraftCategory(initial.category); setDraftSubcategory(initial.subcategory ?? ''); setEditingId(row.transaction_id) }} className="min-h-11 text-[13px] font-semibold text-accent-ink">Change category</button>}
                      {choice && canEdit && <button type="button" onClick={() => { setChoices((current) => { const next = new Map(current); next.delete(row.transaction_id); return next }); if (row.status !== 'suggested') setAcceptedIds((current) => { const next = new Set(current); next.delete(row.transaction_id); return next }) }} className="min-h-11 text-[13px] font-semibold text-muted">{row.status === 'suggested' && row.proposed ? 'Use engine suggestion' : 'Remove your choice'}</button>}
                      {transaction && <button type="button" aria-label={`Open ${row.merchant} on ${row.date} in Ledger`} onClick={() => openTransaction(row.transaction_id)} className="min-h-11 text-[13px] font-semibold text-ink2">Open in Ledger</button>}
                    </div>
                  </div>
                </div>
              </article>
            })}
          </div>

          <div className="mt-4 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4 text-[12px] text-ink2" aria-live="polite">
            <p className="font-semibold uppercase tracking-[0.08em] text-ink">Accepted impact</p>
            {impact.accepted === 0 ? <p className="mt-2 text-muted">Choose at least one category change to apply.</p> : <ul className="mt-2 grid gap-1.5">
              <li><strong>{impact.accepted}</strong> transaction{impact.accepted === 1 ? '' : 's'} will be marked Manual.</li>
              <li>{impact.categoryChanges} categor{impact.categoryChanges === 1 ? 'y' : 'ies'} and {impact.subcategoryChanges} subcategor{impact.subcategoryChanges === 1 ? 'y' : 'ies'} will change; {impact.reviewFlagsCleared} review flag{impact.reviewFlagsCleared === 1 ? '' : 's'} will clear.</li>
              {impact.kindTransitions.map((transition) => <li key={`${transition.from}-${transition.to}`}>{transition.count} derived kind: {KIND_LABELS[transition.from]} → {KIND_LABELS[transition.to]}</li>)}
              {impact.subscriptionChanges > 0 && <li>{impact.subscriptionChanges} derived subscription flag{impact.subscriptionChanges === 1 ? '' : 's'} will change.</li>}
              {delta('Expense reporting', impact.expenseDeltaCents) && <li>{delta('Expense reporting', impact.expenseDeltaCents)}.</li>}
              {delta('Earned income', impact.earnedIncomeDeltaCents) && <li>{delta('Earned income', impact.earnedIncomeDeltaCents)}.</li>}
            </ul>}
          </div>
        </>}

        {completed && <OperationStatusPanel className="mt-6" state="succeeded" title={`Applied ${updated} accepted change${updated === 1 ? '' : 's'}`} description={scope === 'selected' ? 'The changes share one guarded undo operation. Closing clears the Ledger selection.' : 'The changes share one guarded undo operation for this batch.'} />}

        {confirmNext && <div role="alert" className="mt-5 rounded-xl border border-warn/40 bg-[var(--input-bg)] p-4 body-copy">
          <p>{operationId ? 'Moving on closes this batch and its Undo review button. Undo now if you want to reverse these changes.' : 'Moving on discards the changes selected in this preview. Apply them first if you want to keep them.'}</p>
          <div className="mt-3 flex flex-wrap gap-2"><Button onClick={onNextBatch}>Continue to next batch</Button><Button variant="ghost" onClick={() => setConfirmNext(false)}>Stay on this batch</Button></div>
        </div>}

        <div className="sticky bottom-0 mt-5 flex flex-wrap gap-2 border-t border-[var(--hair)] bg-surface py-4">
          {!completed && <Button onClick={() => void apply()} disabled={loading || saving || invalidated || impact.accepted === 0}>{savingAction === 'apply' && <InlineActivity label="Applying accepted changes" size="compact" />}{savingAction === 'apply' ? 'Applying accepted changes…' : `Apply accepted (${impact.accepted})`}</Button>}
          {operationId && <Button variant="ghost" onClick={() => void undo()} disabled={saving}>{savingAction === 'undo' && <InlineActivity label="Undoing categorisation review" size="compact" />}{savingAction === 'undo' ? 'Undoing review…' : 'Undo review'}</Button>}
          {batch?.nextSize !== undefined && response && !loading && !confirmNext && <Button variant="ghost" disabled={saving} onClick={() => { if (operationId || impact.accepted > 0 || choices.size > 0 || editingId) setConfirmNext(true); else onNextBatch?.() }}>Review next batch ({batch.nextSize})</Button>}
          <Button variant="ghost" onClick={close} disabled={saving}>{completed ? 'Done and clear selection' : 'Close preview'}</Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
