import { useState } from 'react'
import { Action, AmountField, money } from './ui'
import { budgetPeriod, goalReserve, inputValue, moneyInput, total, type Budget } from './model'
import { addDays, amountCadence, displayDate, frequencyLabel, occurrences, periodLabel, transitionPeriod, type Frequency, type FrequencyChange } from './frequency'

export function FrequencyPicker({ frequency, anchor, onChange }: { frequency: Frequency; anchor: string; onChange: (f: Frequency, anchor: string) => void }) {
  return <div className="bc-outcome"><h3>How often would you like to budget?</h3><div className="bc-choice-pair">
    <Action aria-pressed={frequency === 'monthly'} onClick={() => onChange('monthly', '2026-10-01')}>Monthly</Action>
    <Action aria-pressed={frequency === 'fortnightly'} onClick={() => onChange('fortnightly', '2026-10-12')}>Every two weeks</Action>
  </div><p>{frequency === 'monthly' ? 'A fresh plan each calendar month. Your pay can follow a different schedule.' : 'A new budget every 14 days—not twice a month. Choose a start date, such as a payday.'}</p>
    {frequency === 'fortnightly' && <div className="bc-field"><label htmlFor="budget-anchor">First budget start date</label><input id="budget-anchor" type="date" min="2026-01-01" max="2026-10-19" value={anchor} onChange={e => onChange(frequency, e.target.value)} /><p className="bc-hint">This example is set on 19 October 2026. Choose a date on or before then; we'll find the current 14-day period.</p></div>}
  </div>
}

export function DatedSchedule({ period }: { period: { start: string; end: string } }) {
  const rows = occurrences(period)
  return <div className="bc-outcome"><h3>Dates, not monthly averages</h3><p>{periodLabel(period)} · fictional schedule</p>
    {rows.map(r => <div className="bc-kv" key={`${r.name}-${r.date}`}><span>{r.name} · {displayDate(r.date)}</span><strong>{r.kind === 'pay' ? '+' : ''}{money(r.amount)}</strong></div>)}
    {!rows.some(r => r.kind === 'bill') && <p>No rent or utility bill falls in these dates. You can still put money aside for the next one.</p>}
    <p className="bc-hint">Pay repeats every 14 days from 12 October. Rent is due on the 1st; utilities on the 20th. Income and bills keep their own schedules.</p>
  </div>
}

export function FrequencyEditor({ budget, commit, close }: { budget: Budget; commit: (b: Budget, message: string) => void; close: () => void }) {
  const [frequency, setFrequency] = useState<Frequency>(budget.pendingFrequency?.frequency ?? (budget.frequency === 'monthly' ? 'fortnightly' : 'monthly'))
  const [step, setStep] = useState(0)
  const p = transitionPeriod(budgetPeriod(budget), frequency)
  const rows = occurrences(p)
  const [values, setValues] = useState(() => ({ income: inputValue(budget.pendingFrequency?.income ?? total(rows.filter(r => r.kind === 'pay').map(r => r.amount))), bills: inputValue(budget.pendingFrequency?.bills ?? total(rows.filter(r => r.kind === 'bill').map(r => r.amount))), upcoming: inputValue(budget.pendingFrequency?.upcoming ?? 100000), savings: inputValue(budget.pendingFrequency?.savings ?? 20000), everyday: inputValue(budget.pendingFrequency?.everyday ?? 50000) }))
  const [goals, setGoals] = useState(() => budget.goals.filter(g => !g.completed && !g.draft).map(g => ({ id: g.id, name: g.name, amount: inputValue(budget.pendingFrequency?.goals.find(old => old.id === g.id)?.amount ?? (g.paused ? 0 : g.monthly)), opening: goalReserve(g) })))
  const [reviewed, setReviewed] = useState(false)
  const [acceptGap, setAcceptGap] = useState(false)
  const [error, setError] = useState('')
  const amounts = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, moneyInput(value)])) as Record<keyof typeof values, number | null>
  const gap = (amounts.income ?? 0) - total([amounts.bills ?? 0, amounts.upcoming ?? 0, amounts.savings ?? 0, amounts.everyday ?? 0, ...goals.map(g => moneyInput(g.amount) ?? 0)])
  const check = () => {
    if (Object.values(amounts).some(v => v === null) || goals.some(g => moneyInput(g.amount) === null)) { setError('Check each amount. Use $0 if you do not want to plan a contribution for this period.'); return false }
    setError(''); return true
  }
  const save = () => {
    if (!check()) return
    if (!reviewed || gap < 0 && !acceptGap) { setError('Confirm that you reviewed the amounts and any shortfall before scheduling.'); return }
    const change: FrequencyChange = { ...p, frequency, income: amounts.income!, bills: amounts.bills!, upcoming: amounts.upcoming!, savings: amounts.savings!, everyday: amounts.everyday!, goals: goals.map(g => ({ ...g, amount: moneyInput(g.amount)! })) }
    commit({ ...budget, pendingFrequency: change }, `${frequencyLabel(frequency)} scheduled from ${displayDate(p.start)}. Your current budget is unchanged.`)
  }
  return <div className="bc-task-body"><div className="bc-steps">{['Choose', 'Review amounts', 'Check & schedule'].map((s, i) => <span key={s} aria-current={step === i ? 'step' : undefined}>{i + 1}<span>{s}</span></span>)}</div>
    {step === 0 && <><p className="bc-lead">Make the rhythm fit your life.</p><label className="bc-field">How often you budget<select aria-label="New budget frequency" value={frequency} onChange={e => { setFrequency(e.target.value as Frequency); setReviewed(false) }}><option value="monthly" disabled={budget.frequency === 'monthly'}>Monthly</option><option value="fortnightly" disabled={budget.frequency === 'fortnightly'}>Every two weeks</option></select></label>
      <div className="bc-kv"><span>Keep your current budget</span><strong>{periodLabel(budgetPeriod(budget))}</strong></div><div className="bc-kv"><span>First new budget</span><strong>{periodLabel(p)}</strong></div>
      <p>{p.bridge ? `A short transition budget takes you to month end. Your first full month starts ${displayDate(p.followingStart)}. Review its amounts rather than dividing a monthly budget.` : `The next budget begins ${displayDate(p.start)}. No current spending is moved or rewritten.`}</p>
      {budget.pendingFrequency && <p className="bc-warning">Saving will replace your existing scheduled change. Cancelling keeps it.</p>}
      <div className="bc-outcome"><h3>What stays the same</h3><p>Your current budget, past spending and reviews. Existing goal money is kept; changing frequency does not move money.</p><h3>What needs checking</h3><p>The amounts for these new dates. A shorter budget may still contain a full bill.</p></div></>}
    {step === 1 && <><h3>{p.bridge ? 'A smaller period needs its own plan.' : 'What should this next budget cover?'}</h3><p>Check three parts of the plan. Each amount is editable. These example suggestions are not automatic conversions.</p>
      <details className="bc-review-group" open><summary>1 · Income & bills</summary>
        <details className="bc-help"><summary>See pay and bill dates</summary><DatedSchedule period={p} /></details>
        {(['income', 'bills', 'upcoming'] as const).map((key, i) => <AmountField key={key} id={`frequency-${key}`} label={`${['Expected income', 'Bills to cover from new income', 'Put aside for later bills'][i]} · AUD`} value={values[key]} onChange={v => { setValues({ ...values, [key]: v }); setReviewed(false) }} />)}
        <p className="bc-hint">Cover each bill once. If an existing bill reserve will pay part of it, only plan the rest from new income.</p>
      </details>
      <details className="bc-review-group"><summary>2 · Everyday spending</summary><AmountField id="frequency-everyday" label="Everyday spending · AUD" value={values.everyday} onChange={v => { setValues({ ...values, everyday: v }); setReviewed(false) }} /><p className="bc-hint">Choose an amount for these dates. Category limits need review for the new frequency.</p></details>
      <details className="bc-review-group"><summary>3 · Savings & goals</summary><AmountField id="frequency-savings" label="Longer-term savings · AUD" value={values.savings} onChange={v => { setValues({ ...values, savings: v }); setReviewed(false) }} />
        {goals.map((g, i) => <AmountField key={g.id} id={`frequency-goal-${g.id}`} label={`${g.name} · contribution for these dates · AUD`} value={g.amount} hint={`${money(g.opening)} expected to carry forward; includes current planned money, not confirmed future cash.`} onChange={v => { setGoals(goals.map((goal, n) => n === i ? { ...goal, amount: v } : goal)); setReviewed(false) }} />)}
      </details>
      <p className="bc-hint">Next you’ll see all amounts together before saving. This previews one initial period; your current budget stays intact.</p></>}
    {step === 2 && <><h3>Check your new rhythm.</h3><p>{frequencyLabel(frequency)} from {displayDate(p.start)} · {periodLabel(p)}{p.bridge ? ' · transition budget' : ''}</p>
      {Object.entries(amounts).map(([key, value], i) => <div className="bc-kv" key={key}><span>{['Expected income', 'Bills from new income', 'For later bills', 'Longer-term savings', 'Everyday spending'][i]}</span><strong>{money(value ?? 0)}</strong></div>)}
      {goals.map(g => {
        const original = budget.goals.find(goal => goal.id === g.id)!
        const remaining = Math.max(0, (original.target ?? 0) - original.purchases - g.opening - (moneyInput(g.amount) ?? 0))
        return <div className="bc-outcome" key={g.id}><h3>{g.name}</h3><p>{money(g.opening)} expected opening reserve + {money(moneyInput(g.amount) ?? 0)} new contribution. {money(remaining)} of the target would still need planning after this budget.</p>{original.neededBy && <p className="bc-warning">Money needed by {displayDate(original.neededBy)}. Review this deadline against the new rhythm; the old date is kept, not silently extended.</p>}</div>
      })}
      <div className={`bc-outcome ${gap < 0 ? 'bc-warning' : ''}`}><h3>{gap < 0 ? 'This plan needs' : 'Still to plan'} {money(Math.abs(gap))}</h3><p>{gap < 0 ? 'The shorter period or bill timing needs more money. Adjust the plan or keep the gap visible; no savings will be moved automatically.' : 'This is remaining plan capacity, not a verified bank balance.'}</p></div>
      <p>{p.bridge ? `After ${displayDate(addDays(p.end, -1))}, monthly budgets begin. The short-period amounts are not your full-month template; review that next plan separately.` : `New goals use contributions ${amountCadence(frequency)}. Existing target dates need review against the new contribution schedule.`}</p>
      <label className="bc-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I've reviewed the dates, bills, goal amounts and expected reserves.</label>
      {gap < 0 && <label className="bc-check"><input type="checkbox" checked={acceptGap} onChange={e => setAcceptGap(e.target.checked)} />Keep this shortfall visible</label>}
    </>}
    {error && <p className="bc-error" role="alert">{error}</p>}
    <div className="bc-task-footer"><Action onClick={() => step ? setStep(step - 1) : close()}>{step ? 'Back' : 'Cancel'}</Action><Action tone="primary" onClick={() => step === 0 ? setStep(1) : step === 1 ? check() && setStep(2) : save()}>{step < 2 ? 'Continue' : 'Schedule budget change'}</Action></div>
  </div>
}

