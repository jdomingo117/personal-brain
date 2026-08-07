import { useMemo, useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import TransactionsPanel from '../components/TransactionsPanel'
import ExpenseTrendCard from '../components/ExpenseTrendCard'
import ExpenseFlowCard from '../components/ExpenseFlowCard'
import ExpensePacingCard from '../components/ExpensePacingCard'

import ExpenseScopeBar from '../components/ExpenseScopeBar'
import SegmentedTabs from '../components/SegmentedTabs'
import HeroMetric from '../components/HeroMetric'
import AnalyzerFilters from '../components/AnalyzerFilters'
import RecurringHub from '../components/RecurringHub'
import { usePeriodRange } from '../hooks/usePeriodRange'
import { iso } from '../lib/period'
import { shortMerchant } from '../lib/recurring'
import {
  EMPTY_SELECTION,
  isActive,
  matchesSelection,
  pruneSubcats,
  selectionLabel,
  toggleCategory,
  toggleSubcat,
  type CatSelection,
} from '../lib/expenseSelection'
import { fmt, type Txn } from '../data'
import { useData } from '../contexts/DataContext'

/** Vendor names carry a `Primary // Detail` form; the hero card shows the
 *  primary so long names don't overflow. */

const TABS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'recurring', label: 'Recurring hub' },
]

export default function Expenses() {
  const [view, setView] = useState('analytics')
  const { preset, from, to, applyPreset, changeFrom, changeTo } = usePeriodRange()
  const { accounts: dbAccounts, transactions } = useData()

  const OUTFLOW_ACCOUNTS = useMemo(() => {
    if (!dbAccounts || dbAccounts.length === 0) return []
    return dbAccounts.map(a => ({ id: a.id, name: a.name, share: 1 / dbAccounts.length }))
  }, [dbAccounts])

  const ACCOUNT_OPTIONS = useMemo(() => OUTFLOW_ACCOUNTS.map((a) => ({
    value: a.id,
    label: a.name,
    hint: '',
  })), [OUTFLOW_ACCOUNTS])

  const [accounts, setAccounts] = useState<string[]>([])
  
  // Set default selected accounts once dbAccounts loads
  useEffect(() => {
    if (dbAccounts.length > 0 && accounts.length === 0) {
      setAccounts(dbAccounts.map(a => a.id))
    }
  }, [dbAccounts])

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
            <RecurringHub />
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  )
}

/* ── Expense analytics ───────────────────────────────────────────────────
   Header toolbar (period range · spending accounts) drives the cash-flow
   pacing chart and the outflow ledger; budget capacity is cycle-based.

   A single category focus (`sel`) is shared across the tiles. The two
   comparison tiles (flow · pacing) are its *sources* and never filter
   themselves — they highlight, because filtering a part-to-whole view down to
   one part deletes the comparison that is the question. Everything that answers
   "how much / which ones?" (hero · trend · ledger) follows the focus. */

const sumAbs = (xs: Txn[]) => xs.reduce((a, t) => a + Math.abs(t.amount), 0)

/** Highest-spending `key` over a set of outflows. */
const topBy = (xs: Txn[], key: (t: Txn) => string) => {
  const totals = new Map<string, number>()
  xs.forEach((t) => totals.set(key(t), (totals.get(key(t)) ?? 0) + Math.abs(t.amount)))
  let top = { name: '—', total: 0 }
  totals.forEach((v, k) => { if (v > top.total) top = { name: k, total: v } })
  return top
}

