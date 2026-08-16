import { useId, useState } from 'react'
import anime from 'animejs'
import { useChartReveal, CHART_EASE } from '../../hooks/useChartReveal'
import { useResponsiveChartSize } from '../../hooks/useResponsiveChartSize'
import { chartYTickCount, visibleTickIndices } from '../../lib/chartDensity'
import { chartIndexFromPointer } from '../../lib/chartInteraction'
import SharedChartTooltip from './SharedChartTooltip'

export interface BarSeries {
  data: number[]
  color: string // CSS color
  /** Shown in grouped tooltips when this chart has more than one series. */
  label?: string
}

// Series data is in CENTS, like every other amount in the app (see the
// comment on fmt()/fmtCents() in data.ts). Divide by 100 before the k-scaling
// below, which otherwise operates on dollars.
const formatChartVal = (v: number) => {
  const absV = Math.abs(v) / 100
  return absV >= 1000
    ? (v < 0 ? '-' : '') + '$' + (absV / 1000).toFixed(1) + 'k'
    : (v < 0 ? '-' : '') + '$' + Math.round(absV)
}

const formatChartTick = (v: number) => {
  const absV = Math.abs(v) / 100
  return absV >= 1000
    ? (v < 0 ? '-' : '') + '$' + Math.round(absV / 1000) + 'k'
    : (v < 0 ? '-' : '') + '$' + Math.round(absV)
}

