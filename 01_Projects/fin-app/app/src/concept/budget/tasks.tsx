import { useEffect, useState, type FormEvent } from 'react'
import { Action, AmountField, Comparison, Icon, money, shortDate } from './ui'
import { budgetPeriod, everydayPlan, fortnightlyBudget, freshBudget, goalMonthly, goalReserve, goalTiming, inputValue, moneyInput, moveBudget, recordPurchase, requiredMonthly, stillToPlan, total, type Budget, type Goal } from './model'
import { amountCadence, contributionDates, frequencyLabel, periodAt, periodLabel, validDate, type Frequency } from './frequency'
import { FrequencyPicker, DatedSchedule } from './FrequencyFlow'
import { SuggestionFlow } from './SuggestionFlow'
import { historyFixture, suggest, type AssistedDraft, type FixtureId } from './suggestions'

export type Task = { kind: 'guide' | 'ready' | 'carry' | 'frequency' | 'setup' | 'goal' | 'purchase' | 'existing' | 'move' | 'category' | 'calculation' | 'settings' | 'data' | 'plan' | 'reserve' | 'contribution' | 'limits'; id?: string }
type Props = { budget: Budget; commit: (next: Budget, message: string) => void; close: () => void; open: (task: Task) => void; suggestionFixture?: FixtureId }
const positive = (value: string) => { const n = moneyInput(value); return n !== null && n > 0 ? n : null }

