import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Account, Txn, Achievement } from '../data'
import type { RecurrenceHint } from '../lib/recurring'
import { useAuth } from './AuthContext'

export type ProfileData = {
  callsign: string
  netWorth: number
  netWorthDelta: number
}

interface Budget {
  id: string
  category: string
  amount_limit: number
}

interface DataCtx {
  loading: boolean
  profile: ProfileData
  isAdmin: boolean
  accounts: Account[]
  transactions: Txn[]
  achievements: Achievement[]
  budgets: Budget[]
  recurrenceHints: Map<string, RecurrenceHint>
  refreshData: () => Promise<void>
}

const defaultProfile: ProfileData = { callsign: 'Operator', netWorth: 0, netWorthDelta: 0 }

// A connection whose balance is older than this gets an automatic
// background sync on load — no spinner, no blocking, just current data by
// the time the user notices. Loose enough that a normal session doesn't
// re-trigger it (refreshData() runs after almost every mutation), tight
// enough that "stale for days" can't happen just from not opening the app.
const STALE_SYNC_MS = 30 * 60 * 1000

export const DataContext = createContext<DataCtx>({
  loading: true,
  profile: defaultProfile,
  isAdmin: false,
  accounts: [],
  transactions: [],
  achievements: [],
  budgets: [],
  recurrenceHints: new Map(),
  refreshData: async () => {},
})

export const useData = () => useContext(DataContext)

