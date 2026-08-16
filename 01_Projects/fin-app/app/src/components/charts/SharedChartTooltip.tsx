import { sharedTooltipLayout } from '../../lib/chartTooltip'

export interface ChartTooltipItem {
  color: string
  label: string
  value: string
}

/** One grouped tooltip per x-position keeps multi-series chart labels readable. */
export default function SharedChartTooltip({
  label,
  items,
  anchorX,
  pointYs,
  bounds,
}: {
  label: string
  items: ChartTooltipItem[]
  anchorX: number
  pointYs: number[]
  bounds: { left: number; right: number; top: number; bottom: number }
}) {
  const layout = sharedTooltipLayout({ anchorX, pointYs, itemCount: items.length, ...bounds })

  return (
    <g transform={`translate(${layout.x}, ${layout.y})`} pointerEvents="none">
      <rect
        width={layout.width}
        height={layout.height}
        rx={5}
        fill="var(--toast-bg)"
        stroke="var(--hair)"
        strokeWidth={1}
        style={{ filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.12))' }}
      />
      <text x={8} y={13} fill="var(--color-muted)" fontSize={9} fontWeight={600}>
        {label}
      </text>
      {items.map((item, index) => {
        const y = 27 + index * 14
        return (
          <g key={item.label}>
            <circle cx={10} cy={y - 3} r={2.5} fill={item.color} />
            <text x={17} y={y} fill="var(--color-ink2)" fontSize={9}>
              {item.label}
            </text>
            <text x={layout.width - 8} y={y} fill="var(--color-ink)" fontSize={9} fontWeight={600} textAnchor="end" className="tabular-nums">
              {item.value}
            </text>
          </g>
        )
      })}
    </g>
  )
}
