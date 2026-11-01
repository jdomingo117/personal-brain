import { useCallback, useContext, useLayoutEffect, useRef } from 'react'
import { UNSAFE_NavigationContext } from 'react-router-dom'

export type BudgetNavigationGuard = (proceed: () => void) => void

/** BrowserRouter has no data-router blocker. Scope interception to a registered
 * Budget task; leave all other navigation untouched. POP is restored before an
 * asynchronous in-panel decision so neither Router nor the period reader sees it.
 */
export function useBudgetNavigationGuard(getGuard: () => BudgetNavigationGuard | null) {
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const latest = useRef(getGuard)
  latest.current = getGuard
  const request = useCallback((proceed: () => void) => {
    const guard = latest.current()
    if (guard) guard(proceed)
    else proceed()
  }, [])

  useLayoutEffect(() => {
    const push = navigator.push, replace = navigator.replace
    const guardedPush: typeof push = (...args) => request(() => push.apply(navigator, args))
    const guardedReplace: typeof replace = (...args) => request(() => replace.apply(navigator, args))
    navigator.push = guardedPush
    navigator.replace = guardedReplace
    let index = window.history.state?.idx as number | undefined
    let restore: (() => void) | null = null
    let replay = false
    const pop = (event: PopStateEvent) => {
      if (restore) {
        event.stopImmediatePropagation()
        const decide = restore; restore = null; decide()
        return
      }
      const target = window.history.state?.idx as number | undefined
      if (replay || !latest.current()) { replay = false; index = target; return }
      // Cross-document history is handled by beforeunload, not this SPA listener.
      if (typeof index !== 'number' || typeof target !== 'number' || index === target) return
      event.stopImmediatePropagation()
      const delta = index - target
      restore = () => request(() => { replay = true; window.history.go(-delta) })
      window.history.go(delta)
    }
    // Track pushes performed by the router and by saved-period navigation.
    const pushed = () => { index = window.history.state?.idx }
    window.addEventListener('popstate', pop, true)
    const originalPushState = window.history.pushState
    const trackPush: typeof originalPushState = function (...args) {
      originalPushState.apply(window.history, args); pushed()
    }
    window.history.pushState = trackPush
    return () => {
      if (navigator.push === guardedPush) navigator.push = push
      if (navigator.replace === guardedReplace) navigator.replace = replace
      if (window.history.pushState === trackPush) window.history.pushState = originalPushState
      window.removeEventListener('popstate', pop, true)
    }
  }, [navigator, request])
  return request
}
