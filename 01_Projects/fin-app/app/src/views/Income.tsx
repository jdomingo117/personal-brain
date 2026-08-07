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
import { MONTHS, dateToIdx } from '../lib/period'
import { CADENCE_PER_MONTH } from '../lib/cadence'
import { fmt } from '../data'
import { useData } from '../contexts/DataContext'

const TABS = [
  { id: 'analyzer', label: 'Income analyzer' },
  { id: 'projections', label: 'Strategic projections' },
]

export default function Income() {
  const [view, setView] = useState('analyzer')
  const { preset, from, to, applyPreset, changeFrom, changeTo } = usePeriodRange()
  
  const { accounts: dbAccounts, transactions } = useData()

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
            <Grid>
              <Tile title="Strategic projections" tag="coming soon" span={3}>
                <div className="grid place-items-center gap-3 py-16 text-center">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3v18h18" />
                    <path d="m7 14 3-4 4 3 5-7" />
                    <path d="M19 6h-4M19 6v4" />
                  </svg>
                  <div className="font-display text-[16px] font-bold text-ink">Project your trajectory</div>
                  <p className="max-w-[420px] text-[13px] leading-relaxed text-muted">
                    Model future inflow, run savings scenarios, and stress-test your objectives against
                    different earning paths. This view is on the way.
                  </p>
                </div>
              </Tile>
            </Grid>
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  )
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

const INCOME_SHARES = [
  { label: 'Primary Salary', glow: 'cyan' as const, share: 0.8 },
  { label: 'Freelance', glow: 'green' as const, share: 0.15 },
  { label: 'Dividends', glow: 'blue' as const, share: 0.05 }
]

function IncomeAnalyzer({ from, to, accounts, dbAccountsLength }: { from: string; to: string; accounts: string[]; dbAccountsLength: number }) {
  const { transactions } = useData()
  const m = useMemo(() => {
    const fromIdx = dateToIdx(from)
    const toIdx = dateToIdx(to)
    const share = accounts.length > 0 ? accounts.length / (dbAccountsLength || 1) : 0
    
    // Group transactions by month to build dynamic inc/exp arrays
    const monthlyInc = Array(12).fill(0)
    const monthlyExp = Array(12).fill(0)
    
    transactions.forEach(t => {
      // Only include transactions for selected accounts
      if (!t.account_id || !accounts.includes(t.account_id) || t.isTransfer || t.pending) return

      const monthIdx = dateToIdx(t.date)
      if (monthIdx >= 0 && monthIdx < 12) {
        if (t.amount > 0) {
          monthlyInc[monthIdx] += t.amount
        } else {
          monthlyExp[monthIdx] += Math.abs(t.amount)
        }
      }
    })

    const inc = monthlyInc.slice(fromIdx, toIdx + 1)
    const exp = monthlyExp.slice(fromIdx, toIdx + 1)
    
    const net = inc.map((v, i) => v - exp[i])
    const n = inc.length || 1
    const totalInflow = sum(inc)
    const totalOutflow = sum(exp)
    const prorated = totalInflow / n
    const coverage = totalOutflow ? totalInflow / totalOutflow : 0
    const surplus = totalInflow - totalOutflow
    const peakVal = Math.max(...inc)
    const peakMonth = peakVal > 0 ? MONTHS[fromIdx + inc.indexOf(peakVal)] : '—'

    // running totals for the pacing chart
    const cum = (xs: number[]) => {
      let a = 0
      return xs.map((v) => (a += v))
    }
    const cumInflow = cum(inc)
    const cumNet = cum(net)
    const monthlyRates = inc.map((v, i) => (v > 0 ? (v - exp[i]) / v : 0))
    const savingsRate = totalInflow > 0 ? surplus / totalInflow : 0

    // income composition over the period (compute real slices from categorized transactions)
    const sourceMap: Record<string, number> = {}
    transactions.forEach(t => {
      if (t.amount > 0 && !t.isTransfer && !t.pending && t.account_id && accounts.includes(t.account_id) && t.date >= from && t.date <= to) {
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
            .filter((t) => t.amount > 0 && !t.isTransfer && t.account_id && accounts.includes(t.account_id) && t.date >= from && t.date <= to)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 6)
        : []

    return {
      fromIdx, toIdx, share, inc, totalInflow, totalOutflow, prorated, coverage, surplus, n, peakVal, peakMonth,
      cumInflow, cumNet, monthlyRates, savingsRate, sourceSlices, deposits,
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

  return (
    <Grid>
      {/* Row 1 — period KPI hero cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
        <HeroMetric
          label="Total period inflow"
          value={fmt(m.totalInflow)}
          sub={`${acctLabel} · ${MONTHS[m.fromIdx]}–${MONTHS[m.toIdx]}`}
        />
        <HeroMetric
          label="Prorated monthly average"
          value={fmt(m.prorated)}
          sub={`per month · ${m.n} mo span`}
        />
        <HeroMetric
          label="Peak deposit item"
          value={fmt(m.peakVal)}
          sub={`${m.peakMonth} · highest single month`}
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
      <Tile title="Cash flow pacing" tag="cumulative" span={2}>
        <div className="mb-2 mt-0.5 flex items-center gap-4">
          <LegendDot color="var(--color-pos)" label="Cumulative inflow" />
          <LegendDot color="var(--color-blue)" label="Cumulative net" />
        </div>
        <Area
          key={`pace-${from}-${to}-${accounts.join(',')}`}
          series={[
            { data: m.cumInflow, color: 'var(--color-pos)' },
            { data: m.cumNet, color: 'var(--color-blue)' },
          ]}
          labels={MONTHS.slice(m.fromIdx, m.toIdx + 1)}
          height={230}
        />
      </Tile>
      <SavingsTile rate={m.savingsRate} saved={m.surplus} monthlyRates={m.monthlyRates} target={0.2} />

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
  if (values.length === 0) return null
  const w = 120
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const denom = values.length - 1 || 1
  const pts = values
    .map((v, i) => `${(i / denom) * w},${height - ((v - min) / span) * (height - 4) - 2}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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
