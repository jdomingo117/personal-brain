import { useEffect } from 'react'
import { animate, useMotionValue, useTransform } from 'framer-motion'

const ease = [0.22, 1, 0.36, 1] as const

/**
 * Declarative count-up. Returns a MotionValue<string> you render inside a
 * <motion.span>. `format` controls the display (currency by default).
 *
 * `to` is expected in CENTS, matching every other amount in the app — the
 * default formatter divides by 100 to match data.ts's `fmt`. A caller
 * passing an already-converted value needs a custom `format`.
 */
export function useCountUp(to: number, format: (v: number) => string = (v) => '$' + Math.round(v / 100).toLocaleString(), duration = 1.4) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => format(v))
  useEffect(() => {
    const controls = animate(mv, to, { duration, ease })
    return () => controls.stop()
  }, [mv, to, duration])
  return text
}
