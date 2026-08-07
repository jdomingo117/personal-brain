import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { setPassword, passwordProblems } from '../lib/auth'
import { useView } from '../router'
import Tile from '../components/Tile'
import { Button } from '../components/Controls'

/**
 * The new-password form.
 *
 * This route is what the old `?reset=true` redirect was missing: reset emails
 * pointed at a URL that nothing in the app handled, so the flow sent a real
 * email and then dead-ended. The recovery link grants a short-lived session,
 * which is exchanged here before updateUser is allowed to set a new password.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const { toast } = useView()
  const [params] = useSearchParams()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const exchanged = useRef(false)

  useEffect(() => {
    if (exchanged.current) return
    exchanged.current = true

    const run = async () => {
      const code = params.get('code')
      const tokenHash = params.get('token_hash')

      if (code) {
        const { error: e } = await supabase.auth.exchangeCodeForSession(code)
        if (e) { setError('This reset link has expired. Request a new one.'); return }
      } else if (tokenHash) {
        const { error: e } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
        if (e) { setError('This reset link has expired. Request a new one.'); return }
      } else {
        // Arriving with no token is only valid if a recovery session already
        // exists (e.g. the user reloaded this page after the exchange).
        const { data } = await supabase.auth.getSession()
        if (!data.session) { setError('Open this page from the link in your email.'); return }
      }
      setReady(true)
    }

    void run()
  }, [params])

  const problems = passwordProblems(password)
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit = ready && !saving && password.length > 0 && !mismatch && problems.length === 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    const result = await setPassword(password)
    setSaving(false)

    if (!result.ok) {
      setError(result.message)
      return
    }
    // Every other device holding a token for this account is now signed out.
    // If the reset was prompted by a compromise, leaving those sessions alive
    // would defeat the point of changing the password.
    await supabase.auth.signOut({ scope: 'others' })
    toast({ title: 'Password updated', sub: 'Other devices have been signed out.' })
    navigate('/', { replace: true })
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="w-full max-w-[340px]">
        <Tile title="Choose a new password">
          {error ? (
            <div className="mt-4 grid gap-4">
              <p className="text-[13px] text-muted">{error}</p>
              <Button onClick={() => navigate('/login', { replace: true })} className="w-full justify-center">
                Back to sign in
              </Button>
            </div>
          ) : !ready ? (
            <p className="mt-4 text-[13px] text-muted">Verifying your link…</p>
          ) : (
            <form onSubmit={submit} className="mt-4 grid gap-4">
              <label className="grid gap-1.5">
                <span className="micro text-muted">New password</span>
                <input
                  type="password" value={password} onChange={(e) => setPw(e.target.value)}
                  autoComplete="new-password" required
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="micro text-muted">Confirm password</span>
                <input
                  type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password" required
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
                />
              </label>

              {password.length > 0 && problems.length > 0 && (
                <ul className="grid gap-1 text-[12px] text-muted">
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}
              {mismatch && <p className="text-[12px] text-muted">Passwords do not match.</p>}

              <Button type="submit" disabled={!canSubmit} className="w-full justify-center">
                {saving ? 'Saving…' : 'Set password'}
              </Button>
            </form>
          )}
        </Tile>
      </div>
    </div>
  )
}