export default function Bar({
  series,
  labels = [],
  height = 240,
  selectedIndex = null,
  onClickDataPoint,
}: {
  series: BarSeries[]
  labels?: string[]
  height?: number
  selectedIndex?: number | null
  onClickDataPoint?: (idx: number) => void
}) {
  const { ref: containerRef, width: W, height: H, ready } = useResponsiveChartSize({
    // Preserve each existing call site's intended desktop proportion while
    // allowing the shared foundation to reduce height on compact cards.
    aspectRatio: 640 / height,
    maxHeight: height,
  })
  const padL = 40
  const padR = 16
  const padT = 16
  const padB = 22
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const yTickCount = chartYTickCount(innerH)
  const uid = useId().replace(/:/g, '')

  const all = series.flatMap((s) => s.data)
  const max = Math.max(...all) * 1.15
  const min = Math.min(0, Math.min(...all)) * 0.95
  const span = max - min || 1

  const yOf = (v: number) => padT + innerH - ((v - min) / span) * innerH

  const dataPoints = series[0]?.data || []
  const n = dataPoints.length
  const spacing = innerW / n
  // Bar is ~55% of the spacing; for dense charts (many days) drop the 8px floor
  // so bars stay within their slot instead of overlapping.
  const barW = spacing >= 14 ? Math.max(8, spacing * 0.55) : Math.max(1.5, spacing * 0.7)
  const xTickIndices = visibleTickIndices(labels.length, innerW)

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const ref = useChartReveal<SVGSVGElement>(
    (scope) => {
      const rects = scope.querySelectorAll<SVGRectElement>('.bar-rect')
      const created: anime.AnimeInstance[] = []

      rects.forEach((el, i) => {
        const finalY = parseFloat(el.dataset.y || '0')
        const finalH = parseFloat(el.dataset.h || '0')
        created.push(
          anime({
            targets: el,
            y: [padT + innerH, finalY],
            height: [0, finalH],
            opacity: [0, 0.85],
            duration: 900,
            delay: i * Math.min(45, 700 / Math.max(1, n)),
            easing: CHART_EASE,
          })
        )
      })
      return created
    },
    (scope) => {
      scope.querySelectorAll<SVGRectElement>('.bar-rect').forEach((el) => {
        const finalY = el.dataset.y || '0'
        const finalH = el.dataset.h || '0'
        el.setAttribute('y', finalY)
        el.setAttribute('height', finalH)
        el.style.opacity = '0.85'
      })
    }
  )

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoveredIdx(chartIndexFromPointer({
      clientX: e.clientX,
      rectLeft: rect.left,
      renderedWidth: rect.width,
      viewBoxWidth: W,
      plotLeft: padL,
      plotWidth: innerW,
      pointCount: n,
      mode: 'slot',
    }))
  }

  const handlePointerLeave = () => {
    setHoveredIdx(null)
  }

  return (
    <div ref={containerRef} style={{ minHeight: ready ? H : Math.min(height, 180) }}>
      {ready && <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: 'block', touchAction: 'none', cursor: onClickDataPoint ? 'pointer' : 'default' }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={() => {
          if (hoveredIdx !== null) onClickDataPoint?.(hoveredIdx)
        }}
        role="img"
        aria-label="Outflow per-period bar chart"
      >
      {/* Gradients definitions */}
      <defs>
        {series.map((s, si) => (
          <linearGradient key={si} id={`bar-grad-${uid}-${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={0.85} />
            <stop offset="100%" stopColor={s.color} stopOpacity={0.12} />
          </linearGradient>
        ))}
      </defs>

      {/* Gridlines + Y Ticks */}
      {Array.from({ length: yTickCount }).map((_, g) => {
        const y = padT + (g / (yTickCount - 1)) * innerH
        const val = max - (g / (yTickCount - 1)) * span
        return (
          <g key={g}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--hair-soft)" strokeWidth={1} />
            <text
              x={padL - 8}
              y={y + 3}
              fill="var(--color-muted)"
              fontSize={9}
              textAnchor="end"
              letterSpacing="0.04em"
              className="tabular-nums"
            >
              {formatChartTick(val)}
            </text>
          </g>
        )
      })}

      {/* X-axis labels are constrained by usable chart width, not data count. */}
      {xTickIndices.map((i) => (
        <text key={i} x={padL + i * spacing + spacing / 2} y={H - 5} fill="var(--color-muted)" fontSize={9} textAnchor="middle">
          {labels[i]}
        </text>
      ))}

      {/* Bars */}
      {series.map((s, si) => (
        <g key={si}>
          {s.data.map((v, i) => {
            const x = padL + i * spacing + (spacing - barW) / 2
            const y = yOf(v)
            const h = padT + innerH - y
            const gradId = `bar-grad-${uid}-${si}`

            const isSelected = selectedIndex === i
            const isAnySelected = selectedIndex !== null
            const isHovered = hoveredIdx === i
            const isAnyHovered = hoveredIdx !== null

            let opacity = 0.85
            if (isAnySelected) {
              if (isSelected) {
                opacity = 1.0
              } else if (isHovered) {
                opacity = 0.85
              } else {
                opacity = 0.25
              }
            } else if (isAnyHovered) {
              opacity = isHovered ? 1.0 : 0.3
            }

            return (
              <rect
                key={i}
                className="bar-rect"
                data-y={y}
                data-h={h}
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.max(2, Math.min(4, barW / 4))} // elegant rounded top
                fill={`url(#${gradId})`}
                stroke={isSelected ? 'var(--color-accent)' : s.color}
                strokeWidth={isSelected ? 2 : 1.2}
                style={{ opacity, transition: 'opacity 0.15s ease, stroke 0.15s ease, stroke-width 0.15s ease', filter: isSelected ? 'drop-shadow(0 0 3px var(--color-accent))' : undefined }}
              />
            )
          })}
        </g>
      ))}

      {/* Tooltip elements */}
      {hoveredIdx !== null && (
        <g pointerEvents="none">
          <SharedChartTooltip
            label={labels[hoveredIdx] ?? ''}
            items={series.map((s, index) => ({
              color: s.color,
              label: s.label ?? (series.length === 1 ? 'Value' : `Series ${index + 1}`),
              value: formatChartVal(s.data[hoveredIdx]),
            }))}
            anchorX={padL + hoveredIdx * spacing + spacing / 2}
            pointYs={series.map((s) => yOf(s.data[hoveredIdx]))}
            bounds={{ left: padL, right: W - padR, top: padT, bottom: padT + innerH }}
          />
        </g>
      )}
      </svg>}
    </div>
  )
}
