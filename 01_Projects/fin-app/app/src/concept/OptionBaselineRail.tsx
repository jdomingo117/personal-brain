import type { BarProps } from './PacingList'
import { ELAPSED, deltaTone, pctText, VOL_LABEL, type Metrics } from './pacingData'
import { BASE_X, deltaLabel, isClamped, paceX, scaleX, stateOf, STATE_COLOR } from './rail'
import { OverflowChevron } from './Marks'

/** Volatility as a 3-step signal glyph — compact, unitless, and deliberately
 *  neutral in colour (a volatile category isn't "bad", just unpredictable). */
function VolGlyph({ m }: { m: Metrics }) {
  const filled = m.vol === 'steady' ? 1 : m.vol === 'variable' ? 2 : 3
  return (
    <span className="flex items-end gap-[2px]" title={`${VOL_LABEL[m.vol]} · σ/μ ${Math.round(m.cv * 100)}%`}>
      {[3, 6, 9].map((h, i) => (
        <span
          key={h}
          className="w-[3px] rounded-[1px]"
          style={{ height: h, background: i < filled ? 'var(--color-ink2)' : 'var(--track)' }}
        />
      ))}
    </span>
  )
}

/** OPTION A — Baseline rail.
 *  Fill = spend this period, category-hued up to the baseline rule and red past
 *  it. Dashed tick = where you'd be if you tracked the baseline exactly. */
export default function OptionBaselineRail({ m, color, sub }: BarProps) {
  const w = scaleX(m.current, m.baseline)
  const st = stateOf(m)
  const h = sub ? 5 : 7

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex-1">
        <div className="relative overflow-hidden rounded-full bg-[var(--track)]" style={{ height: h }}>
          {/* spend up to baseline */}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
            style={{ width: `${Math.min(w, BASE_X)}%`, background: color, opacity: sub ? 0.62 : 0.9 }}
          />
          {/* the portion past the baseline, called out in red */}
          {w > BASE_X && (
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{ left: `${BASE_X}%`, width: `${w - BASE_X}%`, background: 'var(--color-neg)' }}
            />
          )}
          {/* baseline rule — same x on every row */}
          <span className="absolute inset-y-0 w-px" style={{ left: `${BASE_X}%`, background: 'var(--color-ink)', opacity: 0.5 }} />
          {/* pace tick */}
          <span
            className="absolute inset-y-0 w-px"
            style={{
              left: `${paceX(ELAPSED)}%`,
              background: `repeating-linear-gradient(var(--color-ink2) 0 2px, transparent 2px 4px)`,
              opacity: 0.75,
            }}
          />
        </div>
        {isClamped(m.current, m.baseline) && (
          <OverflowChevron color="var(--color-neg)" title={`off-scale — ${Math.round(m.ratio * 100)}% of last period`} />
        )}
      </div>

      <span
        className={`w-[52px] shrink-0 text-right text-[10.5px] font-semibold tabular-nums ${
          deltaTone(m.ratio - 1) === 'neg' ? 'text-neg' : deltaTone(m.ratio - 1) === 'pos' ? 'text-pos' : 'text-muted'
        }`}
        style={st === 'risk' ? { color: STATE_COLOR.risk } : undefined}
        title={m.baseline > 0 ? `${Math.round(m.ratio * 100)}% of last period` : 'no spend last period'}
      >
        {deltaLabel(m, m.ratio - 1, pctText)}
      </span>
      <VolGlyph m={m} />
    </div>
  )
}
