import anime from 'animejs'
import type { Objective } from '../data'
import { fmt, glowColor } from '../data'
import { useChartReveal, CHART_EASE } from '../hooks/useChartReveal'

export default function ObjectiveRing({ obj, index = 0 }: { obj: Objective; index?: number }) {
  const pct = Math.min(obj.current / obj.target, 1)
  const r = 46
  const CIRC = 2 * Math.PI * r
  const target = CIRC * (1 - pct)
  const color = glowColor[obj.glow]
  const delay = index * 180

  const ref = useChartReveal<HTMLDivElement>(
    (scope) => {
      const seg = scope.querySelector<SVGCircleElement>('.ring-seg')
      const label = scope.querySelector<HTMLDivElement>('.ring-pct')
      const draw = anime({
        targets: seg,
        strokeDashoffset: [CIRC, target],
        duration: 1400,
        delay,
        easing: 'easeOutElastic(1, .65)', // springs slightly past, then settles
      })
      const c = { v: 0 }
      const counter = anime({
        targets: c,
        v: pct * 100,
        duration: 1200,
        delay,
        easing: CHART_EASE,
        round: 1,
        update: () => {
          if (label) label.textContent = Math.round(c.v) + '%'
        },
      })
      return [draw, counter]
    },
    (scope) => {
      const seg = scope.querySelector<SVGCircleElement>('.ring-seg')
      if (seg) seg.style.strokeDashoffset = String(target)
      const label = scope.querySelector<HTMLDivElement>('.ring-pct')
      if (label) label.textContent = Math.round(pct * 100) + '%'
    },
  )

  return (
    <div ref={ref} className="text-center">
      <div className="relative mx-auto h-[120px] w-[120px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx={60} cy={60} r={r} fill="none" stroke="var(--track)" strokeWidth={7} />
          <circle
            className="ring-seg"
            cx={60}
            cy={60}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC}
          />
        </svg>
        <div className="ring-pct absolute inset-0 grid place-items-center text-[20px] font-bold tabular-nums">
          {Math.round(pct * 100)}%
        </div>
      </div>
      <div className="mt-2 text-[13px] font-semibold">{fmt(obj.current)}</div>
      <div className="mt-0.5 text-[11px] text-muted">{obj.name}</div>
    </div>
  )
}
