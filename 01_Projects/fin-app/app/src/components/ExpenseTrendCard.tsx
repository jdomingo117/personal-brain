import { useMemo, useState } from 'react'
import Tile from './Tile'
import Area from './charts/Area'
import Bar from './charts/Bar'
import SegmentedTabs from './SegmentedTabs'
import { txnIso } from '../lib/period'
import type { Txn } from '../data'

const DAY = 86400000
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parse = (s: string) => new Date(`${s}T00:00:00`)
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtDay = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`

const TABS = [
  { id: 'cumulative', label: 'Cumulative' },
  { id: 'interval', label: 'Per period' },
]

/** Expenses over time, off a shared period-adaptive binning (daily → weekly →
 *  monthly as the range grows). `Cumulative` is the running spend total (line);
 *  `Per period` is the non-cumulative spend per bin (bars). Both derive from the
 *  same account/date-scoped `outflows` as the hero cards, so they reconcile. */
export default function ExpenseTrendCard({ outflows, from, to }: { outflows: Txn[]; from: string; to: string }) {
  const [tab, setTab] = useState('cumulative')

  const { bins, cumulative, gran } = useMemo(() => {
    const totals = new Map<string, number>()
    outflows.forEach((t) => {
      const d = txnIso(t.date)
      totals.set(d, (totals.get(d) ?? 0) + Math.abs(t.amount))
    })

    const fromD = parse(from)
    const toD = parse(to)
    const lenDays = Math.max(1, Math.round((toD.getTime() - fromD.getTime()) / DAY) + 1)

    // every calendar day in the period (zero-filled)
    const days = Array.from({ length: lenDays }, (_, i) => {
      const d = new Date(fromD.getTime() + i * DAY)
      return { date: d, value: totals.get(isoDay(d)) ?? 0 }
    })

    // adaptive bucket size for both charts
    const gran: 'daily' | 'weekly' | 'monthly' = lenDays <= 45 ? 'daily' : lenDays <= 130 ? 'weekly' : 'monthly'
    let bins: { data: number[]; labels: string[] }
    if (gran === 'daily') {
      bins = { data: days.map((x) => x.value), labels: days.map((x) => fmtDay(x.date)) }
    } else if (gran === 'weekly') {
      const b: { start: Date; value: number }[] = []
      days.forEach((day, i) => {
        if (i % 7 === 0) b.push({ start: day.date, value: 0 })
        b[b.length - 1].value += day.value
      })
      bins = { data: b.map((x) => x.value), labels: b.map((x) => fmtDay(x.start)) }
    } else {
      const byMonth = new Map<string, { start: Date; value: number }>()
      days.forEach((day) => {
        const key = `${day.date.getFullYear()}-${day.date.getMonth()}`
        if (!byMonth.has(key)) byMonth.set(key, { start: new Date(day.date.getFullYear(), day.date.getMonth(), 1), value: 0 })
        byMonth.get(key)!.value += day.value
      })
      const arr = [...byMonth.values()].sort((a, b) => a.start.getTime() - b.start.getTime())
      bins = { data: arr.map((x) => x.value), labels: arr.map((x) => MON[x.start.getMonth()]) }
    }

    // running total for the cumulative view
    let acc = 0
    const cumulative = bins.data.map((v) => (acc += v))

    return { bins, cumulative, gran }
  }, [outflows, from, to])

  const empty = bins.data.every((v) => v === 0)

  return (
    <Tile span={2} className="flex flex-col">
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-display text-[14px] font-bold text-ink">Spending over time</h3>
          <span className="text-[11px] uppercase tracking-[0.06em] text-muted">
            {gran} · {tab === 'cumulative' ? 'cumulative' : 'per period'}
          </span>
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} layoutId="exp-trend-tabs" />
      </header>

      {empty ? (
        <div className="grid place-items-center py-16 text-center text-[12.5px] text-muted">
          No spending in the selected period.
        </div>
      ) : tab === 'cumulative' ? (
        <Area
          key={`cum-${from}-${to}`}
          series={[{ data: cumulative, color: 'var(--color-neg)' }]}
          labels={bins.labels}
          height={212}
        />
      ) : (
        <Bar
          key={`int-${from}-${to}`}
          series={[{ data: bins.data, color: 'var(--color-neg)' }]}
          labels={bins.labels}
          height={212}
        />
      )}
    </Tile>
  )
}
