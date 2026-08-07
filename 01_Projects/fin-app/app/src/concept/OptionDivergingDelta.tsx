import type { BarProps } from './PacingList'
import { VOL_LABEL, type Metrics } from './pacingData'
import { deltaLabel, landingDelta, stateOf, STATE_COLOR } from './rail'

/** ±100% maps to the full half-width; beyond that the bar clamps and the chip
 *  carries the real figure. */
const HALF = 50
const CLAMP = 1

function VolGlyph({ m }: { m: Metrics }) {
  const filled = m.vol === 'steady' ? 1 : m.vol === 'variable' ? 2 : 3
  return (
    <span className="flex items-end gap-[2px]" title={`${VOL_LABEL[m.vol]} · σ/μ ${Math.round(m.cv * 100)}%`}>
      {[3, 6, 9].map((h, i) => (
        <span key={h} className="w-[3px] rounded-[1px]" style={{ height: h, background: i < filled ? 'var(--color-ink2)' : 'var(--track)' }} />
      ))}
    </span>
  )
}

/** OPTION C — Diverging delta.
 *  Answers a different question to A/B: not "where am I now" but "where will I
 *  land". Zero is the baseline; bars grow left when the projected finish saves
 *  against last period, right when it overshoots. Reads as a % saved ledger. */
export default function OptionDivergingDelta({ m, sub }: BarProps) {
  const d = landingDelta(m)
  const st = stateOf(m)
  const mag = Math.min(Math.abs(d), CLAMP) * HALF
  const over = d > 0
  const h = sub ? 6 : 8
  const color = st === 'idle' ? 'var(--color-muted)' : over ? STATE_COLOR[st === 'over' ? 'over' : 'risk'] : 'var(--color-pos)'

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex-1 rounded-sm bg-[var(--track)]" style={{ height: h }}>
        <div
          className="absolute rounded-sm transition-all duration-500"
          style={{
            left: over ? `${HALF}%` : `${HALF - mag}%`,
            width: `${Math.max(mag, 0.5)}%`,
            top: 0,
            bottom: 0,
            background: color,
            opacity: sub ? 0.7 : 0.95,
          }}
        />
        {/* the baseline: zero delta */}
        <span className="absolute w-px" style={{ left: `${HALF}%`, top: -2, bottom: -2, background: 'var(--color-ink)', opacity: 0.55 }} />
      </div>

      <span
        className="w-[52px] shrink-0 text-right text-[10.5px] font-semibold tabular-nums"
        style={{ color: st === 'idle' ? 'var(--color-muted)' : color }}
        title="projected finish vs last period"
      >
        {deltaLabel(m, d, (x) => `${x > 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}%`)}
      </span>
      <VolGlyph m={m} />
    </div>
  )
}
