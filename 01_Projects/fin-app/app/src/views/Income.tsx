import { useMemo, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import Area from '../components/charts/Area'
import AllocationDonut from '../components/AllocationDonut'
import Ledger from '../components/Ledger'
import SegmentedTabs from '../components/SegmentedTabs'
import HeroMetric from '../components/HeroMetric'
import AnalyzerFilters from '../components/AnalyzerFilters'
import { usePeriodRange } from '../hooks/usePeriodRange'
import { useResponsiveChartSize } from '../hooks/useResponsiveChartSize'
import { dayLabel } from '../lib/period'
import { buildCashFlowSeries } from '../lib/cashFlowSeries'
import { isEarnedIncome } from '../lib/classification'
import { fmt } from '../data'
import { useData } from '../contexts/DataContext'
import StrategicProjections from '../components/StrategicProjections'

const TABS = [
  { id: 'analyzer', label: 'Income analyzer' },
  { id: 'projections', label: 'Strategic projections' },
]

export default function Income() {
  const [view, setView] = useState('analyzer')
  const { preset, from, to, applyPreset, changeFrom, changeTo } = usePeriodRange()
  
  const { accounts: dbAccounts, reportingTransactions: transactions } = useData()

  const INFLOW_ACCOUNTS = useMemo(() => {
    if (!dbAccounts || dbAccounts.length === 0) return []
    return dbAccounts.map(a => ({ id: a.id, name: a.name, share: 1 / dbAccounts.length }))
  }, [dbAccounts])

  const ACCOUNT_OPTIONS = useMemo(() => INFLOW_ACCOUNTS.map((a) => ({
    value: a.id,
    label: a.name,
    hint: '',
  })), [INFLOW_ACCOUNTS])

  const [accounts, setAccounts] = useState<string[]>([])
  
  useEffect(() => {
    if (dbAccounts.length > 0 && accounts.length === 0) {
      setAccounts(dbAccounts.map(a => a.id))
    }
  }, [dbAccounts])

  return (
    <Screen>
      <div className="relative z-30 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <ViewHeader index="03 — Inflow" title="Income" sub="Earning streams, cash flow & savings rate" />
          <div className="pt-1.5">
            <SegmentedTabs tabs={TABS} active={view} onChange={setView} layoutId="income-tabs" />
          </div>
        </div>

        {view === 'analyzer' && (
          <AnalyzerFilters
            preset={preset}
            from={from}
            to={to}
            onPreset={applyPreset}
            onFrom={changeFrom}
            onTo={changeTo}
            accounts={accounts}
            accountOptions={ACCOUNT_OPTIONS}
            onAccounts={setAccounts}
            rangeLayoutId="income-range"
          />
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === 'analyzer' ? (
          <motion.div
            key="analyzer"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <IncomeAnalyzer from={from} to={to} accounts={accounts} dbAccountsLength={dbAccounts.length} />
          </motion.div>
        ) : (
          <motion.div
            key="projections"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <StrategicProjections />
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  )
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function IncomeAnalyzer({ from, to, accounts, dbAccountsLength }: { from: string; to: string; accounts: string[]; dbAccountsLength: number }) {
  const { reportingTransactions: transactions } = useData()
  const m = useMemo(() => {
    const share = accounts.length > 0 ? accounts.length / (dbAccountsLength || 1) : 0
    const flow = buildCashFlowSeries({ from, to, accountIds: accounts, transactions })
    const inc = flow.inflow
    const exp = flow.outflow
    
    const net = inc.map((v, i) => v - exp[i])
    const n = inc.length || 1
    const totalInflow = sum(inc)
    const totalOutflow = sum(exp)
    const prorated = totalInflow / n
    const coverage = totalOutflow ? totalInflow / totalOutflow : 0
    const surplus = totalInflow - totalOutflow
    const peakVal = Math.max(...inc)
    const peakPeriod = peakVal > 0 ? flow.labels[inc.indexOf(peakVal)] : '—'

    // running totals for the pacing chart
    const cum = (xs: number[]) => {
      let a = 0
      return xs.map((v) => (a += v))
    }
    const cumInflow = cum(inc)
    const cumNet = cum(net)
    const periodRates = inc.map((v, i) => (v > 0 ? (v - exp[i]) / v : 0))
    const savingsRate = totalInflow > 0 ? surplus / totalInflow : 0

    // income composition over the period (compute real slices from categorized transactions)
    const sourceMap: Record<string, number> = {}
    transactions.forEach(t => {
      if (isEarnedIncome(t) && !t.isTransfer && t.account_id && accounts.includes(t.account_id) && t.date >= from && t.date <= to) {
        sourceMap[t.cat || 'Other'] = (sourceMap[t.cat || 'Other'] || 0) + t.amount
      }
    })
    
    const colors = ['cyan', 'green', 'blue', 'purple', 'amber']
    const sourceSlices = Object.entries(sourceMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        label,
        value,
        glow: colors[i % colors.length] as any
      }))

    // inflow transactions within the selected range, most recent first
    const deposits =
      share > 0
        ? transactions
            .filter((t) => isEarnedIncome(t) && !t.isTransfer && t.account_id && accounts.includes(t.account_id) && t.date >= from && t.date <= to)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 6)
        : []

    return {
      share, inc, totalInflow, totalOutflow, prorated, coverage, surplus, n, peakVal, peakPeriod,
      cumInflow, cumNet, periodRates, savingsRate, sourceSlices, deposits, flow,
    }
  }, [from, to, accounts, transactions, dbAccountsLength])

  const acctLabel =
    accounts.length === dbAccountsLength
      ? 'All accounts'
      : accounts.length === 0
        ? 'No accounts'
        : accounts.length === 1
          ? '1 account'
          : `${accounts.length} accounts`
  const covPositive = m.coverage >= 1
  const periodUnit = m.flow.granularity === 'day' ? 'day' : m.flow.granularity === 'week' ? 'week' : 'month'
  const periodCadenceLabel = m.flow.granularity === 'day' ? 'daily' : m.flow.granularity === 'week' ? 'weekly' : 'monthly'

  return (
    <Grid>
      {/* Row 1 — period KPI hero cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
        <HeroMetric
          label="Total period inflow"
          value={fmt(m.totalInflow)}
          sub={`${acctLabel} · ${dayLabel(from)}–${dayLabel(to)}`}
        />
        <HeroMetric
          label={`Average inflow per ${periodUnit}`}
          value={fmt(m.prorated)}
          sub={`${m.n} ${periodUnit}${m.n === 1 ? '' : 's'} in selected range`}
        />
        <HeroMetric
          label="Peak inflow period"
          value={fmt(m.peakVal)}
          sub={`${m.peakPeriod} · highest ${periodUnit}`}
        />
        <HeroMetric
          label="Inflow / outflow coverage"
          value={`${m.coverage.toFixed(2)}×`}
          valueClass={covPositive ? 'text-pos' : 'text-neg'}
          sub={`${covPositive ? '▲' : '▼'} ${fmt(Math.abs(m.surplus))} ${covPositive ? 'surplus' : 'deficit'}`}
          tone={covPositive ? 'pos' : 'neg'}
        />
      </div>

      {/* Row 2 — cumulative pacing + savings rate */}
      <Tile title="Cash flow pacing" tag={`cumulative · ${periodCadenceLabel}`} span={2}>
        <div className="mb-2 mt-0.5 flex items-center gap-4">
          <LegendDot color="var(--color-pos)" label="Cumulative inflow" />
          <LegendDot color="var(--color-blue)" label="Cumulative net" />
        </div>
        <Area
          key={`pace-${from}-${to}-${accounts.join(',')}`}
          series={[
            { data: m.cumInflow, color: 'var(--color-pos)', label: 'Inflow' },
            { data: m.cumNet, color: 'var(--color-blue)', label: 'Net' },
          ]}
          labels={m.flow.labels}
          height={230}
        />
      </Tile>
      <SavingsTile rate={m.savingsRate} saved={m.surplus} monthlyRates={m.periodRates} target={0.2} />

      {/* Row 3 — income sources + recent deposits */}
      <Tile title="Income sources" tag="share of inflow" span={2}>
        {m.totalInflow > 0 ? (
          <AllocationDonut data={m.sourceSlices} totalLabel="Period inflow" />
        ) : (
          <div className="grid place-items-center py-12 text-center text-[12.5px] text-muted">
            No inflow for the current filters.
          </div>
        )}
      </Tile>
      <Tile title="Recent deposits" tag={m.deposits.length ? `${m.deposits.length} shown` : 'none'}>
        {m.deposits.length ? (
          <Ledger rows={m.deposits} />
        ) : (
          <div className="grid place-items-center py-10 text-center text-[12.5px] text-muted">
            No deposits in the selected range.
          </div>
        )}
      </Tile>
    </Grid>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

function Sparkline({ values, color, height = 30 }: { values: number[]; color: string; height?: number }) {
  const { ref: containerRef, width: w, height: h, ready } = useResponsiveChartSize({
    aspectRatio: 120 / height,
    minHeight: height,
    maxHeight: height,
  })
  if (values.length === 0) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const denom = values.length - 1 || 1
  const pts = values
    .map((v, i) => `${(i / denom) * w},${h - ((v - min) / span) * (h - 4) - 2}`)
    .join(' ')
  return (
    <div ref={containerRef} style={{ minHeight: height }}>
      {ready && <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="block">
        <polyline
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>}
    </div>
  )
}

function SavingsTile({
  rate,
  saved,
  monthlyRates,
  target,
}: {
  rate: number
  saved: number
  monthlyRates: number[]
  target: number
}) {
  const pos = rate >= 0
  const onTarget = rate >= target
  const R = 38
  const C = 2 * Math.PI * R
  const fill = Math.max(0, Math.min(1, rate))
  const ringColor = pos ? 'var(--color-pos)' : 'var(--color-neg)'
  const deltaPts = Math.round((rate - target) * 100)

  return (
    <Tile title="Savings rate" tag="vs 20% target" className="flex flex-col">
      <div className="flex items-center gap-4 pt-1">
        <div className="relative h-[92px] w-[92px] flex-shrink-0">
          <svg viewBox="0 0 92 92" className="h-full w-full -rotate-90">
            <circle cx={46} cy={46} r={R} fill="none" stroke="var(--track)" strokeWidth={7} />
            <motion.circle
              cx={46} cy={46} r={R} fill="none" stroke={ringColor} strokeWidth={7} strokeLinecap="round"
              strokeDasharray={C}
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - fill) }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div
            className="absolute inset-0 grid place-items-center text-[19px] font-bold tabular-nums"
            style={{ color: ringColor }}
          >
            {Math.round(rate * 100)}%
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[24px] font-bold tabular-nums tracking-tight">{fmt(saved)}</div>
          <div className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-muted">saved this period</div>
        </div>
      </div>
      <div className="mt-auto pt-4">
        <Sparkline values={monthlyRates} color={ringColor} />
        <div className="mt-1.5 flex items-center justify-between text-[11px]">
          <span className="text-muted">Monthly rate trend</span>
          <span className={`font-semibold ${onTarget ? 'text-pos' : 'text-warn'}`}>
            {deltaPts >= 0 ? '+' : ''}{deltaPts} pts vs target
          </span>
        </div>
      </div>
    </Tile>
  )
}
