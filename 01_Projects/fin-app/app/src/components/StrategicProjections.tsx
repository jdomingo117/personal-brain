import { useEffect, useMemo, useState } from 'react'
import Tile from './Tile'
import HeroMetric from './HeroMetric'
import ProjectionChart from './ProjectionChart'
import { Grid } from './Screen'
import SegmentedTabs from './SegmentedTabs'
import { fmt, type Account, type Txn } from '../data'
import { useData } from '../contexts/DataContext'
import {
  buildProjection,
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

const inputClass = 'min-h-[42px] w-full rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[13px] font-semibold text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]'
const labelClass = 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-muted'

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
  const { accounts, transactions, netWorthHistory } = useData()
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

  const currentValue = useMemo(() => currentValueFor(metric, accounts), [metric, accounts])
  const investmentBalance = useMemo(
    () => accounts.filter((account) => account.type === 'Invest').reduce((sum, account) => sum + account.balance, 0),
    [accounts],
  )
  const baseline = useMemo(
    () => deriveProjectionBaseline(metric, accounts, transactions),
    [metric, accounts, transactions],
  )
  const target = Math.max(0, dollarsToCents(targetInput))
  const datedMonths = monthsBetween(new Date(), targetDate)
  const horizonMonths = mode === 'byDate' ? datedMonths : 120
  const inputs = useMemo(() => ({
    metric,
    currentValue,
    investmentBalance,
    monthlyFlow: baseline.monthlyFlow,
    monthlyInvestmentContribution: baseline.monthlyInvestmentContribution,
    annualReturnPct: metric === 'netWorth' ? Number(annualReturn) || 0 : 0,
    months: horizonMonths,
  }), [metric, currentValue, investmentBalance, baseline, annualReturn, horizonMonths])
  const projection = useMemo(() => buildProjection(inputs), [inputs])
  const scenarioAmountCents = Math.abs(dollarsToCents(scenarioAmount))
  const scenarioAdjustment = scenarioAmountCents * SCENARIO_ACTIONS[scenarioAction].direction
  const scenarioStartMonth = scenarioStartMode === 'now' || !scenarioStartDate
    ? 1
    : monthsBetween(new Date(), `${scenarioStartDate}-01`)
  const scenario = useMemo(
    () => buildProjection({ ...inputs, monthlyAdjustment: scenarioAdjustment, adjustmentStartMonth: scenarioStartMonth }),
    [inputs, scenarioAdjustment, scenarioStartMonth],
  )
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
  const scenarioStartLabel = scenarioStartMode === 'now' ? 'now' : dateLabel(scenarioStartDate)
  const scenarioSentence = `${SCENARIO_ACTIONS[scenarioAction].sentence} ${fmt(scenarioAmountCents)} per month`

  const history = useMemo(() => {
    if (metric === 'cash') return cashHistory(accounts, transactions, currentValue)
    const points = netWorthHistory.slice(-7).map((point) => ({ date: point.month.slice(0, 7), value: point.value }))
    const currentMonth = new Date().toISOString().slice(0, 7)
    if (!points.length || points.at(-1)?.date !== currentMonth) points.push({ date: currentMonth, value: currentValue })
    else points[points.length - 1] = { date: currentMonth, value: currentValue }
    return points
  }, [metric, accounts, transactions, currentValue, netWorthHistory])

  useEffect(() => {
    setGoalName(metric === 'cash' ? 'Cash reserve' : 'Net worth milestone')
  }, [metric])

  const noHistory = baseline.monthsUsed === 0
  const resultTone = mode === 'byDate' ? (gap >= 0 ? 'pos' : 'neg') : targetPoint ? 'pos' : 'neg'

  return (
    <Grid>
      <Tile span={3} className="!p-0 overflow-hidden">
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
          <div>
            <div className={labelClass}>Projection question</div>
            <SegmentedTabs
              tabs={[{ id: 'byDate', label: 'Value by date' }, { id: 'reachTarget', label: 'Date for value' }]}
              active={mode}
              onChange={(value) => setMode(value as QuestionMode)}
              layoutId="projection-question"
            />
          </div>
          <div className="hidden pb-2 text-[18px] font-semibold text-faint lg:block">for</div>
          <div>
            <div className={labelClass}>Measure</div>
            <SegmentedTabs
              tabs={[{ id: 'cash', label: 'Cash holdings' }, { id: 'netWorth', label: 'Net worth' }]}
              active={metric}
              onChange={(value) => setMetric(value as ProjectionMetric)}
              layoutId="projection-metric"
            />
          </div>
        </div>
        <div className="border-t border-[var(--hair-soft)] bg-[var(--hair-soft)] px-5 py-3 text-[13px] text-ink2">
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
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[11px] font-bold text-accent-ink outline-none transition hover:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
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

      <Tile title="Wealth trajectory" tag={`${baseline.monthsUsed || 0}-month baseline`} span={2}>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-muted">
          <Legend color="var(--color-ink2)" label="Actual" />
          <Legend color="var(--color-accent)" label="Baseline" dashed />
          {showScenario && <Legend color="var(--color-blue)" label={`${SCENARIO_ACTIONS[scenarioAction].label} · ${fmt(scenarioAmountCents)}/mo`} dashed />}
          <Legend color="var(--color-warn)" label="Goal" dashed />
        </div>
        <ProjectionChart history={history} baseline={chartProjection} scenario={showScenario ? chartScenario : undefined} target={target} />
      </Tile>

      <Tile title="Goal & what-if" tag="simulation only">
        <div className="space-y-4">
          <label><span className={labelClass}>Goal name</span><input className={inputClass} value={goalName} onChange={(event) => setGoalName(event.target.value)} /></label>
          <label><span className={labelClass}>Target amount</span><div className="relative"><span className="absolute left-3 top-2.5 text-[14px] font-semibold text-muted">$</span><input className={`${inputClass} pl-7 tabular-nums`} inputMode="decimal" value={targetInput} onChange={(event) => setTargetInput(event.target.value)} /></div></label>
          {mode === 'byDate' && <label><span className={labelClass}>Target date</span><input type="date" min={futureDate(1)} className={inputClass} value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>}
          {metric === 'netWorth' && <label><span className={labelClass}>Annual investment return</span><div className="relative"><input className={`${inputClass} pr-8 tabular-nums`} inputMode="decimal" value={annualReturn} onChange={(event) => setAnnualReturn(event.target.value)} /><span className="absolute right-3 top-2.5 text-[13px] font-semibold text-muted">%</span></div></label>}
          <div className="border-t border-[var(--hair-soft)] pt-4">
            <label className="flex items-center justify-between gap-3">
              <span><span className="block text-[12px] font-bold text-ink">What if?</span><span className="text-[11px] text-muted">Compare a change without altering your accounts</span></span>
              <input type="checkbox" checked={showScenario} onChange={(event) => setShowScenario(event.target.checked)} className="h-4 w-4 accent-[var(--color-accent)]" />
            </label>
            {showScenario && (
              <div className="mt-4 space-y-3.5">
                <fieldset>
                  <legend className={labelClass}>I expect to</legend>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.entries(SCENARIO_ACTIONS) as [ScenarioAction, (typeof SCENARIO_ACTIONS)[ScenarioAction]][]).map(([id, action]) => {
                      const active = scenarioAction === id
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setScenarioAction(id)}
                          className={`min-h-9 rounded-lg border px-2.5 text-[11.5px] font-bold outline-none transition focus:ring-4 focus:ring-[var(--accent-wash)] ${active ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] bg-[var(--input-bg)] text-ink2 hover:border-accent'}`}
                        >
                          {action.label}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                <label>
                  <span className={labelClass}>Amount each month</span>
                  <div className="relative"><span className="absolute left-3 top-2.5 text-[14px] font-semibold text-muted">$</span><input aria-label="What-if amount each month" className={`${inputClass} pl-7 pr-16 tabular-nums`} inputMode="decimal" value={scenarioAmount} onChange={(event) => setScenarioAmount(event.target.value.replace('-', ''))} /><span className="absolute right-3 top-2.5 text-[11px] font-semibold text-muted">/ month</span></div>
                </label>
                <fieldset>
                  <legend className={labelClass}>Starting</legend>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" aria-pressed={scenarioStartMode === 'now'} onClick={() => setScenarioStartMode('now')} className={`min-h-9 rounded-lg border px-2.5 text-[11.5px] font-bold outline-none transition focus:ring-4 focus:ring-[var(--accent-wash)] ${scenarioStartMode === 'now' ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] bg-[var(--input-bg)] text-ink2'}`}>Now</button>
                    <button type="button" aria-pressed={scenarioStartMode === 'date'} onClick={() => setScenarioStartMode('date')} className={`min-h-9 rounded-lg border px-2.5 text-[11.5px] font-bold outline-none transition focus:ring-4 focus:ring-[var(--accent-wash)] ${scenarioStartMode === 'date' ? 'border-accent bg-[var(--accent-wash)] text-accent-ink' : 'border-[var(--hair)] bg-[var(--input-bg)] text-ink2'}`}>Choose month</button>
                  </div>
                  {scenarioStartMode === 'date' && <input aria-label="What-if starting month" type="month" min={futureDate(1).slice(0, 7)} className={`${inputClass} mt-2`} value={scenarioStartDate} onChange={(event) => setScenarioStartDate(event.target.value)} />}
                </fieldset>

                <div className="rounded-xl border border-[color-mix(in_srgb,var(--color-blue)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-blue)_7%,transparent)] p-3.5">
                  <div className="micro text-[var(--color-blue)]">What changes</div>
                  {mode === 'byDate' ? (
                    <>
                      <div className="mt-1.5 text-[19px] font-bold tabular-nums text-ink">
                        {fmt(scenarioValueAtEndpoint)}
                        <span className={`ml-2 text-[12px] ${scenarioDeltaAtEndpoint >= 0 ? 'text-pos' : 'text-neg'}`}>{scenarioDeltaAtEndpoint >= 0 ? '+' : '−'}{fmt(Math.abs(scenarioDeltaAtEndpoint))}</span>
                      </div>
                      <div className="mt-1 text-[11.5px] leading-relaxed text-muted">
                        {scenarioGap >= 0 ? `${fmt(scenarioGap)} headroom` : `${fmt(Math.abs(scenarioGap))} shortfall`} against the {fmt(target)} goal by {dateLabel(targetDate)}.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-1.5 text-[17px] font-bold text-ink">{scenarioTarget ? dateLabel(scenarioTarget.date) : 'Beyond 10 years'}</div>
                      <div className="mt-1 text-[11.5px] leading-relaxed text-muted">
                        {describeTimingImpact(targetPoint, scenarioTarget, targetTimingDelta)}
                      </div>
                    </>
                  )}
                  <div className="mt-2.5 border-t border-[color-mix(in_srgb,var(--color-blue)_18%,transparent)] pt-2 text-[10.5px] text-muted">
                    {scenarioSentence}, starting {scenarioStartLabel}. Comparison only—your accounts and baseline are unchanged.
                  </div>
                </div>
              </div>
            )}
          </div>
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
            <Assumption label="Accounts included" value={metric === 'cash' ? `${accounts.filter(isCashAccount).length} cash accounts` : `${accounts.length} total accounts`} detail={metric === 'cash' ? 'Liquid and savings only' : 'Investment purchases treated as asset transfers'} />
            <Assumption label="Growth assumption" value={metric === 'netWorth' ? `${Number(annualReturn) || 0}% annually` : 'No cash interest'} detail={metric === 'netWorth' ? `Applied to ${fmt(investmentBalance)} invested` : 'Conservative Version 1 baseline'} />
          </div>
        )}
        <p className="mt-5 border-t border-[var(--hair-soft)] pt-4 text-[11.5px] leading-relaxed text-muted">
          This is a planning estimate, not a promise. It extends the observed monthly average and the assumptions above; it does not yet model inflation, tax, salary changes, debt schedules, or one-off events.
        </p>
      </Tile>
    </Grid>
  )
}

