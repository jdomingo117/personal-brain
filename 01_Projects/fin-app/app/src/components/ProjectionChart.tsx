import { useState } from 'react'
import type { ProjectionPoint } from '../lib/projections'
import { fmt } from '../data'
import { useResponsiveChartSize } from '../hooks/useResponsiveChartSize'
import { chartYTickCount, visibleTickIndices } from '../lib/chartDensity'
import { chartIndexFromPointer } from '../lib/chartInteraction'

const compact = (cents: number) => {
  const dollars = Math.abs(cents) / 100
  const value = dollars >= 1_000_000 ? `${(dollars / 1_000_000).toFixed(1)}m` : dollars >= 1_000 ? `${Math.round(dollars / 1_000)}k` : `${Math.round(dollars)}`
  return `${cents < 0 ? '-' : ''}$${value}`
}

const label = (month: string) => {
  const date = new Date(`${month}-01T00:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export default function ProjectionChart({
  history,
  baseline,
  scenario,
  target,
}: {
  history: ProjectionPoint[]
  baseline: ProjectionPoint[]
  scenario?: ProjectionPoint[]
  target: number
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const { ref: containerRef, width: W, height: H, ready } = useResponsiveChartSize({
    // The planner shares a row with a substantial what-if panel. Let the plot
    // use that assigned space instead of leaving a shallow chart above a gap.
    aspectRatio: 760 / 440,
    minHeight: 360,
    maxHeight: 680,
    fillAvailableHeight: true,
  })
  const pad = { left: 64, right: 28, top: 34, bottom: 42 }
  const actual = history.length ? history : [baseline[0]]
  const allDates = [...actual.map((point) => point.date), ...baseline.slice(1).map((point) => point.date)]
  const values = [...actual, ...baseline, ...(scenario ?? []), { date: '', value: target }].map((point) => point.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const buffer = Math.max((rawMax - rawMin) * 0.12, 10_000)
  const min = Math.min(0, rawMin - buffer)
  const max = rawMax + buffer
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const yTickCount = chartYTickCount(innerH)
  const dateTickIndices = visibleTickIndices(allDates.length, innerW, 84, 8)
  const showAnnotationLabels = innerW >= 240
  const x = (index: number) => pad.left + (index / Math.max(allDates.length - 1, 1)) * innerW
  const y = (value: number) => pad.top + innerH - ((value - min) / Math.max(max - min, 1)) * innerH
  const actualPath = actual.map((point, index) => `${index ? 'L' : 'M'}${x(index)} ${y(point.value)}`).join(' ')
  const projectionOffset = Math.max(actual.length - 1, 0)
  const pathFor = (points: ProjectionPoint[]) => points.map((point, index) => `${index ? 'L' : 'M'}${x(projectionOffset + index)} ${y(point.value)}`).join(' ')
  const baselinePath = pathFor(baseline)
  const baselineEndIndex = projectionOffset + Math.max(baseline.length - 1, 0)
  const forecastArea = `${baselinePath} L${x(baselineEndIndex)} ${pad.top + innerH} L${x(projectionOffset)} ${pad.top + innerH} Z`
  const hoverPoint = hovered === null ? null : baseline[hovered]
  const scenarioHoverPoint = hovered === null ? null : scenario?.[hovered]

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1" style={{ minHeight: ready ? H : 360 }}>
      {ready && <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        height={H}
        role="img"
        aria-label="Historical values and projected financial trajectory"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setHovered(chartIndexFromPointer({
            clientX: event.clientX,
            rectLeft: rect.left,
            renderedWidth: rect.width,
            viewBoxWidth: W,
            plotLeft: x(projectionOffset),
            plotWidth: Math.max(innerW - x(projectionOffset) + pad.left, 1),
            pointCount: baseline.length,
          }))
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="projection-forecast-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <rect x={pad.left} y={pad.top} width={innerW} height={innerH} rx="8" fill="var(--glass-fill)" opacity="0.32" />
        <rect x={x(projectionOffset)} y={pad.top} width={Math.max(W - pad.right - x(projectionOffset), 0)} height={innerH} fill="var(--color-accent)" opacity="0.035" />
        {Array.from({ length: yTickCount }).map((_, index) => {
          const value = max - ((max - min) * index) / (yTickCount - 1)
          const py = y(value)
          return <g key={index}><line x1={pad.left} x2={W - pad.right} y1={py} y2={py} stroke="var(--hair-soft)" /><text x={pad.left - 10} y={py + 4} textAnchor="end" fontSize="12" fill="var(--color-muted)">{compact(value)}</text></g>
        })}
        {showAnnotationLabels && <text x={pad.left} y={pad.top - 12} fontSize="12" fontWeight="600" fill="var(--color-muted)">Historical</text>}
        {showAnnotationLabels && <text x={x(projectionOffset) + 10} y={pad.top - 12} fontSize="12" fontWeight="600" fill="var(--color-accent)">Forecast</text>}
        <line x1={pad.left} x2={W - pad.right} y1={y(target)} y2={y(target)} stroke="var(--color-warn)" strokeWidth="2" strokeDasharray="5 5" opacity="0.8" />
        {showAnnotationLabels && <text x={W - pad.right} y={y(target) - 8} textAnchor="end" fontSize="12" fontWeight="600" fill="var(--color-warn)">Goal · {compact(target)}</text>}
        <line x1={x(projectionOffset)} x2={x(projectionOffset)} y1={pad.top} y2={pad.top + innerH} stroke="var(--hair)" strokeDasharray="3 4" />
        {showAnnotationLabels && <text x={x(projectionOffset)} y={pad.top + 17} dx="7" fontSize="12" fontWeight="600" fill="var(--color-muted)">Today</text>}
        <path d={actualPath} fill="none" stroke="var(--color-ink2)" strokeWidth="3" strokeLinejoin="round" />
        <path d={forecastArea} fill="url(#projection-forecast-fill)" />
        <path d={baselinePath} fill="none" stroke="var(--color-accent)" strokeWidth="3.8" strokeLinejoin="round" />
        {scenario && <path d={pathFor(scenario)} fill="none" stroke="var(--color-blue)" strokeWidth="3.2" strokeDasharray="3 5" strokeLinejoin="round" />}
        <circle cx={x(projectionOffset)} cy={y(actual.at(-1)?.value ?? baseline[0]?.value ?? 0)} r="4" fill="var(--color-ink2)" stroke="var(--surface)" strokeWidth="2" />
        <circle cx={x(baselineEndIndex)} cy={y(baseline.at(-1)?.value ?? 0)} r="4.5" fill="var(--color-accent)" stroke="var(--surface)" strokeWidth="2" />
        {scenario && <circle cx={x(baselineEndIndex)} cy={y(scenario.at(-1)?.value ?? 0)} r="4" fill="var(--color-blue)" stroke="var(--surface)" strokeWidth="2" />}
        {dateTickIndices.map((index) => <text key={allDates[index]} x={x(index)} y={H - 10} textAnchor="middle" fontSize="12" fill="var(--color-muted)">{label(allDates[index])}</text>)}
        {hovered !== null && <line x1={x(projectionOffset + hovered)} x2={x(projectionOffset + hovered)} y1={pad.top} y2={pad.top + innerH} stroke="var(--color-accent)" opacity="0.4" />}
      </svg>}
      {hoverPoint && (
        <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-[var(--hair)] bg-[var(--toast-bg)] px-4 py-3 text-[14px] shadow-lg">
          <div className="font-semibold text-muted">{label(hoverPoint.date)}</div>
          <div className="mt-0.5 font-bold tabular-nums text-ink">Baseline {fmt(hoverPoint.value)}</div>
          {scenarioHoverPoint && <div className="font-semibold tabular-nums text-[var(--color-blue)]">Scenario {fmt(scenarioHoverPoint.value)}</div>}
        </div>
      )}
    </div>
  )
}
