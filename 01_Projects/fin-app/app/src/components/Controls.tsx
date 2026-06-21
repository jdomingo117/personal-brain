import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost'
  type?: 'button' | 'submit'
}) {
  const base =
    'micro rounded-lg px-5 py-3 transition will-change-transform'
  const styles =
    variant === 'primary'
      ? 'bg-ink text-surface hover:-translate-y-px hover:shadow-lg'
      : 'border border-[var(--hair)] text-ink hover:bg-black/[0.03]'
  return (
    <motion.button type={type} onClick={onClick} whileTap={{ scale: 0.97 }} className={`${base} ${styles}`}>
      {children}
    </motion.button>
  )
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[10px] border px-3.5 py-2 text-[12px] font-medium transition ${
        active
          ? 'border-accent bg-[var(--accent-wash)] text-accent-ink'
          : 'border-[var(--hair)] text-ink2 hover:border-[var(--hair)] hover:bg-black/[0.02]'
      }`}
    >
      {children}
    </button>
  )
}

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between py-3"
    >
      <span className="text-[13px] font-medium text-ink2">{label}</span>
      <span
        className="relative h-[26px] w-[46px] rounded-full transition-colors"
        style={{ background: on ? 'var(--color-ink)' : 'var(--switch-off)' }}
      >
        <motion.span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-surface shadow"
          animate={{ left: on ? 23 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  )
}
