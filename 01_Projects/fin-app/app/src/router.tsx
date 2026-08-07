import { createContext, useContext } from 'react'

export type View =
  | 'login'
  | 'onboarding'
  | 'landing'
  | 'dashboard'
  | 'accounts'
  | 'income'
  | 'expenses'
  | 'ingestion'
  | 'settings'

export const NAV: { id: View; n: string; label: string }[] = [
  { id: 'landing', n: '00', label: 'Landing' },
  { id: 'dashboard', n: '01', label: 'Dashboard' },
  { id: 'accounts', n: '02', label: 'Accounts' },
  { id: 'income', n: '03', label: 'Income' },
  { id: 'expenses', n: '04', label: 'Expenses' },
  { id: 'ingestion', n: '05', label: 'Ingestion' },
]

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
  ingestion: '/ingestion',
  settings: '/settings',
}

const PATH_VIEWS: Record<string, View> = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view as View]),
) as Record<string, View>

export function pathToView(pathname: string): View {
  return PATH_VIEWS[pathname] ?? 'landing'
}

interface Ctx {
  view: View
  go: (v: View) => void
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
