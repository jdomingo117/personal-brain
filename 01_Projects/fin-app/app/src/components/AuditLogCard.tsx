import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Tile from './Tile'

interface AuditRow {
  id: number
  occurred_at: string
  action: string
  target_type: string | null
  target_id: string | null
  ip: string | null
  metadata: Record<string, unknown>
}

/**
 * Security event viewer.
 *
 * Read-only by construction, not by convention: `authenticated` holds SELECT
 * on audit_log and nothing else, and the rows visible here are limited by RLS
 * to tenants the viewer administers. There is no UI for editing an entry
 * because the database rejects the attempt.
 */
export default function AuditLogCard() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('id, occurred_at, action, target_type, target_id, ip, metadata')
        .order('occurred_at', { ascending: false })
        .limit(50)
      setRows(data ?? [])
      setLoading(false)
    }
    void load()
  }, [])

  return (
    <Tile title="Security log" span={3}>
      {loading ? (
        <p className="text-[13px] text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted">No events recorded yet.</p>
      ) : (
        <div className="max-h-[320px] overflow-y-auto">
          <ul className="grid gap-2 pt-1">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-baseline justify-between gap-4 border-b border-[var(--hair-soft)] pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <span className="font-mono text-[12.5px]">{r.action}</span>
                  {r.target_type && (
                    <span className="ml-2 text-[12px] text-muted">
                      {r.target_type}
                      {r.target_id ? ` · ${r.target_id.slice(0, 8)}` : ''}
                    </span>
                  )}
                </div>
                <div className="flex-shrink-0 text-[12px] text-muted">
                  {r.ip ? `${r.ip} · ` : ''}
                  {new Date(r.occurred_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  )
}
