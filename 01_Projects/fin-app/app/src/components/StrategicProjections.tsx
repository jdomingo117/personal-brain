import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Tile from './Tile'
import HeroMetric from './HeroMetric'
import ProjectionChart from './ProjectionChart'
import PlanningTimeline from './PlanningTimeline'
import { Grid } from './Screen'
import SegmentedTabs from './SegmentedTabs'
import { fmt, type Account, type Txn } from '../data'
import { useData } from '../contexts/DataContext'
import { supabase } from '../lib/supabaseClient'
import PlanningGoalDialog from './PlanningGoalDialog'
import type { PlanningGoal } from '../lib/planning'
import type { ProjectionEvent } from '../lib/projections'
import { buildRecurring, upcomingCharges } from '../lib/recurring'
import { TODAY } from '../lib/period'
import { reviewCompletedMonth } from '../lib/planningReview'
import {
  buildProjection,
  buildProjectionBreakdown,
  currentValueFor,
  deriveProjectionBaseline,
  firstTargetPoint,
  isCashAccount,
  monthsBetween,
  requiredMonthlyAdjustment,
  type ProjectionMetric,
  type ProjectionPoint,
} from '../lib/projections'

type QuestionMode = 'byDate' | 'reachTarget'
type ScenarioAction = 'saveMore' | 'spendMore' | 'earnMore' | 'earnLess'

const SCENARIO_ACTIONS: Record<ScenarioAction, { label: string; sentence: string; direction: 1 | -1 }> = {
  saveMore: { label: 'Save more', sentence: 'Saving more', direction: 1 },
  spendMore: { label: 'Spend more', sentence: 'Spending more', direction: -1 },
  earnMore: { label: 'Earn more', sentence: 'Earning more', direction: 1 },
  earnLess: { label: 'Earn less', sentence: 'Earning less', direction: -1 },
}

const inputClass = 'min-h-[48px] w-full rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] font-semibold text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]'
const labelClass = 'field-label'

const futureDate = (months: number) => {
  const now = new Date()
  return `${now.getFullYear() + Math.floor((now.getMonth() + months) / 12)}-${String(((now.getMonth() + months) % 12) + 1).padStart(2, '0')}-01`
}

const dateLabel = (date: string) => new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const dollarsToCents = (value: string) => Math.round((Number(value.replace(/[^0-9.-]/g, '')) || 0) * 100)
const centsToInput = (value: number) => String(Math.round(value / 100))
const monthOrdinal = (date: string) => {
  const [year, month] = date.slice(0, 7).split('-').map(Number)
  return year * 12 + month
}

const describeTimingImpact = (baseline: ProjectionPoint | null, scenario: ProjectionPoint | null, delta: number | null) => {
  if (!baseline && scenario) return 'This change brings the goal within the 10-year planning horizon.'
  if (baseline && !scenario) return 'This change moves the goal beyond the 10-year planning horizon.'
  if (!baseline || !scenario || delta === null) return 'Neither trajectory reaches the goal within 10 years.'
  if (delta === 0) return 'The forecast goal month is unchanged.'
  const count = Math.abs(delta)
  return `The goal moves ${count} ${count === 1 ? 'month' : 'months'} ${delta < 0 ? 'sooner' : 'later'} than the baseline.`
}

function cashHistory(accounts: Account[], transactions: Txn[], current: number): ProjectionPoint[] {
  const cashIds = new Set(accounts.filter(isCashAccount).map((account) => account.id))
  const now = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (6 - index), 1)
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0)
    const futureMovement = transactions
      .filter((transaction) => cashIds.has(transaction.account_id) && !transaction.pending && transaction.date > monthEnd.toISOString().slice(0, 10))
      .reduce((sum, transaction) => sum + transaction.amount, 0)
    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      value: index === 6 ? current : current - futureMovement,
    }
  })
}