export function GoalEditor({ budget, id, commit, close }: Props & { id?: string }) {
  const cadence = amountCadence(budget.frequency)
  const firstDate = contributionDates(budget.frequency, budget.anchor, '2036-10-25')[0]
  const existing = budget.goals.find(g => g.id === id)
  const [step, setStep] = useState(0)
  const [name, setName] = useState(existing?.name || '')
  const [cost, setCost] = useState(existing?.target ? inputValue(existing.target) : '')
  const [opening, setOpening] = useState(inputValue(existing?.opening ?? 0))
  const [monthly, setMonthly] = useState(inputValue(existing?.monthly ?? 10000))
  const [neededBy, setNeededBy] = useState(existing?.neededBy || '2027-03-25')
  const [mode, setMode] = useState<'amount' | 'date'>(existing?.mode || 'amount')
  const [estimated, setEstimated] = useState(existing?.estimated ?? true)
  const [unknown, setUnknown] = useState(existing?.draft ?? false)
  const [error, setError] = useState('')
  const [gapAccepted, setGapAccepted] = useState(false)
  const target = unknown ? null : positive(cost)
  const start = moneyInput(opening) ?? 0
  const planned = unknown ? 0 : mode === 'date' ? requiredMonthly(target ?? 0, start, neededBy, budget) : moneyInput(monthly)
  const candidate: Goal = { id: existing?.id || 'goal-new', name: name.trim(), target, opening: start, monthly: planned ?? 0,
    neededBy: mode === 'date' ? neededBy : '', mode, estimated, paused: existing?.paused ?? false,
    purchases: existing?.purchases ?? 0, completed: existing?.completed ?? false, draft: unknown }
  const oldAmount = existing ? goalMonthly(existing) : 0
  const after = stillToPlan(budget) + oldAmount - goalMonthly(candidate)
  const timing = goalTiming(candidate, budget)
  const next = () => {
    setError('')
    if (step === 0 && (!name.trim() || (!unknown && target === null) || moneyInput(opening) === null)) { setError('Give your goal a name, enter its cost (or choose “I don’t know yet”), and check the starting amount.'); return }
    if (step === 1 && (planned === null || (mode === 'date' && neededBy < firstDate))) { setError(`Choose a date on or after ${shortDate(firstDate)}, or enter a valid contribution amount.`); return }
    setStep(step + 1)
  }
  const save = () => {
    if (goalReserve(candidate) < 0) { setError('This change would remove budget already used for a purchase. Keep enough in this goal to cover its recorded purchases.'); return }
    if (after < 0 && !gapAccepted) { setError('Your plan needs more money. Confirm you want to keep that gap, or choose a smaller contribution.'); return }
    const goal = { ...candidate, id: existing?.id || `goal-${Date.now()}` }
    commit({ ...budget, goals: existing ? budget.goals.map(g => g.id === id ? goal : g) : [...budget.goals, goal], featured: goal.id }, unknown ? `Saved ${name} as a draft. Add its cost whenever you're ready.` : `${name} is part of your plan. ${money(goal.monthly)} planned ${cadence}.`)
  }
  return <div className="bc-task-body">
    <div className="bc-steps" aria-label="Goal setup progress">{['Your goal', 'Your saving plan', 'Check & save'].map((s, i) => <span key={s} aria-current={step === i ? 'step' : undefined}>{i + 1}<span>{s}</span></span>)}</div>
    {step === 0 && <>
      <p className="bc-lead">A little {cadence} can make something good possible.</p>
      {!existing && <Action tone="link" onClick={() => { setName('Snowboard'); setCost('900'); setOpening('300'); setMonthly('100'); setUnknown(false) }}>Try the snowboard example <Icon name="arrow" size={16} /></Action>}
      <div className="bc-field"><label htmlFor="goal-name">What are you saving for?</label><input id="goal-name" value={name} onChange={e => setName(e.target.value)} placeholder="A snowboard, a flight, something for you…" maxLength={60} /></div>
      {!unknown && <AmountField id="goal-cost" label="About how much will it cost? · AUD" value={cost} onChange={setCost} />}
      <label className="bc-check"><input type="checkbox" checked={unknown} onChange={e => setUnknown(e.target.checked)} />I don't know the cost yet</label>
      {!unknown && <label className="bc-check"><input type="checkbox" checked={estimated} onChange={e => setEstimated(e.target.checked)} />This cost is an estimate</label>}
      <AmountField id="goal-opening" label="Already put aside for this goal · AUD" value={opening} onChange={setOpening} hint="Only include money you've already set aside for this purpose. Don't count it toward another goal too." />
      <details className="bc-help"><summary>Help me choose a starting amount</summary><p>Check your savings and choose the part already intended for this goal. You can start at $0. This is your confirmation, not a bank balance check.</p></details>
    </>}
    {step === 1 && <>
      <h3>What works for you?</h3><p>Start with a date, or choose an amount that fits your budget.</p>
      <div className="bc-choice-pair"><Action aria-pressed={mode === 'amount'} onClick={() => setMode('amount')}>Choose an amount</Action><Action aria-pressed={mode === 'date'} onClick={() => setMode('date')}>Choose a date</Action></div>
      {mode === 'amount' ? <AmountField id="goal-monthly" label={`Plan to put aside ${cadence} · AUD`} value={monthly} onChange={setMonthly} hint="You can change this later. $0 keeps the goal without a saving schedule." /> : <div className="bc-field"><label htmlFor="goal-date">When will you need the money?</label><input id="goal-date" type="date" min={firstDate} max="2036-10-25" value={neededBy} onChange={e => setNeededBy(e.target.value)} /><p className="bc-hint">For a flight, choose when you want to book. First planned contribution: {shortDate(firstDate)}; then {cadence}. Fortnightly goals use the last day of each budget; monthly goals use the 25th.</p></div>}
      <div className="bc-outcome"><span className="bc-eyebrow">Your path to {name || 'this goal'}</span>{unknown ? <p>Add a target cost later to estimate the time needed.</p> : planned === null ? <p>Choose a date with at least one contribution before it.</p> : <><h3>{money(planned)} {cadence}</h3><p>{timing ? `${timing.count} more contributions, around ${shortDate(timing.date)}.` : 'No completion estimate until there is a positive contribution.'}</p><p className="bc-hint">Includes this budget's planned amount. This is a plan, not money already saved.</p></>}</div>
    </>}
    {step === 2 && <>
      <h3>Make room for {name}</h3><p>{unknown ? "We'll keep this as a draft. It won't use your budget yet." : `You're planning ${money(candidate.monthly)} ${cadence}, with ${money(start)} already put aside.`}</p>
      <Comparison rows={[{ label: 'Still to plan this budget', before: stillToPlan(budget), after }, { label: 'Everyday spending budget', before: everydayPlan(budget), after: everydayPlan(budget) }]} />
      <div className="bc-outcome"><strong>{unknown ? 'Draft goal' : `${money(goalReserve(candidate))} set aside in your budget`}</strong><p>{unknown ? 'Add an estimated cost later to plan an amount.' : `${money(start)} you confirmed, plus ${money(goalMonthly(candidate))} planned this budget. Halcyon hasn't transferred that amount.`}</p></div>
      {after < 0 && <label className="bc-check"><input type="checkbox" checked={gapAccepted} onChange={e => setGapAccepted(e.target.checked)} />Keep the {money(-after)} gap in my plan for now</label>}
    </>}
    {error && <p role="alert" className="bc-error">{error}</p>}
    <div className="bc-task-footer"><Action onClick={() => step ? setStep(step - 1) : close()}>{step ? 'Back' : 'Cancel'}</Action>{step < 2 ? <Action tone="primary" onClick={next}>Continue <Icon name="arrow" size={17} /></Action> : <Action tone="primary" onClick={save}>{unknown ? 'Save draft goal' : existing ? 'Save goal changes' : 'Add to my budget'}</Action>}</div>
  </div>
}

export function MoveEditor({ budget, id = 'groceries', commit, close }: Props & { id?: string }) {
  const target = budget.categories.find(c => c.id === id) || budget.categories[0]
  const sources = budget.categories.filter(c => c.id !== target.id && c.planned > c.spent)
  const [sourceId, setSourceId] = useState(sources.find(c => c.id === 'other')?.id || sources[0]?.id || '')
  const [amount, setAmount] = useState(inputValue(Math.max(0, target.spent - target.planned)))
  const [error, setError] = useState('')
  const source = budget.categories.find(c => c.id === sourceId)
  const cents = moneyInput(amount) ?? 0
  const save = (e: FormEvent) => { e.preventDefault(); try { commit(moveBudget(budget, sourceId, target.id, cents), `Moved ${money(cents)} from ${source?.name} to ${target.name}. Your everyday total is unchanged.`) } catch (e) { setError((e as Error).message) } }
  return <form onSubmit={save} className="bc-task-body"><p className="bc-lead">Give {target.name.toLowerCase()} a little more room.</p><p>This changes your budget, not your bank accounts.</p>
    <div className="bc-field"><label htmlFor="move-source">Which category should it come from?</label><select id="move-source" value={sourceId} onChange={e => setSourceId(e.target.value)}>{sources.map(c => <option key={c.id} value={c.id}>{c.name} · {money(c.planned - c.spent)} left</option>)}</select></div>
    <AmountField id="move-amount" label="Amount to move · AUD" value={amount} onChange={setAmount} />
    <Comparison rows={[{ label: `${target.name} left`, before: target.planned - target.spent, after: target.planned - target.spent + cents }, { label: `${source?.name || 'Source'} left`, before: source ? source.planned - source.spent : 0, after: source ? source.planned - source.spent - cents : 0 }]} />
    <p className="bc-hint">Applies to This budget. Your total everyday spending budget stays at {money(everydayPlan(budget))}.</p>
    {error && <p role="alert" className="bc-error">{error}</p>}<div className="bc-task-footer"><Action onClick={close}>Cancel</Action><Action type="submit" tone="primary" disabled={!sources.length}>Move {money(cents)}</Action></div></form>
}

export function PlanEditor({ budget, commit, close }: Props) {
  const [income, setIncome] = useState(inputValue(budget.income))
  const [everyday, setEveryday] = useState(inputValue(everydayPlan(budget)))
  const [scope, setScope] = useState('month')
  const [error, setError] = useState('')
  const [accept, setAccept] = useState(false)
  const i = moneyInput(income), e = moneyInput(everyday)
  const after = stillToPlan(budget) + (i ?? budget.income) - budget.income + everydayPlan(budget) - (e ?? everydayPlan(budget))
  const save = (event: FormEvent) => {
    event.preventDefault()
    const assigned = total(budget.categories.filter(c => c.id !== 'other').map(c => c.planned))
    if (i === null || e === null || e < assigned) { setError(`Enter valid amounts. Keep at least ${money(assigned)} for your existing category limits, or remove those limits first.`); return }
    if (after < 0 && !accept) { setError('Confirm the shortfall, or adjust the amounts before saving.'); return }
    commit({ ...budget, income: i, categories: budget.categories.map(c => c.id === 'other' ? { ...c, planned: e - assigned } : c), ...(scope === 'future' ? { futureIncome: i, futureEveryday: e } : {}) }, scope === 'future' ? 'Current and future starting amounts updated. Earlier reviews are unchanged.' : 'Current plan saved. Future starting amounts are unchanged.')
  }
  return <form className="bc-task-body" onSubmit={save}><p>Change your expectations, then check how the whole budget fits.</p>
    <AmountField id="plan-income" label="Income expected this budget · AUD" value={income} onChange={setIncome} />
    <AmountField id="plan-everyday" label="Everyday spending budget · AUD" value={everyday} onChange={setEveryday} hint="Any change goes to Other everyday spending. Your named category limits stay the same." />
    <div className="bc-field"><label htmlFor="plan-scope">When should this change apply?</label><select id="plan-scope" value={scope} onChange={e => setScope(e.target.value)}><option value="month">This budget</option><option value="future">This and future budgets</option></select></div>
    <Comparison rows={[{ label: 'Still to plan', before: stillToPlan(budget), after }]} />
    {scope === 'future' && <p className="bc-hint">This also changes the next budget’s starting amounts. Earlier plans stay as they were. A scheduled frequency change keeps its separately reviewed amounts.</p>}
    {after < 0 && <label className="bc-check"><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} />Keep the {money(-after)} gap for now</label>}
    {error && <p role="alert" className="bc-error">{error}</p>}<div className="bc-task-footer"><Action onClick={close}>Cancel</Action><Action tone="primary" type="submit">Save budget plan</Action></div></form>
}

