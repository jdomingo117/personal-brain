import { useId, useState } from 'react'
import anime from 'animejs'
import { useChartReveal, CHART_EASE } from '../../hooks/useChartReveal'

export interface BarSeries {
  data: number[]
  color: string // CSS color
}

const formatChartVal = (v: number) => {
  const absV = Math.abs(v)
  return absV >= 1000
    ? (v < 0 ? '-' : '') + '$' + (absV / 1000).toFixed(1) + 'k'
    : (v < 0 ? '-' : '') + '$' + Math.round(absV)
}

const formatChartTick = (v: number) => {
  const absV = Math.abs(v)
  return absV >= 1000
    ? (v < 0 ? '-' : '') + '$' + Math.round(absV / 1000) + 'k'
    : (v < 0 ? '-' : '') + '$' + Math.round(absV)
}

export default function Bar({
  series,
  labels = [],
  height = 240,
}: {
  series: BarSeries[]
  labels?: string[]
  height?: number
}) {
  const W = 640
  const H = height
  const padL = 40
  const padR = 16
  const padT = 16
  const padB = 22
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const uid = useId().replace(/:/g, '')

  const all = series.flatMap((s) => s.data)
  const max = Math.max(...all) * 1.15
  const min = Math.min(0, Math.min(...all)) * 0.95
  const span = max - min || 1

  const yOf = (v: number) => padT + innerH - ((v - min) / span) * innerH

  const dataPoints = series[0]?.data || []
  const n = dataPoints.length
  const spacing = innerW / n
  // Width of each bar is 55% of the spacing
  const barW = Math.max(8, spacing * 0.55)

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
            delay: i * 45,
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
    const mouseX = ((e.clientX - rect.left) / rect.width) * W
    let idx = Math.floor((mouseX - padL) / spacing)
    idx = Math.max(0, Math.min(n - 1, idx))
    setHoveredIdx(idx)
  }

  const handlePointerLeave = () => {
    setHoveredIdx(null)
  }

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="none"
      style={{ height, display: 'block', touchAction: 'none' }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
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
      {Array.from({ length: 5 }).map((_, g) => {
        const y = padT + (g / 4) * innerH
        const val = max - (g / 4) * span
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

      {/* X Labels */}
      {labels.map((lab, i) =>
        labels.length > 12 && i % 2 ? null : (
          <text key={i} x={padL + i * spacing + spacing / 2} y={H - 5} fill="var(--color-muted)" fontSize={9} textAnchor="middle">
            {lab}
          </text>
        ),
      )}

      {/* Bars */}
      {series.map((s, si) => (
        <g key={si}>
          {s.data.map((v, i) => {
            const x = padL + i * spacing + (spacing - barW) / 2
            const y = yOf(v)
            const h = padT + innerH - y
            const gradId = `bar-grad-${uid}-${si}`

            const isHovered = hoveredIdx === i
            const isAnyHovered = hoveredIdx !== null
            const opacity = isHovered ? 1 : isAnyHovered ? 0.3 : 0.85

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
                stroke={s.color}
                strokeWidth={1.2}
                style={{ opacity, transition: 'opacity 0.15s ease' }}
              />
            )
          })}
        </g>
      ))}

      {/* Tooltip elements */}
      {hoveredIdx !== null && (
        <g pointerEvents="none">
          {series.map((s, si) => {
            const val = s.data[hoveredIdx]
            const x = padL + hoveredIdx * spacing + spacing / 2
            const y = yOf(val)

            // Dynamic tooltip positioning
            const cardW = 105
            const cardH = 24
            let tooltipY = y - cardH - 8
            if (tooltipY < padT) {
              tooltipY = y + 12 // flip below
            }
            const cardX = Math.max(padL + 4, Math.min(W - padR - cardW - 4, x - cardW / 2))

            return (
              <g key={si}>
                {/* Floating Tooltip Card */}
                <g transform={`translate(${cardX}, ${tooltipY})`}>
                  <rect
                    width={cardW}
                    height={cardH}
                    rx={5}
                    fill="var(--toast-bg)"
                    stroke="var(--hair)"
                    strokeWidth={1}
                    style={{ filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.12))' }}
                  />
                  <text
                    x={cardW / 2}
                    y={15}
                    fill="var(--color-ink)"
                    fontSize={10}
                    fontWeight={600}
                    textAnchor="middle"
                    className="tabular-nums"
                  >
                    {labels[hoveredIdx]} · {formatChartVal(val)}
                  </text>
                </g>
              </g>
            )
          })}
        </g>
      )}
    </svg>
  )
}
