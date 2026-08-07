import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useView } from '../router'
import { Button } from '../components/Controls'
import Tile from '../components/Tile'
import {
  signIn, signUp, sendMagicLink, sendPasswordReset, signInWithOAuth,
  passwordProblems, type OAuthProvider,
} from '../lib/auth'

const INPUT =
  'min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]'

function ProviderButton({ provider, label, onClick, disabled }: {
  provider: OAuthProvider; label: string; onClick: () => void; disabled: boolean
}) {
  return (
    <Button
      type="button" variant="ghost" onClick={onClick} disabled={disabled}
      className="w-full justify-center"
      aria-label={`Continue with ${label}`}
    >
      <span aria-hidden="true" className="mr-2">{provider === 'google' ? 'G' : '⌥'}</span>
      Continue with {label}
    </Button>
  )
}

export default function Login() {
  const { toast } = useView()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showFallback, setShowFallback] = useState(false)

  const problems = isSignUp ? passwordProblems(password) : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    const result = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password)

    setLoading(false)

    if (result.ok) {
      toast({
        title: isSignUp ? 'Check your inbox' : 'Session secured',
        sub: result.message,
      })
      // Navigation is handled by the route guards once the session lands, so
      // there is nothing to push here.
      return
    }

    toast({ title: 'Sign-in failed', sub: result.message })
    // Offer the recovery paths after any failure. Showing them only for
    // specific errors would itself hint at which part was wrong.
    if (!isSignUp) setShowFallback(true)
  }

  const runFallback = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    if (!email) {
      toast({ title: 'Email required', sub: 'Enter your address first.' })
      return
    }
    setLoading(true)
    const result = await fn()
    setLoading(false)
    toast({ title: result.ok ? 'Check your inbox' : 'Not sent', sub: result.message })
    if (result.ok) setShowFallback(false)
  }

  const oauth = async (provider: OAuthProvider) => {
    setLoading(true)
    const result = await signInWithOAuth(provider)
    if (!result.ok) {
      setLoading(false)
      toast({ title: 'Provider unavailable', sub: result.message })
    }
    // On success the browser navigates away; leave the button disabled.
  }

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center p-6"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="w-full max-w-[340px]">
        <Tile title={isSignUp ? 'Create an account' : 'Sign in'}>
          <div className="mt-4 grid gap-2">
            <ProviderButton provider="google" label="Google" onClick={() => oauth('google')} disabled={loading} />
            <ProviderButton provider="github" label="GitHub" onClick={() => oauth('github')} disabled={loading} />
          </div>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--hair-soft)]" />
            <span className="micro text-muted">or</span>
            <span className="h-px flex-1 bg-[var(--hair-soft)]" />
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="micro text-muted">Email</span>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@halcyon.app" required
                autoComplete="email" className={INPUT}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="micro text-muted">Password</span>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className={INPUT}
              />
            </label>

            {isSignUp && password.length > 0 && problems.length > 0 && (
              <ul className="grid gap-1 text-[12px] text-muted">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}

            <div className="mt-2 flex flex-col gap-2">
              <Button
                type="submit" className="w-full justify-center"
                disabled={loading || (isSignUp && problems.length > 0)}
              >
                {loading ? 'Authenticating…' : isSignUp ? 'Sign up' : 'Sign in'}
              </Button>
            </div>

            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setShowFallback(false) }}
              className="mt-2 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
            >
              {isSignUp ? 'Already have an account? Sign in' : 'No account? Sign up'}
            </button>

            <AnimatePresence>
              {showFallback && !isSignUp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 overflow-hidden border-t border-[var(--hair-soft)] pt-4"
                >
                  <p className="mb-3 text-center text-[12.5px] text-muted">Trouble signing in?</p>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button" variant="ghost" disabled={loading} className="w-full justify-center"
                      onClick={() => runFallback(() => sendMagicLink(email))}
                    >
                      Send magic link
                    </Button>
                    <Button
                      type="button" variant="ghost" disabled={loading} className="w-full justify-center"
                      onClick={() => runFallback(() => sendPasswordReset(email))}
                    >
                      Reset password
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </Tile>
      </div>
    </motion.div>
  )
}