export default function StrategicProjections() {
  const { accounts, transactions, netWorthHistory, planningGoals, planningScenarios, planningEvents, recurrenceHints, recurrenceOverrides, refreshData } = useData()
  const [metric, setMetric] = useState<ProjectionMetric>('cash')
  const [mode, setMode] = useState<QuestionMode>('byDate')
  const [goalName, setGoalName] = useState('Cash reserve')
  const [targetInput, setTargetInput] = useState('100000')
  const [targetDate, setTargetDate] = useState(() => futureDate(24))
  const [annualReturn, setAnnualReturn] = useState('5')
  const [scenarioAction, setScenarioAction] = useState<ScenarioAction>('saveMore')
  const [scenarioAmount, setScenarioAmount] = useState('500')
  const [scenarioStartMode, setScenarioStartMode] = useState<'now' | 'date'>('now')
  const [scenarioStartDate, setScenarioStartDate] = useState(() => futureDate(3).slice(0, 7))
  const [showScenario, setShowScenario] = useState(true)
  const [showCalculation, setShowCalculation] = useState(false)
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [editingGoal, setEditingGoal] = useState<PlanningGoal | null | undefined>(undefined)
  const [undoEventId, setUndoEventId] = useState<string | null>(null)
  const [scenarioUndoEventId, setScenarioUndoEventId] = useState<string | null>(null)
  const [rebaselineUndoEventId, setRebaselineUndoEventId] = useState<string | null>(null)
  const [goalError, setGoalError] = useState('')
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)
  const [scenarioName, setScenarioName] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventAmount, setEventAmount] = useState('')
  const [eventCadence, setEventCadence] = useState<'once' | 'monthly'>('once')
  const [eventStart, setEventStart] = useState(() => futureDate(1))
  const [eventEnd, setEventEnd] = useState('')

  const selectedGoal = useMemo(
    () => planningGoals.find((goal) => goal.id === selectedGoalId) ?? null,
    [planningGoals, selectedGoalId],
  )
  const scopedAccounts = useMemo(
    () => selectedGoal ? accounts.filter((account) => selectedGoal.accountIds.includes(account.id)) : accounts,
    [accounts, selectedGoal],
  )
  const scopedTransactions = useMemo(
    () => selectedGoal ? transactions.filter((transaction) => selectedGoal.accountIds.includes(transaction.account_id)) : transactions,
    [transactions, selectedGoal],
  )
  const allGoalScenarios = useMemo(() => selectedGoal ? planningScenarios.filter((scenario) => scenario.goalId === selectedGoal.id) : [], [planningScenarios, selectedGoal])
  const goalScenarios = useMemo(() => allGoalScenarios.filter((scenario) => scenario.status === 'active'), [allGoalScenarios])
  const archivedScenarios = useMemo(() => allGoalScenarios.filter((scenario) => scenario.status === 'archived'), [allGoalScenarios])
  const selectedScenario = useMemo(() => allGoalScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? goalScenarios.find((scenario) => scenario.isBaseline) ?? null, [allGoalScenarios, goalScenarios, selectedScenarioId])
  const baselineScenario = useMemo(() => goalScenarios.find((scenario) => scenario.isBaseline) ?? null, [goalScenarios])
  const savedEvents = useMemo<ProjectionEvent[]>(() => selectedScenario ? planningEvents.filter((event) => event.scenarioId === selectedScenario.id).map((event) => ({ id: event.id, name: event.name, amountCents: event.amountCents, cadence: event.cadence, startDate: event.startDate, endDate: event.endDate })) : [], [planningEvents, selectedScenario])
  const baselineSavedEvents = useMemo<ProjectionEvent[]>(() => baselineScenario ? planningEvents.filter((event) => event.scenarioId === baselineScenario.id).map((event) => ({ id: event.id, name: event.name, amountCents: event.amountCents, cadence: event.cadence, startDate: event.startDate, endDate: event.endDate })) : [], [planningEvents, baselineScenario])

  const target = Math.max(0, dollarsToCents(targetInput))
  const datedMonths = monthsBetween(new Date(), targetDate)
  const horizonMonths = mode === 'byDate' ? datedMonths : 120
  const recurringSeries = useMemo(
    () => buildRecurring(scopedTransactions, scopedAccounts, TODAY, recurrenceHints, recurrenceOverrides).active,
    [scopedTransactions, scopedAccounts, recurrenceHints, recurrenceOverrides],
  )
  const recurringTransactionIds = useMemo(() => new Set(recurringSeries.flatMap((series) => series.charges.map((charge) => charge.transactionId).filter((id): id is string => !!id))), [recurringSeries])
  const allRecurringEvents = useMemo<ProjectionEvent[]>(() => {
    const to = new Date(); to.setMonth(to.getMonth() + horizonMonths + 1)
    const toDate = to.toISOString().slice(0, 10)
    return recurringSeries.flatMap((series) => upcomingCharges(series, TODAY, toDate).map((charge, index) => ({ id: `recurring:${series.id}:${index}`, name: series.label, amountCents: -charge.amount, cadence: 'once' as const, startDate: charge.date })))
  }, [selectedScenario, recurringSeries, horizonMonths])
  const recurringEvents = useMemo(() => selectedScenario?.includeRecurring ? allRecurringEvents : [], [selectedScenario, allRecurringEvents])
  const baselineRecurringEvents = useMemo(() => baselineScenario?.includeRecurring ? allRecurringEvents : [], [baselineScenario, allRecurringEvents])
  const baselineTransactions = useMemo(
    () => selectedScenario?.includeRecurring ? scopedTransactions.filter((transaction) => !recurringTransactionIds.has(transaction.id)) : scopedTransactions,
    [selectedScenario, scopedTransactions, recurringTransactionIds],
  )
  const baselineScenarioTransactions = useMemo(
    () => baselineScenario?.includeRecurring ? scopedTransactions.filter((transaction) => !recurringTransactionIds.has(transaction.id)) : scopedTransactions,
    [baselineScenario, scopedTransactions, recurringTransactionIds],
  )
  const currentValue = useMemo(() => currentValueFor(metric, scopedAccounts), [metric, scopedAccounts])
  const investmentBalance = useMemo(
    () => scopedAccounts.filter((account) => account.type === 'Invest').reduce((sum, account) => sum + account.balance, 0),
    [scopedAccounts],
  )
  const baseline = useMemo(
    () => deriveProjectionBaseline(metric, scopedAccounts, baselineTransactions),
    [metric, scopedAccounts, baselineTransactions],
  )
  const comparisonBaseline = useMemo(
    () => deriveProjectionBaseline(metric, scopedAccounts, baselineScenarioTransactions),
    [metric, scopedAccounts, baselineScenarioTransactions],
  )
  const inputs = useMemo(() => ({
    metric,
    currentValue,
    investmentBalance,
    monthlyFlow: baseline.monthlyFlow,
    monthlyInvestmentContribution: baseline.monthlyInvestmentContribution,
    annualReturnPct: metric === 'netWorth' ? (selectedScenario ? selectedScenario.annualReturnBps / 100 : Number(annualReturn) || 0) : 0,
    months: horizonMonths,
    events: [...savedEvents, ...recurringEvents],
  }), [metric, currentValue, investmentBalance, baseline, annualReturn, horizonMonths, savedEvents, recurringEvents, selectedScenario])
  const projection = useMemo(() => buildProjection(inputs), [inputs])
  const baselineInputs = useMemo(() => ({
    metric,
    currentValue,
    investmentBalance,
    monthlyFlow: comparisonBaseline.monthlyFlow,
    monthlyInvestmentContribution: comparisonBaseline.monthlyInvestmentContribution,
    annualReturnPct: metric === 'netWorth' ? (baselineScenario ? baselineScenario.annualReturnBps / 100 : Number(annualReturn) || 0) : 0,
    months: horizonMonths,
    events: [...baselineSavedEvents, ...baselineRecurringEvents],
  }), [metric, currentValue, investmentBalance, comparisonBaseline, baselineScenario, annualReturn, horizonMonths, baselineSavedEvents, baselineRecurringEvents])
  const savedBaselineProjection = useMemo(() => buildProjection(baselineInputs), [baselineInputs])
  const scenarioAmountCents = Math.abs(dollarsToCents(scenarioAmount))
  const scenarioAdjustment = scenarioAmountCents * SCENARIO_ACTIONS[scenarioAction].direction
  const scenarioStartMonth = scenarioStartMode === 'now' || !scenarioStartDate
    ? 1
    : monthsBetween(new Date(), `${scenarioStartDate}-01`)
  const scenario = useMemo(
    () => buildProjection({ ...inputs, monthlyAdjustment: scenarioAdjustment, adjustmentStartMonth: scenarioStartMonth }),
    [inputs, scenarioAdjustment, scenarioStartMonth],
  )
  const scenarioBreakdown = useMemo(
    () => buildProjectionBreakdown({ ...inputs, monthlyAdjustment: showScenario ? scenarioAdjustment : 0, adjustmentStartMonth: scenarioStartMonth }),
    [inputs, showScenario, scenarioAdjustment, scenarioStartMonth],
  )
  const monthReview = useMemo(() => reviewCompletedMonth({ metric, accounts: scopedAccounts, transactions: scopedTransactions, monthlyRunRate: baseline.monthlyFlow, events: [...savedEvents, ...recurringEvents], }), [metric, scopedAccounts, scopedTransactions, baseline.monthlyFlow, savedEvents, recurringEvents])
  const targetPoint = firstTargetPoint(projection, target)
  const chartProjection = mode === 'reachTarget' && targetPoint
    ? projection.slice(0, projection.indexOf(targetPoint) + 1)
    : projection
  const chartScenario = scenario.slice(0, chartProjection.length)
  const projectedValue = chartProjection.at(-1)?.value ?? currentValue
  const gap = projectedValue - target
  const required = mode === 'byDate' ? requiredMonthlyAdjustment(inputs, target) : 0
  const scenarioTarget = firstTargetPoint(scenario, target)
  const calculationMonths = Math.max(chartProjection.length - 1, 0)
  const projectedNetMovement = baseline.monthlyFlow * calculationMonths
  const projectedInvestmentGrowth = metric === 'netWorth'
    ? projectedValue - currentValue - projectedNetMovement
    : 0
  const scenarioValueAtEndpoint = scenario[Math.min(calculationMonths, scenario.length - 1)]?.value ?? projectedValue
  const scenarioDeltaAtEndpoint = scenarioValueAtEndpoint - projectedValue
  const scenarioGap = scenarioValueAtEndpoint - target
  const targetTimingDelta = targetPoint && scenarioTarget
    ? monthOrdinal(scenarioTarget.date) - monthOrdinal(targetPoint.date)
    : null
  const isSavedComparison = !!selectedScenario && !!baselineScenario && selectedScenario.id !== baselineScenario.id
  const savedBaselineTarget = firstTargetPoint(savedBaselineProjection, target)
  const savedComparisonDelta = projectedValue - (savedBaselineProjection[Math.min(calculationMonths, savedBaselineProjection.length - 1)]?.value ?? currentValue)
  const savedComparisonTimingDelta = targetPoint && savedBaselineTarget
    ? monthOrdinal(targetPoint.date) - monthOrdinal(savedBaselineTarget.date)
    : null
  const scenarioStartLabel = scenarioStartMode === 'now' ? 'now' : dateLabel(scenarioStartDate)
  const scenarioSentence = `${SCENARIO_ACTIONS[scenarioAction].sentence} ${fmt(scenarioAmountCents)} per month`

  const history = useMemo(() => {
    if (metric === 'cash') return cashHistory(scopedAccounts, scopedTransactions, currentValue)
    // net_worth_monthly is tenant-wide. Do not present it as account-scoped
    // history for a goal that deliberately includes only some accounts.
    if (selectedGoal && selectedGoal.accountIds.length !== accounts.length) {
      return [{ date: new Date().toISOString().slice(0, 7), value: currentValue }]
    }
    const points = netWorthHistory.slice(-7).map((point) => ({ date: point.month.slice(0, 7), value: point.value }))
    const currentMonth = new Date().toISOString().slice(0, 7)
    if (!points.length || points.at(-1)?.date !== currentMonth) points.push({ date: currentMonth, value: currentValue })
    else points[points.length - 1] = { date: currentMonth, value: currentValue }
    return points
  }, [metric, accounts, scopedAccounts, scopedTransactions, currentValue, netWorthHistory, selectedGoal])

  useEffect(() => {
    if (selectedGoalId && !selectedGoal) setSelectedGoalId(null)
    if (!selectedGoal && planningGoals.length && !selectedGoalId) {
      setSelectedGoalId(planningGoals.find((goal) => goal.status === 'active')?.id ?? planningGoals[0].id)
    }
  }, [planningGoals, selectedGoal, selectedGoalId])
  useEffect(() => {
    if (selectedGoal) {
      setGoalName(selectedGoal.name); setMetric(selectedGoal.metric)
      setTargetInput(centsToInput(selectedGoal.targetCents)); setTargetDate(selectedGoal.targetDate ?? futureDate(24))
    } else setGoalName(metric === 'cash' ? 'Cash reserve' : 'Net worth milestone')
  }, [selectedGoal])
  useEffect(() => {
    if (!selectedScenario) return
    setScenarioName(selectedScenario.name)
    setAnnualReturn(String(selectedScenario.annualReturnBps / 100))
  }, [selectedScenario])

  const undoGoalChange = async () => {
    if (!undoEventId) return
    setGoalError('')
    const { error } = await supabase.functions.invoke('manage-planning', { body: { action: 'undo', event_id: undoEventId } })
    if (error) { setGoalError(error.message || 'Could not undo this planning change.'); return }
    setUndoEventId(null); await refreshData()
  }
  const saveScenario = async (id: string | null, name: string, includeRecurring = false, status: 'active' | 'archived' = 'active') => {
    if (!selectedGoal) return
    const { data, error } = await supabase.functions.invoke('manage-planning', { body: { action: 'save_scenario', goal_id: selectedGoal.id, scenario_id: id, name, annual_return_bps: Math.round((Number(annualReturn) || 0) * 100), include_recurring: includeRecurring, status } })
    if (error) { setGoalError(error.message || 'Could not save scenario.'); return }
    if (data?.scenario_id) setSelectedScenarioId(data.scenario_id)
    if (data?.event_id) setScenarioUndoEventId(data.event_id)
    await refreshData()
  }
  const saveEvent = async () => {
    if (!selectedScenario) { setGoalError('Choose a saved scenario before adding a planned event.'); return }
    const amount = dollarsToCents(eventAmount)
    if (!eventName.trim() || !amount || !eventStart) { setGoalError('Give the event a name, non-zero amount and start date.'); return }
    const { data, error } = await supabase.functions.invoke('manage-planning', { body: { action: 'save_event', scenario_id: selectedScenario.id, event_id: null, name: eventName.trim(), amount_cents: amount, cadence: eventCadence, start_date: eventStart, end_date: eventCadence === 'monthly' && eventEnd ? eventEnd : null } })
    if (error) { setGoalError(error.message || 'Could not save this planned event.'); return }
    if (data?.audit_event_id) setScenarioUndoEventId(data.audit_event_id)
    setEventName(''); setEventAmount(''); setEventEnd(''); setGoalError(''); await refreshData()
  }
  const duplicateScenario = async () => {
    if (!selectedScenario) return
    const { data, error } = await supabase.functions.invoke('manage-planning', { body: { action: 'duplicate_scenario', scenario_id: selectedScenario.id, name: `${selectedScenario.name} copy`.slice(0, 120) } })
    if (error) { setGoalError(error.message || 'Could not duplicate this scenario.'); return }
    if (data?.scenario_id) setSelectedScenarioId(data.scenario_id)
    if (data?.event_id) setScenarioUndoEventId(data.event_id)
    await refreshData()
  }
  const undoScenarioChange = async () => {
    if (!scenarioUndoEventId) return
    const { error } = await supabase.functions.invoke('manage-planning', { body: { action: 'undo', scope: 'scenario', event_id: scenarioUndoEventId } })
    if (error) { setGoalError(error.message || 'Could not undo this scenario change.'); return }
    setScenarioUndoEventId(null); await refreshData()
  }
  const rebaseline = async () => {
    if (!baselineScenario) return
    const { data, error } = await supabase.functions.invoke('manage-planning', { body: { action: 'rebaseline', scenario_id: baselineScenario.id, effective_month: `${monthReview.month}-01` } })
    if (error) { setGoalError(error.message || 'Could not rebaseline this plan.'); return }
    if (data?.event_id) setRebaselineUndoEventId(data.event_id)
    if (data?.scenario_id) setSelectedScenarioId(data.scenario_id)
    await refreshData()
  }
  const undoRebaseline = async () => {
    if (!rebaselineUndoEventId) return
    const { error } = await supabase.functions.invoke('manage-planning', { body: { action: 'undo', scope: 'rebaseline', event_id: rebaselineUndoEventId } })
    if (error) { setGoalError(error.message || 'Could not undo this rebaseline.'); return }
    setRebaselineUndoEventId(null); await refreshData()
  }

  const noHistory = baseline.monthsUsed === 0
  const resultTone = mode === 'byDate' ? (gap >= 0 ? 'pos' : 'neg') : targetPoint ? 'pos' : 'neg'

  return (
    <Grid>
      <Tile span={3} className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Saved planning goals</p><p className="mt-1 text-[13px] text-muted">Goals scope the calculation; they never alter account or ledger data.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            {planningGoals.length > 0 && <select aria-label="Selected planning goal" value={selectedGoalId ?? ''} onChange={(event) => setSelectedGoalId(event.target.value || null)} className="min-h-10 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[13px] font-semibold text-ink"><option value="">Temporary calculator</option>{planningGoals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}{goal.status === 'active' ? '' : ` · ${goal.status}`}</option>)}</select>}
            {selectedGoal && <button type="button" onClick={() => setEditingGoal(selectedGoal)} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink">Edit goal</button>}
            <button type="button" onClick={() => setEditingGoal(null)} className="min-h-10 rounded-lg bg-ink px-3 text-[13px] font-semibold text-surface">{planningGoals.length ? 'New goal' : 'Create your first goal'}</button>
          </div>
        </div>
        {selectedGoal && <div className="border-t border-[var(--hair-soft)] bg-[var(--hair-soft)] px-4 py-2.5 text-[12px] text-muted">{selectedGoal.status === 'active' ? 'Active' : selectedGoal.status} · {scopedAccounts.length} included account{scopedAccounts.length === 1 ? '' : 's'}{metric === 'netWorth' && selectedGoal.accountIds.length !== accounts.length ? ' · historical net-worth line is unavailable for a partial account scope' : ''}</div>}
        {undoEventId && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hair-soft)] px-4 py-2.5 text-[12px] text-pos" role="status"><span>Planning goal saved.</span><button type="button" onClick={undoGoalChange} className="font-bold text-accent-ink hover:underline">Undo</button></div>}
        {goalError && <p className="border-t border-neg/20 bg-neg/5 px-4 py-2.5 text-[12px] text-neg" role="alert">{goalError}</p>}
      </Tile>
      {selectedGoal && <Tile span={3}>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Saved scenario</p><p className="mt-1 text-[13px] text-muted">Events are planning inputs only; they never create bank transactions.</p></div><div className="flex flex-wrap gap-2"><select value={selectedScenario?.status === 'active' ? selectedScenario.id : ''} onChange={(event) => setSelectedScenarioId(event.target.value || null)} aria-label="Active scenario" className="min-h-10 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[13px] font-semibold text-ink">{goalScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}{scenario.isBaseline ? ' · baseline' : ''}</option>)}</select>{archivedScenarios.length > 0 && <select value={selectedScenario?.status === 'archived' ? selectedScenario.id : ''} onChange={(event) => event.target.value && setSelectedScenarioId(event.target.value)} aria-label="Archived scenario" className="min-h-10 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[13px] font-semibold text-ink"><option value="">Archived scenarios</option>{archivedScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select>}<button type="button" onClick={() => saveScenario(null, 'Comparison scenario')} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink">New scenario</button></div></div>
        {selectedScenario && <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]"><label className="text-[13px] font-semibold text-ink2">Scenario name<input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} className={inputClass} /></label><label className="text-[13px] font-semibold text-ink2">Annual return (net worth)<input value={annualReturn} onChange={(event) => setAnnualReturn(event.target.value)} inputMode="decimal" className={inputClass} /></label><label className="flex min-h-10 items-center gap-2 pt-5 text-[13px] font-semibold text-ink2"><input type="checkbox" disabled={selectedScenario.status === 'archived'} checked={selectedScenario.includeRecurring} onChange={(event) => saveScenario(selectedScenario.id, scenarioName, event.target.checked, selectedScenario.status)} className="h-4 w-4 accent-[var(--color-accent)] disabled:opacity-50" />Include recurring commitments</label><div className="flex flex-wrap gap-2 self-end"><button type="button" onClick={duplicateScenario} disabled={selectedScenario.status === 'archived'} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink disabled:opacity-50">Duplicate</button><button type="button" onClick={() => saveScenario(selectedScenario.id, scenarioName, selectedScenario.includeRecurring, selectedScenario.status)} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink">Save</button>{selectedScenario.isBaseline ? null : selectedScenario.status === 'active' ? <button type="button" onClick={() => saveScenario(selectedScenario.id, scenarioName, selectedScenario.includeRecurring, 'archived')} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink">Archive</button> : <button type="button" onClick={() => saveScenario(selectedScenario.id, scenarioName, selectedScenario.includeRecurring, 'active')} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink">Restore</button>}</div></div>}
        {scenarioUndoEventId && <div className="mt-3 flex items-center justify-between rounded-lg bg-pos/5 px-3 py-2 text-[12px] text-pos" role="status"><span>Scenario saved.</span><button type="button" onClick={undoScenarioChange} className="font-bold text-accent-ink hover:underline">Undo</button></div>}
        {selectedScenario && <div className="mt-4 border-t border-[var(--hair-soft)] pt-4">{selectedScenario.status === 'active' ? <><p className="text-[13px] font-semibold text-ink2">Add planned event</p><div className="mt-2 grid gap-2 md:grid-cols-6"><input value={eventName} onChange={(event) => setEventName(event.target.value)} placeholder="Holiday" aria-label="Event name" className={inputClass} /><input value={eventAmount} onChange={(event) => setEventAmount(event.target.value)} placeholder="-2500.00" aria-label="Event amount" inputMode="decimal" className={inputClass} /><select value={eventCadence} onChange={(event) => setEventCadence(event.target.value as 'once' | 'monthly')} aria-label="Event cadence" className={inputClass}><option value="once">One-off</option><option value="monthly">Monthly</option></select><input type="date" value={eventStart} aria-label="Event start date" onChange={(event) => setEventStart(event.target.value)} className={inputClass} />{eventCadence === 'monthly' ? <input type="date" value={eventEnd} min={eventStart} aria-label="Event end date" onChange={(event) => setEventEnd(event.target.value)} className={inputClass} /> : <div aria-hidden="true" /> }<button type="button" onClick={saveEvent} className="mt-1.5 min-h-10 rounded-lg bg-ink px-3 text-[13px] font-semibold text-surface">Add event</button></div></> : <p className="text-[13px] text-muted">Archived scenario — restore it to change its assumptions or planned events.</p>}{savedEvents.length > 0 && <div className="mt-3 text-[12px] text-muted">{savedEvents.map((event) => <span key={event.id} className="mr-3 inline-block">{event.name} · {fmt(event.amountCents)} · {event.cadence}{event.endDate ? ` through ${dateLabel(event.endDate)}` : ''}</span>)}</div>}</div>}
      </Tile>}
      <Tile span={3} className="!p-0 overflow-hidden">
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
          <div>
            <div className="mb-2 block text-[12.5px] font-bold uppercase tracking-[0.1em] text-muted">Projection question</div>
            <SegmentedTabs
              tabs={[{ id: 'byDate', label: 'Value by date' }, { id: 'reachTarget', label: 'Date for value' }]}
              active={mode}
              onChange={(value) => setMode(value as QuestionMode)}
              layoutId="projection-question"
            />
          </div>
          <div className="hidden pb-2 text-[19px] font-semibold text-faint lg:block">for</div>
          <div>
            <div className="mb-2 block text-[12.5px] font-bold uppercase tracking-[0.1em] text-muted">Measure</div>
            <SegmentedTabs
              tabs={[{ id: 'cash', label: 'Cash holdings' }, { id: 'netWorth', label: 'Net worth' }]}
              active={metric}
              onChange={(value) => { setSelectedGoalId(null); setMetric(value as ProjectionMetric) }}
              layoutId="projection-metric"
            />
          </div>
        </div>
        <div className="border-t border-[var(--hair-soft)] bg-[var(--hair-soft)] px-5 py-4 text-[15px] leading-7 text-ink2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {mode === 'byDate'
                ? <>At the current trajectory, <strong>{metric === 'cash' ? 'cash holdings' : 'net worth'}</strong> are projected to be <strong className="text-ink">{fmt(projectedValue)}</strong> by <strong>{dateLabel(targetDate)}</strong>.</>
                : targetPoint
                  ? <>At the current trajectory, <strong>{goalName || 'this goal'}</strong> reaches <strong className="text-ink">{fmt(target)}</strong> in <strong>{dateLabel(targetPoint.date)}</strong>.</>
                  : <>The current trajectory does not reach <strong className="text-ink">{fmt(target)}</strong> within the 10-year planning horizon.</>}
            </div>
            <button
              type="button"
              aria-expanded={showCalculation}
              aria-controls="projection-calculation"
              onClick={() => setShowCalculation((shown) => !shown)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[12.5px] font-bold text-accent-ink outline-none transition hover:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
            >
              {showCalculation ? 'Hide calculation' : 'Show calculation'}
              <svg className={`h-3.5 w-3.5 transition-transform ${showCalculation ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
            </button>
          </div>
          {showCalculation && (
            <CalculationBreakdown
              metric={metric}
              currentValue={currentValue}
              projectedValue={projectedValue}
              monthlyFlow={baseline.monthlyFlow}
              months={calculationMonths}
              investmentGrowth={projectedInvestmentGrowth}
              investmentBalance={investmentBalance}
              investmentContribution={baseline.monthlyInvestmentContribution}
              annualReturn={Number(annualReturn) || 0}
              historyMonths={baseline.monthsUsed}
              historyFrom={baseline.fromMonth}
              historyTo={baseline.toMonth}
              scenarioAdjustment={showScenario ? scenarioAdjustment : null}
              scenarioValue={scenarioValueAtEndpoint}
              scenarioLabel={scenarioSentence}
              scenarioStartLabel={scenarioStartLabel}
              scenarioActiveMonths={Math.max(0, calculationMonths - scenarioStartMonth + 1)}
            />
          )}
        </div>
      </Tile>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
        <HeroMetric label={`Current ${metric === 'cash' ? 'cash' : 'net worth'}`} value={fmt(currentValue)} sub={metric === 'cash' ? 'Liquid + savings accounts' : 'Assets less liabilities'} />
        <HeroMetric label={mode === 'byDate' ? 'Projected value' : 'Forecast goal date'} value={mode === 'byDate' ? fmt(projectedValue) : targetPoint ? dateLabel(targetPoint.date) : 'Beyond 10 years'} sub={mode === 'byDate' ? dateLabel(targetDate) : `${fmt(target)} target`} tone={resultTone} valueClass={mode === 'reachTarget' ? 'text-[21px]' : ''} />
        <HeroMetric label={mode === 'byDate' ? (gap >= 0 ? 'Projected headroom' : 'Projected shortfall') : 'Monthly trajectory'} value={mode === 'byDate' ? fmt(Math.abs(gap)) : fmt(baseline.monthlyFlow)} sub={mode === 'byDate' ? `against ${fmt(target)} goal` : `${baseline.monthsUsed} complete months`} tone={resultTone} />
        <HeroMetric label={mode === 'byDate' ? 'Additional saving needed' : 'What-if goal date'} value={mode === 'byDate' ? (required ? `${fmt(required)}/mo` : '$0/mo') : !showScenario ? 'Off' : scenarioTarget ? dateLabel(scenarioTarget.date) : 'Beyond 10 years'} sub={mode === 'byDate' ? (required ? 'to close the projected gap' : 'baseline is already on track') : showScenario ? scenarioSentence : 'comparison is off'} tone={mode === 'byDate' && required ? 'neg' : 'pos'} valueClass={mode === 'reachTarget' ? 'text-[21px]' : ''} />
      </div>

      <Tile title="Wealth trajectory" tag={`${baseline.monthsUsed || 0}-month baseline`} span={2} className="flex min-h-[500px] flex-col">
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-semibold text-muted">
          <Legend color="var(--color-ink2)" label="Actual" />
          <Legend color="var(--color-accent)" label="Baseline" dashed />
          {(isSavedComparison || showScenario) && <Legend color="var(--color-ink2)" label={isSavedComparison ? (selectedScenario?.name ?? 'Comparison scenario') : `${SCENARIO_ACTIONS[scenarioAction].label} · ${fmt(scenarioAmountCents)}/mo`} dashed />}
          <Legend color="var(--color-warn)" label="Goal" dashed />
        </div>
        <ProjectionChart history={history} baseline={isSavedComparison ? savedBaselineProjection.slice(0, chartProjection.length) : chartProjection} scenario={isSavedComparison ? chartProjection : showScenario ? chartScenario : undefined} target={target} />
        <ForecastReadout
          baselineMovement={baseline.monthlyFlow}
          historyMonths={baseline.monthsUsed}
          projectedGap={gap}
          target={target}
          targetDate={targetDate}
          mode={mode}
          scenarioVisible={isSavedComparison || showScenario}
          scenarioDelta={isSavedComparison ? savedComparisonDelta : scenarioDeltaAtEndpoint}
          targetTimingDelta={isSavedComparison ? savedComparisonTimingDelta : targetTimingDelta}
        />
      </Tile>

      <Tile title="Goal & what-if" tag="simulation only" className="min-h-[500px]">
        <div className="space-y-7">
          <section aria-labelledby="goal-assumptions-heading">
            <h3 id="goal-assumptions-heading" className="micro text-muted">Goal assumptions</h3>
            <div className="mt-4 space-y-5">
          <label><span className={labelClass}>Goal name</span><input className={inputClass} value={goalName} readOnly={!!selectedGoal} onChange={(event) => setGoalName(event.target.value)} /></label>
          <label><span className={labelClass}>Target amount</span><div className="relative"><span className="absolute left-3 top-2.5 text-[14px] font-semibold text-muted">$</span><input className={`${inputClass} pl-7 tabular-nums`} inputMode="decimal" value={targetInput} readOnly={!!selectedGoal} onChange={(event) => setTargetInput(event.target.value)} /></div></label>
          {mode === 'byDate' && <label><span className={labelClass}>Target date</span><input type="date" min={futureDate(1)} className={inputClass} value={targetDate} disabled={!!selectedGoal} onChange={(event) => setTargetDate(event.target.value)} /></label>}
          {metric === 'netWorth' && <label><span className={labelClass}>Annual investment return</span><div className="relative"><input className={`${inputClass} pr-8 tabular-nums`} inputMode="decimal" value={annualReturn} onChange={(event) => setAnnualReturn(event.target.value)} /><span className="absolute right-3 top-2.5 text-[13px] font-semibold text-muted">%</span></div></label>}
            </div>
          </section>
          <section aria-labelledby="what-if-heading" className="border-t border-[var(--hair-soft)] pt-7">
            <label className="flex items-center justify-between gap-3">
              <span><span id="what-if-heading" className="control-label block">Optional what-if</span><span className="mt-1.5 block body-copy">Compare a change without altering your accounts or saved baseline.</span></span>
              <input type="checkbox" checked={showScenario} onChange={(event) => setShowScenario(event.target.checked)} className="h-[18px] w-[18px] accent-[var(--color-accent)]" />
            </label>
            {showScenario && (
              <div className="mt-6 space-y-6">
                <fieldset>
                  <legend className={labelClass}>I expect to</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(SCENARIO_ACTIONS) as [ScenarioAction, (typeof SCENARIO_ACTIONS)[ScenarioAction]][]).map(([id, action]) => {
                      const active = scenarioAction === id
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setScenarioAction(id)}
                          className={`min-h-12 rounded-lg border px-3 text-[14px] font-bold outline-none transition focus:ring-4 focus:ring-[var(--accent-wash)] ${active ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] bg-[var(--input-bg)] text-ink2 hover:border-accent'}`}
                        >
                          {action.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                <label>
                  <span className={labelClass}>Amount each month</span>
                  <div className="relative"><span className="absolute left-3.5 top-3 text-[14px] font-semibold text-muted">$</span><input aria-label="What-if amount each month" className={`${inputClass} pl-8 pr-20 tabular-nums`} inputMode="decimal" value={scenarioAmount} onChange={(event) => setScenarioAmount(event.target.value.replace('-', ''))} /><span className="absolute right-3.5 top-3.5 text-[12px] font-semibold text-muted">/ month</span></div>
                </label>
                <fieldset>
                  <legend className={labelClass}>Starting</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={scenarioStartMode === 'now'} onClick={() => setScenarioStartMode('now')} className={`min-h-12 rounded-lg border px-3 text-[14px] font-bold outline-none transition focus:ring-4 focus:ring-[var(--accent-wash)] ${scenarioStartMode === 'now' ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] bg-[var(--input-bg)] text-ink2'}`}>Now</button>
                    <button type="button" aria-pressed={scenarioStartMode === 'date'} onClick={() => setScenarioStartMode('date')} className={`min-h-12 rounded-lg border px-3 text-[14px] font-bold outline-none transition focus:ring-4 focus:ring-[var(--accent-wash)] ${scenarioStartMode === 'date' ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] bg-[var(--input-bg)] text-ink2'}`}>Choose month</button>
                  </div>
                  {scenarioStartMode === 'date' && <input aria-label="What-if starting month" type="month" min={futureDate(1).slice(0, 7)} className={`${inputClass} mt-2`} value={scenarioStartDate} onChange={(event) => setScenarioStartDate(event.target.value)} />}
                </fieldset>

                  <div className="outcome-panel">
                  <div className="micro text-muted">What changes</div>
                  {mode === 'byDate' ? (
                    <>
                      <div className="mt-1.5 text-[19px] font-bold tabular-nums text-ink">
                        {fmt(scenarioValueAtEndpoint)}
                        <span className={`ml-2 text-[13px] ${scenarioDeltaAtEndpoint >= 0 ? 'text-pos' : 'text-neg'}`}>{scenarioDeltaAtEndpoint >= 0 ? '+' : '−'}{fmt(Math.abs(scenarioDeltaAtEndpoint))}</span>
                      </div>
                      <div className="mt-2 text-[15px] leading-6 text-muted">
                        {scenarioGap >= 0 ? `${fmt(scenarioGap)} headroom` : `${fmt(Math.abs(scenarioGap))} shortfall`} against the {fmt(target)} goal by {dateLabel(targetDate)}.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-1.5 text-[17px] font-bold text-ink">{scenarioTarget ? dateLabel(scenarioTarget.date) : 'Beyond 10 years'}</div>
                      <div className="mt-2 text-[15px] leading-6 text-muted">
                        {describeTimingImpact(targetPoint, scenarioTarget, targetTimingDelta)}
                      </div>
                    </>
                  )}
                  <div className="mt-4 border-t border-[var(--hair-soft)] pt-3.5 text-[14px] leading-6 text-muted">
                    {scenarioSentence}, starting {scenarioStartLabel}. Comparison only—your accounts and baseline are unchanged.
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </Tile>

      <Tile title="How this forecast works" tag="transparent assumptions" span={3}>
        {noHistory ? (
          <div className="rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4 text-[13px] leading-relaxed text-muted">
            There are no complete months of ledger history yet. The forecast holds the current balance flat until enough history is available or a comparison adjustment is entered.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Assumption label="History window" value={`${baseline.monthsUsed} complete months`} detail={`${baseline.fromMonth ? dateLabel(baseline.fromMonth) : '—'} – ${baseline.toMonth ? dateLabel(baseline.toMonth) : '—'}`} />
            <Assumption label="Baseline movement" value={`${fmt(baseline.monthlyFlow)} / month`} detail={metric === 'cash' ? 'Settled cash flow; cash-to-cash transfers net to zero' : 'Average settled flow; transfers excluded'} />
            <Assumption label="Accounts included" value={metric === 'cash' ? `${scopedAccounts.filter(isCashAccount).length} cash accounts` : `${scopedAccounts.length} total accounts`} detail={selectedGoal ? `Scoped by ${selectedGoal.name}` : metric === 'cash' ? 'Liquid and savings only' : 'Investment purchases treated as asset transfers'} />
            <Assumption label="Growth assumption" value={metric === 'netWorth' ? `${Number(annualReturn) || 0}% annually` : 'No cash interest'} detail={metric === 'netWorth' ? `Applied to ${fmt(investmentBalance)} invested` : 'Conservative Version 1 baseline'} />
          </div>
        )}
        <p className="mt-5 border-t border-[var(--hair-soft)] pt-4 text-[13px] leading-relaxed text-muted">
          This is a planning estimate, not a promise. It extends the observed monthly average and the saved inputs above; it does not yet model inflation, tax, salary changes, or debt schedules.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="status">
          {noHistory && <PlanningWarning>No completed ledger history is available, so the observed run rate is zero.</PlanningWarning>}
          {selectedGoal && metric === 'netWorth' && selectedGoal.accountIds.length !== accounts.length && <PlanningWarning>This goal excludes account activity; its historical net-worth line is intentionally unavailable.</PlanningWarning>}
          {!targetDate && <PlanningWarning>Choose a target date to assess a dated goal.</PlanningWarning>}
          {(projection.at(-1)?.value ?? 0) < 0 && <PlanningWarning>The forecast becomes negative inside this planning horizon.</PlanningWarning>}
          {mode === 'reachTarget' && !targetPoint && <PlanningWarning>The target is outside the ten-year planning horizon at the current trajectory.</PlanningWarning>}
          {selectedScenario?.includeRecurring && <PlanningWarning>Recurring commitments are projected from active confirmed schedules and may change when those schedules change.</PlanningWarning>}
        </div>
      </Tile>
      <Tile title="Month-by-month forecast" tag="accessible table" span={3}>
        <PlanningTimeline months={scenarioBreakdown} />
      </Tile>
      {selectedGoal && <Tile title="Monthly planning review" tag={`${dateLabel(monthReview.month)} settled activity`} span={3}>
        <p className="text-[13px] leading-5 text-muted">This review uses only the last completed month, scoped to this goal’s accounts. It never treats the current partial month as final. Current baseline: <strong className="text-ink">{baselineScenario?.name ?? 'temporary plan'}</strong>.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Assumption label="Actual movement" value={fmt(monthReview.actualMovement)} detail={`${fmt(monthReview.observedIncome)} income · ${fmt(monthReview.observedSpend)} spend`} />
          <Assumption label="Planned movement" value={fmt(monthReview.expectedMovement)} detail={`${fmt(baseline.monthlyFlow)} observed run rate${monthReview.plannedMovement ? ` · ${fmt(monthReview.plannedMovement)} planned` : ''}`} />
          <Assumption label="Variance" value={`${monthReview.variance >= 0 ? '+' : '−'}${fmt(Math.abs(monthReview.variance))}`} detail="Actual less the saved plan" />
          <Assumption label="Uncategorised residual" value={fmt(monthReview.uncategorisedResidual)} detail="Settled rows without a category" />
        </div>
        <div className="mt-4 grid gap-2 border-t border-[var(--hair-soft)] pt-4 text-[12px] text-muted sm:grid-cols-2 lg:grid-cols-4"><span>Observed vs run rate: {fmt(monthReview.observedRunRateDifference)}</span><span>Planned-event difference: {fmt(monthReview.plannedEventDifference)}</span><span>Recurring timing: {fmt(monthReview.recurringTimingDifference)}</span><span>Uncategorised residual: {fmt(monthReview.uncategorisedResidual)}</span></div>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setGoalError('Plan retained. No assumptions or history were changed.')} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink">Keep plan</button><button type="button" onClick={rebaseline} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink">Rebaseline from current history</button><button type="button" onClick={duplicateScenario} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[13px] font-semibold text-ink">Create scenario from actual</button></div>
        {rebaselineUndoEventId && <div className="mt-3 flex items-center justify-between rounded-lg bg-pos/5 px-3 py-2 text-[12px] text-pos" role="status"><span>New baseline version created from current history.</span><button type="button" onClick={undoRebaseline} className="font-bold text-accent-ink hover:underline">Undo</button></div>}
      </Tile>}
      {editingGoal !== undefined && <PlanningGoalDialog goal={editingGoal} accounts={accounts} onClose={() => setEditingGoal(undefined)} onChanged={refreshData} onSaved={(eventId) => { setUndoEventId(eventId); setGoalError('') }} />}
    </Grid>
  )
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-2"><span className="w-5 border-t-[3px]" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />{label}</span>
}

