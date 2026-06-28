import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import Area from '../components/charts/Area'
import AllocationDonut from '../components/AllocationDonut'
import Ledger from '../components/Ledger'
import SegmentedTabs from '../components/SegmentedTabs'
import { DateRangePicker, MultiSelect } from '../components/Controls'
import { data, fmt } from '../data'

const TABS = [
  { id: 'analyzer', label: 'Income analyzer' },
  { id: 'projections', label: 'Strategic projections' },
]

export default function Income() {
  const [view, setView] = useState('analyzer')
  // Filter state lives here so the controls can sit in the page header toolbar
  // (a global element, not a tile), while the analyzer below consumes it.
  const [from, setFrom] = useState(iso(monthStart(6)))
  const [to, setTo] = useState(TODAY)
  const [preset, setPreset] = useState<string | null>('6M')
  const [accounts, setAccounts] = useState<string[]>(INFLOW_ACCOUNTS.map((a) => a.name))

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setPreset(p.id)
    setFrom(iso(p.back === null ? new Date(anchor.getFullYear(), 0, 1) : monthStart(LAST - p.back)))
    setTo(TODAY)
  }
  // ISO date strings compare lexicographically, so keep from ≤ to with a plain compare
  const changeFrom = (v: string) => {
    setPreset(null)
    setFrom(v)
    if (v > to) setTo(v)
  }
  const changeTo = (v: string) => {
    setPreset(null)
    setTo(v)
    if (v < from) setFrom(v)
  }

  return (
    <Screen>
      {/* Header toolbar — title (left) · period + account filters + tab switch
          (right). Elevated z-index so the filter popovers overlay the content
          below. The filters are analyzer-only. */}
      <div className="relative z-30 flex flex-wrap items-start justify-between gap-4">
        <ViewHeader index="03 — Inflow" title="Income" sub="Earning streams, cash flow & savings rate" />
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1.5">
          {view === 'analyzer' && (
            <>
              <DateRangePicker
                from={from}
                to={to}
                min={MIN_DATE}
                max={MAX_DATE}
                presets={PRESETS}
                activePreset={preset}
                onPreset={applyPreset}
                onFrom={changeFrom}
                onTo={changeTo}
                ariaLabel="Date range"
                className="w-[200px]"
              />
              <div className="w-[200px]">
                <MultiSelect
                  options={ACCOUNT_OPTIONS}
                  selected={accounts}
                  onChange={setAccounts}
                  ariaLabel="Linked financial accounts"
                  allLabel="All linked accounts"
                  emptyLabel="No accounts"
                  noun="accounts"
                />
              </div>
            </>
          )}
          <SegmentedTabs tabs={TABS} active={view} onChange={setView} />
        </div>
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
            <IncomeAnalyzer from={from} to={to} accounts={accounts} />
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

/* ── Income analyzer ─────────────────────────────────────────────────────
   Header toolbar (period range · linked accounts) drives:
   row 1 — period KPI hero cards
   row 2 — cumulative cash-flow pacing chart + savings-rate visual
   row 3 — income source breakdown + a recent-deposits ledger */

const MONTHS = data.cashflow.months
const LAST = MONTHS.length - 1

/* The dataset is a trailing 12-month window whose last bucket is the current
   calendar month. These helpers bridge real dates (for the calendar pickers)
   and the month buckets the figures are actually stored in. */
const now = new Date()
const anchor = new Date(now.getFullYear(), now.getMonth(), 1) // 1st of the current month
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const monthStart = (idx: number) => {
  const d = new Date(anchor)
  d.setMonth(d.getMonth() - (LAST - idx))
  return d
}
const dateToIdx = (s: string) => {
  const d = new Date(`${s}T00:00:00`)
  const diff = (anchor.getFullYear() - d.getFullYear()) * 12 + (anchor.getMonth() - d.getMonth())
  return Math.max(0, Math.min(LAST, LAST - diff))
}
/** `MM.DD` ledger date → ISO within the trailing window (months after the
 *  current one belong to last year). */
const txnIso = (mmdd: string) => {
  const [mm, dd] = mmdd.split('.')
  const year = Number(mm) <= now.getMonth() + 1 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${mm}-${dd}`
}
const TODAY = iso(now)
const MIN_DATE = iso(monthStart(0))
const MAX_DATE = iso(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)) // last day of current month

const PRESETS = [
  { id: '1M', label: '1M', back: 0 },
  { id: '3M', label: '3M', back: 2 },
  { id: '6M', label: '6M', back: 5 },
  { id: 'YTD', label: 'YTD', back: null as number | null },
  { id: '12M', label: '12M', back: LAST },
]

/** Deposit-capable accounts + their stable share of total inflow (debt
 *  accounts can't receive deposits, so they're excluded from the filter). */
const INFLOW_ACCOUNTS = [
  { name: 'Operations Checking', share: 0.68 },
  { name: 'Reserve // High-Yield', share: 0.16 },
  { name: 'Index Fund // VTSAX', share: 0.11 },
  { name: 'Roth IRA', share: 0.05 },
]
const ACCOUNT_OPTIONS = INFLOW_ACCOUNTS.map((a) => ({
  value: a.name,
  label: a.name,
  hint: `${Math.round(a.share * 100)}%`,
}))

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/* Income sources normalised to a monthly-equivalent → fixed share of inflow.
   (Composition is structural; the period total scales it in the donut.) */
const CADENCE_PER_MONTH: Record<string, number> = {
  Weekly: 52 / 12,
  Biweekly: 26 / 12,
  Monthly: 1,
  Quarterly: 1 / 3,
  Annual: 1 / 12,
}
const INCOME_SHARES = (() => {
  const monthly = data.income.map((s) => s.amount * (CADENCE_PER_MONTH[s.cadence] ?? 1))
  const total = sum(monthly)
  return data.income.map((s, i) => ({ label: s.source, glow: s.glow, share: monthly[i] / total }))
})()

function IncomeAnalyzer({ from, to, accounts }: { from: string; to: string; accounts: string[] }) {
  const m = useMemo(() => {
    const fromIdx = dateToIdx(from)
    const toIdx = dateToIdx(to)
    // selected accounts' shares sum to the period multiplier (all → 1.0, none → 0)
    const share = accounts.reduce((s, name) => s + (INFLOW_ACCOUNTS.find((a) => a.name === name)?.share ?? 0), 0)
    const inc = data.cashflow.income.slice(fromIdx, toIdx + 1).map((v) => v * share)
    const exp = data.cashflow.expense.slice(fromIdx, toIdx + 1)
    const net = inc.map((v, i) => v - exp[i])
    const n = inc.length || 1
    const totalInflow = sum(inc)
    const totalOutflow = sum(exp)
    const prorated = totalInflow / n
    const coverage = totalOutflow ? totalInflow / totalOutflow : 0
    const surplus = totalInflow - totalOutflow
    const peakVal = Math.max(...inc)
    const peakMonth = MONTHS[fromIdx + inc.indexOf(peakVal)]

    // running totals for the pacing chart
    const cum = (xs: number[]) => {
      let a = 0
      return xs.map((v) => (a += v))
    }
    const cumInflow = cum(inc)
    const cumNet = cum(net)
    const monthlyRates = inc.map((v, i) => (v > 0 ? (v - exp[i]) / v : 0))
    const savingsRate = totalInflow > 0 ? surplus / totalInflow : 0

    // income composition over the period (shares fixed, total scales)
    const sourceSlices = INCOME_SHARES.map((sh) => ({ label: sh.label, value: totalInflow * sh.share, glow: sh.glow }))

    // inflow transactions within the selected range, most recent first
    // (txns aren't account-mapped, so we gate on "any account selected")
    const deposits =
      share > 0
        ? data.transactions
            .filter((t) => t.amount > 0 && txnIso(t.date) >= from && txnIso(t.date) <= to)
            .sort((a, b) => txnIso(b.date).localeCompare(txnIso(a.date)))
            .slice(0, 6)
        : []

    return {
      fromIdx, toIdx, share, inc, totalInflow, totalOutflow, prorated, coverage, surplus, n, peakVal, peakMonth,
      cumInflow, cumNet, monthlyRates, savingsRate, sourceSlices, deposits,
    }
  }, [from, to, accounts])

  const acctLabel =
    accounts.length === INFLOW_ACCOUNTS.length
      ? 'All accounts'
      : accounts.length === 0
        ? 'No accounts'
        : accounts.length === 1
          ? accounts[0].split(' // ')[0]
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
          dir={covPositive ? 'up' : 'down'}
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

/** Period KPI card — micro-label, big tabular value (re-keys for a soft fade
 *  when the filters change it), optional delta line. */
function HeroMetric({
  label,
  value,
  sub,
  dir,
  valueClass = '',
}: {
  label: string
  value: string
  sub?: string
  dir?: 'up' | 'down'
  valueClass?: string
}) {
  return (
    <Tile className="flex flex-col">
      <div className="micro text-muted">{label}</div>
      <motion.div
        key={value}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={`mt-2 text-[28px] font-bold tabular-nums tracking-tight ${valueClass}`}
      >
        {value}
      </motion.div>
      {sub && (
        <div className={`mt-1.5 text-[12px] font-semibold ${dir === 'down' ? 'text-neg' : dir === 'up' ? 'text-pos' : 'text-muted'}`}>
          {sub}
        </div>
      )}
    </Tile>
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

/** Minimal axis-less trend line for the savings-rate history. */
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

/** Savings-rate ring (rate %) + amount saved, a monthly-rate sparkline and a
 *  delta vs a target benchmark. Ring fill clamps to [0,1]; deficit reads red. */
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
