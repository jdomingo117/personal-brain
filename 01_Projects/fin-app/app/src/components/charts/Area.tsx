import anime from 'animejs'
import { useId } from 'react'
import { useChartReveal, CHART_EASE } from '../../hooks/useChartReveal'

export interface Series {
  data: number[]
  color: string // CSS color
  fill?: boolean
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
  const W = 640,
    H = height
  const padL = 6,
    padR = 6,
    padT = 16,
    padB = 24
  const innerW = W - padL - padR,
    innerH = H - padT - padB
  const all = series.flatMap((s) => s.data)
  const max = Math.max(...all) * 1.1
  const min = Math.min(0, Math.min(...all)) * 0.98
  const span = max - min || 1
  const n = series[0].data.length
  const xOf = (i: number) => padL + (i / (n - 1)) * innerW
  const yOf = (v: number) => padT + innerH - ((v - min) / span) * innerH
  const uid = useId().replace(/:/g, '')

  // geometry per series (shared by render + the reveal closures)
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
        // line draws on (pathLength=1 → scale-proof normalised dash)
        created.push(anime({ targets: el, strokeDashoffset: [1, 0], duration: 1300, delay: i * 120, easing: CHART_EASE }))
        const travel = travels[i]
        const dot = dots[i]
        if (travel && dot) {
          // the <g> rides the drawing tip along the line (translate only)…
          const path = anime.path(el)
          created.push(
            anime({ targets: travel, translateX: path('x'), translateY: path('y'), duration: 1300, delay: i * 120, easing: CHART_EASE }),
          )
          // …the <circle> appears as the draw begins (scale only — separate
          // element, so translate + scale never collide on one transform)…
          created.push(anime({ targets: dot, opacity: [0, 1], scale: [0, 1], duration: 320, delay: i * 120, easing: 'easeOutBack' }))
          // …and gives a little elastic settle when it lands at the tip
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

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ height, display: 'block' }}>
      {/* gridlines + $ ticks */}
      {Array.from({ length: 5 }).map((_, g) => {
        const y = padT + (g / 4) * innerH
        return (
          <g key={g}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--hair-soft)" strokeWidth={1} />
            <text x={padL + 2} y={y - 4} fill="var(--color-muted)" fontSize={9} letterSpacing="0.04em">
              ${Math.round((max - (g / 4) * span) / 1000)}k
            </text>
          </g>
        )
      })}
      {/* x labels */}
      {labels.map((lab, i) =>
        labels.length > 12 && i % 2 ? null : (
          <text key={i} x={xOf(i)} y={H - 6} fill="var(--color-muted)" fontSize={9} textAnchor="middle">
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
                <path className="area-fill" d={s.fillPath} fill={`url(#${gid})`} style={{ opacity: 0 }} />
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
              style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
            />
            <g className="area-dot-travel">
              <circle
                className="area-dot"
                cx={0}
                cy={0}
                r={3.2}
                fill={s.color}
                style={{ opacity: 0, transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            </g>
          </g>
        )
      })}
    </svg>
  )
}
