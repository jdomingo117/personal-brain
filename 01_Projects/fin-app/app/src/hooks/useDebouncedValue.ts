import { useEffect, useState } from 'react'

/** Returns a copy of `value` that only updates after it has stopped changing
 *  for `delay` ms — used to keep the transaction search responsive without
 *  re-filtering on every keystroke. */
export function useDebouncedValue<T>(value: T, delay = 180): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}
