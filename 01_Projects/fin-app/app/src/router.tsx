import { createContext, useContext } from 'react'

export type View =
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
