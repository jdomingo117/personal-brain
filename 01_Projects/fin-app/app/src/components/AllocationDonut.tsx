import anime from 'animejs'
import Donut from './charts/Donut'
import type { AllocationSlice } from '../data'
import { fmt, glowColor } from '../data'
import { useChartReveal, CHART_EASE } from '../hooks/useChartReveal'

const STEP = 230 // ms between segments — segment N's legend row lands at N*STEP + 260

export default function AllocationDonut({ data }: { data: AllocationSlice[] }) {
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
    <div ref={ref} className="flex items-center gap-5">
      <Donut
        size={150}
        data={data.map((d) => ({ value: d.value, color: glowColor[d.glow] }))}
        centerLabel="TOTAL"
        centerValue={centerFmt(total)}
      />
      <ul className="grid flex-1 gap-2.5">
        {data.map((d) => (
          <li
            key={d.label}
            className="donut-legend-row flex items-center gap-2.5 text-[12.5px]"
            style={{ opacity: 0 }}
          >
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{ background: glowColor[d.glow] }} />
            <span className="flex-1 text-ink2">{d.label}</span>
            <span className="font-semibold tabular-nums">{fmt(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
