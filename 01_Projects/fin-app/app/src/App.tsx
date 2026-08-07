import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate,
} from 'react-router-dom'
import { ViewContext, VIEW_PATHS, pathToView, type View } from './router'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { RequireAnon, RequireAuth, RequireOnboarded } from './components/Guards'
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
import Accounts from './views/Accounts'
import Income from './views/Income'
import Expenses from './views/Expenses'
import Ingestion from './views/Ingestion'
import Settings from './views/Settings'

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
  const { session } = useAuth()

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

      {booted && (
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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/income" element={<Income />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/ingestion" element={<Ingestion />} />
            <Route path="/settings" element={<Settings />} />
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
