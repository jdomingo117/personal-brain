import { useCallback, useRef, useState, type FC } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ViewContext, type View } from './router'
import SceneBackground from './three/SceneBackground'
import Shell from './components/Shell'
import ThemeToggle from './components/ThemeToggle'
import Boot from './components/Boot'
import MilestoneToast, { type ToastData } from './components/MilestoneToast'
import Landing from './views/Landing'
import Dashboard from './views/Dashboard'
import Accounts from './views/Accounts'
import Income from './views/Income'
import Expenses from './views/Expenses'
import Ingestion from './views/Ingestion'
import Settings from './views/Settings'

const VIEWS: Record<View, FC> = {
  landing: Landing,
  dashboard: Dashboard,
  accounts: Accounts,
  income: Income,
  expenses: Expenses,
  ingestion: Ingestion,
  settings: Settings,
}

export default function App() {
  const [booted, setBooted] = useState(false)
  const [view, setView] = useState<View>('landing')
  const [motionOn, setMotionOn] = useState(true)
  const [dark, setDarkState] = useState(() => {
    try {
      return localStorage.getItem('halcyon-theme') === 'dark'
    } catch {
      return false
    }
  })
  const [toast, setToast] = useState<ToastData | null>(null)
  const toastId = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const setDark = useCallback((on: boolean) => {
    setDarkState(on)
    document.documentElement.classList.toggle('dark', on)
    try {
      localStorage.setItem('halcyon-theme', on ? 'dark' : 'light')
    } catch {
      // localStorage unavailable (private mode, blocked) — theme just won't persist
    }
  }, [])

  const fireToast = useCallback((a: { title: string; sub: string }) => {
    toastId.current += 1
    setToast({ id: toastId.current, ...a })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 3800)
  }, [])

  const Current = VIEWS[view]

  return (
    <ViewContext.Provider value={{ view, go: setView, toast: fireToast, motionOn, setMotionOn, dark, setDark }}>
      <SceneBackground view={view} motionOn={motionOn} dark={dark} />

      <AnimatePresence>{!booted && <Boot key="boot" onDone={() => setBooted(true)} />}</AnimatePresence>

      {booted && (
        <Shell>
          <AnimatePresence mode="sync" initial={false}>
            <Current key={view} />
          </AnimatePresence>
        </Shell>
      )}

      {booted && <ThemeToggle />}

      <MilestoneToast toast={toast} />
    </ViewContext.Provider>
  )
}
