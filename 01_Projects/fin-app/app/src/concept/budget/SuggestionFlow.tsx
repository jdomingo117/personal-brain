import { useState } from 'react'
import { Action, AmountField, Comparison, money, shortDate } from './ui'
import { addDays, amountCadence, periodAt, periodLabel, type Frequency } from './frequency'
import { inputValue, moneyInput, type Goal } from './model'
import { draftFree, historyFixture, outcome, suggest, whatIf, type AssistedDraft, type DraftAmounts, type FixtureId } from './suggestions'

const fieldNames = ['income', 'bills', 'upcoming', 'savings', 'everyday'] as const
const labels = ['Expected take-home income', 'Bills & regular payments', 'Put aside for upcoming costs', 'Longer-term savings', 'Everyday spending']
export function SuggestionFlow({ fixture, frequency, anchor, onUse, cancel }: { fixture: FixtureId; frequency: Frequency; anchor: string; onUse: (draft: AssistedDraft) => void; cancel: () => void }) {
  const history = historyFixture(fixture)
  const evidence = suggest(history, frequency, anchor)
  const [step, setStep] = useState(0)
  const [changed, setChanged] = useState('')
  const [scopeConfirmed, setScopeConfirmed] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [currentConfirmed, setCurrentConfirmed] = useState(false)
  const [protectedSource, setProtectedSource] = useState(false)
  const [acceptGap, setAcceptGap] = useState(false)
  const [values, setValues] = useState(() => Object.fromEntries(fieldNames.map(k => [k, k === 'income' && history.changed ? '' : inputValue(evidence.defaults[k])])) as Record<keyof DraftAmounts, string>)
  const [tryChange, setTryChange] = useState(false)
  const [withGoal, setWithGoal] = useState(false)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [opening, setOpening] = useState('0')
  const [contribution, setContribution] = useState('0')
  const [neededBy, setNeededBy] = useState('')
  const [source, setSource] = useState('other')
  const [amount, setAmount] = useState('0')
  const [destination, setDestination] = useState<'goal' | 'unassigned'>('unassigned')
  const [future, setFuture] = useState(false)
  const [error, setError] = useState('')
  const parsed = Object.fromEntries(fieldNames.map(k => [k, moneyInput(values[k])])) as Record<keyof DraftAmounts, number | null>
  const numbersValid = Object.values(parsed).every(n => n !== null)
  const draft = Object.fromEntries(fieldNames.map(k => [k, parsed[k] ?? 0])) as DraftAmounts
  const goal: Goal | null = withGoal && tryChange ? { id: 'assisted-goal', name: name.trim(), target: moneyInput(target), opening: moneyInput(opening) ?? -1, monthly: moneyInput(contribution) ?? -1, estimated: true, neededBy, mode: 'amount', purchases: 0, paused: false, completed: false, draft: false } : null
  const goalValid = !goal || !!goal.name && goal.target !== null && goal.target > 0 && goal.opening >= 0 && goal.opening <= goal.target && goal.monthly >= 0
  const baseFree = draftFree(draft, goal?.monthly ?? 0)
  const scenarioAmount = tryChange ? moneyInput(amount) : 0
  // A suggested source partition must still fit after the user edits the everyday total.
  const adjustedEvidence = { ...evidence, source: evidence.source.map(s => ({ ...s, planned: Math.max(0, s.planned + (s.id === 'other' ? draft.everyday - evidence.defaults.everyday : 0)) })) }
  let preview: ReturnType<typeof whatIf> | null = null, previewError = ''
  try {
    if (scenarioAmount === null) throw new Error('Enter a positive amount or $0 to keep the current draft.')
    preview = tryChange ? whatIf(draft, adjustedEvidence, { source, amount: scenarioAmount, destination, future, goal }) : { everyday: draft.everyday, goalAmount: goal?.monthly ?? 0, freeBefore: baseFree, freeAfter: baseFree, sourceBefore: 0, sourceAfter: 0 }
  } catch (e) { previewError = (e as Error).message }
  const period = periodAt(frequency, anchor)
  const projectionGoal = future && goal ? { ...goal, opening: goal.opening + goal.monthly } : goal
  const from = future ? period.end : '2026-10-19'
  const projectionReady = evidence.eligible && reviewed && baseFree >= 0 && numbersValid && goalValid && !!preview && preview.freeAfter >= 0
  const next = () => {
    setError('')
    if (step === 0 && (!scopeConfirmed || !changed || !evidence.eligible)) { setError('Confirm the accounts and recent changes, or continue with your own amounts.'); return }
    if (step === 1 && (!numbersValid || !reviewed || (changed !== 'no' || history.changed) && !currentConfirmed)) { setError('Check each amount and confirm that this plan fits your current circumstances.'); return }
    setStep(step + 1)
  }
  const useDraft = () => {
    if (!numbersValid || !reviewed || !scopeConfirmed || !evidence.eligible || !goalValid || !preview || (tryChange && !protectedSource)) { setError(previewError || 'Check your amounts and confirm the spending area is one you want to change.'); return }
    if ((baseFree < 0 || preview.freeAfter < 0) && !acceptGap) { setError('Keep the funding gap visible or adjust the draft before using it.'); return }
    const updatedGoal = goal ? { ...goal, monthly: future ? goal.monthly : preview.goalAmount } : null
    onUse({ fixture, fingerprint: evidence.fingerprint, confirmed: true, values: { ...draft, everyday: future ? draft.everyday : preview.everyday }, goal: updatedGoal,
      ...(future ? { futureEveryday: preview.everyday, futureGoalAmount: preview.goalAmount } : {}) })
  }
  return <div className="bc-task-body bc-assistance">
    <div className="bc-steps" aria-label="Budget assistance progress">{['Check history', 'Review draft', 'Try a change'].map((s, i) => <span key={s} aria-current={step === i ? 'step' : undefined}>{i + 1}<span>{s}</span></span>)}</div>
    {step === 0 && <><p className="bc-lead">A starting point from your spending—not a rule to live by.</p><p>{periodLabel(period)} · {amountCadence(frequency)} · AUD</p>
      <div className={`bc-outcome ${!evidence.eligible ? 'bc-warning' : ''}`}><h3>{evidence.eligible ? 'Enough history to make a start' : history.months.length ? 'Some information needs checking' : 'Start with what you know'}</h3><p>{evidence.monthlyCount} complete months of fictional activity{history.months.length ? ` · ${shortDate(history.from)}–${shortDate(addDays(history.until, -1))}` : ''}. {frequency === 'fortnightly' && `${evidence.periodTotals.length} complete, anchor-aligned 14-day periods.`}</p>{evidence.reasons.map(r => <p key={r}>{r}</p>)}</div>
      <details className="bc-help"><summary>Which accounts and dates?</summary><p>Everyday account, bills account, cash account and credit card. All four fictional accounts are AUD. Coverage is a fixture, not a bank connection. Missing months are excluded, never treated as zero.</p><p>Prefer up to six complete months; require at least three comparable months. Fortnightly suggestions also need six covered 14-day windows.</p></details>
      {!evidence.eligible && <details className="bc-help"><summary>What can we still show?</summary><div className="bc-kv"><span>Observed spending in covered months</span><strong>{money(evidence.observedTotal)}</strong></div><p>This is a historical total, not a suggested allowance. Known example bills can still help: rent is $2,100 on the 1st and utilities $120 on the 20th. Check your own amounts and dates in manual setup.</p></details>}
      {evidence.eligible && <><label className="bc-check"><input type="checkbox" checked={scopeConfirmed} onChange={e => setScopeConfirmed(e.target.checked)} />These are the accounts I want to include.</label><div className="bc-field"><label htmlFor="assist-changes">Has your income or regular spending changed recently?</label><select id="assist-changes" value={changed} onChange={e => setChanged(e.target.value)}><option value="">Choose an answer</option><option value="no">No</option><option value="yes">Yes</option><option value="unsure">Not sure</option></select></div>{history.changed && <p className="bc-warning">This example includes a recent pay change. We won’t reuse the old salary; enter your current expectation next.</p>}</>}
      <p className="bc-hint">You don’t need to wait to start budgeting. Enter your own amounts, or import older statements in the production app. No AI or bank requests are made here.</p></>}
    {step === 1 && <><h3>Does this fit your life now?</h3><p>Based on {evidence.monthlyCount} complete months{frequency === 'fortnightly' ? ` and ${evidence.periodTotals.length} full fortnights` : ''}. Change any suggestion before using it.</p>
      <details className="bc-help"><summary>Why these amounts?</summary><p>The everyday amount is the middle value (median) of covered periods, not a target to cut down to. Occasional spending stays included.</p>{evidence.labels.map((label, i) => <div className="bc-kv" key={label}><span>{label}</span><strong>{money(evidence.periodTotals[i])}</strong></div>)}<p>Observed range: {money(evidence.minimum ?? 0)}–{money(evidence.maximum ?? 0)}. This is history, not a predicted range. Transfers, card repayments, replaced rows and pending charges are not counted as expenses. Refunds and splits are counted once.</p><p>Income needs your confirmation. Bills use confirmed amounts and their own dates; upcoming costs and longer-term savings are editable example intentions. They are not inferred savings. Known pay dates: {evidence.payDates.map(shortDate).join(', ')}.</p><p>The original monthly bills fixture includes rent of $2,100 and $400 of other regular costs. Fortnightly charges follow actual dates. Review annual costs that may not appear in this history.</p></details>
      {evidence.variable && <p className="bc-warning">Spending varies a lot. Give the everyday amount another look; no high-spend period was removed.</p>}
      {fieldNames.map((key, i) => <AmountField key={key} id={`assist-${key}`} label={`${labels[i]} · AUD ${amountCadence(frequency)}`} value={values[key]} onChange={v => { setValues({ ...values, [key]: v }); setReviewed(false); setCurrentConfirmed(false) }} />)}
      {(changed !== 'no' || history.changed) && <label className="bc-check"><input type="checkbox" checked={currentConfirmed} onChange={e => setCurrentConfirmed(e.target.checked)} />I’ve updated the affected amounts for my current circumstances.</label>}
      <label className="bc-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I’ve checked income, bill dates, annual costs and the amounts I want to plan.</label>
      <div className={`bc-outcome ${baseFree < 0 ? 'bc-warning' : ''}`}><h3>{baseFree < 0 ? 'This plan needs' : 'Still to plan'} {money(Math.abs(baseFree))}</h3><p>No cost is quietly cut to make the plan balance. This is a draft, not a bank balance check.</p></div></>}
    {step === 2 && <><h3>A small change—or keep this starting point.</h3><p>Your draft is ready to review in setup. Trying a change is optional.</p>
      <label className="bc-check"><input type="checkbox" checked={tryChange} onChange={e => setTryChange(e.target.checked)} />Try one change</label>
      {tryChange && <><div className="bc-field"><label htmlFor="assist-source">Which spending area would you like to change?</label><select id="assist-source" value={source} onChange={e => { setSource(e.target.value); setProtectedSource(false) }}>{adjustedEvidence.source.map(s => <option key={s.id} value={s.id}>{s.name} · {money(Math.max(0, s.planned - (future ? 0 : s.spent)))} room</option>)}</select></div>
        <label className="bc-check"><input type="checkbox" checked={protectedSource} onChange={e => setProtectedSource(e.target.checked)} />This is spending I’m willing to reduce, not money needed for essentials.</label>
        <label className="bc-check"><input type="checkbox" checked={future} onChange={e => setFuture(e.target.checked)} />Try this from the next budget instead</label>
        <AmountField id="assist-change" label="Amount to redirect · AUD" value={amount} onChange={setAmount} hint="Default is $0. Recorded purchases cannot be undone by reducing a budget." />
        <div className="bc-field"><label htmlFor="assist-destination">What should this make room for?</label><select id="assist-destination" value={destination} onChange={e => { setDestination(e.target.value as 'goal' | 'unassigned'); setWithGoal(e.target.value === 'goal') }}><option value="unassigned">Leave it still to plan</option><option value="goal">Something I want to save for</option></select></div>
        {withGoal && <><details className="bc-help" open><summary>Your goal</summary><Action tone="link" onClick={() => { setName('Snowboard'); setTarget('900'); setOpening('300'); setContribution('100'); setNeededBy('') }}>Try the snowboard example</Action><div className="bc-field"><label htmlFor="assist-goal-name">What are you saving for?</label><input id="assist-goal-name" maxLength={60} value={name} onChange={e => setName(e.target.value)} /></div><AmountField id="assist-target" label="Estimated goal cost · AUD" value={target} onChange={setTarget} /><AmountField id="assist-opening" label="Already put aside for this goal · AUD" value={opening} onChange={setOpening} hint="Only include savings intended for this goal, not claimed elsewhere." /><AmountField id="assist-contribution" label={`Regular contribution before this change · AUD ${amountCadence(frequency)}`} value={contribution} onChange={setContribution} /><div className="bc-field"><label htmlFor="assist-deadline">Money needed by (optional)</label><input id="assist-deadline" type="date" min="2026-10-19" value={neededBy} onChange={e => setNeededBy(e.target.value)} /></div></details><p className="bc-hint">Snowboard amounts are an editable example, not a goal inferred from your history.</p></>}
      </>}
      {previewError && <p className="bc-warning" role="status">{previewError}</p>}
      {preview && goalValid && <><Comparison beforeLabel="Current draft" afterLabel="With this change" rows={[...(tryChange ? [{ label: `${adjustedEvidence.source.find(s => s.id === source)?.name} allowance`, before: preview.sourceBefore, after: preview.sourceAfter }] : []), { label: future ? 'Next everyday starting amount' : 'Everyday plan', before: draft.everyday, after: preview.everyday }, ...(goal ? [{ label: 'Planned goal contribution', before: goal.monthly, after: preview.goalAmount }] : []), { label: 'Still to plan', before: preview.freeBefore, after: preview.freeAfter }]} />
        {goal && <div className="bc-outcome"><h3>If you keep to these amounts</h3><p>Current draft: {outcome(projectionGoal, goal.monthly, frequency, anchor, projectionReady, from)}</p><p>With this change: {outcome(projectionGoal, preview.goalAmount, frequency, anchor, projectionReady, from)}</p>{future && <p>Starts {shortDate(period.end)}. The opening estimate includes this budget’s planned goal amount, not confirmed future savings.</p>}<p>Planned contributions are not savings already made. No money moves until you do it yourself. Estimates show at most 12 months, not a guarantee.</p></div>}
      </>}
      {!goalValid && <p className="bc-warning">Check the goal’s name, target, existing savings and contribution.</p>}
      {(baseFree < 0 || preview && preview.freeAfter < 0) && <label className="bc-check"><input type="checkbox" checked={acceptGap} onChange={e => setAcceptGap(e.target.checked)} />Keep this funding gap visible in my draft</label>}
      <p className="bc-hint">Use this draft replaces your setup amounts with the reviewed values—not your active budget. You’ll review it again before starting. {future ? 'The current plan keeps its amounts; only the next starting plan gets this change.' : 'This draft retains known current-period purchases.'}</p></>}
    {error && <p role="alert" className="bc-error">{error}</p>}
    <div className="bc-task-footer"><Action onClick={step ? () => { setError(''); setStep(step - 1) } : cancel}>{step ? 'Back' : 'Keep my amounts'}</Action>{evidence.eligible ? <Action tone="primary" onClick={step === 2 ? useDraft : next}>{step === 2 ? 'Use this draft' : 'Continue'}</Action> : <Action tone="primary" onClick={cancel}>Enter my own amounts</Action>}</div>
  </div>
}
