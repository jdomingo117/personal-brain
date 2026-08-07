import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Tile from '../components/Tile'
import { Button } from '../components/Controls'

/**
 * Landing point for OAuth redirects, magic links and email confirmations.
 *
 * The client is configured with detectSessionInUrl: false, so the PKCE code
 * exchange happens here — on one known route — rather than implicitly on
 * whatever page the provider happened to redirect to.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  // React 18 StrictMode mounts effects twice in development; an auth code is
  // single-use, so the second exchange would fail and show a false error.
  const exchanged = useRef(false)

  useEffect(() => {
    if (exchanged.current) return
    exchanged.current = true

    const run = async () => {
      // The provider reports failures in the query string (and, for implicit
      // responses, the fragment). Surface those instead of silently retrying.
      const providerError = params.get('error_description') ?? params.get('error')
      if (providerError) {
        setError('Sign-in was cancelled or refused by the provider.')
        return
      }

      const code = params.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setError('That link is no longer valid. Request a new one.')
          return
        }
        // Strip the code from history so it is not left in the URL bar,
        // browser history, or any referrer header.
        navigate('/', { replace: true })
        return
      }

      // A token_hash arrives from email confirmation links.
      const tokenHash = params.get('token_hash')
      const type = params.get('type')
      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'email' | 'magiclink' | 'recovery' | 'email_change',
        })
        if (verifyError) {
          setError('That link has expired. Request a new one.')
          return
        }
        navigate(type === 'recovery' ? '/auth/reset' : '/', { replace: true })
        return
      }

      setError('This link is incomplete. Request a new one.')
    }

    void run()
  }, [params, navigate])

  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="w-full max-w-[340px]">
        <Tile title={error ? 'Sign-in failed' : 'Completing sign-in'}>
          {error ? (
            <div className="mt-4 grid gap-4">
              <p className="text-[13px] text-muted">{error}</p>
              <Button onClick={() => navigate('/login', { replace: true })} className="w-full justify-center">
                Back to sign in
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-muted">Verifying your link…</p>
          )}
        </Tile>
      </div>
    </div>
  )
}
