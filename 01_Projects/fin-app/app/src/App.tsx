import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate,
} from 'react-router-dom'
import { ViewContext, VIEW_PATHS, pathToView, type View } from './router'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { RequireAnon, RequireAuth, RequireOnboarded } from './components/Guards'
import ViewDataBoundary, { ViewLoadingState } from './components/ViewDataBoundary'
import SceneBackground from './three/SceneBackground'
import Shell from './components/Shell'
import ThemeToggle from './components/ThemeToggle'
import Boot from './components/Boot'
import MilestoneToast, { type ToastData } from './components/MilestoneToast'
import Login from './views/Login'
import AuthCallback from './views/AuthCallback'
import ResetPassword from './views/ResetPassword'
import Onboarding from './views/Onboarding'
import Landing from './views/Landing'
import Dashboard from './views/Dashboard'

const Accounts = lazy(() => import('./views/Accounts'))
const Income = lazy(() => import('./views/Income'))
const Expenses = lazy(() => import('./views/Expenses'))
const LedgerView = lazy(() => import('./views/LedgerView'))
const Ingestion = lazy(() => import('./views/Ingestion'))
const TransferReview = lazy(() => import('./views/TransferReview'))
const Settings = lazy(() => import('./views/Settings'))

function DataRoute({ index, title, sub, children }: { index: string; title: string; sub?: string; children: ReactNode }) {
  return <ViewDataBoundary index={index} title={title} sub={sub}>{children}</ViewDataBoundary>
}

function LazyDataRoute({ index, title, sub, children }: { index: string; title: string; sub?: string; children: ReactNode }) {
  return <DataRoute index={index} title={title} sub={sub}><Suspense fallback={<ViewLoadingState index={index} title={title} sub={sub} />}>{children}</Suspense></DataRoute>
}

/** Chrome shared by the signed-in views. */
function ShellLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  )
}

/** Bare-canvas layout for auth screens, which render without the nav shell. */
function BareLayout() {
  return <Outlet />
}

/**
 * Bridges the router to the pre-existing `useView()` API so Shell, Landing
 * and Onboarding keep calling `go('dashboard')` without modification.
 */
function ViewBridge({
  children, dark, setDark, motionOn, setMotionOn, fireToast,
}: {
  children: React.ReactNode
  dark: boolean; setDark: (on: boolean) => void
  motionOn: boolean; setMotionOn: (on: boolean) => void
  fireToast: (a: { title: string; sub: string }) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const go = useCallback((v: View) => navigate(VIEW_PATHS[v]), [navigate])
  const view = pathToView(location.pathname)

  return (
    <ViewContext.Provider
      value={{ view, go, toast: fireToast, motionOn, setMotionOn, dark, setDark }}
    >
      {children}
    </ViewContext.Provider>
  )
}

function AppFrame({
  booted, setBooted, dark, setDark, motionOn, setMotionOn, toast, fireToast,
}: {
  booted: boolean; setBooted: (b: boolean) => void
  dark: boolean; setDark: (on: boolean) => void
  motionOn: boolean; setMotionOn: (on: boolean) => void
  toast: ToastData | null
  fireToast: (a: { title: string; sub: string }) => void
}) {
  const location = useLocation()
  const view = pathToView(location.pathname)
  const { session, recoveryError, retryAccountRecovery } = useAuth()

  return (
    <ViewBridge
      dark={dark} setDark={setDark}
      motionOn={motionOn} setMotionOn={setMotionOn}
      fireToast={fireToast}
    >
      <SceneBackground view={view} motionOn={motionOn} dark={dark} />

      <AnimatePresence>
        {!booted && <Boot key="boot" onDone={() => setBooted(true)} />}
      </AnimatePresence>

      {booted && recoveryError ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <p className="text-[15px] font-medium">Account recovery needs attention</p>
            <p className="mt-2 text-[13px] text-muted">{recoveryError}</p>
            <button type="button" className="mt-4 rounded-md border border-[var(--hair)] px-3 py-2 text-[13px] hover:border-accent" onClick={() => void retryAccountRecovery()}>
              Retry recovery
            </button>
          </div>
        </div>
      ) : booted && (
        <Routes location={location} key={location.pathname}>
          {/* Pre-auth */}
          <Route element={<BareLayout />}>
            <Route path="/login" element={<RequireAnon><Login /></RequireAnon>} />
            {/* The callback routes are deliberately NOT behind RequireAnon:
                they run while a session is being established, and bouncing
                them would break the exchange they exist to perform. */}
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset" element={<ResetPassword />} />
            <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
          </Route>

          {/* Signed in */}
          <Route
            element={
              <RequireAuth>
                <RequireOnboarded>
                  <ShellLayout />
                </RequireOnboarded>
              </RequireAuth>
            }
          >
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<DataRoute index="01 — Command" title="Dashboard" sub="Your finances at a glance"><Dashboard /></DataRoute>} />
            <Route path="/accounts" element={<LazyDataRoute index="02 — Accounts" title="Accounts" sub="Balances, activity & connections"><Accounts /></LazyDataRoute>} />
            <Route path="/income" element={<LazyDataRoute index="03 — Income" title="Income" sub="Inflow analysis & patterns"><Income /></LazyDataRoute>} />
            <Route path="/expenses" element={<LazyDataRoute index="04 — Expenses" title="Expenses" sub="Outflow analysis, pacing & recurring costs"><Expenses /></LazyDataRoute>} />
            <Route path="/ledger" element={<LazyDataRoute index="05 — Ledger" title="Ledger" sub="Inspect, review and correct every transaction"><LedgerView /></LazyDataRoute>} />
            <Route path="/ingestion" element={<LazyDataRoute index="06 — Ingestion" title="Ingestion" sub="Import statements, categorise, reconcile balances"><Ingestion /></LazyDataRoute>} />
            <Route path="/transfers" element={<LazyDataRoute index="07 — Reconciliation" title="Transfer review" sub="Resolve movements between accounts"><TransferReview /></LazyDataRoute>} />
            <Route path="/settings" element={<LazyDataRoute index="⚙ — Configuration" title="Settings" sub="Interface, identity & preferences"><Settings /></LazyDataRoute>} />
          </Route>

          {/* Unknown URL: home for a signed-in user, login otherwise. */}
          <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
        </Routes>
      )}

      {booted && <ThemeToggle />}
      <MilestoneToast toast={toast} />
    </ViewBridge>
  )
}

export default function App() {
  const [booted, setBooted] = useState(false)
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

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

  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <AppFrame
            booted={booted} setBooted={setBooted}
            dark={dark} setDark={setDark}
            motionOn={motionOn} setMotionOn={setMotionOn}
            toast={toast} fireToast={fireToast}
          />
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
