export interface SharedTooltipLayout {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Places one aggregate tooltip for a hovered x-position. A single card avoids
 * series-to-series collisions while the vertical choice keeps it clear of the
 * nearest plotted point whenever the chart bounds permit it.
 */
export function sharedTooltipLayout({
  anchorX,
  pointYs,
  itemCount,
  left,
  right,
  top,
  bottom,
}: {
  anchorX: number
  pointYs: number[]
  itemCount: number
  left: number
  right: number
  top: number
  bottom: number
}): SharedTooltipLayout {
  const width = 132
  const height = 20 + Math.max(itemCount, 1) * 14 + 4
  const edge = 4
  const x = Math.max(left + edge, Math.min(right - width - edge, anchorX - width / 2))
  const highest = Math.min(...pointYs)
  const lowest = Math.max(...pointYs)
  const above = highest - height - 9
  const below = lowest + 11
  const y = above >= top + edge
    ? above
    : below <= bottom - height - edge
      ? below
      : Math.max(top + edge, Math.min(bottom - height - edge, above))

  return { x, y, width, height }
}
