import { useMemo, useState } from 'react'
import Tile from './Tile'
import { fmt, type Txn } from '../data'
import { catInScope, isActive, type CatSelection } from '../lib/expenseSelection'

type ChangeRow = {
  name: string
  current: number
  previous: number
  delta: number
}

const totalByCategory = (transactions: Txn[]) => {
  const totals = new Map<string, number>()
  transactions.forEach((transaction) => {
    totals.set(transaction.cat, (totals.get(transaction.cat) ?? 0) + Math.abs(transaction.amount))
  })
  return totals
}

/**
 * A deliberately simple answer to “what moved?”: one current point and one
 * prior-period point per category. Unlike the retired pacing rail, this does
 * not extrapolate partial spend or ask the user to interpret a volatility band.
 */
export default function ExpenseChangesCard({
  outflows,
  previousOutflows,
  selection,
  onToggleCategory,
  variant = 'detail',
  expanded,
  onExpandedChange,
  onViewDetail,
}: {
  outflows: Txn[]
  previousOutflows: Txn[]
  selection: CatSelection
  onToggleCategory: (category: string) => void
  /** `summary` is the companion card for the trend chart; `detail` retains the
   *  full-width ranked comparison below the analytics row. */
  variant?: 'summary' | 'detail'
  /** Lets the page open the detailed comparison from its summary card. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onViewDetail?: () => void
}) {
  const { rows, maxValue } = useMemo(() => {
    const current = totalByCategory(outflows)
    const previous = totalByCategory(previousOutflows)
    const categories = new Set([...current.keys(), ...previous.keys()])
    const rows = [...categories]
      .map((name) => {
        const now = current.get(name) ?? 0
        const before = previous.get(name) ?? 0
        return { name, current: now, previous: before, delta: now - before }
      })
      .filter((row) => row.current > 0 || row.previous > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.current - a.current || a.name.localeCompare(b.name))

    return {
      rows,
      maxValue: Math.max(1, ...rows.flatMap((row) => [row.current, row.previous])),
    }
  }, [outflows, previousOutflows])

  const focused = isActive(selection)
  const isSummary = variant === 'summary'
  const [localExpanded, setLocalExpanded] = useState(false)
  const isExpanded = expanded ?? localExpanded
  const setExpanded = (next: boolean) => {
    if (expanded === undefined) setLocalExpanded(next)
    onExpandedChange?.(next)
  }
  const hasHiddenRows = rows.length > 6
  const displayedRows = isSummary ? rows.slice(0, 3) : isExpanded ? rows : rows.slice(0, 6)

  return (
    <Tile span={isSummary ? undefined : 3} className={isSummary ? 'flex min-h-[280px] flex-1 flex-col overflow-hidden' : 'overflow-hidden'}>
      <header className={`${isSummary ? 'mb-2' : 'mb-5'} flex flex-wrap items-baseline justify-between gap-3`}>
        <div>
          <h3 className="font-display text-[16px] font-bold text-ink">{isSummary ? 'Largest movers' : 'What changed this period'}</h3>
          <p className="mt-1 text-[14px] text-muted">
            {isSummary ? 'The three categories with the biggest period-on-period shifts.' : 'Current spend compared with the immediately prior period, ranked by material change.'}
          </p>
        </div>
        {isSummary ? (
          <span className="text-[12px] uppercase tracking-[0.08em] text-muted">Click to focus</span>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-3 text-[12px] text-muted" aria-label="Chart legend and visibility controls">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--color-muted)]" /> Prior</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" /> Current</span>
            <span className="uppercase tracking-[0.08em]">Click to focus</span>
            {hasHiddenRows && (
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpanded(!isExpanded)}
                className="rounded-[8px] border border-[var(--hair)] px-2.5 py-1 text-[12px] font-semibold text-ink2 transition hover:border-accent hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {isExpanded ? 'Show fewer' : `Show all ${rows.length} categories`}
              </button>
            )}
          </div>
        )}
      </header>

      {rows.length === 0 ? (
        <div className={`grid flex-1 place-items-center text-center text-[12.5px] text-muted ${isSummary ? 'py-8' : 'py-16'}`}>No spending in this or the prior period.</div>
      ) : isSummary ? (
        <>
          <ol className="flex flex-1 flex-col justify-center divide-y divide-[var(--hair-soft)]" aria-label="Largest category spend changes versus previous period">
            {displayedRows.map((row) => <MoverSummaryRow key={row.name} row={row} dimmed={focused && !catInScope(row.name, selection)} onClick={() => onToggleCategory(row.name)} />)}
          </ol>
          {onViewDetail && (
            <button
              type="button"
              onClick={onViewDetail}
              className="mt-3 self-start rounded-[8px] px-2 py-1 text-[13px] font-semibold text-accent-ink transition hover:bg-[var(--accent-wash)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              View detailed comparison ↓
            </button>
          )}
        </>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(155px,0.8fr)_minmax(240px,2.1fr)_132px] gap-5 border-b border-[var(--hair-soft)] pb-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted sm:grid">
            <span>Category</span><span>Spend movement</span><span className="text-right">Difference</span>
          </div>
          <ol className="divide-y divide-[var(--hair-soft)]" aria-label="Category changes versus previous period">
            {displayedRows.map((row) => <ChangeRow key={row.name} row={row} maxValue={maxValue} dimmed={focused && !catInScope(row.name, selection)} onClick={() => onToggleCategory(row.name)} />)}
          </ol>
        </>
      )}
    </Tile>
  )
}

function MoverSummaryRow({ row, dimmed, onClick }: { row: ChangeRow; dimmed: boolean; onClick: () => void }) {
  const isNew = row.previous === 0 && row.current > 0
  const tone = isNew ? 'var(--color-warn)' : row.delta > 0 ? 'var(--color-neg)' : row.delta < 0 ? 'var(--color-pos)' : 'var(--color-muted)'
  const deltaLabel = isNew
    ? 'New'
    : `${row.delta > 0 ? '+' : row.delta < 0 ? '−' : '±'}${fmt(Math.abs(row.delta))}${row.previous > 0 ? ` · ${row.delta > 0 ? '+' : ''}${Math.round((row.delta / row.previous) * 100)}%` : ''}`

  return (
    <li className={dimmed ? 'opacity-40' : ''}>
      <button
        type="button"
        onClick={onClick}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md py-4 text-left transition-colors hover:bg-[var(--hair-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
          <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{row.name}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-muted">{fmt(row.current)} vs {fmt(row.previous)}</span>
        </span>
        <span className="text-right text-[13px] font-semibold tabular-nums" style={{ color: tone }}>{deltaLabel}</span>
      </button>
    </li>
  )
}

function ChangeRow({ row, maxValue, dimmed, onClick }: { row: ChangeRow; maxValue: number; dimmed: boolean; onClick: () => void }) {
  // Keep the data marks out of the end-label zones. The marks still use the
  // same shared scale, but dollar labels remain readable even at $0 or max.
  const plotStart = 12
  const plotWidth = 76
  const plotX = (value: number) => plotStart + (value / maxValue) * plotWidth
  const currentX = plotX(row.current)
  const previousX = plotX(row.previous)
  const isNew = row.previous === 0 && row.current > 0
  const tone = isNew ? 'var(--color-warn)' : row.delta > 0 ? 'var(--color-neg)' : row.delta < 0 ? 'var(--color-pos)' : 'var(--color-muted)'
  const direction = row.delta > 0 ? '↗' : row.delta < 0 ? '↘' : '—'

  return (
    <li className={dimmed ? 'opacity-40' : ''}>
      <button
        type="button"
        onClick={onClick}
        className="grid w-full grid-cols-1 gap-2 rounded-md py-4 text-left transition-colors hover:bg-[var(--hair-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:grid-cols-[minmax(155px,0.8fr)_minmax(240px,2.1fr)_132px] sm:items-center sm:gap-5 sm:px-2"
      >
        <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{row.name}</span>
        <span className="relative block h-9 rounded-full bg-[var(--track)]">
          <span className="absolute top-1/2 h-px -translate-y-1/2 bg-[var(--hair)]" style={{ left: `${Math.min(previousX, currentX)}%`, width: `${Math.abs(currentX - previousX)}%` }} />
          {row.previous > 0 && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--toast-bg)] bg-[var(--color-muted)]" style={{ left: `${previousX}%` }} />}
          <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--toast-bg)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]" style={{ left: `${currentX}%`, background: tone }} />
          <span className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded bg-[var(--toast-bg)] px-1.5 py-0.5 text-[12px] tabular-nums text-muted shadow-sm">{fmt(row.previous)}</span>
          <span className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded bg-[var(--toast-bg)] px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-ink shadow-sm">{fmt(row.current)}</span>
        </span>
        <span className="flex items-center justify-end gap-1.5 text-right text-[13px] font-semibold tabular-nums" style={{ color: tone }}>
          {isNew ? 'New' : `${row.delta > 0 ? '+' : row.delta < 0 ? '−' : '±'}${fmt(Math.abs(row.delta))}`}
          <span aria-hidden>{direction}</span>
        </span>
      </button>
    </li>
  )
}
