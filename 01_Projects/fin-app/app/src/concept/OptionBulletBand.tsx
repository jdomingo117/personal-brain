import type { BarProps } from './PacingList'
import { ELAPSED, deltaTone, pctText } from './pacingData'
import { BASE_X, deltaLabel, isClamped, paceX, scaleX, stateOf, STATE_COLOR } from './rail'
import { OverflowChevron } from './Marks'

/** The band is built from *completed* periods, but the bar is a *partial* one —
 *  so comparing the two directly is apples-to-oranges, and every row would read
 *  "under" on day 15. The caret is the projected finish, which is the figure the
 *  band is actually commensurate with: caret inside the band = an ordinary
 *  period for this category, caret outside = the thing worth looking at. */
function LandingCaret({ x, color }: { x: number; color: string }) {
  return (
    <span className="absolute" style={{ left: `${x}%`, top: -5, transform: 'translateX(-50%)' }} title="projected finish">
      <svg width="7" height="4" aria-hidden>
        <path d="M0,0 L7,0 L3.5,4.5 Z" fill={color} />
      </svg>
    </span>
  )
}

/** OPTION B — Bullet chart with a volatility band.
 *  A Stephen Few bullet: the pale band behind the bar is the ±1σ "normal range"
 *  over the last 6 periods, so volatility is encoded *positionally* — a wide
 *  band means an unpredictable category, and the only question left is whether
 *  the bar tip lands inside it. No number to interpret. */
export default function OptionBulletBand({ m, color, sub }: BarProps) {
  const w = scaleX(m.current, m.baseline)
  const lo = scaleX(m.band.lo, m.baseline)
  const hi = scaleX(m.band.hi, m.baseline)
  const st = stateOf(m)
  const trackH = sub ? 11 : 14
  const barH = sub ? 4 : 6

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex-1 rounded-[3px] bg-[var(--track)]" style={{ height: trackH }}>
        {/* ±1σ normal range — width *is* the volatility */}
        <div
          className="absolute inset-y-0 rounded-[3px]"
          style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 0.6)}%`, background: 'var(--hair)' }}
        />
        {/* spend bar, centred bullet-style. Split at the baseline exactly as in
            Option A — hue up to it, red past it — so the band is the *only*
            difference between the two options. */}
        <div
          className="absolute transition-[width] duration-500"
          style={{
            left: 0,
            width: `${Math.min(w, BASE_X)}%`,
            height: barH,
            top: (trackH - barH) / 2,
            background: color,
            opacity: sub ? 0.75 : 1,
          }}
        />
        {w > BASE_X && (
          <div
            className="absolute rounded-r-[2px]"
            style={{
              left: `${BASE_X}%`,
              width: `${w - BASE_X}%`,
              height: barH,
              top: (trackH - barH) / 2,
              background: 'var(--color-neg)',
            }}
          />
        )}
        {/* baseline marker — the bullet's "target" */}
        <span
          className="absolute w-[2px] rounded-full"
          style={{ left: `${BASE_X}%`, top: -2, bottom: -2, background: 'var(--color-ink)' }}
        />
        {/* pace tick */}
        <span
          className="absolute inset-y-0 w-px"
          style={{
            left: `${paceX(ELAPSED)}%`,
            background: 'repeating-linear-gradient(var(--color-ink2) 0 2px, transparent 2px 4px)',
            opacity: 0.7,
          }}
        />
        {/* projected finish — the mark the band is commensurate with */}
        {m.baseline > 0 && m.landing > 0 && (
          <LandingCaret x={scaleX(m.landing, m.baseline)} color={STATE_COLOR[st]} />
        )}
        {(isClamped(m.current, m.baseline) || isClamped(m.landing, m.baseline) || isClamped(m.band.hi, m.baseline)) && (
          <OverflowChevron
            color={STATE_COLOR[st]}
            title={`off-scale — projects ${Math.round((m.landing / m.baseline) * 100)}% of last period`}
          />
        )}
      </div>

      <span
        className={`w-[52px] shrink-0 text-right text-[10.5px] font-semibold tabular-nums ${
          deltaTone(m.ratio - 1) === 'neg' ? 'text-neg' : deltaTone(m.ratio - 1) === 'pos' ? 'text-pos' : 'text-muted'
        }`}
        style={st === 'risk' ? { color: STATE_COLOR.risk } : undefined}
      >
        {deltaLabel(m, m.ratio - 1, pctText)}
      </span>
    </div>
  )
}
