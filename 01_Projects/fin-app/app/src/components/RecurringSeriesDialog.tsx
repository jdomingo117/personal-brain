import { useEffect, useState } from 'react'
import { fmt } from '../data'
import { supabase } from '../lib/supabaseClient'
import type { Cadence } from '../lib/cadence'
import type { Series } from '../lib/recurring'
import { InlineActivity } from './OperationStatus'

type Props = {
  series: Series
  onClose: () => void
  onChanged: () => Promise<void>
  onSaved: (eventId: string) => void
}

const CADENCES: Cadence[] = ['Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annual']

function centsFromInput(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null
  const [whole, fraction = ''] = trimmed.split('.')
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

function dollarsInput(cents: number) {
  return (cents / 100).toFixed(2)
}

/** Manages a durable overlay for a detected series. It intentionally never
 * edits a transaction or implies that Halcyon can cancel the real merchant. */
export default function RecurringSeriesDialog({ series, onClose, onChanged, onSaved }: Props) {
  const [cadence, setCadence] = useState<Cadence>(series.cadence)
  const [amount, setAmount] = useState(dollarsInput(series.expected))
  const [nextExpected, setNextExpected] = useState(series.nextExpected)
  const [reminderDays, setReminderDays] = useState(series.reminderDaysBefore === null ? '' : String(series.reminderDaysBefore))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [undoEventId, setUndoEventId] = useState<string | null>(null)

  useEffect(() => {
    setCadence(series.cadence)
    setAmount(dollarsInput(series.expected))
    setNextExpected(series.nextExpected)
    setReminderDays(series.reminderDaysBefore === null ? '' : String(series.reminderDaysBefore))
    setError('')
    setUndoEventId(null)
  }, [series])

  const persist = async (state: 'active' | 'stopped') => {
    const expectedAmount = centsFromInput(amount)
    const reminder = reminderDays === '' ? null : Number(reminderDays)
    if (!expectedAmount) { setError('Enter a positive expected amount.'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextExpected)) { setError('Choose the next expected date.'); return }
    if (reminder !== null && (!Number.isInteger(reminder) || reminder < 0 || reminder > 60)) {
      setError('Reminder lead time must be between 0 and 60 days.'); return
    }
    const evidenceTransactionIds = series.charges.map((charge) => charge.transactionId).filter((id): id is string => !!id)
    if (evidenceTransactionIds.length < 3) { setError('This detected series no longer has enough supporting transactions.'); return }

    setSaving(true); setError('')
    const { data, error: saveError } = await supabase.functions.invoke('manage-recurring-series', {
      body: {
        action: 'save', account_id: series.accountId, merchant_key: series.merchantKey,
        evidence_transaction_ids: evidenceTransactionIds, state,
        cadence_override: cadence === series.detectedCadence ? null : cadence,
        expected_amount_override: expectedAmount === series.detectedExpected ? null : expectedAmount,
        next_expected_override: nextExpected === series.detectedNextExpected ? null : nextExpected,
        reminder_days_before: reminder,
      },
    })
    setSaving(false)
    if (saveError) { setError(saveError.message || 'Could not save this commitment.'); return }
    if (data?.event_id) {
      setUndoEventId(data.event_id)
      onSaved(data.event_id)
    }
    await onChanged()
    if (state === 'stopped') onClose()
  }

  const undo = async () => {
    if (!undoEventId) return
    setSaving(true); setError('')
    const { error: undoError } = await supabase.functions.invoke('manage-recurring-series', {
      body: { action: 'undo', event_id: undoEventId },
    })
    setSaving(false)
    if (undoError) { setError(undoError.message || 'Could not undo this change.'); return }
    await onChanged()
    onClose()
  }

  const stopped = series.trackingState === 'stopped' || series.trackingState === 'dismissed'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-recurring-title"
        className="w-full max-w-lg rounded-2xl border border-[var(--hair)] bg-surface p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Managed commitment</p>
            <h2 id="manage-recurring-title" className="mt-1 text-lg font-bold text-ink">{series.label}</h2>
            <p className="mt-1 text-[13px] text-muted">{series.fundingAccount} · detected from {series.charges.length} charges</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-black/[0.05] hover:text-ink" aria-label="Close">×</button>
        </div>

        <p className="mt-4 rounded-lg border border-[var(--hair-soft)] bg-[var(--input-bg)] p-3 text-[12px] leading-relaxed text-muted">
          These settings change Halcyon’s projection only. They do not edit past bank transactions or cancel the real subscription or direct debit.
        </p>

        {stopped ? (
          <div className="mt-5 rounded-lg border border-warn/35 bg-warn/5 p-3 text-[13px] text-ink2">
            Tracking is stopped. This commitment is excluded from totals and the billing calendar until you resume it.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-[13px] font-semibold text-ink2">
              Cadence
              <select value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)} className="mt-1.5 w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2.5 text-[13px] font-medium text-ink">
                {CADENCES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
              {cadence !== series.detectedCadence && <button type="button" onClick={() => setCadence(series.detectedCadence)} className="mt-1 text-[11px] font-semibold text-accent-ink hover:underline">Use detected {series.detectedCadence}</button>}
            </label>
            <label className="text-[13px] font-semibold text-ink2">
              Expected amount (AUD)
              <input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2.5 text-[13px] font-medium text-ink" />
              {centsFromInput(amount) !== series.detectedExpected && <button type="button" onClick={() => setAmount(dollarsInput(series.detectedExpected))} className="mt-1 text-[11px] font-semibold text-accent-ink hover:underline">Use detected {fmt(series.detectedExpected)}</button>}
            </label>
            <label className="text-[13px] font-semibold text-ink2">
              Next expected date
              <input type="date" value={nextExpected} onChange={(event) => setNextExpected(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2.5 text-[13px] font-medium text-ink" />
              {nextExpected !== series.detectedNextExpected && <button type="button" onClick={() => setNextExpected(series.detectedNextExpected)} className="mt-1 text-[11px] font-semibold text-accent-ink hover:underline">Use detected {series.detectedNextExpected}</button>}
            </label>
            <label className="text-[13px] font-semibold text-ink2">
              In-app reminder
              <select value={reminderDays} onChange={(event) => setReminderDays(event.target.value)} className="mt-1.5 w-full rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 py-2.5 text-[13px] font-medium text-ink">
                <option value="">Off</option>
                <option value="0">On the day</option>
                <option value="1">1 day before</option>
                <option value="3">3 days before</option>
                <option value="7">7 days before</option>
                <option value="14">14 days before</option>
              </select>
            </label>
          </div>
        )}

        {error && <p className="mt-4 rounded-lg border border-neg/30 bg-neg/5 p-3 text-[13px] text-neg" role="alert">{error}</p>}
        {undoEventId && <p className="mt-4 text-[13px] text-pos" role="status">Saved. You can undo this change while this panel is open.</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => persist(stopped ? 'active' : 'stopped')} disabled={saving} className="inline-flex items-center gap-2 text-[13px] font-bold text-neg hover:underline disabled:opacity-50">
            {saving && <InlineActivity label={stopped ? 'Resuming tracking' : 'Stopping tracking'} size="compact" />}{saving ? (stopped ? 'Resuming tracking…' : 'Stopping tracking…') : (stopped ? 'Resume tracking' : 'Stop tracking')}
          </button>
          <div className="flex gap-2">
            {undoEventId && <button type="button" onClick={undo} disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-[var(--hair)] px-3 py-2 text-[13px] font-semibold text-ink hover:bg-black/[0.03] disabled:opacity-50">{saving && <InlineActivity label="Undoing change" size="compact" />}{saving ? 'Undoing…' : 'Undo'}</button>}
            <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-[var(--hair)] px-3 py-2 text-[13px] font-semibold text-ink hover:bg-black/[0.03] disabled:opacity-50">Close</button>
            {!stopped && <button type="button" onClick={() => persist('active')} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-[13px] font-semibold text-surface disabled:opacity-50">{saving && <InlineActivity label="Saving commitment" size="compact" />}{saving ? 'Saving changes…' : 'Save changes'}</button>}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-faint">Detected amount: {fmt(series.expected)} · next {series.nextExpected}</p>
      </section>
    </div>
  )
}
