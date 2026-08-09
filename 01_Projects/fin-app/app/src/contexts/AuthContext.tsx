import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export type TenantRole = 'owner' | 'admin' | 'member' | 'viewer'

interface AuthCtx {
  /** null once resolved and signed out; undefined while still resolving. */
  session: Session | null
  user: User | null
  tenantId: string | null
  role: TenantRole | null
  /** True until the initial session lookup settles. Guards must wait on this. */
  initialising: boolean
  recoveryError: string | null
  isAdmin: boolean
  signOut: () => Promise<void>
  /** Re-reads tenant membership, e.g. after onboarding creates one. */
  refreshMembership: () => Promise<void>
  retryAccountRecovery: () => Promise<void>
}

const AuthContext = createContext<AuthCtx>({
  session: null, user: null, tenantId: null, role: null,
  initialising: true, recoveryError: null, isAdmin: false,
  signOut: async () => {}, refreshMembership: async () => {}, retryAccountRecovery: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initialising, setInitialising] = useState(true)
  const [membership, setMembership] = useState<{ tenantId: string; role: TenantRole } | null>(null)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  // Guards against a slow membership fetch resolving after sign-out and
  // repopulating state for a user who is no longer here.
  const currentUserId = useRef<string | null>(null)

  const loadMembership = useCallback(async (userId: string | null) => {
    if (!userId) {
      setMembership(null)
      return
    }
    const { data, error } = await supabase
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (currentUserId.current !== userId) return // superseded

    if (error) {
      // A rejected token means the stored session is no longer valid — the
      // user was deleted, the session was revoked from another device, or the
      // signing key rotated. Holding on to it strands the user in a
      // signed-in-looking UI where every request fails, so drop it.
      const rejected = error.code === 'PGRST301' || /jwt|token|expired/i.test(error.message)
      if (rejected) {
        await supabase.auth.signOut({ scope: 'local' })
        setMembership(null)
        return
      }
      setMembership(null)
      return
    }

    if (!data) {
      // Authenticated but not yet a member of any tenant — the provisioning
      // trigger has not landed. Not an error; onboarding handles it.
      setMembership(null)
      return
    }
    setMembership({ tenantId: data.tenant_id, role: data.role as TenantRole })

    // Register this device in the session list through the same authenticated
    // Edge Function boundary as every other application-table write. The RPC
    // still keys off the JWT session_id; user_agent is only a display label.
    void supabase.functions.invoke('record-user-session', {
      body: { user_agent: navigator.userAgent },
    }).catch((err) => console.error('could not record user session', err))

    // Signing in cancels a pending account deletion. This is the recovery
    // path that makes the 30-day grace period meaningful: the real owner
    // simply logs in and the scheduled deletion goes away.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('deletion_scheduled_at')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      console.error('could not check deletion recovery status', profileError.message)
      return
    }
    if (profile?.deletion_scheduled_at) {
      const { error } = await supabase.functions.invoke('restore-user-account', { body: {} })
      if (error) {
        console.error('could not cancel scheduled deletion', error.message)
        setRecoveryError('We could not cancel your scheduled account deletion. Retry before continuing.')
      } else {
        setRecoveryError(null)
      }
    }
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      currentUserId.current = data.session?.user.id ?? null
      await loadMembership(data.session?.user.id ?? null)
      if (active) setInitialising(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return
      setSession(next)
      const nextId = next?.user.id ?? null
      const changed = currentUserId.current !== nextId
      currentUserId.current = nextId

      // TOKEN_REFRESHED fires on every silent refresh and carries the same
      // user; re-fetching membership there would mean a needless query every
      // 15 minutes.
      if (changed || event === 'SIGNED_IN') {
        setRecoveryError(null)
        void loadMembership(nextId)
      }
      if (event === 'SIGNED_OUT') setMembership(null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [loadMembership])

  const signOut = useCallback(async () => {
    // 'global' revokes every refresh token for this user, not just this tab's,
    // so signing out on a shared machine ends the session everywhere.
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      // The local session is already gone; clear state rather than stranding
      // the user in a signed-in-looking UI they cannot use.
      console.error('sign out failed', error.message)
    }
    setSession(null)
    setMembership(null)
    setRecoveryError(null)
    currentUserId.current = null
  }, [])

  const refreshMembership = useCallback(
    () => loadMembership(currentUserId.current),
    [loadMembership],
  )
  const retryAccountRecovery = useCallback(
    () => loadMembership(currentUserId.current),
    [loadMembership],
  )

  const value = useMemo<AuthCtx>(() => ({
    session,
    user: session?.user ?? null,
    tenantId: membership?.tenantId ?? null,
    role: membership?.role ?? null,
    initialising,
    recoveryError,
    // Platform admin comes from app_metadata, which only the service role can
    // write. user_metadata is user-writable and must never be trusted for this.
    isAdmin: session?.user?.app_metadata?.admin === true,
    signOut,
    refreshMembership,
    retryAccountRecovery,
  }), [session, membership, initialising, recoveryError, signOut, refreshMembership, retryAccountRecovery])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
