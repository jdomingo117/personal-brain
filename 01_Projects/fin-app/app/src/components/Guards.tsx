import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'

/**
 * Route guards.
 *
 * These are a usability layer, not the security boundary. Anything they
 * protect is also protected by RLS on every table and a JWT check in every
 * Edge Function, because a guard that runs in the browser can be bypassed by
 * anyone willing to edit their own JavaScript. Their job is to send people to
 * the right screen, not to keep data safe.
 */

function Waiting() {
  // Deliberately blank. Rendering a skeleton of the protected view here would
  // flash real chrome at a signed-out visitor before the redirect lands.
  return <div className="absolute inset-0" aria-busy="true" />
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, initialising } = useAuth()
  const location = useLocation()

  if (initialising) return <Waiting />
  if (!session) {
    // Remember where they were headed so the post-login redirect can return
    // them there instead of dumping everyone on the landing page.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}

/**
 * Signed in but with no accounts yet — send them through onboarding.
 * Layered on top of RequireAuth rather than duplicating its check.
 */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const { loadState, accounts } = useData()

  if (loadState === 'ready' && accounts.length === 0) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

/** Login and other pre-auth screens: bounce anyone already signed in. */
export function RequireAnon({ children }: { children: ReactNode }) {
  const { session, initialising } = useAuth()
  const location = useLocation()

  if (initialising) return <Waiting />
  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  }
  return <>{children}</>
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, initialising } = useAuth()
  if (initialising) return <Waiting />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}
