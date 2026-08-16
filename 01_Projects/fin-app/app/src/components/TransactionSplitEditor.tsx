import { useEffect, useMemo, useState } from 'react'
import { ALL_CATEGORIES, FULL_TAXONOMY, fmtCents, type CustomSubcategory, type TransactionAllocation, type Txn } from '../data'
import { KIND_LABELS, TRANSACTION_KINDS, type TransactionKind } from '../lib/classification'
import { supabase } from '../lib/supabaseClient'
import { Button, Select } from './Controls'

type Draft = { amount: string; kind: TransactionKind; category: string; subcategory: string; note: string }
const cents = (value: string) => {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d{0,2}))?$/)
  if (!match) return null
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0')))
}
const dollars = (value: number) => (value / 100).toFixed(2)

function defaultDrafts(transaction: Txn): Draft[] {
  if (transaction.allocations?.length) return transaction.allocations.map((a) => ({ amount: dollars(a.amount), kind: a.kind, category: a.category, subcategory: a.subcategory ?? '', note: a.note ?? '' }))
  const first = Math.trunc(transaction.amount / 2)
  return [first, transaction.amount - first].map((amount) => ({ amount: dollars(amount), kind: transaction.kind, category: transaction.cat, subcategory: transaction.subcat ?? '', note: '' }))
}

