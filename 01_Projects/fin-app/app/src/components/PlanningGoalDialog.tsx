import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useDialogFocus } from '../hooks/useDialogFocus'
import type { Account } from '../data'
import type { PlanningGoal, PlanningGoalStatus, PlanningMetric } from '../lib/planning'
import { InlineActivity } from './OperationStatus'

type Props = { goal: PlanningGoal | null; accounts: Account[]; onClose: () => void; onChanged: () => Promise<void>; onSaved: (eventId: string) => void }

const inputClass = 'mt-1.5 w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2.5 text-[13px] font-medium text-ink'
const dollars = (cents: number) => (cents / 100).toFixed(2)
const cents = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null
  const [whole, fraction = ''] = value.split('.')
  const result = Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
  return Number.isSafeInteger(result) && result > 0 ? result : null
}

export default function PlanningGoalDialog({ goal, accounts, onClose, onChanged, onSaved }: Props) {
  const dialogRef = useDialogFocus()
  const [name, setName] = useState(goal?.name ?? '')
  const [metric, setMetric] = useState<PlanningMetric>(goal?.metric ?? 'cash')
  const [amount, setAmount] = useState(goal ? dollars(goal.targetCents) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [status, setStatus] = useState<PlanningGoalStatus>(goal?.status ?? 'active')
  const [accountIds, setAccountIds] = useState<string[]>(goal?.accountIds ?? accounts.filter((account) => account.type === 'Liquid' || account.type === 'Savings').map((account) => account.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setName(goal?.name ?? '')
    setMetric(goal?.metric ?? 'cash')
    setAmount(goal ? dollars(goal.targetCents) : '')
    setTargetDate(goal?.targetDate ?? '')
    setStatus(goal?.status ?? 'active')
    setAccountIds(goal?.accountIds ?? accounts.filter((account) => account.type === 'Liquid' || account.type === 'Savings').map((account) => account.id))
    setError('')
  }, [goal, accounts])

  const toggleAccount = (id: string) => setAccountIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])
  const save = async () => {
    const targetCents = cents(amount)
    if (!name.trim()) { setError('Name this goal.'); return }
    if (!targetCents) { setError('Enter a positive target amount.'); return }
    if (!accountIds.length) { setError('Select at least one account.'); return }
    setSaving(true); setError('')
    const { data, error: saveError } = await supabase.functions.invoke('manage-planning', { body: {
      action: 'save_goal', goal_id: goal?.id ?? null, name: name.trim(), metric,
      target_cents: targetCents, target_date: targetDate || null, status, account_ids: accountIds,
    } })
    setSaving(false)
    if (saveError) { setError(saveError.message || 'Could not save this goal.'); return }
    if (data?.event_id) onSaved(data.event_id)
    await onChanged(); onClose()
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="planning-goal-title" className="w-full max-w-xl rounded-2xl border border-[var(--hair)] bg-surface p-5 shadow-2xl outline-none" onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Planning goal</p><h2 id="planning-goal-title" className="mt-1 text-lg font-bold text-ink">{goal ? 'Edit goal' : 'Create your first goal'}</h2></div><button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-black/[0.05]" aria-label="Close">×</button></div>
      <p className="mt-4 rounded-lg border border-[var(--hair-soft)] bg-[var(--input-bg)] p-3 text-[12px] leading-relaxed text-muted">Goals are planning inputs only. Saving one never changes an account balance, bank transaction, or recurring commitment.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 text-[13px] font-semibold text-ink2">Goal name<input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Emergency reserve" /></label>
        <label className="text-[13px] font-semibold text-ink2">Measure<select value={metric} onChange={(event) => setMetric(event.target.value as PlanningMetric)} className={inputClass}><option value="cash">Cash holdings</option><option value="net_worth">Net worth</option></select></label>
        <label className="text-[13px] font-semibold text-ink2">Target amount (AUD)<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className={inputClass} placeholder="50000" /></label>
        <label className="text-[13px] font-semibold text-ink2">Target date <span className="font-normal text-muted">optional</span><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className={inputClass} /></label>
        {goal && <label className="text-[13px] font-semibold text-ink2">Status<select value={status} onChange={(event) => setStatus(event.target.value as PlanningGoalStatus)} className={inputClass}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>}
      </div>
      <fieldset className="mt-5"><legend className="text-[13px] font-semibold text-ink2">Included accounts</legend><p className="mt-1 text-[12px] text-muted">Only selected accounts inform this goal’s current value and observed run rate.</p><div className="mt-3 max-h-44 space-y-1.5 overflow-auto rounded-lg border border-[var(--hair)] p-2">{accounts.map((account) => <label key={account.id} className="flex min-h-10 items-center gap-3 rounded-md px-2 text-[13px] hover:bg-black/[0.03]"><input type="checkbox" checked={accountIds.includes(account.id)} onChange={() => toggleAccount(account.id)} className="h-4 w-4 accent-[var(--color-accent)]" /><span className="font-semibold text-ink">{account.name}</span><span className="ml-auto text-muted">{account.type}</span></label>)}</div></fieldset>
      {error && <p className="mt-4 rounded-lg border border-neg/30 bg-neg/5 p-3 text-[13px] text-neg" role="alert">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-[var(--hair)] px-3 py-2 text-[13px] font-semibold text-ink">Cancel</button><button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-surface disabled:opacity-50">{saving && <InlineActivity label="Saving goal" size="compact" />}{saving ? 'Saving goal…' : 'Save goal'}</button></div>
    </section>
  </div>
}
