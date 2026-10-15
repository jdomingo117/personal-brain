import { fmt } from '../data'
import type { ProjectionMonthBreakdown } from '../lib/projections'

const monthLabel = (date: string) => new Date(`${date}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${fmt(Math.abs(value))}`

/** A compact, keyboard-native explanation of the next forecast months. */
export default function PlanningTimeline({ months, limit = 12 }: { months: ProjectionMonthBreakdown[]; limit?: number }) {
  const visible = months.slice(0, limit)
  if (!visible.length) return null

  return (
    <details className="border-t border-[var(--hair-soft)] pt-4">
      <summary className="cursor-pointer text-[14px] font-bold text-accent-ink outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-wash)]">Explain the next {visible.length} month{visible.length === 1 ? '' : 's'}</summary>
      <p className="mt-3 body-copy">Forecast values combine the observed completed-month run rate with only the saved inputs shown below. Values are estimates, not account transactions.</p>
      <div className="data-table-wrap mt-4">
        <table className="data-table text-left text-[14px]">
          <thead className="bg-[var(--hair-soft)] text-[12px] font-bold uppercase tracking-[0.07em] text-muted"><tr><th className="px-4 py-3">Month</th><th className="px-4 py-3 text-right">Opening</th><th className="px-4 py-3 text-right">Observed run rate</th><th className="px-4 py-3">Planned inputs</th><th className="px-4 py-3 text-right">Growth</th><th className="px-4 py-3 text-right">Closing</th></tr></thead>
          <tbody>
            {visible.map((month) => <tr key={month.date} className="border-t border-[var(--hair-soft)] align-top text-ink2">
              <th scope="row" className="whitespace-nowrap px-4 py-3.5 font-semibold text-ink">{monthLabel(month.date)}</th>
              <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{fmt(month.openingValue)}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{signed(month.observedRunRate)}</td>
              <td className="min-w-[240px] px-4 py-3.5"><div className="space-y-1.5">{month.plannedEvents.length ? month.plannedEvents.map((event) => <div key={event.id} className="flex justify-between gap-3"><span>{event.id.startsWith('recurring:') ? 'Recurring · ' : ''}{event.name}</span><span className="whitespace-nowrap tabular-nums">{signed(event.amountCents)}</span></div>) : <span className="text-muted">No saved inputs</span>}{month.adjustment !== 0 && <div className="flex justify-between gap-3"><span>Temporary what-if</span><span className="whitespace-nowrap tabular-nums">{signed(month.adjustment)}</span></div>}</div></td>
              <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{month.investmentGrowth === 0 ? '—' : signed(month.investmentGrowth)}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-right font-bold tabular-nums text-ink">{fmt(month.closingValue)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </details>
  )
}
