import type { BarProps } from './PacingList'
import { ELAPSED, deltaTone, pctText, type Metrics } from './pacingData'
import { BASE_X, deltaLabel, isClamped, paceX, scaleX, stateOf, STATE_COLOR } from './rail'
import { OverflowChevron } from './Marks'

const SW = 54
const SH = 18

/** Volatility as *shape* rather than a statistic — the trailing 6 periods drawn
 *  as a sparkline. A flat line is a fixed cost; a jagged one is discretionary.
 *  The hollow dot is the current, still-incomplete period. */
function Spark({ m, color }: { m: Metrics; color: string }) {
  const pts = [...m.history, m.current]
  const max = Math.max(...pts, 1)
  const x = (i: number) => (i / (pts.length - 1)) * (SW - 4) + 2
  const y = (v: number) => SH - 3 - (v / max) * (SH - 6)
  const lastX = x(pts.length - 1)
  const lastY = y(m.current)

  return (
    <svg width={SW} height={SH} className="shrink-0 overflow-visible" aria-hidden>
      {/* completed periods */}
      <path
        d={pts.slice(0, -1).map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
        fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" opacity="0.75"
      />
      {/* the leg into the partial period is dashed — it isn't a finished figure */}
      <path
        d={`M${x(pts.length - 2).toFixed(1)},${y(m.history[m.history.length - 1]).toFixed(1)} L${lastX.toFixed(1)},${lastY.toFixed(1)}`}
        fill="none" stroke={color} strokeWidth="1.3" strokeDasharray="2 2" opacity="0.75"
      />
      <circle cx={lastX} cy={lastY} r="2.1" fill="var(--toast-bg)" stroke={color} strokeWidth="1.3" />
    </svg>
  )
}

/** OPTION D — Rail + sparkline.
 *  The Option A rail, with the volatility glyph swapped for the actual history.
 *  Richest per row, and the widest. */
export default function OptionRailSparkline({ m, color, sub }: BarProps) {
  const w = scaleX(m.current, m.baseline)
  const st = stateOf(m)
  const h = sub ? 5 : 7

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex-1">
        <div className="relative overflow-hidden rounded-full bg-[var(--track)]" style={{ height: h }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
            style={{ width: `${Math.min(w, BASE_X)}%`, background: color, opacity: sub ? 0.62 : 0.9 }}
          />
          {w > BASE_X && (
            <div
              className="absolute inset-y-0 rounded-r-full"
              style={{ left: `${BASE_X}%`, width: `${w - BASE_X}%`, background: 'var(--color-neg)' }}
            />
          )}
          <span className="absolute inset-y-0 w-px" style={{ left: `${BASE_X}%`, background: 'var(--color-ink)', opacity: 0.5 }} />
          <span
            className="absolute inset-y-0 w-px"
            style={{
              left: `${paceX(ELAPSED)}%`,
              background: 'repeating-linear-gradient(var(--color-ink2) 0 2px, transparent 2px 4px)',
              opacity: 0.75,
            }}
          />
        </div>
        {isClamped(m.current, m.baseline) && (
          <OverflowChevron color="var(--color-neg)" title={`off-scale — ${Math.round(m.ratio * 100)}% of last period`} />
        )}
      </div>

      <span
        className={`w-[46px] shrink-0 text-right text-[10.5px] font-semibold tabular-nums ${
          deltaTone(m.ratio - 1) === 'neg' ? 'text-neg' : deltaTone(m.ratio - 1) === 'pos' ? 'text-pos' : 'text-muted'
        }`}
        style={st === 'risk' ? { color: STATE_COLOR.risk } : undefined}
      >
        {deltaLabel(m, m.ratio - 1, pctText)}
      </span>
      <Spark m={m} color={color} />
    </div>
  )
}
