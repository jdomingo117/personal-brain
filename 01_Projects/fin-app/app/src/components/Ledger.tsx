import type { Txn } from '../data'
import { fmtCents } from '../data'

export default function Ledger({ rows }: { rows: Txn[] }) {
  return (
    <div className="text-[13px]">
      <div className="grid grid-cols-[40px_1fr_80px_84px] sm:grid-cols-[44px_1fr_104px_92px] items-center gap-3 border-b border-[var(--hair)] pb-2 text-[10.5px] uppercase tracking-[0.1em] text-muted">
        <span>Date</span>
        <span>Merchant</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
      </div>
      {rows.map((t, i) => (
        <div
          key={i}
          className={`grid grid-cols-[40px_1fr_80px_84px] sm:grid-cols-[44px_1fr_104px_92px] items-center gap-3 border-b border-[var(--hair-soft)] py-[11px] last:border-0 ${t.pending ? 'italic opacity-70' : ''}`}
        >
          <span className="text-[12px] tabular-nums text-muted">{t.date}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate font-medium">{t.merchant}</span>
              {t.pending && (
                <span className="not-italic flex-shrink-0 rounded-[4px] bg-[var(--hair)] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-[0.06em] text-muted">
                  Held
                </span>
              )}
            </div>
            {t.subcat && <div className="truncate text-[11px] text-muted">{t.subcat}</div>}
          </div>
          <span className="truncate text-[10.5px] uppercase tracking-[0.06em] text-accent-ink">{t.cat}</span>
          <span className={`text-right font-semibold tabular-nums ${t.amount > 0 ? 'text-pos' : ''}`}>
            {fmtCents(t.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}