export default function TransactionSplitEditor({ transaction, customSubcategories, onChanged }: { transaction: Txn; customSubcategories: CustomSubcategory[]; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>(() => defaultDrafts(transaction))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastEdit, setLastEdit] = useState<string | null>(null)
  const [latestUndoable, setLatestUndoable] = useState<string | null>(null)
  useEffect(() => { setDrafts(defaultDrafts(transaction)); setLastEdit(null) }, [transaction.id, transaction.allocations])
  useEffect(() => {
    if (!open) return
    void supabase.from('transaction_allocation_edits').select('id,undone_at').eq('transaction_id', transaction.id).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => setLatestUndoable(data?.[0] && !data[0].undone_at ? data[0].id : null))
  }, [open, transaction.id, transaction.allocations])
  const parsed = drafts.map((draft) => cents(draft.amount))
  const total = parsed.every((amount) => amount != null) ? parsed.reduce((sum, amount) => sum + (amount ?? 0), 0) : null
  const remainder = total == null ? null : transaction.amount - total
  const valid = drafts.length >= 2 && total === transaction.amount && parsed.every((amount) => amount !== 0)
  const options = (category: string) => [...(FULL_TAXONOMY[category] ?? []), ...customSubcategories.filter((item) => item.category === category).map((item) => item.displayName)]
  const update = (index: number, patch: Partial<Draft>) => setDrafts((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item))
  const save = async () => {
    if (!valid) return
    setSaving(true); setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('manage-transaction-split', { body: { action: 'replace', transaction_id: transaction.id, allocations: drafts.map((draft, position) => ({ position, amount: parsed[position], kind: draft.kind, category: draft.category, subcategory: draft.subcategory || null, note: draft.note || null })) } })
    setSaving(false)
    if (invokeError) { setError(invokeError.message || 'Could not save split.'); return }
    setLastEdit(data.edit_id); await onChanged()
  }
  const undo = async () => {
    const editId = lastEdit ?? latestUndoable
    if (!editId) return
    setSaving(true); setError('')
    const { error: invokeError } = await supabase.functions.invoke('manage-transaction-split', { body: { action: 'undo', edit_id: editId } })
    setSaving(false)
    if (invokeError) { setError(invokeError.message || 'Could not undo split.'); return }
    setLastEdit(null); setLatestUndoable(null); await onChanged()
  }
  const protectedRow = transaction.pending || (transaction.kind === 'adjustment' && transaction.kindSource === 'system')
  const summary = useMemo(() => transaction.allocations?.map((a) => `${fmtCents(a.amount)} ${a.category}${a.subcategory ? ` · ${a.subcategory}` : ''}`).join(' · '), [transaction.allocations])
  return <section className="mt-7 border-t border-[var(--hair)] pt-5" aria-labelledby="split-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 id="split-title" className="font-display text-[15px] font-bold text-ink">Split transaction</h3><p className="mt-1 text-[12px] text-muted">Allocate the exact bank amount across purposes without changing the account ledger.</p></div>
      {!protectedRow && <Button variant="ghost" onClick={() => setOpen((value) => !value)}>{open ? 'Close split editor' : transaction.allocations?.length ? 'Edit split' : 'Split transaction'}</Button>}
    </div>
    {protectedRow && <p className="mt-3 rounded-lg border border-[var(--hair)] bg-[var(--hair-soft)] p-3 text-[12px] text-ink2">Pending and system-adjustment transactions cannot be split.</p>}
    {!open && summary && <p className="mt-3 text-[12px] leading-relaxed text-ink2">{summary}</p>}
    {open && <div className="mt-4 grid gap-3">
      {drafts.map((draft, index) => <div key={index} className="rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-3">
        <div className="flex items-center justify-between"><strong className="text-[12px] text-ink">Allocation {index + 1}</strong>{drafts.length > 2 && <button type="button" className="min-h-11 px-2 text-[11px] font-semibold text-neg" onClick={() => setDrafts((items) => items.filter((_, i) => i !== index))}>Remove</button>}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-[11px] font-semibold text-ink2">Amount
            <input aria-label={`Allocation ${index + 1} amount`} value={draft.amount} onChange={(event) => update(index, { amount: event.target.value.replace(/[^0-9.-]/g, '') })} className="min-h-11 rounded-[10px] border border-[var(--hair)] bg-surface px-3 text-[13px] tabular-nums text-ink outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]" />
          </label>
          <label className="grid gap-1 text-[11px] font-semibold text-ink2">Kind<Select value={draft.kind} onChange={(value) => update(index, { kind: value as TransactionKind })} ariaLabel={`Allocation ${index + 1} kind`}>{TRANSACTION_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}</Select></label>
          <label className="grid gap-1 text-[11px] font-semibold text-ink2">Category<Select value={draft.category} onChange={(value) => update(index, { category: value, subcategory: '' })} ariaLabel={`Allocation ${index + 1} category`}>{ALL_CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}</Select></label>
          <label className="grid gap-1 text-[11px] font-semibold text-ink2">Subcategory<Select value={draft.subcategory} onChange={(value) => update(index, { subcategory: value })} ariaLabel={`Allocation ${index + 1} subcategory`}><option value="">No subcategory</option>{options(draft.category).filter((value) => !(draft.category === 'Transfer' && value === 'Reconciliation')).map((value) => <option key={value}>{value}</option>)}</Select></label>
        </div>
        <input aria-label={`Allocation ${index + 1} note`} value={draft.note} maxLength={160} onChange={(event) => update(index, { note: event.target.value })} placeholder="Optional note" className="mt-2 min-h-11 w-full rounded-[10px] border border-[var(--hair)] bg-surface px-3 text-[12px] text-ink outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]" />
      </div>)}
      {drafts.length < 50 && <Button variant="ghost" onClick={() => setDrafts((items) => [...items, { amount: '0.00', kind: transaction.kind, category: transaction.cat, subcategory: transaction.subcat ?? '', note: '' }])}>Add allocation</Button>}
      <div className={`rounded-lg border p-3 text-[12px] ${remainder === 0 ? 'border-[var(--hair)] text-ink2' : 'border-warn text-warn'}`} aria-live="polite">Allocated {total == null ? '—' : fmtCents(total)} of {fmtCents(transaction.amount)}{remainder ? ` · ${fmtCents(remainder)} remaining` : ' · Exact'}</div>
      <div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={saving || !valid}>{saving ? 'Saving…' : 'Save split'}</Button>{(lastEdit || latestUndoable) && <Button variant="ghost" onClick={() => void undo()} disabled={saving}>Undo split change</Button>}</div>
      {error && <p role="alert" className="text-[12px] text-neg">{error}</p>}
    </div>}
  </section>
}
