/** Shown when a mark runs past the track's ceiling (~1.5× baseline). Without it,
 *  "pinned to the right edge" and "reaches the right edge" look identical — the
 *  chip carries the true figure. */
export function OverflowChevron({ color, title }: { color: string; title: string }) {
  return (
    <span className="pointer-events-none absolute top-1/2 -translate-y-1/2" style={{ right: -7 }} title={title}>
      <svg width="5" height="8" viewBox="0 0 5 8" fill="none" aria-hidden>
        <path d="M1 1l3 3-3 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
