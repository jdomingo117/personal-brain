import { useEffect, useRef, useState } from 'react'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ/—·'

/**
 * Halcyon's signature techy label reveal — resolves text character-by-character.
 * Returns the current (possibly scrambled) string. Re-runs whenever `active`
 * flips true.
 */
export function useScramble(text: string, active: boolean, speed = 22) {
  const [out, setOut] = useState(active ? text : '')
  const raf = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      setOut('')
      return
    }
    let frame = 0
    const total = text.length
    const tick = () => {
      const resolved = Math.floor(frame / 1.6)
      const next = text
        .split('')
        .map((ch, i) => {
          if (i < resolved || ch === ' ') return ch
          return CHARS[Math.floor(Math.random() * CHARS.length)]
        })
        .join('')
      setOut(next)
      frame++
      if (resolved <= total) raf.current = window.setTimeout(tick, speed) as unknown as number
      else setOut(text)
    }
    tick()
    return () => {
      if (raf.current) clearTimeout(raf.current)
    }
  }, [text, active, speed])

  return out
}
