/**
 * Converts a pointer position from rendered CSS pixels into a chart data
 * index. SVGs use the measured CSS-pixel viewBox from useResponsiveChartSize,
 * but keeping this conversion here makes the interaction contract explicit
 * and independently testable at every responsive width.
 */
export function chartIndexFromPointer({
  clientX,
  rectLeft,
  renderedWidth,
  viewBoxWidth,
  plotLeft,
  plotWidth,
  pointCount,
  mode = 'nearest',
}: {
  clientX: number
  rectLeft: number
  renderedWidth: number
  viewBoxWidth: number
  plotLeft: number
  plotWidth: number
  pointCount: number
  mode?: 'nearest' | 'slot'
}): number {
  if (pointCount <= 1 || renderedWidth <= 0 || plotWidth <= 0) return 0

  const svgX = ((clientX - rectLeft) / renderedWidth) * viewBoxWidth
  const rawIndex = mode === 'slot'
    ? Math.floor((svgX - plotLeft) / (plotWidth / pointCount))
    : Math.round(((svgX - plotLeft) / plotWidth) * (pointCount - 1))

  return Math.max(0, Math.min(pointCount - 1, rawIndex))
}
