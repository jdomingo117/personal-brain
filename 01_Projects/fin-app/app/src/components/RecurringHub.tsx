import { useMemo, useState } from 'react'
import { Grid } from './Screen'
import HeroMetric from './HeroMetric'
import RecurringDirectory from './RecurringDirectory'
import BillingCalendar from './BillingCalendar'
import Tile from './Tile'
import { buildRecurring, type FundingAccountSummary } from '../lib/recurring'
import { dayLabel, monthLabel } from '../lib/period'
import { fmt, glowColor } from '../data'
import { useData } from '../contexts/DataContext'

/* The recurring hub — "what am I committed to?", as opposed to the analytics
   tab's "what did I spend?".
   
   Equipped with:
   1. Funding accounts breakdown visual (stacked proportions track).
   2. Shared focus/highlight state between Directory, Accounts, and BillingCalendar (ui-ux-pro-max).
*/

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function FundingAccountsCard({
  accounts,
  hoveredAccount,
  onHoverAccount,
}: {
  accounts: FundingAccountSummary[]
  hoveredAccount: string | null
  onHoverAccount: (name: string | null) => void
}) {
  return (
    <Tile title="Funding accounts breakdown" tag="Monthly run rate">
      <div className="mb-4 mt-1 select-none">
        {/* proportion bar graphic */}
        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5 p-0.5 border border-[var(--hair-soft)]">
          {accounts.map((acc) => {
            const isHovered = hoveredAccount === acc.name
            const isOtherHovered = hoveredAccount !== null && !isHovered
            return (
              <div
                key={acc.name}
                onMouseEnter={() => onHoverAccount(acc.name)}
                onMouseLeave={() => onHoverAccount(null)}
                style={{
                  width: `${acc.percentage}%`,
                  background: glowColor[acc.glow],
                }}
                className={`h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full cursor-pointer ${
                  isOtherHovered ? 'opacity-30' : 'opacity-100 shadow-[0_0_8px_rgba(var(--color-accent),0.1)]'
                }`}
              />
            )
          })}
        </div>

        {/* accounts list */}
        <div className="mt-4 space-y-2">
          {accounts.map((acc) => {
            const isHovered = hoveredAccount === acc.name
            const isOtherHovered = hoveredAccount !== null && !isHovered
            return (
              <div
                key={acc.name}
                onMouseEnter={() => onHoverAccount(acc.name)}
                onMouseLeave={() => onHoverAccount(null)}
                className={`flex items-center justify-between p-2 rounded-lg border border-transparent transition-all duration-200 cursor-pointer ${
                  isHovered
                    ? 'bg-black/[0.03] dark:bg-white/[0.03] border-[var(--hair-soft)]'
                    : isOtherHovered
                    ? 'opacity-35'
                    : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: glowColor[acc.glow],
                      boxShadow: `0 0 6px ${glowColor[acc.glow]}`,
                    }}
                  />
                  <span className="text-[12px] font-semibold text-ink">{acc.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-[12.5px] font-bold text-ink tabular-nums">{fmt(acc.amount)}</span>
                  <span className="ml-2.5 text-[10.5px] font-semibold text-muted tabular-nums">
                    {Math.round(acc.percentage)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Tile>
  )
}

export default function RecurringHub() {
  const { transactions, accounts, recurrenceHints } = useData()
  const r = useMemo(
    () => buildRecurring(transactions, accounts, undefined, recurrenceHints),
    [transactions, accounts, recurrenceHints],
  )

  // Cross-highlighting states (ui-ux-pro-max)
  const [focusedSeriesId, setFocusedSeriesId] = useState<string | null>(null)
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [hoveredAccount, setHoveredAccount] = useState<string | null>(null)

  const fixed = r.active.filter((s) => s.kind === 'fixed').length
  const variable = r.active.length - fixed
  const none = r.active.length === 0

  const mix = none
    ? 'no recurring series detected'
    : `${plural(r.active.length, 'commitment')} · ${fixed} fixed · ${variable} variable`

  const burnGap = r.annualBurn - r.trailingActual
  const pressurePct = r.pressure.ratio === null ? null : Math.round(r.pressure.ratio * 100)

  return (
    <Grid>
      {/* Page-level metadata, not content */}
      <div className="md:col-span-2 xl:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1 rounded-xl border border-[var(--hair-soft)] bg-[var(--hair-soft)] px-3.5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              Recurring commitments
            </span>
            <span className="text-[12px] text-muted">
              detected from 12 months of ledger history · {monthLabel(r.bounds.from)} – {monthLabel(r.bounds.to)}
            </span>
          </div>
          {(focusedSeriesId || hoveredSeriesId || hoveredDate || hoveredAccount) && (
            <button
              onClick={() => {
                setFocusedSeriesId(null)
                setHoveredSeriesId(null)
                setHoveredDate(null)
                setHoveredAccount(null)
              }}
              className="text-[11px] font-bold text-accent-ink hover:underline cursor-pointer border-none bg-transparent"
            >
              Clear Focus
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:col-span-2 xl:col-span-3 xl:grid-cols-4">
        <HeroMetric
          label="Monthly commitment"
          value={none ? '—' : fmt(r.monthlyCommitment)}
          sub={mix}
        />
        <HeroMetric
          label="Annualized cash burn"
          value={none ? '—' : fmt(r.annualBurn)}
          sub={none ? mix : `run rate · ${fmt(r.trailingActual)} trailing actual`}
          tone={none || Math.abs(burnGap) < 1 ? 'muted' : burnGap > 0 ? 'neg' : 'pos'}
        />
        <HeroMetric
          label="Fixed outflow pressure"
          value={pressurePct === null ? '—' : `${pressurePct}%`}
          sub={
            pressurePct === null
              ? 'no outflow in the last 30 days'
              : `${fmt(r.pressure.recurring)} of ${fmt(r.pressure.total)} · trailing 30d`
          }
        />
        <HeroMetric
          label="Active commitments"
          value={String(r.active.length)}
          sub={
            none
              ? 'no recurring series detected'
              : `${fixed} fixed · ${variable} variable${r.dormant.length ? ` · ${r.dormant.length} dormant` : ''}`
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:col-span-2 xl:col-span-3 xl:grid-cols-[1.15fr_1fr]">
        <RecurringDirectory
          sections={r.sections}
          candidates={r.candidates}
          monthlyCommitment={r.monthlyCommitment}
          boundsLabel="12-month history"
          focusedSeriesId={focusedSeriesId}
          onFocusSeries={setFocusedSeriesId}
          hoveredSeriesId={hoveredSeriesId}
          onHoverSeries={setHoveredSeriesId}
          hoveredDate={hoveredDate}
          hoveredAccount={hoveredAccount}
        />
        <div className="flex flex-col gap-3.5">
          <FundingAccountsCard
            accounts={r.fundingAccounts}
            hoveredAccount={hoveredAccount}
            onHoverAccount={setHoveredAccount}
          />
          <BillingCalendar
            series={r.active}
            horizon={r.horizon}
            today={r.bounds.to}
            rangeLabel={`${dayLabel(r.horizon.from)} – ${dayLabel(r.horizon.to)}`}
            focusedSeriesId={focusedSeriesId}
            hoveredSeriesId={hoveredSeriesId}
            hoveredDate={hoveredDate}
            onHoverDate={setHoveredDate}
          />
        </div>
      </div>
    </Grid>
  )
}
