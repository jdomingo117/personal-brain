import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ALL_CATEGORIES, fmtCents, FULL_TAXONOMY, type Txn } from '../data'
import { supabase } from '../lib/supabaseClient'
import { Button, Select } from './Controls'
import { useData } from '../contexts/DataContext'
import { buildBulkCategoryChanges, buildBulkCategoryImpact, initialBulkCategoryDraft, LEAVE_UNCHANGED, type BulkDistributionItem } from '../lib/bulkCategory'
import { KIND_LABELS } from '../lib/classification'
import { useDialogFocus } from '../hooks/useDialogFocus'

function Distribution({ items }: { items: BulkDistributionItem[] }) {
  return <span>{items.map((item) => `${item.label} (${item.count})`).join(' · ')}</span>
}

function deltaText(label: string, cents: number) {
  if (cents === 0) return null
  return `${label} ${cents > 0 ? 'increases' : 'decreases'} by ${fmtCents(Math.abs(cents))}`
}

export default function BulkCategoryDialog({
  transactions, onClose, onChanged,
}: {
  transactions: Txn[]
  onClose: (clearSelection?: boolean) => void
  onChanged: () => Promise<void>
}) {
  const { customSubcategories } = useData()
  const initialDraft = useMemo(() => initialBulkCategoryDraft(transactions), [transactions])
  const [category, setCategory] = useState(initialDraft.category)
  const [subcategory, setSubcategory] = useState(initialDraft.subcategory)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [operationId, setOperationId] = useState<string | null>(null)
  const [updated, setUpdated] = useState<number | null>(null)
  const dialogRef = useDialogFocus()
  const activeCategory = category === LEAVE_UNCHANGED ? null : category
  const subcategories = activeCategory
    ? [...(FULL_TAXONOMY[activeCategory] ?? []), ...customSubcategories.filter((item) => item.category === activeCategory).map((item) => item.displayName)]
    : []
  const changes = useMemo(
    () => buildBulkCategoryChanges(transactions, { category, subcategory }),
    [category, subcategory, transactions],
  )
  const impact = useMemo(
    () => buildBulkCategoryImpact(transactions, changes.payload),
    [changes.payload, transactions],
  )
  const reconciliationCount = useMemo(
    () => transactions.filter((transaction) => transaction.kind === 'adjustment' && transaction.kindSource === 'system').length,
    [transactions],
  )

  const close = () => onClose(updated !== null && updated > 0)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [updated, onClose])

  const apply = async () => {
    setSaving(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('update-transaction-category', {
      body: {
        action: 'bulk_edit', transaction_ids: transactions.map((transaction) => transaction.id),
        ...changes.payload,
      },
    })
    if (invokeError) {
      setError(invokeError.message || 'Could not update the selected transactions.')
    } else {
      setOperationId(data.updated > 0 ? data.operation_id : null)
      setUpdated(data.updated)
      await onChanged()
    }
    setSaving(false)
  }

  const undo = async () => {
    if (!operationId) return
    setSaving(true); setError('')
    const { error: invokeError } = await supabase.functions.invoke('update-transaction-category', {
      body: { action: 'undo_operation', operation_id: operationId },
    })
    if (invokeError) setError(invokeError.message || 'Could not undo this bulk correction.')
    else {
      setOperationId(null); setUpdated(null)
      await onChanged()
    }
    setSaving(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-category-title" className="max-h-[calc(100vh-2rem)] w-full max-w-[600px] overflow-y-auto rounded-2xl border border-[var(--hair)] bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Selected transactions</p>
            <h2 id="bulk-category-title" className="mt-1 font-display text-[24px] font-black text-ink">Correct {transactions.length} transactions</h2>
          </div>
          <button type="button" onClick={close} aria-label={updated !== null && updated > 0 ? 'Close bulk correction and clear selection' : 'Close bulk correction'} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-[var(--hair)]">×</button>
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">This changes only the selected ledger entries. It does not create a reusable merchant rule.</p>
        {reconciliationCount > 0 && <p role="alert" className="mt-3 rounded-lg border border-[var(--color-neg)] p-3 text-[12px] text-neg">Remove the {reconciliationCount} system reconciliation entr{reconciliationCount === 1 ? 'y' : 'ies'} from the selection before continuing.</p>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">Category
            <Select value={category} onChange={(value) => {
              setCategory(value)
              setSubcategory(value === initialDraft.category ? initialDraft.subcategory : LEAVE_UNCHANGED)
            }} ariaLabel="Bulk category">
              {initialDraft.category === LEAVE_UNCHANGED && <option value={LEAVE_UNCHANGED}>Mixed — leave unchanged</option>}
              {ALL_CATEGORIES.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </Select>
          </label>
          <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">Subcategory
            <Select value={subcategory} onChange={setSubcategory} ariaLabel="Bulk subcategory" className={!activeCategory ? 'opacity-60' : ''}>
              {subcategory === LEAVE_UNCHANGED && <option value={LEAVE_UNCHANGED}>{category === initialDraft.category ? 'Mixed — leave unchanged' : 'Choose subcategory…'}</option>}
              <option value="">No subcategory</option>
              {subcategories.filter((candidate) => !(activeCategory === 'Transfer' && candidate === 'Reconciliation')).map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </Select>
          </label>
        </div>

        {changes.requiresCategory && <p role="alert" className="mt-3 text-[12px] text-warn">Choose a category before applying one subcategory across mixed categories.</p>}
        {changes.requiresSubcategory && <p role="alert" className="mt-3 text-[12px] text-warn">Choose a subcategory, including “No subcategory,” when changing category.</p>}

        <div className="mt-4 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4 text-[12px] text-ink2" aria-live="polite">
          <p className="font-semibold uppercase tracking-[0.08em] text-ink">Impact preview</p>
          <dl className="mt-3 grid gap-2">
            <div className="grid gap-0.5 sm:grid-cols-[104px_1fr]"><dt className="font-semibold text-muted">Current category</dt><dd><Distribution items={impact.categories} /></dd></div>
            <div className="grid gap-0.5 sm:grid-cols-[104px_1fr]"><dt className="font-semibold text-muted">Current subcategory</dt><dd><Distribution items={impact.subcategories} /></dd></div>
          </dl>

          {changes.hasChanges ? <>
            <div className="my-3 border-t border-[var(--hair)]" />
            <ul className="grid gap-1.5">
              {changes.payload.category !== undefined && <li><strong>{impact.categoryChangeCount}</strong> of {transactions.length} categor{impact.categoryChangeCount === 1 ? 'y' : 'ies'} → <strong>{changes.payload.category}</strong></li>}
              {Object.prototype.hasOwnProperty.call(changes.payload, 'subcategory') && <li>
                <strong>{impact.subcategoryChangeCount}</strong> of {transactions.length} subcategor{impact.subcategoryChangeCount === 1 ? 'y' : 'ies'} → <strong>{changes.payload.subcategory || 'No subcategory'}</strong>
                {impact.subcategoryClearCount > 0 && `; ${impact.subcategoryClearCount} existing value${impact.subcategoryClearCount === 1 ? '' : 's'} will be cleared`}
              </li>}
              <li><strong>{impact.affectedCount}</strong> of {transactions.length} ledger entr{impact.affectedCount === 1 ? 'y' : 'ies'} will be updated and marked Manual.</li>
              {impact.provenanceOnlyCount > 0 && <li>{impact.provenanceOnlyCount} already {impact.provenanceOnlyCount === 1 ? 'matches' : 'match'} the chosen labels and will change provenance/review state only.</li>}
            </ul>
            <div className="mt-3 rounded-lg border border-[var(--hair-soft)] bg-surface p-3">
              <p className="font-semibold text-ink">Accounting & reporting</p>
              {impact.kindTransitions.length === 0 && impact.subscriptionChangeCount === 0 && impact.expenseDeltaCents === 0 && impact.earnedIncomeDeltaCents === 0
                ? <p className="mt-1 text-muted">No derived kind, subscription, expense-total or earned-income changes.</p>
                : <ul className="mt-1 grid gap-1 text-muted">
                  {impact.kindTransitions.map((transition) => <li key={`${transition.from}-${transition.to}`}>{transition.count} derived kind: {KIND_LABELS[transition.from]} → {KIND_LABELS[transition.to]}</li>)}
                  {impact.subscriptionChangeCount > 0 && <li>{impact.subscriptionChangeCount} derived subscription flag{impact.subscriptionChangeCount === 1 ? '' : 's'} will change.</li>}
                  {deltaText('Expense reporting', impact.expenseDeltaCents) && <li>{deltaText('Expense reporting', impact.expenseDeltaCents)}.</li>}
                  {deltaText('Earned income', impact.earnedIncomeDeltaCents) && <li>{deltaText('Earned income', impact.earnedIncomeDeltaCents)}.</li>}
                </ul>}
            </div>
          </> : <p className="mt-3 text-muted">Choose a different category or subcategory to make an explicit correction. Mixed fields remain unchanged.</p>}
        </div>
        {updated !== null && <p className="mt-3 text-[12.5px] text-pos">Updated {updated} transaction{updated === 1 ? '' : 's'}. Closing this dialog will clear the selection.</p>}
        {error && <p role="alert" className="mt-3 text-[12.5px] text-neg">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void apply()} disabled={saving || reconciliationCount > 0 || !changes.hasChanges}>{saving ? 'Saving…' : 'Apply to selection'}</Button>
          {operationId && <Button variant="ghost" onClick={() => void undo()} disabled={saving}>Undo bulk correction</Button>}
          <Button variant="ghost" onClick={close} disabled={saving}>{updated !== null && updated > 0 ? 'Done and clear selection' : 'Done'}</Button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
