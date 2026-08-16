import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtCents, type Txn } from '../data'
import { supabase } from '../lib/supabaseClient'
import { Button, Select } from './Controls'
import { KIND_LABELS, TRANSACTION_KINDS } from '../lib/classification'
import { LEAVE_UNCHANGED, type BulkDistributionItem } from '../lib/bulkCategory'
import {
  buildBulkClassificationChanges, buildBulkClassificationImpact,
  initialBulkClassificationDraft, NO_SPENDING_NATURE,
  type BulkClassificationDraft, type BulkClassificationPayload,
} from '../lib/bulkClassification'
import { useDialogFocus } from '../hooks/useDialogFocus'

function Distribution({ items }: { items: BulkDistributionItem[] }) {
  return <span>{items.map((item) => `${item.label} (${item.count})`).join(' · ')}</span>
}

function leaveLabel(initial: string) {
  return initial === LEAVE_UNCHANGED ? 'Mixed — leave unchanged' : 'Leave unchanged'
}

const FIELD_LABELS: Record<keyof BulkClassificationPayload, string> = {
  kind: 'Kind', is_recurring: 'Recurring', is_subscription: 'Subscription',
  spending_nature: 'Spending nature', is_reimbursable: 'Reimbursable', is_tax_related: 'Tax-related',
}

function targetLabel(field: keyof BulkClassificationPayload, value: unknown) {
  if (field === 'kind') return KIND_LABELS[value as keyof typeof KIND_LABELS]
  if (field === 'spending_nature') return value === null ? 'Not set' : value === 'essential' ? 'Essential' : 'Discretionary'
  return value === true ? 'Yes' : 'No'
}

function deltaText(label: string, cents: number) {
  if (cents === 0) return null
  return `${label} ${cents > 0 ? 'increases' : 'decreases'} by ${fmtCents(Math.abs(cents))}`
}

