import { useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { AnimatePresence, motion } from 'framer-motion'
import Tile from './Tile'
import { useScrollIdle } from '../hooks/useScrollIdle'
import { buildPacing, type PaceState, type PacingRow } from '../lib/pacing'
import { catInScope, isActive, subInScope, type CatSelection } from '../lib/expenseSelection'
import { fmt } from '../data'

/* Colour carries one meaning here and one only: how this row is tracking. No
   category hues — a hue that means "Retail" competes with a hue that means
   "overspent", and only one of those is worth an alarm. Mirrors the
   healthy/warning/critical convention CapacityMeter already uses. */
const STATE_COLOR: Record<PaceState, string> = {
  ok: 'var(--color-accent)',
  risk: 'var(--color-warn)',
  over: 'var(--color-neg)',
  idle: 'var(--color-muted)',
}

/* The baseline sits at a constant x on every row, so the marker reads as one
   vertical rule you scan down. 66% leaves headroom to draw up to ~1.5× baseline
   before marks clamp and defer to the chip. */
const BASE_X = 66

const rawX = (v: number, baseline: number) => (baseline > 0 ? (v / baseline) * BASE_X : v > 0 ? 100 : 0)
const scaleX = (v: number, baseline: number) => Math.min(100, rawX(v, baseline))
const isClamped = (v: number, baseline: number) => rawX(v, baseline) > 100.5

const pct = (d: number) => `${d > 0.005 ? '+' : d < -0.005 ? '−' : '±'}${Math.abs(Math.round(d * 100))}%`

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthOf = (isoDate: string) => {
  const d = new Date(`${isoDate}T00:00:00`)
  return { m: MON[d.getMonth()], y: d.getFullYear() }
}

/** "Jul 2026 · to date" / "May–Jul 2026" — the window this card actually measures. */
const windowLabel = (period: { from: string; to: string }, elapsed: number) => {
  const a = monthOf(period.from)
  const b = monthOf(period.to)
  const span = a.m === b.m && a.y === b.y ? `${a.m} ${a.y}` : a.y === b.y ? `${a.m}–${b.m} ${b.y}` : `${a.m} ${a.y}–${b.m} ${b.y}`
  return elapsed < 1 ? `${span} · to date` : span
}


/** A bullet rail. The pale band is the ±1σ range over the trailing windows, so
 *  volatility reads as width; the caret is the projected finish, which is the
 *  only mark the band is commensurate with (the band is built from *completed*
 *  periods, the bar is a partial one). Caret inside the band = an ordinary
 *  period for this category; outside = the thing worth opening. */
function Rail({
  r, elapsed, hasHistory, share, sub,
}: {
  r: PacingRow
  elapsed: number
  /** false → nothing to compare against; the rail degrades to a magnitude bar */
  hasHistory: boolean
  /** current ÷ the largest current on screen, used only when `hasHistory` is false */
  share: number
  sub?: boolean
}) {
  const color = STATE_COLOR[r.state]
  const w = hasHistory ? scaleX(r.current, r.baseline) : share * 100
  const trackH = sub ? 11 : 14
  const barH = sub ? 4 : 6
  const off =
    hasHistory &&
    (isClamped(r.current, r.baseline) || isClamped(r.landing, r.baseline) || (r.band ? isClamped(r.band.hi, r.baseline) : false))

  return (
    <div className="relative flex-1">
      <div className="relative rounded-[3px] bg-[var(--track)]" style={{ height: trackH }}>
        {/* ±1σ normal range — its width *is* the volatility */}
        {r.band && (
          <div
            className="absolute inset-y-0 rounded-[3px]"
            style={{
              left: `${scaleX(r.band.lo, r.baseline)}%`,
              width: `${Math.max(scaleX(r.band.hi, r.baseline) - scaleX(r.band.lo, r.baseline), 0.6)}%`,
              background: 'var(--hair)',
            }}
          />
        )}
        {/* spend so far */}
        <div
          className="absolute rounded-r-[2px] transition-[width,background-color] duration-500"
          style={{ left: 0, width: `${w}%`, height: barH, top: (trackH - barH) / 2, background: color, opacity: sub ? 0.75 : 1 }}
        />
        {/* the bullet's target: last completed period */}
        {hasHistory && (
          <span className="absolute w-[2px] rounded-full" style={{ left: `${BASE_X}%`, top: -2, bottom: -2, background: 'var(--color-ink)' }} />
        )}
        {/* where you'd be if you tracked the baseline exactly */}
        {hasHistory && elapsed < 1 && (
          <span
            className="absolute inset-y-0 w-px"
            style={{
              left: `${BASE_X * elapsed}%`,
              background: 'repeating-linear-gradient(var(--color-ink2) 0 2px, transparent 2px 4px)',
              opacity: 0.7,
            }}
          />
        )}
        {/* projected finish */}
        {hasHistory && r.baseline > 0 && r.landing > 0 && (
          <span
            className="absolute"
            style={{ left: `${scaleX(r.landing, r.baseline)}%`, top: -5, transform: 'translateX(-50%)' }}
            title={`projects ${fmt(r.landing)}`}
          >
            <svg width="7" height="5" aria-hidden>
              <path d="M0,0 L7,0 L3.5,4.5 Z" fill={color} />
            </svg>
          </span>
        )}
      </div>
      {/* a mark pinned to the edge must say it's pinned, or it reads as merely
          reaching the edge — the chip carries the true figure */}
      {off && (
        <span className="pointer-events-none absolute top-1/2 -translate-y-1/2" style={{ right: -7 }} title="off-scale — see the figure">
          <svg width="5" height="8" viewBox="0 0 5 8" fill="none" aria-hidden>
            <path d="M1 1l3 3-3 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </div>
  )
}

function Row({
  r, elapsed, hasHistory, share, sub = false, open, onClick, chevron = false, dimmed = false,
}: {
  r: PacingRow
  elapsed: number
  hasHistory: boolean
  share: number
  sub?: boolean
  open?: boolean
  onClick?: () => void
  /** Only category rows expand. Sub-rows are clickable too, so this can't be
   *  derived from `onClick` — they'd sprout a chevron that expands nothing. */
  chevron?: boolean
  /** out of the view's shared focus */
  dimmed?: boolean
}) {
  const clickable = !!onClick
  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-1.5 px-1 py-2.5 transition-opacity sm:flex-row sm:items-center sm:gap-3 ${
        clickable ? 'cursor-pointer rounded-lg transition-colors hover:bg-[var(--hair-soft)]' : ''
      } ${dimmed ? 'opacity-40' : ''}`}
    >
      <span className="flex min-w-0 items-center gap-1.5 sm:w-[150px]">
        {chevron && (
          <motion.svg
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.18 }} style={{ flexShrink: 0 }}
          >
            <path d="M9 18l6-6-6-6" />
          </motion.svg>
        )}
        <span className={`truncate ${sub ? 'text-[12px] text-ink2' : 'text-[12.5px] font-semibold text-ink'}`}>{r.name}</span>
      </span>

      <span className="shrink-0 text-[10.5px] tabular-nums text-muted sm:w-[112px] sm:text-right">
        {fmt(r.current)}
        {hasHistory && (
          <>
            {' '}
            <span className="opacity-60">of</span> {fmt(r.baseline)}
          </>
        )}
      </span>

      <div className="flex flex-1 items-center gap-2.5">
        <Rail r={r} elapsed={elapsed} hasHistory={hasHistory} share={share} sub={sub} />
        <span
          className="w-[46px] shrink-0 text-right text-[10.5px] font-semibold tabular-nums"
          style={{ color: STATE_COLOR[r.state] }}
          title={!hasHistory ? 'no prior period to compare' : elapsed < 1 ? 'projected finish vs last period' : 'vs last period'}
        >
          {!hasHistory ? '—' : r.baseline > 0 ? pct(r.landingDelta) : r.current > 0 ? 'new' : '—'}
        </span>
      </div>
    </div>
  )
}

function Key({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {swatch}
      <span className="text-[10px] text-muted">{children}</span>
    </span>
  )
}

/** Category volatility & pacing — spend against the prior window of equal
 *  length, sized against how volatile the category normally is.
 *
 *  A *source* of the view's shared focus: clicking a row focuses the page, but
 *  this card never filters itself — a pacing list of one row isn't a pacing
 *  list, and the other categories are the comparison. It highlights instead. */
export default function ExpensePacingCard({
  from,
  to,
  gated,
  selection,
  onToggleCategory,
  onToggleSubcat,
}: {
  from: string
  to: string
  gated: boolean
  selection: CatSelection
  onToggleCategory: (cat: string) => void
  onToggleSubcat: (cat: string, sub: string) => void
}) {
  const scrollRef = useScrollIdle<HTMLDivElement>()
  const { transactions } = useData()
  const { cats, elapsed, periods, months, period } = useMemo(() => buildPacing(from, to, gated, transactions), [from, to, gated, transactions])
  const hasHistory = periods > 0
  const focusOn = isActive(selection)

  // The accordion IS the focus — one concept, no second source of truth. Opens
  // iff exactly one category is selected; a multi-select expands nothing, which
  // is the honest answer to "which one would you open?".
  const open = selection.categories.length === 1 ? selection.categories[0] : null

  const totals = useMemo(
    () => ({
      current: cats.reduce((a, c) => a + c.current, 0),
      baseline: cats.reduce((a, c) => a + c.baseline, 0),
      landing: cats.reduce((a, c) => a + c.landing, 0),
    }),
    [cats],
  )
  // only used when there's no baseline to scale against
  const maxCurrent = useMemo(() => Math.max(0, ...cats.map((c) => c.current)), [cats])
  const totalDelta = totals.baseline > 0 ? totals.landing / totals.baseline - 1 : 0
  const totalTone = totalDelta > 0.02 ? 'var(--color-neg)' : totalDelta < -0.02 ? 'var(--color-pos)' : 'var(--color-muted)'

  return (
    <Tile span={3} className="flex flex-col">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h3 className="font-display text-[14px] font-bold text-ink">Category pacing &amp; volatility</h3>
          {/* This card measures whole calendar months, so on a Week or mid-month
              custom range its window is genuinely wider than the one driving the
              rest of the page. Name it rather than let the tiles silently disagree. */}
          <span className="text-[11px] uppercase tracking-[0.06em] text-muted" title={`${period.from} → ${period.to}`}>
            {windowLabel(period, elapsed)}
          </span>
        </div>
        <span className="text-[11px] uppercase tracking-[0.06em] text-muted">
          vs prior period · click to focus the page
        </span>
      </header>

      {cats.length === 0 ? (
        <div className="grid place-items-center py-16 text-center text-[12.5px] text-muted">
          No spending in the selected period.
        </div>
      ) : (
        <>
          {/* The projected total surfaced once, where it belongs — not as a bar per row */}
          <p className="mb-2.5 text-[12px] text-ink2">
            {!hasHistory ? (
              <>
                <strong className="font-semibold text-ink tabular-nums">{fmt(totals.current)}</strong> over{' '}
                {months === 1 ? 'the period' : `${months} months`} — no prior period to compare against.
              </>
            ) : (
              <>
                {elapsed < 1 ? 'On track to spend ' : 'Spent '}
                <strong className="font-semibold text-ink tabular-nums">{fmt(totals.landing)}</strong> vs{' '}
                <span className="tabular-nums">{fmt(totals.baseline)}</span> last period{' '}
                <strong className="font-semibold tabular-nums" style={{ color: totalTone }}>
                  ({pct(totalDelta)})
                </strong>
              </>
            )}
          </p>

          {hasHistory && (
            <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Key swatch={<span className="h-[6px] w-4 rounded-[2px]" style={{ background: STATE_COLOR.ok }} />}>on track</Key>
              <Key swatch={<span className="h-[6px] w-4 rounded-[2px]" style={{ background: STATE_COLOR.risk }} />}>pacing over</Key>
              <Key swatch={<span className="h-[6px] w-4 rounded-[2px]" style={{ background: STATE_COLOR.over }} />}>over last period</Key>
              <Key swatch={<span className="h-[10px] w-4 rounded-[2px] bg-[var(--hair)]" />}>normal range (±1σ)</Key>
              <Key swatch={<svg width="7" height="5"><path d="M0,0 L7,0 L3.5,4.5 Z" fill="var(--color-ink2)" /></svg>}>projected finish</Key>
              <Key swatch={<span className="h-[9px] w-[2px] rounded-full bg-[var(--color-ink)]" />}>last period</Key>
              {elapsed < 1 && (
                <Key swatch={<span className="h-[9px] w-px" style={{ background: 'repeating-linear-gradient(var(--color-ink2) 0 2px, transparent 2px 4px)' }} />}>
                  on-pace
                </Key>
              )}
            </div>
          )}

          <div ref={scrollRef} className="scroll-region min-h-0 flex-1 overflow-y-auto pr-1.5" style={{ maxHeight: 288 }}>
            <div className="divide-y divide-[var(--hair-soft)]">
              {cats.map((c) => {
                const isOpen = open === c.name
                return (
                  <div key={c.name}>
                    <Row
                      r={c}
                      elapsed={elapsed}
                      hasHistory={hasHistory}
                      share={maxCurrent > 0 ? c.current / maxCurrent : 0}
                      open={isOpen}
                      chevron
                      dimmed={focusOn && !catInScope(c.name, selection)}
                      onClick={() => onToggleCategory(c.name)}
                    />
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="ml-2 border-l border-[var(--hair)] pl-3">
                            {c.subs.map((s) => (
                              <Row
                                key={s.name}
                                r={s}
                                elapsed={elapsed}
                                hasHistory={hasHistory}
                                share={maxCurrent > 0 ? s.current / maxCurrent : 0}
                                sub
                                dimmed={focusOn && !subInScope(c.name, s.name, selection)}
                                // `Other` is synthesized for txns with no subcat and isn't in the
                                // taxonomy — focusing it would match zero rows with no way back
                                onClick={s.name === 'Other' ? undefined : () => onToggleSubcat(c.name, s.name)}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          </div>

          {periods < 3 && (
            <p className="mt-2.5 border-t border-[var(--hair-soft)] pt-2 text-[10.5px] leading-relaxed text-muted">
              {hasHistory
                ? `Only ${periods} comparable ${periods === 1 ? 'period' : 'periods'} behind this range — the normal-range band needs at least 3, so it's suppressed.`
                : `A ${months}-month range has no earlier ${months}-month period inside a 12-month ledger, so there's nothing to compare against.`}{' '}
              Pacing reads best on a <strong className="font-semibold text-ink2">Month</strong> or{' '}
              <strong className="font-semibold text-ink2">Last month</strong> range.
            </p>
          )}
        </>
      )}
    </Tile>
  )
}
