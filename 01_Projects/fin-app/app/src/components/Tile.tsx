import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cell } from './motion'

/** Glass panel. Carries the stagger `cell` variant (driven by the grid parent)
 *  and a spring hover-lift. Optional title/tag header. */
export default function Tile({
  title,
  tag,
  span,
  className = '',
  children,
}: {
  title?: string
  tag?: ReactNode
  span?: 2 | 3
  className?: string
  children?: ReactNode
}) {
  const spanClass =
    span === 3 ? 'md:col-span-2 xl:col-span-3' : span === 2 ? 'md:col-span-2' : ''
  return (
    <motion.div
      variants={cell}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`glass p-5 ${spanClass} ${className}`}
    >
      {(title || tag) && (
        <header className="mb-3.5 flex items-baseline justify-between gap-3">
          {title && <h3 className="font-display text-[14px] font-bold text-ink">{title}</h3>}
          {tag && <span className="text-[11px] uppercase tracking-[0.06em] text-muted">{tag}</span>}
        </header>
      )}
      {children}
    </motion.div>
  )
}
