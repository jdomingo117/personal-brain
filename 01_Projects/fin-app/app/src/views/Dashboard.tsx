import { useState } from 'react'
import HeroCard from '../components/HeroCard'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import Stat from '../components/Stat'
import AllocationDonut from '../components/AllocationDonut'
import Ledger from '../components/Ledger'
import TransactionCategoryDrawer from '../components/TransactionCategoryDrawer'
import Area from '../components/charts/Area'
import Bar from '../components/charts/Bar'
import { fmt, fmtCents, glowColor, type Glow } from '../data'
import { useData } from '../contexts/DataContext'
import { earnedIncomeCents, expenseEffectCents, isGrossExpense } from '../lib/classification'
import { useView } from '../router'
import { MONTHS, TODAY, addDays, iso } from '../lib/period'

// Single source of truth for the Recent Activity tile, so its row count and
// its "last N" tag text can't drift apart the way they used to (tag said 5,
// body sliced 10).
const RECENT_ACTIVITY_COUNT = 10

function getAccountIcon(type: string, name: string) {
  const t = type.toLowerCase()
  const n = name.toLowerCase()

  if (n.includes('car') || n.includes('auto') || n.includes('vehicle')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    )
  }
  if (t === 'debt' || n.includes('credit') || n.includes('card')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
        <line x1="6" x2="10" y1="14" y2="14" />
      </svg>
    )
  }
  if (t === 'invest' || n.includes('ira') || n.includes('fund') || n.includes('vtsax')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="m3 16 4-4 4 4 9-9" />
        <path d="M16 7h4v4" />
      </svg>
    )
  }
  if (t === 'savings' || n.includes('reserve') || n.includes('yield')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  )
}

