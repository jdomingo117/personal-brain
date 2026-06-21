import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useScramble } from '../hooks/useScramble'

const STEPS = ['Establishing uplink', 'Decrypting ledger', 'Syncing accounts', 'Calibrating systems', 'Ready']

export default function Boot({ onDone }: { onDone: () => void }) {
  const pct = useMotionValue(0)
  const pctText = useTransform(pct, (v) => Math.round(v).toString().padStart(2, '0'))
  const width = useTransform(pct, (v) => `${v}%`)
  const [stepIdx, setStepIdx] = useState(0)
  const status = useScramble(STEPS[stepIdx], true)

  useEffect(() => {
    const controls = animate(pct, 100, {
      duration: 2.0,
      ease: [0.22, 1, 0.36, 1],
      onComplete: () => setTimeout(onDone, 280),
    })
    const unsub = pct.on('change', (v) => setStepIdx(Math.min(STEPS.length - 1, Math.floor((v / 100) * STEPS.length))))
    // safety net: FM's rAF pauses on a backgrounded tab, so never trust the
    // tween alone to advance past boot.
    const net = window.setTimeout(onDone, 2900)
    return () => {
      controls.stop()
      unsub()
      clearTimeout(net)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center bg-surface"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[min(420px,80vw)]">
        <div className="mb-[38px] flex items-center gap-3.5">
          <span className="grid h-[46px] w-[46px] place-items-center rounded-xl bg-ink font-display text-2xl font-black text-white">
            H
          </span>
          <span className="font-display text-[22px] font-extrabold tracking-wide">HALCYON</span>
        </div>
        <div className="mb-3 flex items-end justify-between">
          <span className="micro text-muted">{status}</span>
          <span className="font-display text-[34px] font-extrabold leading-none tabular-nums tracking-tight">
            <motion.span>{pctText}</motion.span>
            <span className="ml-0.5 text-base text-muted">%</span>
          </span>
        </div>
        <div className="relative h-0.5 w-full overflow-hidden bg-[var(--hair)]">
          <motion.span className="absolute left-0 top-0 h-full bg-accent" style={{ width }} />
        </div>
        <div className="mt-3.5 text-[10.5px] uppercase tracking-[0.14em] text-faint">Private Wealth Interface · v0.1</div>
      </div>
    </motion.div>
  )
}