export function DataProvider({ children }: { children: ReactNode }) {
  const { session, isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileData>(defaultProfile)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [recurrenceHints, setRecurrenceHints] = useState<Map<string, RecurrenceHint>>(new Map())
  // Connection ids already given a stale-sync this session — refreshData()
  // runs after nearly every mutation, and without this a single session
  // would fire the same background sync repeatedly instead of once.
  const staleSyncTriggered = useRef(new Set<string>())

  const refreshData = async () => {
    if (!session?.user) {
      // Signed out — drop the previous user's rows so they can't flash behind
      // the next sign-in on a shared browser.
      setProfile(defaultProfile)
      setAccounts([])
      setTransactions([])
      setRecurrenceHints(new Map())
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // The explicit .eq('user_id', ...) filters that used to sit on these
      // queries are gone: membership-based RLS now scopes every row to the
      // caller's tenant server-side. Client-side filters were never the
      // boundary, and keeping them implied otherwise — the pattern quietly
      // invites "just one query without the filter" to become a leak.
      //
      // The getUser() round-trip that used to guard this block is also gone;
      // RequireAuth already gates every route that mounts this provider, and
      // an invalid token now fails the queries themselves.
      const [profileRes, accountsRes, txnsRes, achievementsRes, userAchievementsRes, budgetsRes, accountConnectionsRes, recurrenceHintsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('accounts').select('*'),
        supabase.from('transactions_analytic').select('*').order('date', { ascending: false }),
        supabase.from('achievements').select('*'),
        supabase.from('user_achievements').select('*').eq('user_id', session.user.id),
        supabase.from('budgets').select('*'),
        supabase.from('account_connections').select('id, account_id, connection_id, balance_as_of, provider_connections(status)'),
        supabase.from('merchant_recurrence_hints').select('merchant_key, is_recurring, suggested_cadence, confidence'),
      ])

      const fetchedAccounts = accountsRes.data || []
      const fetchedTxns = txnsRes.data || []
      const fetchedProfile = profileRes.data
      const fetchedConnections = accountConnectionsRes.data || []
      const connectionByAccountId = new Map(fetchedConnections.map(c => [c.account_id, c.id]))

      // Fire-and-forget: a stale connection gets synced in the background,
      // not blocking this render. sync-provider's own concurrency lock and
      // rate limit make a redundant call harmless if two tabs both trigger it.
      const staleConnectionIds = new Set(
        fetchedConnections
          .filter((c) => {
            const status = (c as unknown as { provider_connections: { status: string } | null }).provider_connections?.status
            if (status !== 'active') return false
            if (staleSyncTriggered.current.has(c.connection_id)) return false
            const staleness = c.balance_as_of ? Date.now() - new Date(c.balance_as_of).getTime() : Infinity
            return staleness > STALE_SYNC_MS
          })
          .map((c) => c.connection_id),
      )
      for (const connectionId of staleConnectionIds) {
        staleSyncTriggered.current.add(connectionId)
        void supabase.functions
          .invoke('sync-provider', { body: { connection_id: connectionId, trigger: 'stale' } })
          .catch(() => {})
      }

      const netWorth = fetchedAccounts.reduce((sum, acc) => sum + acc.balance, 0)
      // Map DB accounts to UI Accounts
      const mappedAccounts: Account[] = fetchedAccounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance,
        glow: a.balance < 0 ? 'red' : 'cyan',
        connectionId: connectionByAccountId.get(a.id),
      }))

      // Map DB transactions to UI Txn
      const mappedTxns: Txn[] = fetchedTxns.map(t => ({
        id: t.id,
        date: t.date,
        merchant: t.merchant || t.original_description,
        cat: t.category,
        subcat: t.subcategory,
        amount: t.amount,
        account: mappedAccounts.find(a => a.id === t.account_id)?.name || 'Unknown',
        account_id: t.account_id,
        upload_batch_id: t.upload_batch_id,
        isTransfer: t.is_transfer,
        transferState: t.transfer_state,
        pending: t.pending,
      }))

      setAccounts(mappedAccounts)
      setTransactions(mappedTxns)
      
      const allAchievements = achievementsRes.data || []
      const userUnlockIds = new Set((userAchievementsRes.data || []).map(ua => ua.achievement_id))
      const unlockedAchievements = allAchievements.filter(a => userUnlockIds.has(a.id))
      setAchievements(unlockedAchievements)
      
      setBudgets(budgetsRes.data || [])

      setRecurrenceHints(new Map(
        (recurrenceHintsRes.data || []).map((h) => [
          h.merchant_key,
          {
            isRecurring: h.is_recurring,
            suggestedCadence: h.suggested_cadence as RecurrenceHint['suggestedCadence'],
            confidence: h.confidence,
          },
        ]),
      ))

      // Calculate 30-day net worth delta
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyDaysAgoIso = thirtyDaysAgo.toISOString().split('T')[0]
      
      // We assume balance is current. Sum of transactions in the last 30 days represents the delta.
      // NetWorthDelta = (Current Net Worth) - (Net Worth 30 days ago) = Sum of all transactions in last 30 days (since transactions are deltas to the accounts)
      // Transfers are excluded here too: a transfer leg genuinely moves this
      // account's balance, but is_transfer marks legs already reflected on
      // the OTHER side of the pair, so including it would double-count the
      // net-worth swing when both legs land inside the 30-day window.
      // Pending (HELD) rows are excluded too: a connected account's balance
      // is already net of holds, so counting one here double-counts it now
      // and again at its real amount once it settles.
      const recentTxns = fetchedTxns.filter(t => t.date >= thirtyDaysAgoIso && !t.is_transfer && !t.pending)
      const netWorthDelta = recentTxns.reduce((sum, t) => sum + t.amount, 0)

      setProfile({
        callsign: fetchedProfile?.callsign || 'Operator',
        netWorth,
        netWorthDelta
      })
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Keyed on the user id rather than the session object: a token refresh
  // produces a new session every 15 minutes with the same user, and refetching
  // the whole dataset on each one would be pure churn.
  useEffect(() => {
    refreshData()
  }, [session?.user?.id])

  return (
    <DataContext.Provider value={{ loading, profile, isAdmin, accounts, transactions, achievements, budgets, recurrenceHints, refreshData }}>
      {children}
    </DataContext.Provider>
  )
}