function ExpenseAnalytics({ from, to, accounts }: { from: string; to: string; accounts: string[] }) {
  const [sel, setSel] = useState<CatSelection>(EMPTY_SELECTION)
  const [timeFocus, setTimeFocus] = useState<{ from: string; to: string; label: string } | null>(null)

  // Reset timeFocus if the base date range changes
  useEffect(() => {
    setTimeFocus(null)
  }, [from, to])

  // The expensive pass: scans of `data.transactions`, keyed to the period and
  // account filters only — so clicking a category never re-runs them.
  const { transactions } = useData()
  const base = useMemo(() => {
    const gated = accounts.length > 0

    // Day-level outflows within a range.
    const outflowsIn = (a: string, b: string) =>
      gated ? transactions.filter((t) => t.amount < 0 && !t.isTransfer && !t.pending && t.account_id && accounts.includes(t.account_id) && t.date >= a && t.date <= b) : []
    const outflows = outflowsIn(from, to).sort((x, y) => y.date.localeCompare(x.date))

    // Previous window of equal length (in days) for the vs-prev indicators.
    const DAY = 86400000
    const fromD = new Date(`${from}T00:00:00`)
    const toD = new Date(`${to}T00:00:00`)
    const lenDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / DAY) + 1)
    const prevOutflows = outflowsIn(iso(new Date(fromD.getTime() - lenDays * DAY)), iso(new Date(fromD.getTime() - DAY)))

    // Unfiltered period total
    return { gated, outflows, prevOutflows, lenDays, periodTotal: sumAbs(outflows) }
  }, [from, to, accounts, transactions])

  // The cheap pass: the focus applied. `prevOutflows` MUST go through the same
  // predicate — comparing a focused total against an unfocused prior period
  // yields a plausible-looking, entirely wrong "vs prev".
  const m = useMemo(() => {
    const focused = isActive(sel)
    const catOutflows = focused ? base.outflows.filter((t) => matchesSelection(t, sel)) : base.outflows

    const outflows = timeFocus
      ? catOutflows.filter((t) => t.date >= timeFocus.from && t.date <= timeFocus.to)
      : catOutflows

    const activeFrom = timeFocus ? timeFocus.from : from
    const activeTo = timeFocus ? timeFocus.to : to

    const DAY = 86400000
    const activeFromD = new Date(`${activeFrom}T00:00:00`)
    const activeToD = new Date(`${activeTo}T00:00:00`)
    const activeLenDays = Math.max(1, Math.round((activeToD.getTime() - activeToD.getTime()) / DAY) + 1)

    const prevFrom = iso(new Date(activeFromD.getTime() - activeLenDays * DAY))
    const prevTo = iso(new Date(activeFromD.getTime() - DAY))

    const gated = base.gated
    const prior = gated
      ? transactions.filter((t) => t.amount < 0 && !t.isTransfer && !t.pending && t.account_id && accounts.includes(t.account_id) && t.date >= prevFrom && t.date <= prevTo)
      : []
    const prevOutflows = focused ? prior.filter((t) => matchesSelection(t, sel)) : prior

    const total = sumAbs(outflows)
    const prevTotal = sumAbs(prevOutflows)
    const topCat = topBy(outflows, (t) => t.cat)
    const topMerch = topBy(outflows, (t) => t.merchant)

    const unfilteredTimeTotal = timeFocus
      ? sumAbs(base.outflows.filter((t) => t.date >= timeFocus.from && t.date <= timeFocus.to))
      : base.periodTotal

    return {
      outflows,
      catOutflows,
      total,
      prevTotal,
      dailyAvg: total / activeLenDays,
      deltaPct: prevTotal > 0 ? (total - prevTotal) / prevTotal : null,
      lenDays: activeLenDays,
      gated,
      topCat,
      topMerch,
      topCatShare: total > 0 ? topCat.total / total : 0,
      periodShare: unfilteredTimeTotal > 0 ? total / unfilteredTimeTotal : 0,
      periodTotal: unfilteredTimeTotal,
    }
  }, [base, sel, timeFocus, from, to])

  const focused = isActive(sel)
  const focusLabel = selectionLabel(sel)

  /* Every mutation routes through the helpers so `subcats ⊆ union(TAXONOMY[categories])`
     can't be violated — an impossible pair matches zero rows with no explanation. */
  const setCategories = (next: string[]) =>
    setSel((s) => ({ categories: next, subcats: pruneSubcats(next, s.subcats) }))
  const setSubcats = (next: string[]) => setSel((s) => ({ ...s, subcats: next }))
  const onToggleCategory = (cat: string) => setSel((s) => toggleCategory(s, cat))
  const onToggleSubcat = (cat: string, sub: string) => setSel((s) => toggleSubcat(s, cat, sub))

  // Spending semantics: an increase reads unfavourable (red ▲), a decrease favourable (green ▼).
  const deltaTone = m.deltaPct == null || m.deltaPct === 0 ? 'muted' : m.deltaPct > 0 ? 'neg' : 'pos'
  const deltaText =
    m.deltaPct == null
      ? null
      : `${m.deltaPct > 0 ? '▲' : m.deltaPct < 0 ? '▼' : '±'} ${Math.abs(Math.round(m.deltaPct * 100))}% vs prev`

  const timeFilteredBaseOutflows = useMemo(() => {
    if (!timeFocus) return base.outflows
    return base.outflows.filter((t) => t.date >= timeFocus.from && t.date <= timeFocus.to)
  }, [base.outflows, timeFocus])

  if (accounts.length === 0) {
    return (
      <Grid>
        <div className="md:col-span-2 xl:col-span-3 py-16 text-center border border-[var(--hair-soft)] bg-[var(--hair-soft)] rounded-xl px-6 flex flex-col items-center gap-3">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-warn)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="12" x="2" y="6" rx="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M6 12h.01M18 12h.01" />
          </svg>
          <div className="font-display text-[16px] font-bold text-ink">No spending accounts selected</div>
          <p className="max-w-[440px] text-[13px] leading-relaxed text-muted">
            Please select at least one outflow account from the filter bar above to analyze transaction history, pacing, and category outflow.
          </p>
        </div>
      </Grid>
    )
  }

  return (
    <Grid>
      <ExpenseScopeBar
        selection={sel}
        label={focusLabel}
        onClear={() => setSel(EMPTY_SELECTION)}
        timeFocus={timeFocus}
        onClearTimeFocus={() => setTimeFocus(null)}
      />

      {/* Row 1 — period KPI hero cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
        <HeroMetric
          label={focused ? `${focusLabel} outflow` : 'Outflow period total'}
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
        {/* Under a focus "heavyweight category" is trivially the focused one, so the
            card swaps to the share of the whole — non-degenerate at any depth, and
            it re-links this row to the totals the comparison tiles still show.
            Keyed so the label and value transition together. */}
        {focused ? (
          <HeroMetric
            key="share"
            label="Share of outflow"
            value={`${Math.round(m.periodShare * 100)}%`}
            sub={m.total > 0 ? `${fmt(m.total)} of ${fmt(m.periodTotal)} period outflow` : 'no spending'}
          />
        ) : (
          <HeroMetric
            key="heavyweight"
            label="Heavyweight category"
            value={m.topCat.name}
            valueClass="truncate"
            sub={m.topCat.total > 0 ? `${fmt(m.topCat.total)} · ${Math.round(m.topCatShare * 100)}% of outflow` : 'no spending'}
          />
        )}
        <HeroMetric
          label="Top vendor"
          value={shortMerchant(m.topMerch.name)}
          valueClass="truncate"
          sub={
            m.topMerch.total > 0
              ? `${fmt(m.topMerch.total)} · highest ${focused ? `in ${focusLabel}` : 'cost'}`
              : 'no vendors'
          }
        />
      </div>

      {/* Row 2 — spending-over-time (left) + category-outflow flow (right), ~55/45.
          A nested grid so the split isn't limited to the 3-col grid's 33/67. */}
      <div className="grid grid-cols-1 gap-3.5 md:col-span-2 xl:col-span-3 xl:grid-cols-[1.15fr_1fr]">
        <ExpenseTrendCard
          outflows={m.catOutflows}
          from={from}
          to={to}
          scopeLabel={focused ? focusLabel : undefined}
          timeFocus={timeFocus}
          onTimeFocus={setTimeFocus}
        />
        {/* a selection *source*: takes the unfiltered set and highlights */}
        <ExpenseFlowCard
          outflows={timeFilteredBaseOutflows}
          selection={sel}
          onToggleCategory={onToggleCategory}
          onToggleSubcat={onToggleSubcat}
        />
      </div>
      {/* Row 3 — category pacing vs the prior window of equal length. Derives its
          own trailing history from the ledger, so it takes the range rather than
          the range-scoped `outflows` the cards above share. Also a source. */}
      <ExpensePacingCard
        from={timeFocus ? timeFocus.from : from}
        to={timeFocus ? timeFocus.to : to}
        gated={m.gated}
        selection={sel}
        onToggleCategory={onToggleCategory}
        onToggleSubcat={onToggleSubcat}
      />
      {/* Row 4 — transactions. `rows` stays UNFILTERED: this panel is the filterer,
          it just sources its category state from the shared focus now. Pre-filtering
          would zero out the popover's per-category counts. */}
      <TransactionsPanel
        rows={timeFilteredBaseOutflows}
        categories={sel.categories}
        subcats={sel.subcats}
        onCategories={setCategories}
        onSubcats={setSubcats}
      />
    </Grid>
  )
}