function ForecastReadout({
  baselineMovement,
  historyMonths,
  projectedGap,
  target,
  targetDate,
  mode,
  scenarioVisible,
  scenarioDelta,
  targetTimingDelta,
}: {
  baselineMovement: number
  historyMonths: number
  projectedGap: number
  target: number
  targetDate: string
  mode: QuestionMode
  scenarioVisible: boolean
  scenarioDelta: number
  targetTimingDelta: number | null
}) {
  const onTrack = projectedGap >= 0
  const timing = targetTimingDelta === null
    ? null
    : targetTimingDelta === 0
      ? 'The scenario leaves the forecast goal month unchanged.'
      : `The scenario reaches the goal ${Math.abs(targetTimingDelta)} ${Math.abs(targetTimingDelta) === 1 ? 'month' : 'months'} ${targetTimingDelta < 0 ? 'sooner' : 'later'}.`

  return (
    <section aria-label="Forecast readout" className="mt-5 shrink-0 grid border-t border-[var(--hair-soft)] pt-4 sm:grid-cols-3">
      <ForecastInsight
        label="Baseline movement"
        value={`${fmt(baselineMovement)} / month`}
        detail={`Observed across ${historyMonths || 'no'} complete ${historyMonths === 1 ? 'month' : 'months'} of settled history.`}
        tone={baselineMovement >= 0 ? 'text-pos' : 'text-neg'}
      />
      <ForecastInsight
        label={onTrack ? 'Goal buffer' : 'Goal shortfall'}
        value={`${fmt(Math.abs(projectedGap))} ${onTrack ? 'ahead' : 'short'}`}
        detail={mode === 'byDate' ? `Against the ${fmt(target)} goal by ${dateLabel(targetDate)}.` : 'At the current forecast endpoint.'}
        tone={onTrack ? 'text-pos' : 'text-neg'}
      />
      <ForecastInsight
        label="Scenario effect"
        value={!scenarioVisible ? 'Scenario off' : mode === 'byDate' ? `${scenarioDelta >= 0 ? '+' : '−'}${fmt(Math.abs(scenarioDelta))}` : timing ? timing.split('.').at(0) ?? 'Compared with baseline' : 'Compared with baseline'}
        detail={!scenarioVisible ? 'Turn on a what-if change to compare it with the baseline.' : mode === 'byDate' ? 'Difference at the forecast endpoint versus the baseline.' : timing ?? 'Compare the scenario with the baseline trajectory.'}
        tone={!scenarioVisible ? 'text-muted' : scenarioDelta >= 0 || (targetTimingDelta !== null && targetTimingDelta < 0) ? 'text-pos' : 'text-neg'}
      />
    </section>
  )
}