export function GoalMoneyTask({ budget, id, kind, commit, close }: Props & { id: string; kind: 'purchase' | 'existing' }) {
  const goal = budget.goals.find(g => g.id === id)!
  const [amount, setAmount] = useState(kind === 'purchase' && goal.target ? inputValue(Math.max(0, goal.target - goal.purchases)) : '')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const n = moneyInput(amount) ?? 0
  const reserve = goalReserve(goal)
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (positive(amount) === null || !confirmed) { setError('Enter an amount and confirm the example source before recording it.'); return }
    try {
      commit(kind === 'purchase' ? recordPurchase(budget, id, n) : { ...budget, goals: budget.goals.map(g => g.id === id ? { ...g, opening: g.opening + n } : g) }, kind === 'purchase' ? `Recorded ${money(n)} toward ${goal.name}. It is counted once, outside everyday spending.` : `${money(n)} of existing savings added to ${goal.name}. Your budget plan is unchanged.`)
    } catch (e) { setError((e as Error).message) }
  }
  return <form className="bc-task-body" onSubmit={save}><p className="bc-lead">{kind === 'purchase' ? `Bring ${goal.name} into the real world.` : `Already have more put aside for ${goal.name}?`}</p>
    <AmountField id="goal-money" label={kind === 'purchase' ? 'Purchase amount · AUD' : 'Existing savings to add · AUD'} value={amount} onChange={setAmount} />
    <div className="bc-outcome"><div className="bc-kv"><span>Set aside in this goal's budget</span><strong>{money(reserve)}</strong></div><div className="bc-kv"><span>After this change</span><strong className={kind === 'purchase' && n > reserve ? 'bc-negative' : ''}>{money(reserve + (kind === 'purchase' ? -n : n))}</strong></div></div>
    <label className="bc-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{kind === 'purchase' ? 'Use this fictional purchase, not a new bank transaction.' : "I've put this amount aside for this goal, and haven't counted it elsewhere."}</label>
    <p className="bc-hint">{kind === 'purchase' ? 'This concept simulates matching a purchase to the goal. A partial purchase is supported. No real account is changed.' : 'This is a dated user confirmation of existing savings. It does not create income or transfer money.'}</p>
    {kind === 'purchase' && n > reserve && <p className="bc-warning">Your goal's plan needs {money(n - reserve)} more before this purchase can be recorded here. Add existing savings or adjust the plan first.</p>}
    {error && <p role="alert" className="bc-error">{error}</p>}<div className="bc-task-footer"><Action onClick={close}>Cancel</Action><Action tone="primary" type="submit">{kind === 'purchase' ? 'Record purchase' : 'Confirm existing savings'}</Action></div></form>
}

