import { useEffect, useRef } from 'react'

/** Auto-hiding scrollbar for a `.scroll-region`.
 *
 *  The scrollbar is transparent at rest and only tints while the region is
 *  actually moving, so a tile full of rows doesn't advertise its overflow with a
 *  permanent grey bar. Pair with the `.scroll-region` class (index.css). */
export function useScrollIdle<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const idle = useRef<number | undefined>(undefined)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onScroll = () => {
      el.classList.add('is-scrolling')
      window.clearTimeout(idle.current)
      idle.current = window.setTimeout(() => el.classList.remove('is-scrolling'), 700)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.clearTimeout(idle.current)
    }
  }, [])
  return ref
}
