import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const scene = readFileSync(new URL('../../three/SceneBackground.tsx', import.meta.url), 'utf8')
const ledgerDialogs = [
  'BulkCategoryDialog.tsx', 'BulkClassificationDialog.tsx',
  'ClassificationRulesDialog.tsx', 'TransactionCategoryDrawer.tsx',
].map((file) => readFileSync(new URL(`../../components/${file}`, import.meta.url), 'utf8'))

function hexToken(block: string, name: string) {
  const value = block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
  if (!value) throw new Error(`Missing --color-${name}`)
  return value
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground: string, background: string) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('workflow accessibility guardrails', () => {
  it('keeps helper and semantic text at WCAG AA contrast in both themes', () => {
    const light = css.slice(css.indexOf('@theme'), css.indexOf('/* raw vars'))
    const dark = css.slice(css.indexOf('.dark {'), css.indexOf('html, body'))

    for (const theme of [light, dark]) {
      const surface = hexToken(theme, 'surface')
      for (const token of ['muted', 'faint', 'accent-ink', 'pos', 'warn', 'neg']) {
        expect(contrast(hexToken(theme, token), surface), `${token} contrast`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('provides visible keyboard focus and 44px workflow controls', () => {
    expect(css).toContain('[role="button"]):focus-visible')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('--workflow-control-border')
  })

  it('keeps every Ledger modal on the shared focus trap and restoration contract', () => {
    for (const dialog of ledgerDialogs) {
      expect(dialog).toContain('useDialogFocus')
      expect(dialog).toContain('tabIndex={-1}')
      expect(dialog).toContain('aria-modal="true"')
    }
  })

  it('honours reduced motion and quiets the ambient scene on workflow routes', () => {
    expect(scene).toContain("matchMedia('(prefers-reduced-motion: reduce)')")
    expect(scene).toContain("view === 'ingestion' || view === 'transfers'")
    expect(scene).toContain('opacity-25')
  })
})
