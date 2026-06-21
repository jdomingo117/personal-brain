import type { Variants } from 'framer-motion'

export const ease = [0.22, 1, 0.36, 1] as const

/** grid container that staggers its tile children in */
export const gridStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.12 } },
}

/** an individual tile / cell — "blur focus" entrance: sharpens from a soft
 *  blur as it fades + rises, which suits the frosted-glass material. */
export const cell: Variants = {
  hidden: { opacity: 0, y: 8, filter: 'blur(10px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.7, ease },
  },
}

/** landing copy stagger */
export const copyGroup: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}
export const copyItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
}
