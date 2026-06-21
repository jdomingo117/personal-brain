import { useEffect, useRef } from 'react'
import anime from 'animejs'
import { useView } from '../router'

/**
 * The single integration point for anime.js chart motion — the "firewall".
 *
 * anime.js only ever runs through this hook, which guarantees the three things
 * that keep it from fighting Framer Motion:
 *   1. SCOPED — `build` receives the chart's own root element; target elements
 *      via `scope.querySelectorAll(...)`, never global selectors, so multiple
 *      charts on screen never cross-animate.
 *   2. MOTION-AWARE — when the motion toggle is off or the OS prefers reduced
 *      motion, we skip the animation and call `setFinal` to render the resting
 *      state synchronously.
 *   3. SELF-CLEANING — every instance `build` returns is paused on unmount and
 *      anime is detached from the scope, so no stray rAF writes to a torn-down
 *      node during the AnimatePresence view morph.
 *
 * Framer Motion still owns the tile's blur-focus entrance + the `layoutId`
 * morph; anime.js only touches SVG internals + counters. No element is animated
 * by both libraries.
 */
type Reveal = anime.AnimeInstance | anime.AnimeTimelineInstance
type Build<T> = (scope: T) => Reveal[] | void

export function useChartReveal<T extends Element = HTMLDivElement>(
  build: Build<T>,
  setFinal: (scope: T) => void,
) {
  const ref = useRef<T>(null)

  // motionOn is read once at mount (charts animate on entrance, same as before)
  const { motionOn } = useView()
  const motionRef = useRef(motionOn)
  motionRef.current = motionOn

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!motionRef.current || reduce) {
      setFinal(el)
      return
    }
    const created = build(el) || []
    return () => {
      created.forEach((a) => a.pause())
      anime.remove(el.querySelectorAll('*'))
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}

export const CHART_EASE = 'cubicBezier(.22,1,.36,1)'
