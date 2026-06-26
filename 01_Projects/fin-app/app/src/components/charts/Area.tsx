import anime from 'animejs'
import { useId, useState } from 'react'
import { useChartReveal, CHART_EASE } from '../../hooks/useChartReveal'

export interface Series {
  data: number[]
  color: string // CSS color
  fill?: boolean
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

export default function Area({
  series,
  labels = [],
  height = 240,
}: {
  series: Series[]
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
  const all = series.flatMap((s) => s.data)
  const max = Math.max(...all) * 1.15
  const min = Math.min(0, Math.min(...all)) * 0.95
  const span = max - min || 1
  const n = series[0].data.length
  const xOf = (i: number) => padL + (i / (n - 1)) * innerW
  const yOf = (v: number) => padT + innerH - ((v - min) / span) * innerH
  const uid = useId().replace(/:/g, '')

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // geometry per series
  const geo = series.map((s) => {
    const pts = s.data.map((v, i) => [xOf(i), yOf(v)] as const)
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
    const last = pts[pts.length - 1]
    const fillPath = `${line} L${xOf(n - 1).toFixed(1)} ${padT + innerH} L${padL} ${padT + innerH} Z`
    return { ...s, line, fillPath, last }
  })

  const ref = useChartReveal<SVGSVGElement>(
    (scope) => {
      const lines = scope.querySelectorAll<SVGPathElement>('.area-line')
      const fills = scope.querySelectorAll<SVGPathElement>('.area-fill')
      const travels = scope.querySelectorAll<SVGGElement>('.area-dot-travel')
      const dots = scope.querySelectorAll<SVGCircleElement>('.area-dot')
      const created: anime.AnimeInstance[] = []

      lines.forEach((el, i) => {
        created.push(anime({ targets: el, strokeDashoffset: [1, 0], duration: 1300, delay: i * 120, easing: CHART_EASE }))
        const travel = travels[i]
        const dot = dots[i]
        if (travel && dot) {
          const path = anime.path(el)
          created.push(
            anime({ targets: travel, translateX: path('x'), translateY: path('y'), duration: 1300, delay: i * 120, easing: CHART_EASE }),
          )
          created.push(anime({ targets: dot, opacity: [0, 1], scale: [0, 1], duration: 320, delay: i * 120, easing: 'easeOutBack' }))
          created.push(anime({ targets: dot, scale: [1, 1.5, 1], duration: 460, delay: i * 120 + 1300, easing: 'easeOutElastic(1, .6)' }))
        }
      })
      created.push(anime({ targets: fills, opacity: [0, 1], duration: 800, delay: 500, easing: 'linear' }))
      return created
    },
    (scope) => {
      scope.querySelectorAll<SVGPathElement>('.area-line').forEach((el) => (el.style.strokeDashoffset = '0'))
      scope.querySelectorAll<SVGPathElement>('.area-fill').forEach((el) => (el.style.opacity = '1'))
      scope.querySelectorAll<SVGGElement>('.area-dot-travel').forEach((g, i) => {
        anime.set(g, { translateX: geo[i].last[0], translateY: geo[i].last[1] })
      })
      scope.querySelectorAll<SVGCircleElement>('.area-dot').forEach((el) => (el.style.opacity = '1'))
    },
  )

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * W
    const pct = (mouseX - padL) / innerW
    let idx = Math.round(pct * (n - 1))
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
      {/* gridlines + $ ticks */}
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
      {/* x labels */}
      {labels.map((lab, i) =>
        labels.length > 12 && i % 2 ? null : (
          <text key={i} x={xOf(i)} y={H - 5} fill="var(--color-muted)" fontSize={9} textAnchor="middle">
            {lab}
          </text>
        ),
      )}
      {/* series */}
      {geo.map((s, si) => {
        const gid = `area-${uid}-${si}`
        return (
          <g key={si}>
            {s.fill !== false && (
              <>
                <defs>
                  <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <path className="area-fill" d={s.fillPath} fill={`url(#${gid})`} style={{ opacity: 1 }} />
              </>
            )}
            <path
              className="area-line"
              d={s.line}
              pathLength={1}
              fill="none"
              stroke={s.color}
              strokeWidth={2.2}
              strokeLinejoin="round"
              style={{ strokeDasharray: 1, strokeDashoffset: 0 }}
            />
            <g className="area-dot-travel">
              <circle
                className="area-dot"
                cx={0}
                cy={0}
                r={3.2}
                fill={s.color}
                style={{ opacity: 1, transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            </g>
          </g>
        )
      })}

      {/* Tooltip elements */}
      {hoveredIdx !== null && (
        <g pointerEvents="none">
          {/* Vertical guide line */}
          <line
            x1={xOf(hoveredIdx)}
            y1={padT}
            x2={xOf(hoveredIdx)}
            y2={padT + innerH}
            stroke="var(--color-accent)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />

          {series.map((s, si) => {
            const val = s.data[hoveredIdx]
            const x = xOf(hoveredIdx)
            const y = yOf(val)

            // Dynamic tooltip positioning (above or below depending on top margin)
            const cardW = 105
            const cardH = 24
            let tooltipY = y - cardH - 8
            if (tooltipY < padT) {
              tooltipY = y + 12 // flip below
            }
            const cardX = Math.max(padL + 4, Math.min(W - padR - cardW - 4, x - cardW / 2))

            return (
              <g key={si}>
                {/* Active point hover ring */}
                <circle cx={x} cy={y} r={6} fill="var(--color-surface)" stroke={s.color} strokeWidth={2.5} />
                <circle cx={x} cy={y} r={12} fill={s.color} opacity={0.15} />

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