export default function BulkClassificationDialog({
  transactions, onClose, onChanged,
}: {
  transactions: Txn[]
  onClose: (clearSelection?: boolean) => void
  onChanged: () => Promise<void>
}) {
  const initialDraft = useMemo(() => initialBulkClassificationDraft(transactions), [transactions])
  const [draft, setDraft] = useState<BulkClassificationDraft>(initialDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [operationId, setOperationId] = useState<string | null>(null)
  const [updated, setUpdated] = useState<number | null>(null)
  const dialogRef = useDialogFocus()
  const changes = useMemo(() => buildBulkClassificationChanges(transactions, draft), [draft, transactions])
  const impact = useMemo(() => buildBulkClassificationImpact(transactions, changes.payload), [changes.payload, transactions])
  const reconciliationCount = useMemo(() => transactions.filter((transaction) => transaction.kind === 'adjustment' && transaction.kindSource === 'system').length, [transactions])
  const setField = (field: keyof BulkClassificationDraft) => (value: string) => setDraft((current) => ({ ...current, [field]: value }))
  const close = () => onClose(updated !== null && updated > 0)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [updated, onClose])

  const apply = async () => {
    setSaving(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('update-transaction-classification', {
      body: { action: 'bulk_edit', transaction_ids: transactions.map((transaction) => transaction.id), ...changes.payload },
    })
    if (invokeError) setError(invokeError.message || 'Could not update the selected transactions.')
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
    const { error: invokeError } = await supabase.functions.invoke('update-transaction-classification', {
      body: { action: 'undo_operation', operation_id: operationId },
    })
    if (invokeError) setError(invokeError.message || 'Could not undo this bulk classification change.')
    else { setOperationId(null); setUpdated(null); await onChanged() }
    setSaving(false)
  }

  const booleanSelect = (field: 'isRecurring' | 'isSubscription' | 'isReimbursable' | 'isTaxRelated', label: string) => (
    <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">{label}
      <Select value={draft[field]} onChange={setField(field)} ariaLabel={`Bulk ${label.toLowerCase()}`}>
        <option value={LEAVE_UNCHANGED}>{leaveLabel(initialDraft[field])}</option>
        <option value="true">Yes</option><option value="false">No</option>
      </Select>
    </label>
  )

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-classification-title" className="max-h-[calc(100vh-2rem)] w-full max-w-[680px] overflow-y-auto rounded-2xl border border-[var(--hair)] bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-ink">Selected transactions</p><h2 id="bulk-classification-title" className="mt-1 font-display text-[24px] font-black text-ink">Edit accounting & attributes for {transactions.length}</h2></div>
          <button type="button" onClick={close} aria-label={updated !== null && updated > 0 ? 'Close bulk attributes and clear selection' : 'Close bulk attributes'} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-[var(--hair)]">×</button>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">Only fields you explicitly change are applied. Kind affects expense and income reporting; recurring and subscription choices become manual decisions.</p>
        {reconciliationCount > 0 && <p role="alert" className="mt-3 rounded-lg border border-[var(--color-neg)] p-3 text-[12px] text-neg">Remove the {reconciliationCount} system reconciliation entr{reconciliationCount === 1 ? 'y' : 'ies'} from the selection before continuing.</p>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">Kind
            <Select value={draft.kind} onChange={setField('kind')} ariaLabel="Bulk transaction kind">
              <option value={LEAVE_UNCHANGED}>{leaveLabel(initialDraft.kind)}</option>
              {TRANSACTION_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
            </Select>
          </label>
          <label className="grid gap-1.5 text-[12px] font-semibold text-ink2">Spending nature
            <Select value={draft.spendingNature} onChange={setField('spendingNature')} ariaLabel="Bulk spending nature">
              <option value={LEAVE_UNCHANGED}>{leaveLabel(initialDraft.spendingNature)}</option>
              <option value={NO_SPENDING_NATURE}>Not set</option><option value="essential">Essential</option><option value="discretionary">Discretionary</option>
            </Select>
          </label>
          {booleanSelect('isRecurring', 'Recurring')}
          {booleanSelect('isSubscription', 'Subscription')}
          {booleanSelect('isReimbursable', 'Reimbursable')}
          {booleanSelect('isTaxRelated', 'Tax-related')}
        </div>

        <div className="mt-4 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4 text-[12px] text-ink2" aria-live="polite">
          <p className="font-semibold uppercase tracking-[0.08em] text-ink">Impact preview</p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div><dt className="font-semibold text-muted">Current kind</dt><dd><Distribution items={impact.kinds} /></dd></div>
            <div><dt className="font-semibold text-muted">Current spending nature</dt><dd><Distribution items={impact.spendingNatures} /></dd></div>
            <div><dt className="font-semibold text-muted">Current recurring</dt><dd><Distribution items={impact.recurring} /></dd></div>
            <div><dt className="font-semibold text-muted">Current subscription</dt><dd><Distribution items={impact.subscriptions} /></dd></div>
            <div><dt className="font-semibold text-muted">Current reimbursable</dt><dd><Distribution items={impact.reimbursable} /></dd></div>
            <div><dt className="font-semibold text-muted">Current tax-related</dt><dd><Distribution items={impact.taxRelated} /></dd></div>
          </dl>
          {changes.hasChanges ? <>
            <div className="my-3 border-t border-[var(--hair)]" />
            <ul className="grid gap-1.5">
              {(Object.keys(changes.payload) as (keyof BulkClassificationPayload)[]).map((field) => <li key={field}><strong>{impact.fieldChangeCounts[field]}</strong> of {transactions.length} {FIELD_LABELS[field].toLowerCase()} values → <strong>{targetLabel(field, changes.payload[field])}</strong></li>)}
              <li><strong>{impact.affectedCount}</strong> of {transactions.length} ledger entr{impact.affectedCount === 1 ? 'y' : 'ies'} will be updated.</li>
              {impact.manualPinCount > 0 && <li>{impact.manualPinCount} entr{impact.manualPinCount === 1 ? 'y' : 'ies'} will gain manual precedence for the selected kind, recurring or subscription field.</li>}
            </ul>
            <div className="mt-3 rounded-lg border border-[var(--hair-soft)] bg-surface p-3"><p className="font-semibold text-ink">Accounting & reporting</p>
              {impact.expenseDeltaCents === 0 && impact.earnedIncomeDeltaCents === 0 ? <p className="mt-1 text-muted">No expense-total or earned-income changes.</p> : <ul className="mt-1 grid gap-1 text-muted">{deltaText('Expense reporting', impact.expenseDeltaCents) && <li>{deltaText('Expense reporting', impact.expenseDeltaCents)}.</li>}{deltaText('Earned income', impact.earnedIncomeDeltaCents) && <li>{deltaText('Earned income', impact.earnedIncomeDeltaCents)}.</li>}</ul>}
            </div>
          </> : <p className="mt-3 text-muted">Choose at least one different value. Mixed fields remain unchanged unless you select Yes, No or a specific value.</p>}
        </div>
        {updated !== null && <p className="mt-3 text-[12.5px] text-pos">Updated {updated} transaction{updated === 1 ? '' : 's'}. Closing this dialog will clear the selection.</p>}
        {error && <p role="alert" className="mt-3 text-[12.5px] text-neg">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void apply()} disabled={saving || reconciliationCount > 0 || !changes.hasChanges}>{saving ? 'Saving…' : 'Apply to selection'}</Button>
          {operationId && <Button variant="ghost" onClick={() => void undo()} disabled={saving}>Undo bulk attributes</Button>}
          <Button variant="ghost" onClick={close} disabled={saving}>{updated !== null && updated > 0 ? 'Done and clear selection' : 'Done'}</Button>
        </div>
      </section>
    </div>, document.body,
  )
}