type SetupDraft = { step: number; frequency: Frequency; anchor: string; income: string; bills: string; upcoming: string; savings: string; everyday: string; limits: boolean; estimated: boolean; assistance?: AssistedDraft; manualEdits?: string[]; manualGoal?: Goal; manualFutureEveryday?: number; manualFutureGoalAmount?: number }
const initialSetup: SetupDraft = { step: 0, frequency: 'monthly', anchor: '2026-10-01', income: '6000', bills: '2500', upcoming: '400', savings: '1000', everyday: '1800', limits: false, estimated: false }
function readSetup(): SetupDraft {
  try { const d = JSON.parse(localStorage.getItem('halcyon-budget-setup-draft') || 'null'); if (d && [0, 1, 2, 3].includes(d.step) && ['income', 'bills', 'upcoming', 'savings', 'everyday'].every(k => typeof d[k] === 'string')) return { ...initialSetup, ...d } } catch { /* use fixture */ }
  return initialSetup
}
export function SetupFlow({ commit, close, open, suggestionFixture = 'complete' }: Props) {
  const [draft, setDraft] = useState<SetupDraft>(readSetup)
  const [assisting, setAssisting] = useState(false)
  const [help, setHelp] = useState(false)
  const [error, setError] = useState('')
  const [confirmGap, setConfirmGap] = useState(false)
  const cadence = amountCadence(draft.frequency)
  const p = validDate(draft.anchor) ? periodAt(draft.frequency, draft.anchor) : null
  const chooseFrequency = (frequency: Frequency, anchor: string) => {
    if (frequency === draft.frequency) {
      if (frequency === 'fortnightly' && validDate(anchor)) {
        const sample = fortnightlyBudget(anchor)
        setDraft(d => ({ ...d, anchor, income: inputValue(sample.income), bills: inputValue(sample.bills) }))
      } else setDraft(d => ({ ...d, anchor }))
      return
    }
    setDraft(d => ({ ...d, frequency, anchor, income: frequency === 'monthly' ? '6000' : '3000', bills: frequency === 'monthly' ? '2500' : '120', upcoming: frequency === 'monthly' ? '400' : '1100', savings: frequency === 'monthly' ? '1000' : '500', everyday: frequency === 'monthly' ? '1800' : '800', limits: false }))
  }
  const set = (key: keyof SetupDraft, value: string | boolean | number) => setDraft(d => ({ ...d, [key]: value, ...(['income', 'bills', 'upcoming', 'savings', 'everyday'].includes(key) ? { manualEdits: [...new Set([...(d.manualEdits ?? []), key])] } : {}) }))
  useEffect(() => { try { localStorage.setItem('halcyon-budget-setup-draft', JSON.stringify(draft)) } catch { /* optional storage */ } }, [draft])
  const amounts = ['income', 'bills', 'upcoming', 'savings', 'everyday'].map(k => moneyInput(draft[k as keyof SetupDraft] as string))
  const goal = draft.assistance?.goal ?? draft.manualGoal
  const futureEveryday = draft.assistance?.futureEveryday ?? draft.manualFutureEveryday
  const futureGoalAmount = draft.assistance?.futureGoalAmount ?? draft.manualFutureGoalAmount
  const left = (amounts[0] ?? 0) - total(amounts.slice(1).map(n => n ?? 0)) - (goal?.monthly ?? 0)
  const fingerprint = p ? suggest(historyFixture(suggestionFixture), draft.frequency, draft.anchor).fingerprint : ''
  const stale = !!draft.assistance && draft.assistance.fingerprint !== fingerprint
  const next = () => {
    if (!p || draft.anchor > '2026-10-19' || draft.anchor < '2026-01-01') { setError('Choose a valid example start date between 1 January and 19 October 2026.'); return }
    const fields = draft.step === 0 ? ['income'] : draft.step === 1 ? ['bills', 'upcoming', 'savings'] : ['everyday']
    if (fields.some(k => moneyInput(draft[k as keyof SetupDraft] as string) === null)) { setError('Enter an amount for each field. An estimate is fine; mark it below.'); return }
    if (draft.step === 2 && draft.limits && (amounts[4] ?? 0) < 110000) { setError('The example category limits need at least $1,100. Use one everyday amount instead, or increase the total.'); return }
    setError(''); setHelp(false); set('step', draft.step + 1)
  }
  const activate = () => {
    if (stale) { setError('The example history or budget dates changed. Review the suggestions again, or keep these amounts as your own manual estimates.'); return }
    if (amounts.some(n => n === null) || (left < 0 && !confirmGap)) { setError('Confirm the gap or go back and adjust the plan.'); return }
    const b = draft.frequency === 'fortnightly' ? fortnightlyBudget(draft.anchor) : freshBudget()
    ;[b.income, b.bills, b.upcoming, b.savings] = amounts.slice(0, 4) as number[]
    b.futureIncome = b.income; b.futureEveryday = futureEveryday ?? amounts[4]!
    b.goals = goal ? [goal] : []; b.featured = goal?.id ?? ''; b.hasLimits = draft.limits; b.estimates = draft.estimated
    if (goal && futureGoalAmount !== undefined) b.futureGoalAmounts = { [goal.id]: futureGoalAmount }
    b.categories = b.categories.map(c => ({ ...c, planned: draft.limits ? c.id === 'other' ? amounts[4]! - 110000 : c.planned : c.id === 'other' ? amounts[4]! : 0 }))
    try { localStorage.removeItem('halcyon-budget-setup-draft') } catch { /* optional */ }
    commit(b, `Your first budget is ready.${draft.estimated ? ' Your amounts include estimates.' : ''} Add a savings goal whenever you're ready.`)
  }
  if (assisting && p) return <SuggestionFlow fixture={suggestionFixture} frequency={draft.frequency} anchor={draft.anchor} cancel={() => setAssisting(false)} onUse={assistance => {
    setDraft(d => ({ ...d, ...Object.fromEntries(Object.entries(assistance.values).map(([key, value]) => [key, inputValue(value)])), step: 3, assistance, manualEdits: [], manualGoal: undefined, manualFutureEveryday: undefined, manualFutureGoalAmount: undefined, limits: false, estimated: true }))
    setConfirmGap(false); setError(''); setAssisting(false)
  }} />
  return <div className="bc-task-body"><div className="bc-steps" aria-label="Budget setup progress">{['Your money', 'Your costs', 'Everyday spending', 'Review'].map((s, i) => <span key={s} aria-current={draft.step === i ? 'step' : undefined}>{i + 1}<span>{s}</span></span>)}</div>
    {stale && <div className="bc-warning" role="status"><p>Suggestions need review: the history or dates changed. Your edited amounts have been kept.</p><Action onClick={() => setAssisting(true)}>Review suggestions again</Action><Action onClick={() => setDraft(d => ({ ...d, manualGoal: d.assistance?.goal ?? d.manualGoal, manualFutureEveryday: d.assistance?.futureEveryday ?? d.manualFutureEveryday, manualFutureGoalAmount: d.assistance?.futureGoalAmount ?? d.manualFutureGoalAmount, assistance: undefined, estimated: true }))}>Keep as manual estimates</Action></div>}
    {draft.step === 0 && <Action tone="link" onClick={() => open({ kind: 'guide', id: 'setup' })}>How your budget works</Action>}
    {draft.step === 0 && <><FrequencyPicker frequency={draft.frequency} anchor={draft.anchor} onChange={chooseFrequency} />{p && <p className="bc-hint">Current budget: {periodLabel(p)} · {frequencyLabel(draft.frequency)}</p>}<div className="bc-outcome"><h3>You don’t have to start from a blank page.</h3><p>Choose your budget dates below, then get an editable starting point from the example history.</p><Action tone="primary" disabled={!p} onClick={() => { setError(''); setAssisting(true) }}>Help me build a budget</Action></div><h3>What money are you planning with?</h3><p>Editable fictional starting amounts. Changing frequency loads a different dated example—not half a monthly budget.</p><AmountField id="setup-income" label={`Income expected ${cadence} · AUD`} value={draft.income} onChange={v => set('income', v)} /><details className="bc-help"><summary>Which accounts are included?</summary><p>Everyday account, bills account, cash account and credit card. All four are fictional AUD accounts.</p></details><Action tone="link" onClick={() => setDraft({ ...draft, income: '', bills: '', upcoming: '', savings: '', everyday: '', assistance: undefined, manualEdits: [], manualGoal: undefined, manualFutureEveryday: undefined, manualFutureGoalAmount: undefined })}>Enter my own amounts</Action></>}
    {draft.step === 1 && <><h3>What does your money need to cover?</h3>{draft.frequency === 'fortnightly' && p && <DatedSchedule period={p} />}<AmountField id="setup-bills" label={`Bills & regular payments · AUD ${cadence}`} value={draft.bills} onChange={v => set('bills', v)} hint="Count bills on their real due dates, not a monthly average." /><AmountField id="setup-upcoming" label={`Put aside for upcoming costs · AUD ${cadence}`} value={draft.upcoming} onChange={v => set('upcoming', v)} hint="For later bills, registration or annual insurance. Review any first-period shortfall." /><AmountField id="setup-savings" label={`Longer-term savings · AUD ${cadence}`} value={draft.savings} onChange={v => set('savings', v)} /><label className="bc-check"><input type="checkbox" checked={draft.estimated} onChange={e => set('estimated', e.target.checked)} />I'm using estimates for now</label></>}
    {draft.step === 2 && <><h3>What would you like left for everyday spending?</h3><p>This includes groceries, eating out and other spending outside the costs you've already planned for.</p><AmountField id="setup-everyday" label={`Everyday spending · AUD ${cadence}`} value={draft.everyday} onChange={v => set('everyday', v)} /><label className="bc-check"><input type="checkbox" checked={draft.limits} onChange={e => set('limits', e.target.checked)} />Add example limits for groceries and dining</label><p className="bc-hint">One overall amount is enough to start. You can add category limits later.</p><details className="bc-help"><summary>What about something I want to save for?</summary><p>Once your budget is in place, choose “Save for something”. We'll show how the goal fits before changing your plan.</p></details><Action tone="link" onClick={next}>Add a goal later; review my budget <Icon name="arrow" size={16} /></Action></>}
    {draft.step === 3 && <><h3>Does this budget feel right?</h3><p>{frequencyLabel(draft.frequency)} · {p && periodLabel(p)}</p>{draft.assistance && <p className="bc-hint">Suggested draft · {draft.assistance.fixture} fictional history. Nothing has been activated yet.{draft.manualEdits?.length ? ` You edited: ${draft.manualEdits.join(', ')}.` : ''}</p>}{['Expected income', 'Bills & regular payments', 'Upcoming costs', 'Longer-term savings', 'Everyday spending'].map((label, i) => <div className="bc-kv" key={label}><span>{label}</span><strong>{money(amounts[i] ?? 0)}</strong></div>)}{goal && <div className="bc-outcome"><h3>{goal.name}</h3><div className="bc-kv"><span>Confirmed existing savings</span><strong>{money(goal.opening)}</strong></div><div className="bc-kv"><span>Planned contribution</span><strong>{money(goal.monthly)}</strong></div><p>These are separate: planning a contribution does not save or transfer it.</p></div>}{futureEveryday !== undefined && <div className="bc-outcome"><h3>From the next budget</h3><div className="bc-kv"><span>Everyday starting amount</span><strong>{money(futureEveryday!)}</strong></div>{goal && <div className="bc-kv"><span>{goal.name} planned contribution</span><strong>{money(futureGoalAmount ?? goal.monthly)}</strong></div>}<p>This budget keeps its starting amounts. The what-if only changes future starting amounts.</p></div>}<div className="bc-outcome"><span>{left < 0 ? 'Your plan needs' : 'Still to plan'}</span><h3>{money(Math.abs(left))}</h3><p>{left < 0 ? 'You can adjust the amounts or keep this shortfall visible for now.' : 'Keep this space in your plan or give it a purpose later.'}</p></div>{left < 0 && <label className="bc-check"><input type="checkbox" checked={confirmGap} onChange={e => setConfirmGap(e.target.checked)} />Keep this gap visible</label>}<p className="bc-hint">{draft.estimated ? 'Some amounts are estimates. ' : ''}Australia/Sydney · AUD. Known activity from this period is included; starting today does not erase earlier spending.</p></>}
    {draft.step < 3 && <><Action tone="link" onClick={() => setHelp(!help)} aria-expanded={help}>Help me choose</Action>{help && <div className="bc-outcome"><p>{draft.step === 0 ? 'Use take-home pay you expect in these budget dates. Leave out transfers and one-off amounts you are not expecting again.' : draft.step === 1 ? 'Start with amounts you know. For occasional bills, spread the expected cost across the contribution dates before it is due. Mark uncertain amounts as estimates.' : 'Use the example amount as a starting point, not a target. Compare similar complete periods and adjust after trying a budget.'}</p></div>}</>}
    <p className="bc-hint">Your draft is saved on this device. You can continue later.</p>{error && <p role="alert" className="bc-error">{error}</p>}
    <div className="bc-task-footer"><Action onClick={() => draft.step ? set('step', draft.step - 1) : close()}>{draft.step ? 'Back' : 'Continue later'}</Action><Action tone="primary" onClick={draft.step === 3 ? activate : next}>{draft.step === 3 ? 'Start my budget' : 'Continue'}<Icon name="arrow" size={16} /></Action></div>
  </div>
}

export function InfoTask({ task, budget, commit, close, open }: Props & { task: Task }) {
  const category = budget.categories.find(c => c.id === task.id) || budget.categories[0]
  const [extra, setExtra] = useState('220')
  const [error, setError] = useState('')
  const [ackGap, setAckGap] = useState(false)
  const regAmount = moneyInput(extra) ?? 0
  return <div className="bc-task-body">
    {task.kind === 'category' && <><p className="bc-lead">{category.planned < category.spent ? `You've spent ${money(category.spent - category.planned)} more on ${category.name.toLowerCase()} than you planned.` : `${money(category.planned - category.spent)} left in ${category.name.toLowerCase()}.`}</p><div className="bc-kv"><span>Planned for this budget</span><strong>{money(category.planned)}</strong></div><div className="bc-kv"><span>Spent so far</span><strong>{money(category.spent)}</strong></div><p>These example purchases are already included in your everyday total.</p><details className="bc-help"><summary>Example spending activity</summary><p>Fictional settled purchases within the current budget dates total {money(category.spent)}. Pending card payments are shown separately.</p></details><div className="bc-actions"><Action tone="primary" onClick={() => open({ kind: 'move', id: category.id })}>Move budget between categories</Action><Action onClick={() => open({ kind: 'plan' })}>Change my plan</Action></div><Action tone="link" onClick={() => commit({ ...budget, acknowledged: true }, 'Your plan is unchanged. The overspend stays visible.')}>Keep my plan as it is</Action></>}
    {task.kind === 'calculation' && <><p className="bc-lead">Your plan, minus what you've spent.</p><div className="bc-kv"><span>Everyday spending plan</span><strong>{money(everydayPlan(budget))}</strong></div><div className="bc-kv"><span>Spent so far</span><strong>−{money(total(budget.categories.map(c => c.spent)))}</strong></div><div className="bc-kv"><span>Left for everyday spending</span><strong>{money(everydayPlan(budget) - total(budget.categories.map(c => c.spent)))}</strong></div><div className="bc-outcome"><p>This is what remains in your budget, not your bank balance. Bills, upcoming costs and saving plans are accounted for separately.</p></div><p>Any period-end estimate needs comparable complete history and the actual days remaining. The $45 pending charge hasn't been counted as settled spending.</p></>}
    {task.kind === 'settings' && <><p className="bc-lead">{periodLabel(budgetPeriod(budget))}</p><div className="bc-kv"><span>How often you budget</span><strong>{frequencyLabel(budget.frequency)}</strong></div><Action onClick={() => open({ kind: 'frequency' })}>Change budget frequency</Action><div className="bc-kv"><span>Currency</span><strong>AUD</strong></div><div className="bc-kv"><span>Timezone</span><strong>Australia/Sydney</strong></div><details open className="bc-help"><summary>Four example activity accounts</summary><p>Everyday account · Bills account · Cash account · Credit card</p></details><p>Changing account membership is a saved budget decision in the planned feature. This concept uses the same four fictional accounts throughout.</p><Action onClick={() => open({ kind: 'setup' })}>Try guided setup</Action></>}
    {task.kind === 'data' && <><p className="bc-lead">{budget.coverage ? 'A complete example period to explore.' : 'Some earlier activity is missing.'}</p><p>{budget.coverage ? 'All four example accounts have complete coverage. Figures are fixed at 19 October 2026 for design review.' : 'One account is missing activity before 10 October. Last known amounts stay visible, but we cannot confidently estimate period-end spending.'}</p><div className="bc-kv"><span>Pending purchases</span><strong>$45.00</strong></div><p>Pending amounts stay separate until they settle. You can try the incomplete-data state using the review controls above the page.</p></>}
    {task.kind === 'contribution' && <><p className="bc-lead">Keep longer-term savings in sight.</p><div className="bc-kv"><span>Planned this budget</span><strong>{money(budget.savings)}</strong></div><div className="bc-kv"><span>Example transfer recorded</span><strong>$600.00</strong></div><p>The recorded transfer counts once. Planning an amount does not transfer it or automatically update a longer-term Planning goal.</p><Action onClick={() => open({ kind: 'plan' })}>View my plan</Action></>}
    {task.kind === 'reserve' && <><p className="bc-lead">Registration needs {money(Math.max(0, 22000 - budget.registrationExtra))} more by 1 November.</p><div className="bc-kv"><span>Expected cost</span><strong>$820.00</strong></div><div className="bc-kv"><span>Set aside in the plan</span><strong>{money(50000 + budget.registrationExtra)}</strong></div><div className="bc-kv"><span>Next planned amount · 25 Oct</span><strong>$100.00</strong></div><AmountField id="registration-extra" label="Add to this budget's registration budget · AUD" value={extra} onChange={setExtra} /><Comparison rows={[{ label: 'Still to plan', before: stillToPlan(budget), after: stillToPlan(budget) - regAmount }]} />{stillToPlan(budget) - regAmount < 0 && <label className="bc-check"><input type="checkbox" checked={ackGap} onChange={e => setAckGap(e.target.checked)} />Keep the {money(regAmount - stillToPlan(budget))} shortfall visible</label>}{error && <p role="alert" className="bc-error">{error}</p>}<div className="bc-task-footer"><Action onClick={close}>Keep my plan</Action><Action tone="primary" onClick={() => { if (positive(extra) === null || (stillToPlan(budget) - regAmount < 0 && !ackGap)) { setError('Enter a positive amount and confirm any shortfall, or choose a smaller amount.'); return } commit({ ...budget, registrationExtra: budget.registrationExtra + regAmount }, `${money(regAmount)} added to registration's plan. No bank transfer was made.`) }}>Save registration plan</Action></div></>}
    {task.kind === 'limits' && <><p className="bc-lead">Keep an eye on a few categories.</p><p>The example adds a $700 grocery limit and a $400 dining limit inside your everyday total. Everything else stays in Other everyday spending.</p><p>Your total everyday budget stays at {money(everydayPlan(budget))}.</p><Action tone="primary" disabled={everydayPlan(budget) < 110000} onClick={() => commit({ ...budget, hasLimits: !budget.hasLimits, categories: budget.categories.map(c => ({ ...c, planned: budget.hasLimits ? c.id === 'other' ? everydayPlan(budget) : 0 : c.id === 'groceries' ? 70000 : c.id === 'dining' ? 40000 : everydayPlan(budget) - 110000 })) }, budget.hasLimits ? 'Category limits removed. All spending remains in your everyday total.' : 'Grocery and dining limits added inside your everyday budget.')}>{budget.hasLimits ? 'Use one everyday amount instead' : 'Add example category limits'}</Action></>}
    {!['reserve', 'category', 'limits'].includes(task.kind) && <div className="bc-task-footer"><Action tone="primary" onClick={close}>Got it</Action></div>}
  </div>
}
