import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Tile from './Tile'
import { upcomingCharges, type Series } from '../lib/recurring'
import { dayLabel } from '../lib/period'
import { fmt } from '../data'

/* The 30-day billing calendar — when the committed money leaves, laid out
   spatially. The directory already carries `next expected` per row; this is that
   same data arranged so the shape of the month is visible at a glance.

   Equipped with:
   1. Interactive cross-highlighting with the directory.
   2. Custom glassmorphic tooltip card that pops up on hover.
*/

const DAY = 86400000
const parse = (s: string) => new Date(`${s}T00:00:00`)
const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const col = (d: Date) => (d.getDay() + 6) % 7
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const alphaFor = (v: number, max: number) =>
  v > 0 && max > 0 ? 0.12 + 0.5 * Math.pow(v / max, 0.6) : 0

export default function BillingCalendar({
  series,
  horizon,
  today,
  rangeLabel,
  focusedSeriesId,
  hoveredSeriesId,
  hoveredDate,
  onHoverDate,
}: {
  series: Series[]
  horizon: { from: string; to: string }
  today: string
  rangeLabel: string
  focusedSeriesId: string | null
  hoveredSeriesId: string | null
  hoveredDate: string | null
  onHoverDate: (date: string | null) => void
}) {
  const [hoveredDayIso, setHoveredDayIso] = useState<string | null>(null)

  const { cells, leading, total, count, max } = useMemo(() => {
    const byDay = new Map<string, { label: string; amount: number; seriesId: string }[]>()
    series.forEach((s) => {
      upcomingCharges(s, horizon.from, horizon.to).forEach((c) => {
        const list = byDay.get(c.date) ?? []
        list.push({ label: s.label, amount: c.amount, seriesId: s.id })
        byDay.set(c.date, list)
      })
    })

    const start = parse(horizon.from)
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(start.getTime() + i * DAY)
      const iso = isoOf(d)
      const charges = byDay.get(iso) ?? []
      return { iso, d, charges, value: charges.reduce((a, c) => a + c.amount, 0) }
    })

    const values = days.map((x) => x.value)
    return {
      cells: days,
      leading: col(start),
      total: values.reduce((a, b) => a + b, 0),
      count: [...byDay.values()].reduce((a, l) => a + l.length, 0),
      max: Math.max(...values),
    }
  }, [series, horizon.from, horizon.to])

  if (!count) {
    return (
      <Tile title="Billing calendar" tag={rangeLabel}>
        <p className="py-10 text-center text-[13px] text-muted">
          No recurring charges projected in the next 30 days.
        </p>
      </Tile>
    )
  }

  const activeHighlightId = focusedSeriesId || hoveredSeriesId

  return (
    <Tile title="Billing calendar" tag={rangeLabel} className="flex flex-col">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 select-none">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-faint">
            {d}
          </div>
        ))}
      </div>

      <motion.div
        className="grid grid-cols-7 gap-1.5"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.012 } } }}
      >
        {Array.from({ length: leading }, (_, i) => (
          <div key={`pad-${i}`} aria-hidden="true" />
        ))}

        {cells.map((c, idx) => {
          const isToday = c.iso === today
          const hit = c.value > 0
          const hasMatchingCharge = activeHighlightId ? c.charges.some(ch => ch.seriesId === activeHighlightId) : false
          const isDimmed = activeHighlightId && !hasMatchingCharge
          const isHighlightedByCalendarHover = hoveredDate === c.iso

          const isFirstTwoRows = (leading + idx) < 14

          return (
            <motion.div
              key={c.iso}
              variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ scale: isDimmed ? 1 : 1.06 }}
              className="relative aspect-square rounded-[5px] transition-opacity duration-200"
              style={{
                background: 'var(--track)',
                outline: isToday
                  ? '1px solid var(--color-accent)'
                  : isHighlightedByCalendarHover
                  ? '1px solid var(--color-accent-ink)'
                  : undefined,
                outlineOffset: isToday || isHighlightedByCalendarHover ? '-1px' : undefined,
                opacity: isDimmed ? 0.25 : 1,
              }}
              onMouseEnter={() => {
                setHoveredDayIso(c.iso)
                onHoverDate(c.iso)
              }}
              onMouseLeave={() => {
                setHoveredDayIso(null)
                onHoverDate(null)
              }}
            >
              {/* the heat: one token, one number — retintable and dark-mode-correct */}
              {hit && (
                <div
                  className="absolute inset-0 rounded-[5px]"
                  style={{ background: 'var(--color-accent)', opacity: alphaFor(c.value, max) }}
                  aria-hidden="true"
                />
              )}
              <span
                className={`absolute left-1 top-0.5 text-[10px] tabular-nums select-none ${
                  hit ? 'font-semibold text-ink' : 'text-faint'
                }`}
              >
                {c.d.getDate()}
              </span>
              {c.charges.length > 1 && (
                <span
                  className="absolute bottom-1 right-1 h-1 w-1 rounded-full"
                  style={{ background: 'var(--color-accent-ink)' }}
                  aria-hidden="true"
                />
              )}

              {/* Custom Glassmorphic Tooltip Card */}
              <AnimatePresence>
                {hoveredDayIso === c.iso && (
                  <motion.div
                    initial={{ opacity: 0, y: isFirstTwoRows ? -4 : 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: isFirstTwoRows ? -4 : 4, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    style={{ zIndex: 50 }}
                    className={`absolute ${
                      isFirstTwoRows ? 'top-full mt-2' : 'bottom-full mb-2'
                    } left-1/2 -translate-x-1/2 w-48 p-3.5 rounded-xl border border-[var(--glass-bd)] bg-[var(--toast-bg)] shadow-lg -webkit-backdrop-filter blur(16px) backdrop-filter blur(16px) select-none`}
                  >
                    <div className="text-[10px] font-bold text-muted uppercase tracking-[0.06em] border-b border-[var(--hair-soft)] pb-1 mb-2">
                      {dayLabel(c.iso)}
                    </div>
                    {c.value > 0 ? (
                      <div className="space-y-2">
                        {c.charges.map((ch, idx) => (
                          <div key={idx} className="flex flex-col text-[11px] leading-tight">
                            <span className="font-semibold text-ink">{ch.label}</span>
                            <span className="text-accent-ink font-bold tabular-nums mt-0.5">{fmt(ch.amount)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between border-t border-[var(--hair-soft)] pt-1.5 text-[11px] font-bold">
                          <span className="text-ink2">Total due</span>
                          <span className="text-ink tabular-nums">{fmt(c.value)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-muted italic">No charges due</div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </motion.div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--hair)] pt-3 select-none">
        <span className="text-[12px] font-semibold text-ink">
          {count} charge{count === 1 ? '' : 's'} · {fmt(total)} due
        </span>
        <span className="flex items-center gap-1 text-[10px] text-faint">
          less
          {[0.12, 0.28, 0.45, 0.62].map((a) => (
            <span
              key={a}
              className="h-2 w-2 rounded-[2px]"
              style={{ background: 'var(--color-accent)', opacity: a }}
            />
          ))}
          more
        </span>
      </div>
    </Tile>
  )
}