export default function Dashboard() {
  const { profile, accounts, reportingTransactions: transactions, netWorthHistory, refreshData } = useData()
  const { go, toast } = useView()
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null)
  const selectedTransaction = selectedTransactionId
    ? transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null
    : null

  const refreshAfterTransactionEdit = async () => {
    await refreshData()
    toast({ title: 'Transaction updated', sub: 'Dashboard activity has been refreshed.' })
  }
  
  // Calculate flow — a real trailing 30-CALENDAR-day window (today - 29
  // through today), not "the last 30 transactions". A transaction-count slice
  // silently drifts wider or narrower than 30 days depending on how many
  // transactions actually happened recently.
  const thirtyDaysAgoIso = iso(addDays(new Date(), -29))
  const recentTxns = transactions.filter(t => t.date >= thirtyDaysAgoIso && t.date <= TODAY && !t.isTransfer && !t.pending)
  const inc = recentTxns.reduce((sum, t) => sum + earnedIncomeCents(t), 0)
  const spend = recentTxns.reduce((sum, t) => sum + expenseEffectCents(t), 0)
  const savings = inc === 0 ? 0 : Math.round(((inc - spend) / inc) * 100)
  const percentOfInflow = inc === 0 ? 0 : Math.round((spend / inc) * 100)

  // Real vs-prior-30-days comparison (days 30-59 ago), replacing the old
  // hardcoded +4.2%/-1.8% badges. 0% when there's no prior-window data to
  // compare against, not a claim that nothing changed.
  const sixtyDaysAgoIso = iso(addDays(new Date(), -59))
  const priorTxns = transactions.filter(t => t.date >= sixtyDaysAgoIso && t.date < thirtyDaysAgoIso && !t.isTransfer && !t.pending)
  const priorInc = priorTxns.reduce((sum, t) => sum + earnedIncomeCents(t), 0)
  const priorSpend = priorTxns.reduce((sum, t) => sum + expenseEffectCents(t), 0)
  const incChangePct = priorInc === 0 ? 0 : Math.round(((inc - priorInc) / priorInc) * 1000) / 10
  const spendChangePct = priorSpend === 0 ? 0 : Math.round(((spend - priorSpend) / priorSpend) * 1000) / 10
  
  // Calculate allocation from actual accounts. `Liquid` and `Savings` are
  // both spendable cash — the type split exists for account *behavior*
  // elsewhere in the app (e.g. transfer matching), not for "is this cash".
  // `Debt`/`Credit Card`/`Loan` are liabilities, not assets, so they're left
  // out of this donut entirely (consistent with Math.max(0, ...) already
  // flooring a negative balance to 0 rather than counting it as negative cash).
  const CASH_TYPES = new Set(['liquid', 'savings'])
  const liquidSum = accounts.filter(a => CASH_TYPES.has(a.type.toLowerCase())).reduce((sum, a) => sum + Math.max(0, a.balance), 0)
  const investSum = accounts.filter(a => a.type.toLowerCase() === 'invest').reduce((sum, a) => sum + Math.max(0, a.balance), 0)
  
  const allocation = []
  if (investSum > 0) allocation.push({ label: 'Investments', value: investSum, glow: 'green' as Glow })
  if (liquidSum > 0) allocation.push({ label: 'Cash', value: liquidSum, glow: 'cyan' as Glow })
  if (allocation.length === 0) {
    allocation.push({ label: 'Cash', value: 0, glow: 'cyan' as Glow })
  }

  // Spending insights use settled, real outflows only.  Unlike the old
  // capacity tile, they don't invent a budget baseline when the person has
  // not actually configured one.
  const recentExpenses = recentTxns.filter(isGrossExpense)
  const catSpending: Record<string, number> = {}
  recentExpenses.forEach(t => {
    if (t.cat) catSpending[t.cat] = (catSpending[t.cat] || 0) + Math.abs(t.amount)
  })
  const rankedCategories = Object.entries(catSpending)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
  const topCategory = rankedCategories[0] ?? null
  const topCategoryShare = spend > 0 && topCategory ? Math.round((topCategory.amount / spend) * 100) : 0

  const priorCatSpending: Record<string, number> = {}
  priorTxns.filter(isGrossExpense).forEach(t => {
    if (t.cat) priorCatSpending[t.cat] = (priorCatSpending[t.cat] || 0) + Math.abs(t.amount)
  })
  const largestCategoryChange = Array.from(new Set([...Object.keys(catSpending), ...Object.keys(priorCatSpending)]))
    .map((category) => ({
      category,
      amount: catSpending[category] ?? 0,
      delta: (catSpending[category] ?? 0) - (priorCatSpending[category] ?? 0),
    }))
    .filter((change) => change.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] ?? null
  const reviewCount = recentExpenses.filter((t) => t.cat === 'Uncategorized' || t.needsReview).length

  // Net worth trend calculated dynamically from transactions
  const currentNetWorth = accounts.reduce((sum, a) => sum + a.balance, 0)
  
  const fallbackNetWorthTrend: number[] = []
  let runningNW = currentNetWorth
  
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    fallbackNetWorthTrend.unshift(runningNW)
    
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthStartIso = d.toISOString().split('T')[0]
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const nextMonthIso = nextMonth.toISOString().split('T')[0]
    
    // Pending (HELD) transactions may still change on settlement — excluded
    // here for the same reason every other aggregate in this app waits for
    // settlement, so the trend doesn't wobble as holds resolve.
    const txnsInMonth = transactions.filter(t => t.date >= monthStartIso && t.date < nextMonthIso && !t.pending)
    const monthDelta = txnsInMonth.reduce((sum, t) => sum + t.amount, 0)

    runningNW -= monthDelta
  }
  const visibleNetWorthHistory = netWorthHistory.slice(-12)
  const netWorthTrend = visibleNetWorthHistory.length > 0
    ? visibleNetWorthHistory.map((point) => point.value)
    : fallbackNetWorthTrend
  const netWorthLabels = visibleNetWorthHistory.length > 0
    ? visibleNetWorthHistory.map((point) => point.month.slice(0, 7))
    : MONTHS

  // Net worth as of the start of the current calendar month — the second-to-
  // last trend point, a byproduct of the loop above. Reused instead of a
  // second calculation to drive the hero card's real "this month" badge.
  const netWorthMonthStart = netWorthTrend[netWorthTrend.length - 2] ?? currentNetWorth
  const netWorthMonthChangePct = netWorthMonthStart === 0
    ? 0
    : Math.round(((currentNetWorth - netWorthMonthStart) / Math.abs(netWorthMonthStart)) * 1000) / 10

  const [chartType, setChartType] = useState<'line' | 'bar'>('line')

  return (
    <Screen>
      <ViewHeader index="01 — Command" title="Dashboard" sub="Your finances at a glance" />
      {/* 
        GRID LAYOUT GUIDE:
        - The <Grid> wrapper is defined in 'app/src/components/Screen.tsx'.
        - On desktop, it is a 3-column layout (class 'xl:grid-cols-3').
        - On mobile/tablet, it defaults to a 1-column layout.
      */}
      <Grid>
        {/* 
          Row 1: Three Hero KPI Cards 
          Each card takes up 1 column by default, filling the 3-column row on desktop.
        */}
        <div className="relative">
          <HeroCard variant="tile" monthChangePct={netWorthMonthChangePct} />
        </div>

        <Tile>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">30-day income flow</div>
          <div className="mt-2 text-[32px] font-bold tabular-nums tracking-tight">{fmt(inc)}</div>
          <div className={`mt-1.5 text-[12.5px] font-semibold ${incChangePct >= 0 ? 'text-pos' : 'text-neg'}`}>
            {incChangePct >= 0 ? '▲' : '▼'} {incChangePct >= 0 ? '+' : ''}{incChangePct}% vs prior 30 days · {savings}% savings rate
          </div>
        </Tile>

        <Tile>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">30-day expense flow</div>
          <div className="mt-2 text-[32px] font-bold tabular-nums tracking-tight">{fmt(spend)}</div>
          <div className={`mt-1.5 text-[12.5px] font-semibold ${spendChangePct <= 0 ? 'text-pos' : 'text-neg'}`}>
            {spendChangePct <= 0 ? '▼' : '▲'} {spendChangePct >= 0 ? '+' : ''}{spendChangePct}% vs prior 30 days · {percentOfInflow}% of inflow
          </div>
        </Tile>

        {/* 
          Row 2: Custom Flex Layout for Precise Proportions
          - 'md:col-span-2 xl:col-span-3' makes this row span the full width of the grid.
          - 'flex flex-col xl:flex-row' makes the items stack vertically on tablet, and sit side-by-side on desktop.
          - 'gap-3.5' controls the horizontal/vertical spacing between the tiles.
        */}
        <div className="md:col-span-2 xl:col-span-3 flex flex-col xl:flex-row gap-3.5">
          {/* 
            Left Tile Wrapper (Cumulative Net Worth):
            - 'xl:w-[55%]' sets a precise horizontal width proportion (55% on desktop).
            - Change this percentage (e.g. xl:w-[60%]) to adjust the chart card's width.
          */}
          <div className="w-full xl:w-[55%] flex-shrink-0 flex flex-col">
            <Tile
              title="Cumulative net worth"
              tag={
                <div className="flex items-center gap-1.5 -my-1">
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.06em] uppercase transition ${
                      chartType === 'line'
                        ? 'bg-ink text-surface'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.06em] uppercase transition ${
                      chartType === 'bar'
                        ? 'bg-ink text-surface'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Bar
                  </button>
                </div>
              }
              className="h-full pb-3.5"
            >
              <div className="mt-1">
                {chartType === 'line' ? (
                  <Area key="line" series={[{ data: netWorthTrend, color: 'var(--color-accent)' }]} labels={netWorthLabels} height={240} />
                ) : (
                  <Bar key="bar" series={[{ data: netWorthTrend, color: 'var(--color-accent)' }]} labels={netWorthLabels} height={240} />
                )}
              </div>
            </Tile>
          </div>

          {/* 
            Right Tile Wrapper (Asset Allocation):
            - 'xl:flex-1' makes this tile dynamically take up all remaining horizontal space on desktop (100% - 55% = 45%).
            - Changing the left tile's percentage automatically recalculates this card's width.
          */}
          <div className="w-full xl:flex-1 flex flex-col">
            <Tile title="Asset allocation" className="h-full pb-3.5">
              <AllocationDonut data={allocation} />
            </Tile>
          </div>
        </div>

        {/* Row 3: account inventory + data-backed spending observations. */}
        <Tile title="Holdings" tag={`${accounts.length} linked`}>
          <div className="mt-2 grid gap-1.5">
            {accounts.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-3 py-2 px-2.5 -mx-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-[10px] cursor-pointer transition duration-200"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `color-mix(in srgb, ${glowColor[a.glow as Glow]} 12%, transparent)`,
                    color: glowColor[a.glow as Glow],
                  }}
                >
                  {getAccountIcon(a.type, a.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink truncate">{a.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.06em] text-muted mt-0.5">{a.type}</div>
                </div>
                <div className={`text-[13.5px] font-bold tabular-nums ${a.balance < 0 ? 'text-neg' : 'text-ink'}`}>
                  {fmtCents(a.balance)}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        <SpendingInsights
          topCategory={topCategory}
          topCategoryShare={topCategoryShare}
          largestCategoryChange={largestCategoryChange}
          savings={savings}
          income={inc}
          reviewCount={reviewCount}
          onExploreExpenses={() => go('expenses', { state: { source: 'dashboard-insight', from: thirtyDaysAgoIso, to: TODAY } })}
          onExploreCategory={(category) => go('expenses', { state: { source: 'dashboard-insight', category, from: thirtyDaysAgoIso, to: TODAY } })}
          onReviewLedger={() => go('ledger', { state: { source: 'dashboard-insight', review: 'needs-review' } })}
          onExploreIncome={() => go('income')}
        />

        {/* 
          Row 4: Recent Activity 
          - 'span={3}' translates to 'md:col-span-2 xl:col-span-3', stretching this card across the full width (3 columns) at the bottom.
        */}
        <Tile title="Recent activity" tag={`last ${RECENT_ACTIVITY_COUNT}`} span={3}>
          {transactions.length > 0 ? <Ledger rows={transactions.slice(0, RECENT_ACTIVITY_COUNT)} onEdit={(transaction) => setSelectedTransactionId(transaction.id)} /> : (
            <div className="py-10 text-center"><p className="body-copy">No settled transactions yet.</p>
              <button type="button" onClick={() => go('ingestion')} className="mt-3 text-[13px] font-semibold text-accent hover:opacity-80">Import a statement</button>
            </div>
          )}
        </Tile>
      </Grid>
      <TransactionCategoryDrawer
        transaction={selectedTransaction}
        onClose={() => setSelectedTransactionId(null)}
        onChanged={refreshAfterTransactionEdit}
      />
    </Screen>
  )
}

