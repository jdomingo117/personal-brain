export interface Slice {
  value: number
  color: string
}

/**
 * Pure SVG donut renderer — no animation of its own. Segments render hidden
 * (strokeDashoffset = their dash length) with `.donut-seg` + `data-dash`, and
 * the centre value carries `.donut-center`; the parent `AllocationDonut` drives
 * the reveal timeline so segments and legend rows stay in lockstep.
 */
export default function Donut({
  data,
  size = 190,
  centerLabel = '',
  centerValue = '',
}: {
  data: Slice[]
  size?: number
  centerLabel?: string
  centerValue?: string
}) {
  const r = size / 2 - 14
  const cx = size / 2
  const cy = size / 2
  const CIRC = 2 * Math.PI * r
  const total = data.reduce((a, d) => a + d.value, 0)
  let cum = 0

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--track)" strokeWidth={13} />
      {data.map((d, i) => {
        const dash = (d.value / total) * CIRC
        const rot = (cum / total) * 360 - 90
        cum += d.value
        return (
          <circle
            key={i}
            className="donut-seg"
            data-dash={dash}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth={13}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRC}`}
            strokeDashoffset={dash}
            transform={`rotate(${rot} ${cx} ${cy})`}
          />
        )
      })}
      {centerLabel && (
        <text x={cx} y={cy - 4} textAnchor="middle" fill="var(--color-muted)" fontSize={9} letterSpacing="0.08em">
          {centerLabel}
        </text>
      )}
      {centerValue && (
        <text className="donut-center" x={cx} y={cy + 14} textAnchor="middle" fill="var(--color-ink)" fontSize={20} fontWeight={700}>
          {centerValue}
        </text>
      )}
    </svg>
  )
}
