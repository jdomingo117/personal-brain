import { useMemo } from 'react'
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
}: {
  outflows: Txn[]
  previousOutflows: Txn[]
  selection: CatSelection
  onToggleCategory: (category: string) => void
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

  return (
    <Tile span={3} className="overflow-hidden">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-[14px] font-bold text-ink">What changed this period</h3>
          <p className="mt-1 text-[12px] text-muted">Current spend compared with the immediately prior period, ranked by material change.</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted" aria-label="Chart legend">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--color-muted)]" /> Prior</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-accent" /> Current</span>
          <span className="uppercase tracking-[0.08em]">Click to focus</span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="grid place-items-center py-16 text-center text-[12.5px] text-muted">No spending in this or the prior period.</div>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(145px,0.8fr)_minmax(240px,2.1fr)_112px] gap-5 border-b border-[var(--hair-soft)] pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted sm:grid">
            <span>Category</span><span>Spend movement</span><span className="text-right">Difference</span>
          </div>
          <ol className="divide-y divide-[var(--hair-soft)]" aria-label="Category changes versus previous period">
            {rows.map((row) => <ChangeRow key={row.name} row={row} maxValue={maxValue} dimmed={focused && !catInScope(row.name, selection)} onClick={() => onToggleCategory(row.name)} />)}
          </ol>
        </>
      )}
    </Tile>
  )
}

function ChangeRow({ row, maxValue, dimmed, onClick }: { row: ChangeRow; maxValue: number; dimmed: boolean; onClick: () => void }) {
  const currentX = (row.current / maxValue) * 100
  const previousX = (row.previous / maxValue) * 100
  const isNew = row.previous === 0 && row.current > 0
  const tone = isNew ? 'var(--color-warn)' : row.delta > 0 ? 'var(--color-neg)' : row.delta < 0 ? 'var(--color-pos)' : 'var(--color-muted)'
  const direction = row.delta > 0 ? '↗' : row.delta < 0 ? '↘' : '—'

  return (
    <li className={dimmed ? 'opacity-40' : ''}>
      <button
        type="button"
        onClick={onClick}
        className="grid w-full grid-cols-1 gap-2 rounded-md py-3 text-left transition-colors hover:bg-[var(--hair-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:grid-cols-[minmax(145px,0.8fr)_minmax(240px,2.1fr)_112px] sm:items-center sm:gap-5 sm:px-2"
      >
        <span className="min-w-0 truncate text-[12px] font-semibold text-ink">{row.name}</span>
        <span className="relative block h-7 rounded-full bg-[var(--track)]">
          <span className="absolute top-1/2 h-px -translate-y-1/2 bg-[var(--hair)]" style={{ left: `${Math.min(previousX, currentX)}%`, width: `${Math.abs(currentX - previousX)}%` }} />
          {row.previous > 0 && <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--toast-bg)] bg-[var(--color-muted)]" style={{ left: `${previousX}%` }} />}
          <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--toast-bg)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]" style={{ left: `${currentX}%`, background: tone }} />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] tabular-nums text-muted">{fmt(row.previous)}</span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold tabular-nums text-ink">{fmt(row.current)}</span>
        </span>
        <span className="flex items-center justify-end gap-1.5 text-right text-[11px] font-semibold tabular-nums" style={{ color: tone }}>
          {isNew ? 'New' : `${row.delta > 0 ? '+' : row.delta < 0 ? '−' : '±'}${fmt(Math.abs(row.delta))}`}
          <span aria-hidden>{direction}</span>
        </span>
      </button>
    </li>
  )
}