type CategoryAmount = { category: string; amount: number }
type CategoryChange = CategoryAmount & { delta: number }

function SpendingInsights({
  topCategory,
  topCategoryShare,
  largestCategoryChange,
  savings,
  income,
  reviewCount,
  onExploreExpenses,
  onExploreCategory,
  onReviewLedger,
  onExploreIncome,
}: {
  topCategory: CategoryAmount | null
  topCategoryShare: number
  largestCategoryChange: CategoryChange | null
  savings: number
  income: number
  reviewCount: number
  onExploreExpenses: () => void
  onExploreCategory: (category: string) => void
  onReviewLedger: () => void
  onExploreIncome: () => void
}) {
  if (!topCategory) {
    return (
      <Tile title="Spending insights" tag="last 30 days" span={2} className="flex min-h-[300px] flex-col">
        <div className="flex flex-1 flex-col items-start justify-center rounded-[14px] border border-dashed border-[var(--hair)] bg-[var(--hair-soft)] px-5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">No settled outflows yet</span>
          <p className="mt-2 max-w-md text-[15px] leading-6 text-muted">Insights appear once spending activity has settled. Importing a statement or reviewing recent activity will make this panel useful.</p>
          <button type="button" onClick={onReviewLedger} className="mt-5 text-[14px] font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
            Review transactions →
          </button>
        </div>
      </Tile>
    )
  }

  const changeDirection = (largestCategoryChange?.delta ?? 0) >= 0 ? 'increased' : 'decreased'
  const changeTone = changeDirection === 'increased' ? 'text-neg' : 'text-pos'

  return (
    <Tile
      title="Spending insights"
      tag={<button type="button" onClick={onExploreExpenses} className="font-semibold text-accent-ink transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">View all spending →</button>}
      span={2}
      className="flex min-h-[300px] flex-col overflow-hidden"
    >
      <div className="flex flex-1 flex-col gap-3.5">
        <button
          type="button"
          onClick={() => onExploreCategory(topCategory.category)}
          aria-label={`Explore ${topCategory.category} spending for the last 30 days`}
          className="group w-full rounded-[14px] border border-[color-mix(in_srgb,var(--color-accent)_35%,var(--hair))] bg-[var(--accent-wash)] px-4 py-3.5 text-left transition hover:border-accent/60 hover:bg-[color-mix(in_srgb,var(--accent-wash)_72%,var(--surface))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Largest outflow</p>
              <p className="mt-1.5 max-w-xl text-[17px] font-semibold leading-6 tracking-tight text-ink">
                <span className="text-accent-ink">{topCategory.category}</span> was your largest outflow: {fmt(topCategory.amount)} ({topCategoryShare}% of spending).
              </p>
              <p className="mt-2 body-copy">Explore this category in the Expenses analysis <span className="font-semibold text-accent-ink group-hover:underline">→</span></p>
            </div>
            <span aria-hidden="true" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-accent/30 bg-[var(--surface)] text-[16px] font-bold tabular-nums text-accent-ink">{topCategoryShare}%</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--track)]">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, topCategoryShare)}%` }} />
          </div>
        </button>

        <div className="grid gap-3 sm:grid-cols-2">
          {largestCategoryChange ? (
            <InsightAction
              eyebrow="Period change"
              sentence={`${largestCategoryChange.category} ${changeDirection} by ${fmt(Math.abs(largestCategoryChange.delta))} versus the prior 30 days.`}
              tone={changeTone}
              action="Explore category →"
              onClick={() => onExploreCategory(largestCategoryChange.category)}
            />
          ) : (
            <InsightSentence eyebrow="Period change" sentence="A comparison will appear once a prior 30-day period is available." />
          )}
          {reviewCount > 0 ? (
            <InsightAction
              eyebrow="Needs attention"
              sentence={`${reviewCount} transaction${reviewCount === 1 ? '' : 's'} need${reviewCount === 1 ? 's' : ''} review before this period is fully classified.`}
              tone="text-warn"
              action="Review transactions →"
              onClick={onReviewLedger}
            />
          ) : (
            <InsightAction
              eyebrow="Cash flow"
              sentence={income > 0 ? `You saved ${savings}% of settled inflow after spending this period.` : 'A savings insight will appear once settled inflow is recorded.'}
              tone={income > 0 ? (savings >= 0 ? 'text-pos' : 'text-neg') : 'text-muted'}
              action="Explore income →"
              onClick={onExploreIncome}
            />
          )}
        </div>
      </div>
      <p className="mt-4 border-t border-[var(--hair-soft)] pt-3.5 text-[11.5px] text-muted">Based on settled activity from the last 30 days.</p>
    </Tile>
  )
}

function InsightAction({ eyebrow, sentence, tone, action, onClick }: { eyebrow: string; sentence: string; tone: string; action: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-[12px] border border-[var(--hair-soft)] bg-[var(--input-bg)] px-3.5 py-3 text-left transition hover:border-accent/50 hover:bg-[var(--hair-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{eyebrow}</p>
      <p className={`mt-1.5 text-[14px] font-medium leading-5 ${tone}`}>{sentence}</p>
      <p className="mt-2 text-[12.5px] font-semibold text-accent-ink group-hover:underline">{action}</p>
    </button>
  )
}

function InsightSentence({ eyebrow, sentence }: { eyebrow: string; sentence: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--hair-soft)] bg-[var(--input-bg)] px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{eyebrow}</p>
      <p className="mt-1.5 text-[14px] leading-5 text-muted">{sentence}</p>
    </div>
  )
}
