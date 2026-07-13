import { useState } from 'react'
import { DEFAULT_PRESET, PRESETS, presetRange } from '../lib/period'

/** Shared from/to/preset state for the analyzer filter bar. A quick-select
 *  preset sets both dates and marks itself active; editing either date manually
 *  clears the active preset (so the pill row shows nothing selected and the
 *  custom-range picker reads as active). ISO date strings compare
 *  lexicographically, so `from ≤ to` is kept with a plain compare. */
export function usePeriodRange(initialPreset: string = DEFAULT_PRESET) {
  const [preset, setPreset] = useState<string | null>(initialPreset)
  const [from, setFrom] = useState(() => presetRange(initialPreset).from)
  const [to, setTo] = useState(() => presetRange(initialPreset).to)

  const applyPreset = (id: string) => {
    if (!PRESETS.some((p) => p.id === id)) return
    const r = presetRange(id)
    setPreset(id)
    setFrom(r.from)
    setTo(r.to)
  }
  const changeFrom = (v: string) => {
    setPreset(null)
    setFrom(v)
    if (v > to) setTo(v)
  }
  const changeTo = (v: string) => {
    setPreset(null)
    setTo(v)
    if (v < from) setFrom(v)
  }

  return { preset, from, to, applyPreset, changeFrom, changeTo }
}
