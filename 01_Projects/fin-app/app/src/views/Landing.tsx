import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import HeroCard from '../components/HeroCard'
import { copyGroup, copyItem } from '../components/motion'
import { useCountUp } from '../hooks/useCountUp'
import { useView } from '../router'
import { data } from '../data'

const soft = { stiffness: 60, damping: 18 } as const

export default function Landing() {
  const { go } = useView()
  const netWorth = useCountUp(data.operator.netWorth)
  const wheelLock = useRef(false)

  // cursor-parallax depth (copy and card move on opposing layers)
  const mx = useSpring(useMotionValue(0), soft)
  const my = useSpring(useMotionValue(0), soft)
  const copyX = useTransform(mx, (v) => v * -14)
  const copyY = useTransform(my, (v) => v * -9)
  const cardX = useTransform(mx, (v) => v * 26)
  const cardY = useTransform(my, (v) => v * 18)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5)
      my.set(e.clientY / window.innerHeight - 0.5)
    }
    const onWheel = (e: WheelEvent) => {
      if (wheelLock.current || e.deltaY < 18) return
      wheelLock.current = true
      go('dashboard')
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('wheel', onWheel)
    }
  }, [mx, my, go])

  return (
    <motion.div
      className="absolute inset-0 grid grid-cols-1 items-center gap-6 pb-[6vh] lg:grid-cols-[1fr_1.05fr]"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div variants={copyGroup} initial="hidden" animate="show" style={{ x: copyX, y: copyY }} className="relative">
        <motion.div
          variants={copyItem}
          className="mb-4 flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.2em] text-muted"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_4px_rgba(17,181,150,0.12)]" />
          Session secured · Private Wealth
        </motion.div>

        <motion.h1 variants={copyItem} className="font-display font-black leading-[0.88] tracking-[-0.03em] text-[clamp(48px,6vw,92px)]">
          <span className="mb-1.5 block text-[30px] font-bold tracking-tight text-ink2">Welcome back,</span>
          {data.operator.callsign}
        </motion.h1>

        <motion.p variants={copyItem} className="mt-5 max-w-[360px] text-[15px] leading-relaxed text-ink2">
          Your portfolio is up {data.operator.netWorthDelta}% this month. Everything is nominal and on track.
        </motion.p>

        <motion.div variants={copyItem} className="mt-6 flex items-baseline gap-3">
          <span className="text-[40px] font-bold tabular-nums tracking-tight">
            <motion.span>{netWorth}</motion.span>
          </span>
          <span className="text-[13px] text-muted">
            total net worth · <span className="font-semibold text-pos">+{data.operator.netWorthDelta}% MoM</span>
          </span>
        </motion.div>

        <motion.button
          variants={copyItem}
          onClick={() => go('dashboard')}
          className="group mt-8 flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--hair)] text-ink transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-surface">
            <motion.svg
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              animate={{ y: [0, 3, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </motion.svg>
          </span>
          Enter dashboard — or scroll
        </motion.button>
      </motion.div>

      <motion.div style={{ x: cardX, y: cardY }} className="hidden items-center justify-center lg:flex">
        <HeroCard variant="card" />
      </motion.div>
    </motion.div>
  )
}
