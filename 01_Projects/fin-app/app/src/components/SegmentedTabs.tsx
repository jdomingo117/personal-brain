import { motion } from 'framer-motion'

export type SegTab = { id: string; label: string }

/** Glass segmented switcher. The active segment is a sliding `accent-wash`
 *  thumb (shared `layoutId`) that springs between options — mirroring the
 *  accent-select idiom of `Chip`, but as a single mutually-exclusive control. */
export default function SegmentedTabs({
  tabs,
  active,
  onChange,
  layoutId = 'seg-thumb',
}: {
  tabs: SegTab[]
  active: string
  onChange: (id: string) => void
  layoutId?: string
}) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-1 rounded-[12px] border border-[var(--hair)] bg-[var(--glass-fill)] p-1"
    >
      {tabs.map((t) => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`relative rounded-[9px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
              isActive ? 'text-accent-ink' : 'text-ink2 hover:text-ink'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[9px] border border-accent bg-[var(--accent-wash)]"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