export function ScheduledBudget({ change }: { change: FrequencyChange }) {
  const free = change.income - total([change.bills, change.upcoming, change.savings, change.everyday, ...change.goals.map(g => g.amount)])
  return <section className="bc-surface bc-plan-panel"><p className="bc-eyebrow">Scheduled · {frequencyLabel(change.frequency)}</p><h2>Your next rhythm starts here.</h2><p>{periodLabel(change)}{change.bridge ? ' · transition budget' : ''}. These are planned values, not future actuals.</p><DatedSchedule period={change} />
    <div className="bc-kv"><span>Expected income</span><strong>{money(change.income)}</strong></div><div className="bc-kv"><span>Bills from new income</span><strong>{money(change.bills)}</strong></div><div className="bc-kv"><span>Put aside for later bills</span><strong>{money(change.upcoming)}</strong></div><div className="bc-kv"><span>Longer-term savings</span><strong>{money(change.savings)}</strong></div><div className="bc-kv"><span>Everyday spending</span><strong>{money(change.everyday)}</strong></div>
    {change.goals.map(g => <div className="bc-kv" key={g.id}><span>{g.name} · expected opening / new plan</span><strong>{money(g.opening)} / {money(g.amount)}</strong></div>)}
    <div className="bc-kv"><span>{free < 0 ? 'Your plan needs' : 'Still to plan'}</span><strong>{money(Math.abs(free))}</strong></div><p>Current budgets, matches and reviews have not changed. Opening reserves remain provisional until the current period closes. No money has moved.</p>
  </section>
}
