import { data, EXPENSE_CATEGORIES } from '../data'

/* Validated CVD-safe categorical palette (hex, since nivo derives shades and
   needs real colours, not CSS vars). Mirrors --cat-1..7 in index.css. */
export const CAT_HEX_LIGHT = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4']
export const CAT_HEX_DARK = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767', '#d55181']

export function catColor(name: string, dark: boolean) {
  const i = EXPENSE_CATEGORIES.indexOf(name)
  const ramp = dark ? CAT_HEX_DARK : CAT_HEX_LIGHT
  return ramp[(i + ramp.length) % ramp.length]
}

export type SubEntry = { name: string; value: number }
export type CatEntry = { name: string; total: number; subs: SubEntry[] }

/** Aggregate all outflow transactions into Total → category → sub-category,
   sorted by spend descending. */
export function buildHierarchy() {
  const outflows = data.transactions.filter((t) => t.amount < 0)
  const catMap = new Map<string, Map<string, number>>()
  outflows.forEach((t) => {
    const subs = catMap.get(t.cat) ?? new Map<string, number>()
    const sk = t.subcat ?? 'Other'
    subs.set(sk, (subs.get(sk) ?? 0) + Math.abs(t.amount))
    catMap.set(t.cat, subs)
  })
  const cats: CatEntry[] = [...catMap.entries()]
    .map(([name, subs]) => ({
      name,
      subs: [...subs.entries()].map(([n, value]) => ({ name: n, value })).sort((a, b) => b.value - a.value),
      total: [...subs.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total)
  const total = cats.reduce((a, c) => a + c.total, 0)
  return { cats, total }
}

export const fmtUsd = (n: number) => '$' + Math.round(n).toLocaleString()
