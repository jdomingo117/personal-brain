import { useMemo, useState } from 'react'
import Tile from './Tile'
import Area from './charts/Area'
import Bar from './charts/Bar'
import SegmentedTabs from './SegmentedTabs'
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
export default function ExpenseTrendCard({
  outflows,
  from,
  to,
  scopeLabel,
  timeFocus,
  onTimeFocus,
}: {
  outflows: Txn[]
  from: string
  to: string
  /** the view's active category focus, if any — `outflows` arrives already
   *  filtered by it; this only retitles so the chart isn't misread as page-wide */
  scopeLabel?: string
  timeFocus: { from: string; to: string; label: string } | null
  onTimeFocus: (focus: { from: string; to: string; label: string } | null) => void
}) {
  const [tab, setTab] = useState('cumulative')

  const { bins, cumulative, gran } = useMemo(() => {
    const totals = new Map<string, number>()
    outflows.forEach((t) => {
      totals.set(t.date, (totals.get(t.date) ?? 0) + Math.abs(t.amount))
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
    let bins: { data: number[]; labels: string[]; ranges: { from: string; to: string; label: string }[] }
    if (gran === 'daily') {
      bins = {
        data: days.map((x) => x.value),
        labels: days.map((x) => fmtDay(x.date)),
        ranges: days.map((x) => ({
          from: isoDay(x.date),
          to: isoDay(x.date),
          label: fmtDay(x.date),
        })),
      }
    } else if (gran === 'weekly') {
      const b: { start: Date; end: Date; value: number }[] = []
      days.forEach((day, i) => {
        if (i % 7 === 0) {
          const endIdx = Math.min(days.length - 1, i + 6)
          b.push({ start: day.date, end: days[endIdx].date, value: 0 })
        }
        b[b.length - 1].value += day.value
      })
      bins = {
        data: b.map((x) => x.value),
        labels: b.map((x) => fmtDay(x.start)),
        ranges: b.map((x) => ({
          from: isoDay(x.start),
          to: isoDay(x.end),
          label: `${fmtDay(x.start)} – ${fmtDay(x.end)}`,
        })),
      }
    } else {
      const byMonth = new Map<string, { start: Date; end: Date; value: number }>()
      days.forEach((day) => {
        const key = `${day.date.getFullYear()}-${day.date.getMonth()}`
        if (!byMonth.has(key)) {
          byMonth.set(key, { start: day.date, end: day.date, value: 0 })
        } else {
          byMonth.get(key)!.end = day.date
        }
        byMonth.get(key)!.value += day.value
      })
      const arr = [...byMonth.values()].sort((a, b) => a.start.getTime() - b.start.getTime())
      bins = {
        data: arr.map((x) => x.value),
        labels: arr.map((x) => MON[x.start.getMonth()]),
        ranges: arr.map((x) => ({
          from: isoDay(x.start),
          to: isoDay(x.end),
          label: `${MON[x.start.getMonth()]} ${x.start.getFullYear()}`,
        })),
      }
    }

    // running total for the cumulative view
    let acc = 0
    const cumulative = bins.data.map((v) => (acc += v))

    return { bins, cumulative, gran }
  }, [outflows, from, to])

  const selectedIndex = useMemo(() => {
    if (!timeFocus) return null
    const idx = bins.ranges.findIndex((r) => r.from === timeFocus.from && r.to === timeFocus.to)
    return idx >= 0 ? idx : null
  }, [bins.ranges, timeFocus])

  const handleSelectBin = (idx: number) => {
    const bin = bins.ranges[idx]
    if (!bin) return
    if (timeFocus && timeFocus.from === bin.from && timeFocus.to === bin.to) {
      onTimeFocus(null)
    } else {
      onTimeFocus(bin)
    }
  }

  const empty = bins.data.every((v) => v === 0)

  return (
    <Tile className="flex flex-col">
      <header className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-display text-[14px] font-bold text-ink">
            {scopeLabel ? `${scopeLabel} over time` : 'Spending over time'}
          </h3>
          <span className="text-[11px] uppercase tracking-[0.06em] text-muted">
            {gran} · {tab === 'cumulative' ? 'cumulative' : 'per period'}
          </span>
        </div>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} layoutId="exp-trend-tabs" />
      </header>

      {empty ? (
        <div className="grid place-items-center py-16 text-center text-[12.5px] text-muted">
          {/* with a focus applied the period may well have spending — just none of it here */}
          {scopeLabel ? `No ${scopeLabel} spending in the selected period.` : 'No spending in the selected period.'}
        </div>
      ) : tab === 'cumulative' ? (
        <Area
          key={`cum-${from}-${to}`}
          series={[{ data: cumulative, color: 'var(--color-neg)' }]}
          labels={bins.labels}
          height={330}
          selectedIndex={selectedIndex}
          onClickDataPoint={handleSelectBin}
        />
      ) : (
        <Bar
          key={`int-${from}-${to}`}
          series={[{ data: bins.data, color: 'var(--color-neg)' }]}
          labels={bins.labels}
          height={330}
          selectedIndex={selectedIndex}
          onClickDataPoint={handleSelectBin}
        />
      )}
    </Tile>
  )
}
