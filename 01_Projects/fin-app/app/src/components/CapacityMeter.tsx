import anime from 'animejs'
import type { Shield } from '../data'
import { useChartReveal, CHART_EASE } from '../hooks/useChartReveal'

export default function CapacityMeter({ shield, delay = 0 }: { shield: Shield; delay?: number }) {
  const pct = Math.round((shield.spent / shield.budget) * 100)
  const status = pct >= 100 ? 'critical' : pct >= 90 ? 'warning' : 'healthy'
  const color = status === 'critical' ? 'bg-neg' : status === 'warning' ? 'bg-warn' : 'bg-accent'
  const w = Math.min(pct, 100)
  const delayMs = 250 + delay * 1000

  const ref = useChartReveal<HTMLDivElement>(
    (scope) => {
      const fill = scope.querySelector<HTMLDivElement>('.meter-fill')
      const hi = scope.querySelector<HTMLDivElement>('.meter-hi')
      const trackW = fill?.parentElement?.offsetWidth || 0
      const fillIn = anime({ targets: fill, width: ['0%', w + '%'], duration: 1000, delay: delayMs, easing: CHART_EASE })
      // a highlight races just ahead of the fill edge, then fades
      const sweep = anime({
        targets: hi,
        translateX: [0, (w / 100) * trackW - 26],
        opacity: [
          { value: 0.6, duration: 120 },
          { value: 0, duration: 520 },
        ],
        duration: 1000,
        delay: delayMs,
        easing: CHART_EASE,
      })
      return [fillIn, sweep]
    },
    (scope) => {
      const fill = scope.querySelector<HTMLDivElement>('.meter-fill')
      if (fill) fill.style.width = w + '%'
    },
  )

  return (
    <div ref={ref} className="mt-3.5 first:mt-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink2">{shield.category}</span>
        <span className="text-[11px] tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="relative mt-[7px] h-1.5 overflow-hidden rounded bg-[var(--track)]">
        <div className={`meter-fill h-full rounded ${color}`} style={{ width: 0 }} />
        <div className="meter-hi pointer-events-none absolute inset-y-0 left-0 w-[26px] rounded bg-white/55 opacity-0" />
      </div>
      <div className="mt-1.5 text-[10.5px] tabular-nums text-muted">
        ${shield.spent.toLocaleString()} of ${shield.budget.toLocaleString()}
      </div>
    </div>
  )
}
