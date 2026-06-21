import { AnimatePresence, motion } from 'framer-motion'

export interface ToastData {
  id: number
  title: string
  sub: string
}

export default function MilestoneToast({ toast }: { toast: ToastData | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[72px] z-50 flex justify-center" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: -24, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            style={{ background: 'var(--toast-bg)' }}
            className="pointer-events-auto flex items-center gap-3.5 rounded-2xl border border-[var(--hair)] px-5 py-3.5 shadow-[0_14px_34px_rgba(10,14,20,0.28)] backdrop-blur-xl"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--accent-wash)] text-accent-ink">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <div>
              <div className="micro text-accent-ink">Milestone reached</div>
              <div className="font-display text-[15px] font-bold">{toast.title}</div>
              <div className="text-[12px] text-muted">{toast.sub}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
