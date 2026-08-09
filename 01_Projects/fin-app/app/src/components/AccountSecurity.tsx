import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { changeEmail, changePassword, passwordProblems } from '../lib/auth'
import { useAuth } from '../contexts/AuthContext'
import { useView } from '../router'
import Tile from '../components/Tile'
import { Button } from '../components/Controls'

const INPUT =
  'min-h-[42px] w-full rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3 text-[14px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]'

/** Password rotation, with the current password re-verified first. */
export function PasswordCard() {
  const { user } = useAuth()
  const { toast } = useView()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  // OAuth-only accounts have no password to rotate.
  const hasPassword = user?.identities?.some((i) => i.provider === 'email') ?? false

  const problems = passwordProblems(next)
  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit =
    !saving && current.length > 0 && next.length > 0 && !mismatch && problems.length === 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !user?.email) return
    setSaving(true)
    const result = await changePassword(user.email, current, next)
    setSaving(false)

    if (!result.ok) {
      toast({ title: 'Not changed', sub: result.message })
      return
    }
    setCurrent(''); setNext(''); setConfirm('')
    // Rotating a password should end every other session — that is usually
    // the whole reason for rotating it.
    await supabase.auth.signOut({ scope: 'others' })
    toast({ title: 'Password updated', sub: 'Other devices have been signed out.' })
  }

  if (!hasPassword) {
    return (
      <Tile title="Password" span={2}>
        <p className="text-[13px] text-muted">
          This account signs in with a linked provider, so there is no password to change.
        </p>
      </Tile>
    )
  }

  return (
    <Tile title="Password" span={2}>
      <form onSubmit={submit} className="grid gap-3 pt-1">
        <label className="grid gap-1.5">
          <span className="micro text-muted">Current password</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)}
                 autoComplete="current-password" className={INPUT} />
        </label>
        <label className="grid gap-1.5">
          <span className="micro text-muted">New password</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)}
                 autoComplete="new-password" className={INPUT} />
        </label>
        <label className="grid gap-1.5">
          <span className="micro text-muted">Confirm new password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                 autoComplete="new-password" className={INPUT} />
        </label>

        {next.length > 0 && problems.length > 0 && (
          <ul className="grid gap-1 text-[12px] text-muted">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        {mismatch && <p className="text-[12px] text-muted">Passwords do not match.</p>}

        <div><Button type="submit" disabled={!canSubmit}>{saving ? 'Saving…' : 'Change password'}</Button></div>
      </form>
    </Tile>
  )
}

/** Email change, confirmed at both the old and new address. */
export function EmailCard() {
  const { user } = useAuth()
  const { toast } = useView()
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || email === user?.email) return
    setSaving(true)
    const result = await changeEmail(email)
    setSaving(false)
    toast({ title: result.ok ? 'Confirmation sent' : 'Not changed', sub: result.message })
    if (result.ok) setEmail('')
  }

  return (
    <Tile title="Email" span={2}>
      <p className="text-[13px] text-muted">
        Currently <span className="font-medium text-ink">{user?.email ?? '—'}</span>
      </p>
      <form onSubmit={submit} className="mt-3 grid gap-3">
        <label className="grid gap-1.5">
          <span className="micro text-muted">New email address</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 autoComplete="email" className={INPUT} />
        </label>
        <p className="text-[12px] text-muted">
          Confirmation links go to both your current and new address; the change only
          takes effect once both are followed.
        </p>
        <div><Button type="submit" disabled={saving || !email}>{saving ? 'Sending…' : 'Change email'}</Button></div>
      </form>
    </Tile>
  )
}

interface SessionRow {
  id: string
  user_agent: string | null
  ip: string | null
  created_at: string
  last_seen_at: string
  revoked_at: string | null
}

/** Signed-in devices, with remote revocation. */
export function SessionsCard() {
  const { toast } = useView()
  const [rows, setRows] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('user_sessions')
      .select('id, user_agent, ip, created_at, last_seen_at, revoked_at')
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const revokeOthers = async () => {
    // GoTrue owns the refresh tokens, so this is what actually ends the
    // sessions; the table below is the user-visible record of them.
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) {
      toast({ title: 'Could not sign out other devices', sub: 'Try again in a moment.' })
      return
    }
    const { error: recordError } = await supabase.functions.invoke('revoke-other-session-records', { body: {} })
    if (recordError) {
      toast({ title: 'Sessions were signed out, but the session list could not update', sub: 'Refresh the page in a moment.' })
      return
    }
    toast({ title: 'Other devices signed out', sub: 'They will need to sign in again.' })
    void load()
  }

  return (
    <Tile title="Active sessions" span={3}>
      {loading ? (
        <p className="text-[13px] text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted">
          No other devices recorded. Session records appear here as you sign in.
        </p>
      ) : (
        <ul className="grid gap-2 pt-1">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 border-b border-[var(--hair-soft)] pb-2 last:border-0">
              <div className="min-w-0">
                <div className="truncate text-[13px]">{s.user_agent ?? 'Unknown device'}</div>
                <div className="text-[12px] text-muted">
                  {s.ip ?? 'unknown IP'} · last seen {new Date(s.last_seen_at).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <Button variant="ghost" onClick={revokeOthers}>Sign out all other devices</Button>
      </div>
    </Tile>
  )
}

/** Data export and account deletion. */
export function DangerZoneCard() {
  const { user, signOut } = useAuth()
  const { toast } = useView()
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  const exportData = async () => {
    setBusy(true)
    // RLS scopes each of these to the caller's own tenant.
    const [accounts, transactions, budgets, profiles] = await Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('transactions').select('*'),
      supabase.from('budgets').select('*'),
      supabase.from('profiles').select('*'),
    ])
    const blob = new Blob(
      [JSON.stringify({
        exported_at: new Date().toISOString(),
        profile: profiles.data,
        accounts: accounts.data,
        transactions: transactions.data,
        budgets: budgets.data,
      }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `halcyon-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setBusy(false)
    toast({ title: 'Export ready', sub: 'Your data has been downloaded.' })
  }

  const deleteAccount = async () => {
    if (confirmText !== 'DELETE') return
    setBusy(true)
    const { error } = await supabase.functions.invoke('delete-user-account', {
      body: { confirm: 'DELETE' },
    })
    setBusy(false)
    if (error) {
      toast({ title: 'Could not delete account', sub: 'Try again, or contact support.' })
      return
    }
    toast({ title: 'Account scheduled for deletion', sub: 'You have been signed out.' })
    await signOut()
  }

  return (
    <Tile title="Your data" span={3}>
      <div className="grid gap-4 pt-1">
        <div>
          <p className="text-[13px] text-muted">
            Download every account, transaction and budget on this profile as JSON.
          </p>
          <div className="mt-2">
            <Button variant="ghost" onClick={exportData} disabled={busy}>Export my data</Button>
          </div>
        </div>

        <div className="border-t border-[var(--hair-soft)] pt-4">
          <p className="text-[13px]">Delete account</p>
          <p className="mt-1 text-[12px] text-muted">
            Permanently removes {user?.email ?? 'this account'} and all its financial records
            after a 30-day grace period. Sign in during that window to cancel.
            Type <span className="font-mono font-medium text-ink">DELETE</span> to confirm.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              aria-label="Type DELETE to confirm"
              className={`${INPUT} max-w-[160px]`}
            />
            <Button variant="ghost" onClick={deleteAccount} disabled={busy || confirmText !== 'DELETE'}>
              Delete my account
            </Button>
          </div>
        </div>
      </div>
    </Tile>
  )
}
