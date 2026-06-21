import { AnimatePresence, motion } from 'framer-motion'
import { useView } from '../router'

/**
 * Floating quick theme toggle, anchored bottom-right above the status strip.
 * Shares the same `dark`/`setDark` context as Settings → Dark mode, so the two
 * stay in sync. Glass pill + a sun/moon icon that rotates-and-fades on swap.
 */
export default function ThemeToggle() {
  const { dark, setDark } = useView()

  return (
    <motion.button
      onClick={() => setDark(!dark)}
      aria-label="Toggle dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light' : 'Switch to dark'}
      initial={{ opacity: 0, y: 12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, delay: 0.3 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className="glass fixed bottom-[60px] right-6 z-20 grid h-[46px] w-[46px] place-items-center text-ink md:bottom-[64px] md:right-8"
      style={{ borderRadius: 9999 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {dark ? (
          <motion.svg
            key="moon"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.25 }}
            width="19" height="19" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
          </motion.svg>
        ) : (
          <motion.svg
            key="sun"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.25 }}
            width="19" height="19" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2.2M12 19.8V22M4.5 4.5l1.6 1.6M17.9 17.9l1.6 1.6M2 12h2.2M19.8 12H22M4.5 19.5l1.6-1.6M17.9 6.1l1.6-1.6" />
          </motion.svg>
        )}
      </AnimatePresence>
    </motion.button>
  )
}
