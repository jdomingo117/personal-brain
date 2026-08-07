import { useEffect, useRef, useState, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { fmt } from '../data'
import { CATEGORIES, catColor, type CatMetrics, type Metrics } from './pacingData'

/** Every option renders the same row *chrome* (name, amounts, delta) and differs
 *  only in the rail below it — so the four options are a fair comparison, and
 *  the zoom mechanism is provably orthogonal to the bar treatment. */
export interface BarProps {
  m: Metrics
  color: string
  /** sub-category rows render at reduced weight */
  sub?: boolean
}
export type BarComponent = ComponentType<BarProps>

export type ZoomMode = 'accordion' | 'drill'

/* The baseline sits at a constant x across every row, so the marker reads as a
   single vertical rule you can scan down — bars past it are over last period.
   66% leaves headroom to show up to ~1.5× baseline before clamping. */
export const BASE_X = 66

/** Inner scroll regions need the same auto-hiding scrollbar treatment the page
 *  shell applies in Screen.tsx (`is-scrolling` toggled on scroll, off at rest). */
function useScrollIdle<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const idle = useRef<number>()
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

function Chevron({ open }: { open: boolean }) {
  return (
    <motion.svg
      width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="var(--color-muted)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      animate={{ rotate: open ? 90 : 0 }}
      transition={{ duration: 0.18 }}
      style={{ flexShrink: 0 }}
    >
      <path d="M9 18l6-6-6-6" />
    </motion.svg>
  )
}

function Row({
  m, color, Bar, sub = false, open, onClick,
}: {
  m: Metrics
  color: string
  Bar: BarComponent
  sub?: boolean
  open?: boolean
  onClick?: () => void
}) {
  const clickable = !!onClick
  return (
    <div
      onClick={onClick}
      className={`px-1 py-2.5 ${clickable ? 'cursor-pointer rounded-lg transition-colors hover:bg-[var(--hair-soft)]' : ''}`}
    >
      <div className="mb-[7px] flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          {clickable && open !== undefined && <Chevron open={open} />}
          <span className={`truncate ${sub ? 'text-[12px] text-ink2' : 'text-[12.5px] font-semibold text-ink'}`}>
            {m.name}
          </span>
        </span>
        <span className="shrink-0 text-[10.5px] tabular-nums text-muted">
          {fmt(m.current)} <span className="opacity-60">of</span> {fmt(m.baseline)}
        </span>
      </div>
      <Bar m={m} color={color} sub={sub} />
    </div>
  )
}

export default function PacingList({
  Bar,
  zoom,
  legend,
}: {
  Bar: BarComponent
  zoom: ZoomMode
  legend?: React.ReactNode
}) {
  const [open, setOpen] = useState<string | null>(CATEGORIES[1]?.name ?? null)
  const [drilled, setDrilled] = useState<CatMetrics | null>(null)
  const scrollRef = useScrollIdle<HTMLDivElement>()

  // switching mechanism mid-demo shouldn't strand the list in a drilled state
  useEffect(() => setDrilled(null), [zoom])

  return (
    <div className="flex min-h-0 flex-col">
      {legend && <div className="mb-1 shrink-0">{legend}</div>}

      {/* breadcrumb — drill mode only */}
      <AnimatePresence initial={false}>
        {drilled && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onClick={() => setDrilled(null)}
            className="mb-1 flex shrink-0 items-center gap-1.5 self-start text-[11px] font-semibold text-muted transition-colors hover:text-accent"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            All categories
            <span className="text-ink2">· {drilled.name}</span>
          </motion.button>
        )}
      </AnimatePresence>

      <div ref={scrollRef} className="scroll-region min-h-0 flex-1 overflow-y-auto pr-1.5" style={{ maxHeight: 296 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={drilled?.name ?? 'root'}
            initial={{ opacity: 0, x: drilled ? 10 : -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="divide-y divide-[var(--hair-soft)]"
          >
            {drilled
              ? drilled.subs.map((s) => <Row key={s.name} m={s} color={catColor(drilled.name)} Bar={Bar} sub />)
              : CATEGORIES.map((c) => {
                  const isOpen = zoom === 'accordion' && open === c.name
                  return (
                    <div key={c.name}>
                      <Row
                        m={c}
                        color={catColor(c.name)}
                        Bar={Bar}
                        open={zoom === 'accordion' ? isOpen : undefined}
                        onClick={() =>
                          zoom === 'accordion'
                            ? setOpen(isOpen ? null : c.name)
                            : setDrilled(c)
                        }
                      />
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden"
                          >
                            <div
                              className="ml-2 border-l pl-3"
                              style={{ borderColor: `color-mix(in srgb, ${catColor(c.name)} 40%, transparent)` }}
                            >
                              {c.subs.map((s) => (
                                <Row key={s.name} m={s} color={catColor(c.name)} Bar={Bar} sub />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
