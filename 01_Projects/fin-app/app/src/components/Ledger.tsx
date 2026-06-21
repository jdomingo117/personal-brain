import type { Txn } from '../data'
import { fmtCents } from '../data'

export default function Ledger({ rows }: { rows: Txn[] }) {
  return (
    <div className="text-[13px]">
      <div className="grid grid-cols-[48px_1fr_84px_96px] items-center gap-3 border-b border-[var(--hair)] pb-2 text-[10.5px] uppercase tracking-[0.1em] text-muted">
        <span>Date</span>
        <span>Merchant</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
      </div>
      {rows.map((t, i) => (
        <div
          key={i}
          className="grid grid-cols-[48px_1fr_84px_96px] items-center gap-3 border-b border-[var(--hair-soft)] py-[11px] last:border-0"
        >
          <span className="text-[12px] tabular-nums text-muted">{t.date}</span>
          <span className="truncate font-medium">{t.merchant}</span>
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-accent-ink">{t.cat}</span>
          <span className={`text-right font-semibold tabular-nums ${t.amount > 0 ? 'text-pos' : ''}`}>
            {fmtCents(t.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}
