import { useMemo, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Screen, ViewHeader } from '../components/Screen'
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
import { fmt, type Txn } from '../data'
import { useData } from '../contexts/DataContext'
import StrategicProjections from '../components/StrategicProjections'
import { ease, gridStagger } from '../components/motion'
import { useView } from '../router'
import TransactionCategoryDrawer from '../components/TransactionCategoryDrawer'

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

      <AnimatePresence mode="wait">
        {view === 'analyzer' ? (
          <motion.div
            key="analyzer"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
          >
            <IncomeAnalyzer from={from} to={to} accounts={accounts} dbAccountsLength={dbAccounts.length} />
          </motion.div>
        ) : (
          <motion.div
            key="projections"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
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
  const { reportingTransactions: transactions, refreshData } = useData()
  const { go, toast } = useView()
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
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

    // Inflow composition and its drill-down use the exact same scoped settled
    // transactions, so every donut value has a traceable transaction list.
    const sourceTransactions = share > 0
      ? transactions.filter((t) => isEarnedIncome(t) && !t.isTransfer && t.account_id && accounts.includes(t.account_id) && t.date >= from && t.date <= to)
      : []
    const sourceMap: Record<string, number> = {}
    sourceTransactions.forEach(t => {
      sourceMap[t.cat || 'Other'] = (sourceMap[t.cat || 'Other'] || 0) + t.amount
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
    const deposits = [...sourceTransactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)

    return {
      share, inc, totalInflow, totalOutflow, prorated, coverage, surplus, n, peakVal, peakPeriod,
      cumInflow, cumNet, periodRates, savingsRate, sourceSlices, sourceTransactions, deposits, flow,
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
  const activeSource = selectedSource && m.sourceSlices.some((slice) => slice.label === selectedSource)
    ? selectedSource
    : m.sourceSlices[0]?.label ?? null
  const sourceTransactions = activeSource
    ? m.sourceTransactions.filter((transaction) => (transaction.cat || 'Other') === activeSource)
    : []
  const latestSourceTransactions = [...sourceTransactions].sort((a, b) => b.date.localeCompare(a.date))
  const largestSourceTransaction = [...sourceTransactions].sort((a, b) => b.amount - a.amount)[0] ?? null
  const selectedTransaction = selectedTransactionId
    ? transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null
    : null

  const refreshAfterTransactionEdit = async () => {
    await refreshData()
    toast({ title: 'Transaction updated', sub: 'Income analytics have been refreshed.' })
  }

  return (
    <motion.div
      variants={gridStagger}
      initial="hidden"
      animate="show"
      className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.62fr)_minmax(360px,1fr)]"
    >
      {/* Row 1 — period KPI hero cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-2 xl:grid-cols-4">
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
      <Tile title="Cash flow pacing" tag={`cumulative · ${periodCadenceLabel}`} span={2} className="xl:col-span-1">
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

      {/* Row 3 — inflow categories + recent deposits */}
      <Tile title="Inflow categories" tag="share of inflow" span={2} className="flex h-full flex-col xl:col-span-1">
        {m.totalInflow > 0 ? (
          <>
            <AllocationDonut
              data={m.sourceSlices}
              totalLabel="Period inflow"
              selectedLabel={activeSource}
              onSelect={(slice) => setSelectedSource(slice.label)}
            />
            {activeSource && (
              <IncomeSourceActivity
                category={activeSource}
                total={m.sourceSlices.find((slice) => slice.label === activeSource)?.value ?? 0}
                periodTotal={m.totalInflow}
                transactions={latestSourceTransactions}
                largestTransaction={largestSourceTransaction}
                onEdit={(transaction) => setSelectedTransactionId(transaction.id)}
                onViewAll={() => go('ledger', {
                  state: { source: 'income-source', category: activeSource, accountIds: accounts, from, to, incomeOnly: true },
                })}
              />
            )}
          </>
        ) : (
          <div className="grid place-items-center py-12 text-center text-[12.5px] text-muted">
            No inflow for the current filters.
          </div>
        )}
      </Tile>
      <Tile title="Recent deposits" tag={m.deposits.length ? `${m.deposits.length} shown` : 'none'}>
        {m.deposits.length ? (
          <Ledger rows={m.deposits} onEdit={(transaction) => setSelectedTransactionId(transaction.id)} />
        ) : (
          <div className="grid place-items-center py-10 text-center text-[12.5px] text-muted">
            No deposits in the selected range.
          </div>
        )}
      </Tile>
      <TransactionCategoryDrawer
        transaction={selectedTransaction}
        onClose={() => setSelectedTransactionId(null)}
        onChanged={refreshAfterTransactionEdit}
      />
    </motion.div>
  )
}

function IncomeSourceActivity({
  category,
  total,
  periodTotal,
  transactions,
  largestTransaction,
  onEdit,
  onViewAll,
}: {
  category: string
  total: number
  periodTotal: number
  transactions: Txn[]
  largestTransaction: Txn | null
  onEdit: (transaction: Txn) => void
  onViewAll: () => void
}) {
  const share = periodTotal > 0 ? Math.round((total / periodTotal) * 1000) / 10 : 0

  return (
    <section aria-label={`${category} income activity`} className="mt-5 border-t border-[var(--hair-soft)] pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Income activity · {category}</p>
          <p className="mt-1 text-[17px] font-bold tabular-nums text-ink">{fmt(total)} <span className="text-[13px] font-semibold text-muted">· {share}% of inflow</span></p>
        </div>
        <span className="text-[12.5px] font-semibold text-accent-ink">{transactions.length} deposit{transactions.length === 1 ? '' : 's'}</span>
      </div>

      <p className="mt-2 text-[12.5px] leading-5 text-muted">
        {largestTransaction ? <>Largest deposit {fmt(largestTransaction.amount)} · latest {dayLabel(transactions[0]?.date ?? largestTransaction.date)}.</> : 'No matching deposits in the selected range.'}
      </p>

      <div className="mt-3 divide-y divide-[var(--hair-soft)] border-y border-[var(--hair-soft)]">
        {transactions.slice(0, 3).map((transaction) => (
          <button
            key={transaction.id}
            type="button"
            onClick={() => onEdit(transaction)}
            aria-label={`Edit ${transaction.merchant} on ${transaction.date}`}
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left transition hover:bg-[var(--hair-soft)] focus-visible:bg-[var(--accent-wash)]"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">{transaction.merchant}</p>
              <p className="mt-0.5 text-[12px] text-muted">{dayLabel(transaction.date)}{transaction.subcat ? ` · ${transaction.subcat}` : ''}</p>
            </div>
            <span className="flex items-center gap-2 text-[13px] font-bold tabular-nums text-pos"><span>{fmt(transaction.amount)}</span><span className="text-[12px] font-semibold text-accent-ink">Edit →</span></span>
          </button>
        ))}
      </div>

      <button type="button" onClick={onViewAll} className="mt-3 text-[13px] font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
        View all {transactions.length} matching transactions →
      </button>
    </section>
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
