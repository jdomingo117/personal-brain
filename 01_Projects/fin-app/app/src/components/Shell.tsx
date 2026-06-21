import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { NAV, useView, type View } from '../router'
import { useScramble } from '../hooks/useScramble'

const barSpring = { type: 'spring', stiffness: 120, damping: 20 } as const

function Icon({ d, onClick, label }: { d: string; onClick?: () => void; label: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="grid h-[38px] w-[38px] place-items-center rounded-[11px] text-white/55 transition hover:bg-white/10 hover:text-white"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d={d} />
      </svg>
    </button>
  )
}

function RailItem({ item }: { item: (typeof NAV)[number] }) {
  const { view, go } = useView()
  const [hover, setHover] = useState(false)
  const active = view === item.id
  const show = active || hover
  const label = useScramble(item.label, show)
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => go(item.id)}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      className="group flex cursor-pointer items-center text-left"
    >
      <span
        className={`w-[22px] font-display text-[14px] font-extrabold tabular-nums transition-colors ${
          active ? 'text-accent-ink' : hover ? 'text-ink' : 'text-faint'
        }`}
      >
        {item.n}
      </span>
      <span
        className={`relative ml-1.5 h-[1.5px] flex-shrink-0 bg-faint transition-[width] duration-300 ${
          show ? 'w-[34px]' : 'w-[14px]'
        }`}
      >
        {active && (
          <motion.span
            layoutId="rail-active"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="absolute -top-px left-0 h-[2px] w-full bg-accent"
          />
        )}
      </span>
      <span
        className={`ml-3 hidden overflow-hidden whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.16em] text-ink transition-all duration-300 md:inline ${
          show ? 'md:max-w-[160px] md:opacity-100' : 'md:max-w-0 md:opacity-0'
        }`}
      >
        {label}
      </span>
    </button>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  const { view, go } = useView()
  return (
    <div className="relative z-[5] grid h-screen w-screen grid-rows-[auto_1fr_auto]">
      {/* top letterbox bar */}
      <motion.header
        initial={{ y: -70 }}
        animate={{ y: 0 }}
        transition={barSpring}
        className="relative z-10 flex items-center justify-between bg-bar px-8 py-3"
      >
        <button className="flex items-center gap-3" onClick={() => go('landing')}>
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-white/25 font-display text-[17px] font-black text-white">
            H
          </span>
          <span className="font-display text-[17px] font-extrabold tracking-wide text-white">HALCYON</span>
          <span className="border-l border-white/15 pl-3 text-[12px] text-white/45">Private Wealth</span>
        </button>
        <div className="flex items-center gap-2">
          <Icon label="Search" d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5" />
          <Icon
            label="Settings"
            onClick={() => go('settings')}
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15Z"
          />
          <Icon label="Notifications" d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0" />
          <div className="ml-1 grid h-[38px] w-[38px] place-items-center rounded-[11px] bg-white text-[13px] font-semibold text-bar">
            AM
          </div>
        </div>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/55 to-transparent" />
      </motion.header>

      {/* body: rail + screen */}
      <div className="grid min-h-0 grid-cols-[52px_1fr] gap-2 px-4 py-4 md:grid-cols-[188px_1fr] md:px-8">
        <motion.nav
          className="flex flex-col justify-center gap-5"
          animate={{ y: view === 'landing' ? -26 : 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 24 }}
        >
          {NAV.map((item) => (
            <RailItem key={item.id} item={item} />
          ))}
        </motion.nav>
        <main className="relative min-h-0">{children}</main>
      </div>

      {/* bottom status strip */}
      <motion.footer
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        transition={barSpring}
        className="relative z-10 flex items-center justify-between bg-bar px-8 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35"
      >
        <span className="flex items-center gap-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
          System nominal · all accounts synced
        </span>
        <span className="capitalize text-white/40">{view === 'landing' ? 'Session secured' : view}</span>
        <span>
          Last sync <b className="font-semibold text-white/70">2m ago</b>
        </span>
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      </motion.footer>
    </div>
  )
}
