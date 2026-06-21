import { motion } from 'framer-motion'
import { useEffect, useRef, type ReactNode } from 'react'
import { gridStagger } from './motion'

const FADE = 32 // px — how far content dissolves into the letterbox bars

/** Full-screen view container — overlaid (absolute) so AnimatePresence can
 *  bridge the shared hero morph; fades out on exit.
 *
 *  Scroll chrome: a scroll-position-driven top/bottom mask so content melts
 *  into the bars (top fades only once scrolled, bottom only while more remains
 *  below — header stays crisp at rest), plus an `is-scrolling` class that
 *  reveals the minimal scrollbar while scrolling and hides it when idle. */
export function Screen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const idle = useRef<number | undefined>(undefined)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const top = Math.min(el.scrollTop, FADE)
      const bottom = Math.min(el.scrollHeight - el.clientHeight - el.scrollTop, FADE)
      const mask = `linear-gradient(to bottom, transparent 0, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent 100%)`
      el.style.setProperty('mask-image', mask)
      el.style.setProperty('-webkit-mask-image', mask)
    }
    const onScroll = () => {
      update()
      el.classList.add('is-scrolling')
      window.clearTimeout(idle.current)
      idle.current = window.setTimeout(() => el.classList.remove('is-scrolling'), 700)
    }
    update()
    // re-measure after entrance layout settles
    const raf = requestAnimationFrame(update)
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', update)
      window.clearTimeout(idle.current)
    }
  }, [])

  return (
    <motion.div
      ref={ref}
      className="scroll-region absolute inset-0 overflow-y-auto pb-4 pr-1"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  )
}

export function ViewHeader({ index, title, sub }: { index: string; title: string; sub?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent-ink">{index}</div>
      <h2 className="font-display text-[40px] font-black tracking-[-0.02em]">{title}</h2>
      {sub && <p className="text-[14px] text-muted">{sub}</p>}
    </motion.div>
  )
}

export function Grid({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={gridStagger}
      initial="hidden"
      animate="show"
      className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3"
    >
      {children}
    </motion.div>
  )
}
