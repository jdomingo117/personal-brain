import { motion, useMotionValue, useSpring } from 'framer-motion'
import type { PointerEvent } from 'react'
import { data, fmt } from '../data'

/**
 * The shared-element hero. The SAME `layoutId="hero"` is used by both the
 * landing card and the dashboard net-worth tile, so Framer Motion physically
 * morphs one into the other when the view changes.
 *
 * The landing variant adds a pointer-parallax 3D tilt + idle float (the
 * signature interactive card) — applied via motion values, which are morph-safe
 * because the card is the *exiting* shared element (Framer hides it; the flat
 * tile is what's visible during the morph).
 */

const morph = { type: 'spring', stiffness: 210, damping: 28 } as const
const springCfg = { stiffness: 150, damping: 18 } as const

export default function HeroCard({ variant }: { variant: 'card' | 'tile' }) {
  const mvX = useMotionValue(0)
  const mvY = useMotionValue(0)
  const rotateX = useSpring(mvX, springCfg)
  const rotateY = useSpring(mvY, springCfg)

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    mvY.set(px * 16)
    mvX.set(-py * 12)
  }
  const onLeave = () => {
    mvX.set(0)
    mvY.set(0)
  }

  if (variant === 'card') {
    return (
      <div style={{ perspective: 1200 }} onPointerMove={onMove} onPointerLeave={onLeave}>
        <motion.div
          layoutId="hero"
          transition={morph}
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
          className="relative aspect-[1.586/1] w-[420px] cursor-grab overflow-hidden rounded-[20px] bg-gradient-to-br from-[#23262c] to-[#0c0e12] p-7 text-white shadow-[0_44px_90px_-24px_rgba(10,12,16,0.65)]"
        >
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ repeat: Infinity, duration: 5.5, ease: 'easeInOut' }}
            className="flex h-full flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div className="h-9 w-12 rounded-md bg-gradient-to-br from-[#d9c187] to-[#b08d3e]" />
              <span className="font-display text-xl font-black">H</span>
            </div>
            <div>
              <div className="text-lg tabular-nums tracking-[0.18em]">0117 · 4492</div>
              <div className="mt-2 flex items-end justify-between">
                <span className="text-[11px] uppercase tracking-[0.18em] text-white/55">{data.operator.callsign}</span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-accent">Reserve</span>
              </div>
              <div className="mt-3 h-[3px] w-full rounded bg-gradient-to-r from-accent/0 via-accent to-accent/0" />
            </div>
          </motion.div>
        </motion.div>
      </div>
    )
  }

  // dashboard net-worth tile — same layoutId, so it morphs from the card
  return (
    <motion.div
      layoutId="hero"
      transition={morph}
      className="glass relative h-full overflow-hidden p-6"
    >
      <motion.div layout="position">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Total net worth</div>
        <div className="mt-2 text-[34px] font-bold tabular-nums tracking-tight">{fmt(data.operator.netWorth)}</div>
        <div className="mt-1.5 text-[12.5px] font-semibold text-pos">▲ {data.operator.netWorthDelta}% this month · +23% YTD</div>
      </motion.div>
    </motion.div>
  )
}