function Legend({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2" style={{ borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />{label}</span>
}

function Assumption({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div><div className="micro text-muted">{label}</div><div className="mt-1.5 text-[15px] font-bold tabular-nums text-ink">{value}</div><div className="mt-1 text-[11.5px] leading-relaxed text-muted">{detail}</div></div>
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
    <div id="projection-calculation" className="mt-4 border-t border-[var(--hair)] pt-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-xl border border-[var(--hair)] bg-[var(--input-bg)] p-4">
          <div className="micro text-muted">How we reached {fmt(projectedValue)}</div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink2">
            Starting {metric === 'cash' ? 'cash' : 'net worth'} of <strong className="text-ink">{fmt(currentValue)}</strong>,
            {' '}plus an observed movement of <strong className={monthlyFlow >= 0 ? 'text-pos' : 'text-neg'}>{fmt(monthlyFlow)} per month</strong>,
            {' '}projected across <strong className="text-ink">{months} months</strong>
            {metric === 'netWorth' && <> with <strong className="text-ink">{fmt(investmentGrowth)}</strong> estimated investment growth</>}.
          </p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--hair-soft)] bg-[var(--glass-fill)] px-3 py-3 font-mono text-[12px] font-semibold tabular-nums text-ink">
            {metric === 'cash' ? (
              <>{fmt(currentValue)} + ({fmt(monthlyFlow)} × {months}) = <span className="text-accent-ink">{fmt(projectedValue)}</span></>
            ) : (
              <>{fmt(currentValue)} + {fmt(movement)} + {fmt(investmentGrowth)} = <span className="text-accent-ink">{fmt(projectedValue)}</span></>
            )}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-[11.5px]">
            <BreakdownRow label={`Starting ${metric === 'cash' ? 'cash' : 'net worth'}`} value={fmt(currentValue)} />
            <BreakdownRow label="Future net movement" value={fmt(movement)} tone={movement >= 0 ? 'pos' : 'neg'} />
            {metric === 'netWorth' && <BreakdownRow label="Estimated investment growth" value={fmt(investmentGrowth)} tone={investmentGrowth >= 0 ? 'pos' : 'neg'} />}
            <div className="col-span-2 border-t border-[var(--hair)]" />
            <BreakdownRow label="Projected value" value={fmt(projectedValue)} strong />
          </div>
          {scenarioAdjustment !== null && scenarioAdjustment !== 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--color-blue)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-blue)_7%,transparent)] text-[11.5px]">
              <div className="border-b border-[color-mix(in_srgb,var(--color-blue)_18%,transparent)] px-3 py-2 font-bold text-[var(--color-blue)]">What-if comparison</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 px-3 py-2.5 tabular-nums">
                <span className="text-muted">Endpoint</span><span className="text-right text-muted">Baseline</span><span className="text-right text-muted">What-if</span>
                <span className="font-semibold text-ink">Projected value</span><span className="text-right font-semibold text-ink">{fmt(projectedValue)}</span><span className="text-right font-bold text-[var(--color-blue)]">{fmt(scenarioValue)}</span>
                <span className="font-semibold text-ink">Difference</span><span className="text-right text-muted">—</span><span className={`text-right font-bold ${scenarioValue - projectedValue >= 0 ? 'text-pos' : 'text-neg'}`}>{scenarioValue - projectedValue >= 0 ? '+' : '−'}{fmt(Math.abs(scenarioValue - projectedValue))}</span>
              </div>
              <div className="border-t border-[color-mix(in_srgb,var(--color-blue)_18%,transparent)] px-3 py-2 text-[10.5px] leading-relaxed text-muted">
                {scenarioLabel}, starting {scenarioStartLabel} · {scenarioActiveMonths} active {scenarioActiveMonths === 1 ? 'month' : 'months'}. Comparison only; it is not included in the baseline above.
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <div className="micro text-muted">Variables & sources</div>
            <span className="text-[10.5px] text-muted">Nothing hidden</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--hair)]">
            <VariableRow name={`Current ${metric === 'cash' ? 'cash' : 'net worth'}`} value={fmt(currentValue)} provenance="Current" source={metric === 'cash' ? 'Liquid + savings balances' : 'All account balances'} />
            <VariableRow name="Monthly movement" value={fmt(monthlyFlow)} provenance="Observed" source={historyMonths ? `${historyMonths} complete months · ${historyRange}` : historyRange} />
            <VariableRow name="Projection horizon" value={`${months} months`} provenance="Calculated" source="Today to the forecast endpoint" />
            {metric === 'netWorth' && <VariableRow name="Investment return" value={`${annualReturn}% / year`} provenance="Assumed" source={`Applied to ${fmt(investmentBalance)} invested`} />}
            {metric === 'netWorth' && investmentContribution > 0 && <VariableRow name="Investment contributions" value={`${fmt(investmentContribution)} / month`} provenance="Observed" source="Used to grow the invested base, not counted as new wealth" />}
            {scenarioAdjustment !== null && <VariableRow name="What-if adjustment" value={`${scenarioAdjustment >= 0 ? '+' : '−'}${fmt(Math.abs(scenarioAdjustment))} / month`} provenance="Scenario" source={`${scenarioLabel}, starting ${scenarioStartLabel}`} />}
          </div>

          <details className="group mt-3 rounded-xl border border-[var(--hair)] bg-[var(--input-bg)]">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-[11.5px] font-bold text-ink outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-wash)]">
              Technical method
              <svg className="h-3.5 w-3.5 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
            </summary>
            <div className="border-t border-[var(--hair-soft)] px-3.5 py-3 text-[11.5px] leading-relaxed text-muted">
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
  return <><span className={strong ? 'font-bold text-ink' : 'text-muted'}>{label}</span><span className={`text-right tabular-nums ${strong ? 'font-bold' : 'font-semibold'} ${color}`}>{value}</span></>
}

function VariableRow({ name, value, provenance, source }: { name: string; value: string; provenance: 'Current' | 'Observed' | 'Calculated' | 'Assumed' | 'Scenario'; source: string }) {
  const provenanceClass = provenance === 'Scenario' ? 'text-[var(--color-blue)]' : provenance === 'Assumed' ? 'text-warn' : provenance === 'Observed' ? 'text-accent-ink' : 'text-muted'
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-[var(--hair-soft)] bg-[var(--glass-fill)] px-3.5 py-2.5 last:border-b-0">
      <div className="min-w-0"><div className="text-[11.5px] font-semibold text-ink">{name}</div><div className="mt-0.5 truncate text-[10.5px] text-muted" title={source}>{source}</div></div>
      <div className="text-right"><div className="text-[11.5px] font-bold tabular-nums text-ink">{value}</div><div className={`mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] ${provenanceClass}`}>{provenance}</div></div>
    </div>
  )
}
