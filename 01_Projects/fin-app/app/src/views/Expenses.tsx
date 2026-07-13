import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import CapacityMeter from '../components/CapacityMeter'
import TransactionsPanel from '../components/TransactionsPanel'
import ExpenseTrendCard from '../components/ExpenseTrendCard'
import SegmentedTabs from '../components/SegmentedTabs'
import HeroMetric from '../components/HeroMetric'
import AnalyzerFilters from '../components/AnalyzerFilters'
import { usePeriodRange } from '../hooks/usePeriodRange'
import { txnIso, iso } from '../lib/period'
import { data, fmt } from '../data'

/** Vendor names carry a `Primary // Detail` form; the hero card shows the
 *  primary so long names don't overflow. */
const shortMerchant = (name: string) => name.split(' // ')[0]

const TABS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'recurring', label: 'Recurring hub' },
]

/** Accounts money flows out of + their stable share of total outflow (deposit-
 *  and invest-only accounts don't fund spending, so they're excluded). Mirrors
 *  the inflow-share model on the Income analyzer. */
const OUTFLOW_ACCOUNTS = [
  { name: 'Operations Checking', share: 0.66 },
  { name: 'Sapphire Credit Line', share: 0.24 },
  { name: 'Auto Loan // Vehicle', share: 0.1 },
]
const ACCOUNT_OPTIONS = OUTFLOW_ACCOUNTS.map((a) => ({
  value: a.name,
  label: a.name,
  hint: `${Math.round(a.share * 100)}%`,
}))

