/**
 * Chart labels have to respond to the plot's usable width, not merely the
 * number of data points. These helpers keep the first and last data labels so
 * a compact chart still establishes a clear time range.
 */
export function visibleTickIndices(
  pointCount: number,
  availableWidth: number,
  minLabelSpacing = 64,
  maxLabels = 12,
): number[] {
  if (pointCount <= 0) return []
  if (pointCount === 1) return [0]

  const labelsToShow = Math.max(2, Math.min(pointCount, maxLabels, Math.floor(availableWidth / minLabelSpacing)))
  if (labelsToShow >= pointCount) return Array.from({ length: pointCount }, (_, index) => index)

  return Array.from({ length: labelsToShow }, (_, index) =>
    Math.round((index * (pointCount - 1)) / (labelsToShow - 1)),
  )
}

/** Three horizontal guides are enough for a compact chart; taller cards earn
 * more reference points without exceeding the calm five-line desktop grid. */
export function chartYTickCount(plotHeight: number): number {
  return Math.max(3, Math.min(5, Math.floor(plotHeight / 48) + 1))
}
