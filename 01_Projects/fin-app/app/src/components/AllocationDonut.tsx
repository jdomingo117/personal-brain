import anime from 'animejs'
import Donut from './charts/Donut'
import type { AllocationSlice } from '../data'
import { fmt, glowColor } from '../data'
import { useChartReveal, CHART_EASE } from '../hooks/useChartReveal'

const STEP = 230 // ms between segments — segment N's legend row lands at N*STEP + 260

export default function AllocationDonut({
  data,
  totalLabel = 'Gross Assets',
}: {
  data: AllocationSlice[]
  totalLabel?: string
}) {
  const total = data.reduce((a, d) => a + d.value, 0)
  const centerFmt = (n: number) => '$' + Math.round(n / 1000) + 'K'

  const ref = useChartReveal<HTMLDivElement>(
    (scope) => {
      const segs = scope.querySelectorAll<SVGCircleElement>('.donut-seg')
      const rows = scope.querySelectorAll<HTMLLIElement>('.donut-legend-row')
      const center = scope.querySelector<SVGTextElement>('.donut-center')

      const tl = anime.timeline({ easing: CHART_EASE })
      segs.forEach((el, i) => {
        const dash = parseFloat(el.dataset.dash || '0')
        // segment draws in with a slight overshoot…
        tl.add({ targets: el, strokeDashoffset: [dash, 0], duration: 560, easing: 'easeOutBack' }, i * STEP)
        // …then its legend row lands exactly as it completes
        tl.add({ targets: rows[i], opacity: [0, 1], translateX: [8, 0], duration: 380 }, i * STEP + 260)
      })

      const c = { v: 0 }
      const counter = anime({
        targets: c,
        v: total,
        duration: segs.length * STEP + 400,
        easing: CHART_EASE,
        round: 1,
        update: () => {
          if (center) center.textContent = centerFmt(c.v)
        },
      })

      return [tl, counter]
    },
    (scope) => {
      scope.querySelectorAll<SVGCircleElement>('.donut-seg').forEach((el) => {
        el.style.strokeDashoffset = '0'
      })
      scope.querySelectorAll<HTMLLIElement>('.donut-legend-row').forEach((el) => {
        el.style.opacity = '1'
      })
      const center = scope.querySelector<SVGTextElement>('.donut-center')
      if (center) center.textContent = centerFmt(total)
    },
  )

  return (
    <div ref={ref} className="flex items-center gap-6">
      <div className="flex-shrink-0">
        <Donut
          size={165}
          data={data.map((d) => ({ value: d.value, color: glowColor[d.glow] }))}
          centerLabel="TOTAL"
          centerValue={centerFmt(total)}
        />
      </div>
      <div className="flex-1 min-w-0">
        <ul className="grid gap-2">
          {data.map((d) => {
            const pct = ((d.value / total) * 100).toFixed(1)
            return (
              <li
                key={d.label}
                className="donut-legend-row flex flex-col gap-1"
                style={{ opacity: 0 }}
              >
                {/* Label and Percentage */}
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: glowColor[d.glow] }} />
                    <span className="truncate text-ink2">{d.label}</span>
                  </div>
                  <span className="text-muted text-[10px] tabular-nums">{pct}%</span>
                </div>
                {/* Progress Bar and Value */}
                <div className="flex items-center gap-2.5">
                  <div className="h-1 flex-1 rounded bg-[var(--track)] overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${pct}%`, background: glowColor[d.glow] }} />
                  </div>
                  <span className="text-[12.5px] font-bold tabular-nums text-ink">{fmt(d.value)}</span>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="border-t border-[var(--hair-soft)] my-2" />
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.08em]">
          <span className="text-muted">{totalLabel}</span>
          <span className="text-[13px] font-extrabold text-ink tabular-nums">{fmt(total)}</span>
        </div>
      </div>
    </div>
  )
}
