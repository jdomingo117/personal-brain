import { createContext, useContext } from 'react'
import { BUDGET_ENABLED } from './lib/budgetWorkspace'

export type View =
  | 'login'
  | 'onboarding'
  | 'landing'
  | 'dashboard'
  | 'accounts'
  | 'income'
  | 'expenses'
  | 'budget'
  | 'ledger'
  | 'ingestion'
  | 'transfers'
  | 'settings'
  | 'operation-status'

export const NAV: { id: View; n: string; label: string }[] = [
  { id: 'landing', n: '00', label: 'Landing' },
  { id: 'dashboard', n: '01', label: 'Dashboard' },
  { id: 'accounts', n: '02', label: 'Accounts' },
  { id: 'income', n: '03', label: 'Income' },
  { id: 'expenses', n: '04', label: 'Expenses' },
  ...(BUDGET_ENABLED ? [{ id: 'budget' as const, n: '05', label: 'Budget' }] : []),
  { id: 'ledger', n: BUDGET_ENABLED?'06':'05', label: 'Ledger' },
  { id: 'ingestion', n: BUDGET_ENABLED?'07':'06', label: 'Ingestion' },
  { id: 'transfers', n: BUDGET_ENABLED?'08':'07', label: 'Transfers' },
]

/** Keep view and loading-state indices aligned with optional navigation entries. */
export const navNumber = (view:View) => NAV.find(item=>item.id===view)?.n??'—'

/**
 * Views are now backed by real URLs. `useView()` keeps its old shape so that
 * Shell, Landing and Onboarding continue to call `go('dashboard')` unchanged —
 * only the plumbing underneath became a router.
 */
export const VIEW_PATHS: Record<View, string> = {
  login: '/login',
  onboarding: '/onboarding',
  landing: '/',
  dashboard: '/dashboard',
  accounts: '/accounts',
  income: '/income',
  expenses: '/expenses',
  budget: '/budget',
  ledger: '/ledger',
  ingestion: '/ingestion',
  transfers: '/transfers',
  settings: '/settings',
  'operation-status': '/concept/operation-status',
}

const PATH_VIEWS: Record<string, View> = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view as View]),
) as Record<string, View>

export function pathToView(pathname: string): View {
  return PATH_VIEWS[pathname] ?? 'landing'
}

interface Ctx {
  view: View
  /** Optional state lets a dashboard observation open the relevant view with
      a useful focus, without turning ephemeral UI context into a permanent URL. */
  go: (v: View, options?: { state?: unknown }) => void
  toast: (a: { title: string; sub: string }) => void
  motionOn: boolean
  setMotionOn: (on: boolean) => void
  dark: boolean
  setDark: (on: boolean) => void
}
export const ViewContext = createContext<Ctx>({
  view: 'landing',
  go: () => {},
  toast: () => {},
  motionOn: true,
  setMotionOn: () => {},
  dark: false,
  setDark: () => {},
})
export const useView = () => useContext(ViewContext)
