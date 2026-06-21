export default function Stat({
  label,
  value,
  delta,
  dir,
  small,
}: {
  label: string
  value: string
  delta?: string
  dir?: 'up' | 'down'
  small?: boolean
}) {
  return (
    <div>
      <div className="micro text-muted">{label}</div>
      <div className={`mt-1.5 font-bold tabular-nums tracking-tight ${small ? 'text-[24px]' : 'text-[32px]'}`}>{value}</div>
      {delta && (
        <div className={`mt-1 text-[12px] font-semibold ${dir === 'down' ? 'text-neg' : 'text-pos'}`}>{delta}</div>
      )}
    </div>
  )
}
