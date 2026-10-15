import type { Txn } from '../data'
import { fmtCents } from '../data'

export default function Ledger({ rows, onEdit }: { rows: Txn[]; onEdit?: (transaction: Txn) => void }) {
  const columns = onEdit
    ? 'grid-cols-[56px_minmax(0,1fr)_106px_102px_auto] sm:grid-cols-[72px_1fr_140px_122px_72px]'
    : 'grid-cols-[56px_1fr_106px_102px] sm:grid-cols-[72px_1fr_140px_122px]'

  return (
    <div className="text-[15px]">
      <div className={`grid ${columns} items-center gap-3.5 border-b border-[var(--hair)] pb-3 text-[12px] uppercase tracking-[0.1em] text-muted`}>
        <span>Date</span>
        <span>Merchant</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
        {onEdit && <span className="sr-only">Action</span>}
      </div>
      {rows.map((t) => {
        const row = <>
          <span className="text-[14px] tabular-nums text-muted">{t.date}</span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium">{t.merchant}</span>
              {t.pending && (
                <span className="not-italic flex-shrink-0 rounded-[4px] bg-[var(--hair)] px-1.5 py-[1px] text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                  Held
                </span>
              )}
            </span>
            {t.subcat && <span className="block truncate text-[13px] text-muted">{t.subcat}</span>}
          </span>
          <span className="truncate text-[12.5px] uppercase tracking-[0.06em] text-accent-ink">{t.cat}</span>
          <span className={`text-right font-semibold tabular-nums ${t.amount > 0 ? 'text-pos' : ''}`}>
            {fmtCents(t.amount)}
          </span>
          {onEdit && <span className="justify-self-end text-[13px] font-semibold text-accent-ink">Edit →</span>}
        </>

        return onEdit ? (
          <button
            key={t.id}
            type="button"
            onClick={() => onEdit(t)}
            aria-label={`Edit ${t.merchant} on ${t.date}`}
            className={`grid min-h-14 w-full ${columns} items-center gap-3.5 border-b border-[var(--hair-soft)] py-3.5 text-left transition hover:bg-[var(--hair-soft)] focus-visible:bg-[var(--accent-wash)] last:border-0 ${t.pending ? 'italic opacity-70' : ''}`}
          >
            {row}
          </button>
        ) : (
          <div key={t.id} className={`grid ${columns} items-center gap-3.5 border-b border-[var(--hair-soft)] py-3.5 last:border-0 ${t.pending ? 'italic opacity-70' : ''}`}>
            {row}
          </div>
        )
      })}
    </div>
  )
}
