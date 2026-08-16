import { useCallback, useEffect, useState } from 'react'

/**
 * Shared responsive geometry for the hand-built SVG charts.
 *
 * A chart must draw against these CSS-pixel dimensions rather than a fixed
 * viewBox stretched into an arbitrary container. Keeping the rendered and
 * internal coordinate systems aligned prevents non-uniform SVG scaling from
 * deforming text, circles, tooltips, and strokes as cards reflow.
 */
export interface ResponsiveChartSizeOptions {
  /** Preferred rendered width / height. Defaults to the existing 640 × 240 charts. */
  aspectRatio?: number
  /** Compact-chart floor, used once a card becomes narrow. */
  minHeight?: number
  /** Prevent a wide desktop card from consuming excessive vertical space. */
  maxHeight?: number
}

export interface ResponsiveChartSize {
  width: number
  height: number
  /** False until the container has reported a usable width. */
  ready: boolean
}

export const DEFAULT_CHART_ASPECT_RATIO = 640 / 240
export const DEFAULT_CHART_MIN_HEIGHT = 180
export const DEFAULT_CHART_MAX_HEIGHT = 300

const positive = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && value! > 0 ? value! : fallback

/** Pure sizing rule, exported so responsive thresholds can be regression-tested
 * without mounting a component. */
export function resolveResponsiveChartSize(
  containerWidth: number,
  options: ResponsiveChartSizeOptions = {},
): ResponsiveChartSize {
  const width = Number.isFinite(containerWidth) && containerWidth > 0 ? Math.round(containerWidth) : 0
  if (width === 0) return { width: 0, height: 0, ready: false }

  const aspectRatio = positive(options.aspectRatio, DEFAULT_CHART_ASPECT_RATIO)
  const minHeight = positive(options.minHeight, DEFAULT_CHART_MIN_HEIGHT)
  const maxHeight = Math.max(minHeight, positive(options.maxHeight, DEFAULT_CHART_MAX_HEIGHT))
  const height = Math.round(Math.min(maxHeight, Math.max(minHeight, width / aspectRatio)))

  return { width, height, ready: true }
}

/**
 * Measures a chart's own container with ResizeObserver and returns stable SVG
 * dimensions. Use the returned ref on a block wrapper; once `ready`, render an
 * SVG whose viewBox uses `width` and `height` exactly.
 */
export function useResponsiveChartSize<T extends Element = HTMLDivElement>(
  options: ResponsiveChartSizeOptions = {},
) {
  const aspectRatio = positive(options.aspectRatio, DEFAULT_CHART_ASPECT_RATIO)
  const minHeight = positive(options.minHeight, DEFAULT_CHART_MIN_HEIGHT)
  const maxHeight = Math.max(minHeight, positive(options.maxHeight, DEFAULT_CHART_MAX_HEIGHT))
  const [element, setElement] = useState<T | null>(null)
  const [size, setSize] = useState<ResponsiveChartSize>({ width: 0, height: 0, ready: false })

  const ref = useCallback((node: T | null) => setElement(node), [])

  useEffect(() => {
    if (!element) return

    const measure = () => {
      const next = resolveResponsiveChartSize(element.getBoundingClientRect().width, {
        aspectRatio,
        minHeight,
        maxHeight,
      })
      setSize((current) =>
        current.width === next.width && current.height === next.height && current.ready === next.ready
          ? current
          : next,
      )
    }

    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [aspectRatio, element, maxHeight, minHeight])

  return { ref, ...size }
}