export default function Expenses() {
  const [view, setView] = useState('analytics')
  // Filter state lives here so the controls can sit in the page header toolbar,
  // while the analytics content below consumes it. Analytics-only.
  const { preset, from, to, applyPreset, changeFrom, changeTo } = usePeriodRange()
  const [accounts, setAccounts] = useState<string[]>(OUTFLOW_ACCOUNTS.map((a) => a.name))

  return (
    <Screen>
      {/* Header — title + primary view switch (row 1), then an analytics-only
          filter bar (row 2). Elevated z-index so the popovers overlay content. */}
      <div className="relative z-30 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <ViewHeader index="04 — Outflow" title="Expenses" sub="Cash flow, ledger & budget capacity" />
          <div className="pt-1.5">
            <SegmentedTabs tabs={TABS} active={view} onChange={setView} layoutId="expenses-tabs" />
          </div>
        </div>

        {view === 'analytics' && (
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
            rangeLayoutId="expenses-range"
          />
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === 'analytics' ? (
          <motion.div
            key="analytics"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <ExpenseAnalytics from={from} to={to} accounts={accounts} />
          </motion.div>
        ) : (
          <motion.div
            key="recurring"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            <Grid>
              <Tile title="Recurring hub" tag="coming soon" span={3}>
                <div className="grid place-items-center gap-3 py-16 text-center">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                  <div className="font-display text-[16px] font-bold text-ink">Command your recurring costs</div>
                  <p className="max-w-[440px] text-[13px] leading-relaxed text-muted">
                    Surface every subscription and standing charge, catch silent price creep, forecast
                    upcoming debits, and stay ahead of renewals. This view is on the way.
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

/* ── Expense analytics ───────────────────────────────────────────────────
   Header toolbar (period range · spending accounts) drives the cash-flow
   pacing chart and the outflow ledger; budget capacity is cycle-based. */

function ExpenseAnalytics({ from, to, accounts }: { from: string; to: string; accounts: string[] }) {
  const m = useMemo(() => {
    // any selected account → the full itemised outflow set (txns aren't
    // account-mapped, so account selection gates all-or-nothing)
    const gated = accounts.some((name) => OUTFLOW_ACCOUNTS.some((a) => a.name === name))

    // Day-level outflows within a range. Transactions aren't account-mapped, so
    // account selection gates all-or-nothing (any account → the full set). The
    // hero cards + ledger share this itemised set so their figures reconcile.
    const outflowsIn = (a: string, b: string) =>
      gated ? data.transactions.filter((t) => t.amount < 0 && txnIso(t.date) >= a && txnIso(t.date) <= b) : []
    const outflows = outflowsIn(from, to).sort((x, y) => txnIso(y.date).localeCompare(txnIso(x.date)))

    // Previous window of equal length (in days) for the vs-prev indicators.
    const DAY = 86400000
    const fromD = new Date(`${from}T00:00:00`)
    const toD = new Date(`${to}T00:00:00`)
    const lenDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / DAY) + 1)
    const prevOutflows = outflowsIn(iso(new Date(fromD.getTime() - lenDays * DAY)), iso(new Date(fromD.getTime() - DAY)))

    const sumAbs = (xs: typeof outflows) => xs.reduce((a, t) => a + Math.abs(t.amount), 0)
    const total = sumAbs(outflows)
    const prevTotal = sumAbs(prevOutflows)
    const dailyAvg = total / lenDays
    const deltaPct = prevTotal > 0 ? (total - prevTotal) / prevTotal : null

    // Top category + top vendor by spend over the period.
    const topBy = (key: (t: (typeof outflows)[number]) => string) => {
      const totals = new Map<string, number>()
      outflows.forEach((t) => totals.set(key(t), (totals.get(key(t)) ?? 0) + Math.abs(t.amount)))
      let top = { name: '—', total: 0 }
      totals.forEach((v, k) => { if (v > top.total) top = { name: k, total: v } })
      return top
    }
    const topCat = topBy((t) => t.cat)
    const topMerch = topBy((t) => t.merchant)
    const topCatShare = total > 0 ? topCat.total / total : 0

    return { outflows, total, prevTotal, dailyAvg, deltaPct, lenDays, topCat, topCatShare, topMerch }
  }, [from, to, accounts])

  // Spending semantics: an increase reads unfavourable (red ▲), a decrease favourable (green ▼).
  const deltaTone = m.deltaPct == null || m.deltaPct === 0 ? 'muted' : m.deltaPct > 0 ? 'neg' : 'pos'
  const deltaText =
    m.deltaPct == null
      ? null
      : `${m.deltaPct > 0 ? '▲' : m.deltaPct < 0 ? '▼' : '±'} ${Math.abs(Math.round(m.deltaPct * 100))}% vs prev`

  return (
    <Grid>
      {/* Row 1 — period KPI hero cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
        <HeroMetric
          label="Outflow period total"
          value={fmt(m.total)}
          sub={deltaText ? `${deltaText} · was ${fmt(m.prevTotal)}` : 'no prior period'}
          tone={deltaTone}
        />
        <HeroMetric
          label="Daily average outflow"
          value={fmt(m.dailyAvg)}
          sub={deltaText ? `${deltaText} · ${m.lenDays} days` : `over ${m.lenDays} days`}
          tone={deltaTone}
        />
        <HeroMetric
          label="Heavyweight category"
          value={m.topCat.name}
          valueClass="truncate"
          sub={m.topCat.total > 0 ? `${fmt(m.topCat.total)} · ${Math.round(m.topCatShare * 100)}% of outflow` : 'no spending'}
        />
        <HeroMetric
          label="Top vendor"
          value={shortMerchant(m.topMerch.name)}
          valueClass="truncate"
          sub={m.topMerch.total > 0 ? `${fmt(m.topMerch.total)} · highest cost` : 'no vendors'}
        />
      </div>

      {/* Row 2 — spending-over-time (tabbed) + budget capacity */}
      <ExpenseTrendCard outflows={m.outflows} from={from} to={to} />
      <Tile title="Budget capacity" tag="this cycle">
        {data.shields.slice(0, 4).map((s, i) => (
          <CapacityMeter key={s.category} shield={s} delay={i * 0.05} />
        ))}
      </Tile>
      <TransactionsPanel rows={m.outflows} />
    </Grid>
  )
}