function ForecastInsight({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className="border-[var(--hair-soft)] px-0 py-2.5 first:pt-0 sm:border-r sm:px-4 sm:py-0 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
      <div className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className={`mt-1.5 text-[16px] font-bold tabular-nums ${tone}`}>{value}</div>
      <p className="mt-2 text-[14px] leading-6 text-muted">{detail}</p>
    </div>
  )
}

function Assumption({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><div className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted">{label}</div><div className="mt-2 text-[16px] font-bold tabular-nums text-ink">{value}</div><div className="mt-2 text-[14px] leading-6 text-muted">{detail}</div></div>
}

function PlanningWarning({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-[14px] leading-6 text-ink2">{children}</p>
}

function CalculationBreakdown({
  metric,
  currentValue,
  projectedValue,
  monthlyFlow,
  months,
  investmentGrowth,
  investmentBalance,
  investmentContribution,
  annualReturn,
  historyMonths,
  historyFrom,
  historyTo,
  scenarioAdjustment,
  scenarioValue,
  scenarioLabel,
  scenarioStartLabel,
  scenarioActiveMonths,
}: {
  metric: ProjectionMetric
  currentValue: number
  projectedValue: number
  monthlyFlow: number
  months: number
  investmentGrowth: number
  investmentBalance: number
  investmentContribution: number
  annualReturn: number
  historyMonths: number
  historyFrom: string | null
  historyTo: string | null
  scenarioAdjustment: number | null
  scenarioValue: number
  scenarioLabel: string
  scenarioStartLabel: string
  scenarioActiveMonths: number
}) {
  const movement = monthlyFlow * months
  const historyRange = historyFrom && historyTo
    ? `${dateLabel(historyFrom)} – ${dateLabel(historyTo)}`
    : 'No complete history yet'

  return (
    <div id="projection-calculation" className="mt-5 border-t border-[var(--hair)] pt-5">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-5">
          <div className="micro text-muted">How we reached {fmt(projectedValue)}</div>
          <p className="mt-3 text-[15px] leading-7 text-ink2">
            Starting {metric === 'cash' ? 'cash' : 'net worth'} of <strong className="text-ink">{fmt(currentValue)}</strong>,
            {' '}plus an observed movement of <strong className={monthlyFlow >= 0 ? 'text-pos' : 'text-neg'}>{fmt(monthlyFlow)} per month</strong>,
            {' '}projected across <strong className="text-ink">{months} months</strong>
            {metric === 'netWorth' && <> with <strong className="text-ink">{fmt(investmentGrowth)}</strong> estimated investment growth</>}.
          </p>
          <div className="mt-5 overflow-x-auto rounded-lg border border-[var(--hair)] bg-[var(--glass-fill)] px-4 py-4 font-mono text-[15px] font-bold leading-6 tabular-nums text-ink">
            {metric === 'cash' ? (
              <>{fmt(currentValue)} + ({fmt(monthlyFlow)} × {months}) = <span className="text-accent-ink">{fmt(projectedValue)}</span></>
            ) : (
              <>{fmt(currentValue)} + {fmt(movement)} + {fmt(investmentGrowth)} = <span className="text-accent-ink">{fmt(projectedValue)}</span></>
            )}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 text-[14px] leading-6">
            <BreakdownRow label={`Starting ${metric === 'cash' ? 'cash' : 'net worth'}`} value={fmt(currentValue)} />
            <BreakdownRow label="Future net movement" value={fmt(movement)} tone={movement >= 0 ? 'pos' : 'neg'} />
            {metric === 'netWorth' && <BreakdownRow label="Estimated investment growth" value={fmt(investmentGrowth)} tone={investmentGrowth >= 0 ? 'pos' : 'neg'} />}
            <div className="col-span-2 border-t border-[var(--hair)]" />
            <BreakdownRow label="Projected value" value={fmt(projectedValue)} strong />
          </div>
          {scenarioAdjustment !== null && scenarioAdjustment !== 0 && (
            <div className="mt-5 overflow-hidden rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] text-[14px]">
              <div className="border-b border-[var(--hair-soft)] px-4 py-3 font-bold text-ink">What-if comparison</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-3 px-4 py-3.5 tabular-nums">
                <span className="text-muted">Endpoint</span><span className="text-right text-muted">Baseline</span><span className="text-right text-muted">What-if</span>
                <span className="font-semibold text-ink">Projected value</span><span className="text-right font-semibold text-ink">{fmt(projectedValue)}</span><span className="text-right font-bold text-ink">{fmt(scenarioValue)}</span>
                <span className="font-semibold text-ink">Difference</span><span className="text-right text-muted">—</span><span className={`text-right font-bold ${scenarioValue - projectedValue >= 0 ? 'text-pos' : 'text-neg'}`}>{scenarioValue - projectedValue >= 0 ? '+' : '−'}{fmt(Math.abs(scenarioValue - projectedValue))}</span>
              </div>
              <div className="border-t border-[var(--hair-soft)] px-4 py-3 text-[13px] leading-6 text-muted">
                {scenarioLabel}, starting {scenarioStartLabel} · {scenarioActiveMonths} active {scenarioActiveMonths === 1 ? 'month' : 'months'}. Comparison only; it is not included in the baseline above.
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <div className="micro text-muted">Variables & sources</div>
            <span className="text-[13px] text-muted">Nothing hidden</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--hair)]">
            <VariableRow name={`Current ${metric === 'cash' ? 'cash' : 'net worth'}`} value={fmt(currentValue)} provenance="Current" source={metric === 'cash' ? 'Liquid + savings balances' : 'All account balances'} />
            <VariableRow name="Monthly movement" value={fmt(monthlyFlow)} provenance="Observed" source={historyMonths ? `${historyMonths} complete months · ${historyRange}` : historyRange} />
            <VariableRow name="Projection horizon" value={`${months} months`} provenance="Calculated" source="Today to the forecast endpoint" />
            {metric === 'netWorth' && <VariableRow name="Investment return" value={`${annualReturn}% / year`} provenance="Assumed" source={`Applied to ${fmt(investmentBalance)} invested`} />}
            {metric === 'netWorth' && investmentContribution > 0 && <VariableRow name="Investment contributions" value={`${fmt(investmentContribution)} / month`} provenance="Observed" source="Used to grow the invested base, not counted as new wealth" />}
            {scenarioAdjustment !== null && <VariableRow name="What-if adjustment" value={`${scenarioAdjustment >= 0 ? '+' : '−'}${fmt(Math.abs(scenarioAdjustment))} / month`} provenance="Scenario" source={`${scenarioLabel}, starting ${scenarioStartLabel}`} />}
          </div>

          <details className="group mt-4 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)]">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-bold text-ink outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-wash)]">
              Technical method
              <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
            </summary>
            <div className="border-t border-[var(--hair-soft)] px-4 py-4 text-[14px] leading-6 text-muted">
              {metric === 'cash' ? (
                <><code className="text-ink">Cₙ = C₀ + n(r + a)</code><p className="mt-2">C₀ is current eligible cash, r is observed monthly movement, a is a scenario adjustment, and n is the number of months. The baseline sets a to zero.</p></>
              ) : (
                <><code className="text-ink">Nₙ = Nₙ₋₁ + r + a + Iₙ₋₁i</code><p className="mt-2">N is net worth, r is observed monthly movement, a is a scenario adjustment, I is the invested balance, and i is the monthly return derived from the annual assumption. Observed investment contributions increase I but are not counted again as new net worth.</p></>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({ label, value, tone, strong = false }: { label: string; value: string; tone?: 'pos' | 'neg'; strong?: boolean }) {
  const color = tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : 'text-ink'
  return <><span className={strong ? 'font-bold text-ink' : 'font-medium text-ink2'}>{label}</span><span className={`text-right tabular-nums ${strong ? 'text-[15px] font-bold' : 'font-bold'} ${color}`}>{value}</span></>
}

function VariableRow({ name, value, provenance, source }: { name: string; value: string; provenance: 'Current' | 'Observed' | 'Calculated' | 'Assumed' | 'Scenario'; source: string }) {
  const provenanceClass = provenance === 'Scenario' ? 'text-ink2' : provenance === 'Assumed' ? 'text-warn' : provenance === 'Observed' ? 'text-accent-ink' : 'text-muted'
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-[var(--hair-soft)] bg-[var(--glass-fill)] px-4 py-3 last:border-b-0">
      <div className="min-w-0"><div className="text-[14px] font-semibold text-ink">{name}</div><div className="mt-1 truncate text-[13px] leading-5 text-muted" title={source}>{source}</div></div>
      <div className="text-right"><div className="text-[15px] font-bold tabular-nums text-ink">{value}</div><div className={`mt-1 text-[11px] font-bold uppercase tracking-[0.09em] ${provenanceClass}`}>{provenance}</div></div>
    </div>
  )
}
