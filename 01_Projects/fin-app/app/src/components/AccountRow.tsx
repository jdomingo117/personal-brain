import type { Account } from '../data'
import { fmtCents, glowColor } from '../data'

export default function AccountRow({ acct }: { acct: Account }) {
  return (
    <div className="flex items-center gap-[13px] border-b border-[var(--hair-soft)] py-[13px] last:border-0">
      <span className="h-8 w-[3px] flex-shrink-0 rounded" style={{ background: glowColor[acct.glow] }} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{acct.name}</div>
        <div className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-muted">{acct.type}</div>
      </div>
      <div className={`text-[15px] font-semibold tabular-nums ${acct.balance < 0 ? 'text-neg' : ''}`}>
        {fmtCents(acct.balance)}
      </div>
    </div>
  )
}
