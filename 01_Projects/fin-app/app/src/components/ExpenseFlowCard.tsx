import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Tile from './Tile'
import { catInScope, isActive, subInScope, type CatSelection } from '../lib/expenseSelection'
import { catColor } from '../lib/categoryColor'
import { fmt, type Txn } from '../data'

/* √-scaled, capped edge width — keeps "thicker = bigger" but bounds the dominant
   flow so it doesn't crowd the node cards, and keeps small flows visible. */
const edgeW = (ratio: number, k: number, cap: number) => Math.min(cap, Math.max(2, Math.sqrt(ratio) * k))

/** A card node. Category and sub-category cards are clickable — they expand, and
 *  they set the view's shared focus. `selected` means *expanded* (structural);
 *  `dimmed` means *out of the shared focus*. Keeping them separate is what lets
 *  the unfocused card render exactly as it always has. */
function FlowNode({
  data,
}: {
  data: { label: string; amount: string; pct?: string; color: string; kind: string; selected?: boolean; dimmed?: boolean }
}) {
  const isTotal = data.kind === 'total'
  return (
    <div
      style={{
        minWidth: isTotal ? 96 : 122,
        padding: '7px 12px',
        borderRadius: 12,
        background: 'var(--toast-bg)',
        border: `1px solid ${data.selected ? data.color : 'var(--hair)'}`,
        borderLeft: `4px solid ${data.color}`,
        boxShadow: data.selected ? `0 0 0 3px color-mix(in srgb, ${data.color} 22%, transparent)` : 'var(--shadow-glass)',
        fontFamily: 'Hanken Grotesk, sans-serif',
        cursor: data.kind === 'cat' || data.kind === 'sub' ? 'pointer' : 'default',
        opacity: data.dimmed ? 0.42 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-ink)' }}>{data.label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>
        {data.amount}
        {data.pct && <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}> · {data.pct}</span>}
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { flow: FlowNode }

/** Total → category → sub-category flow. A *source* of the view's shared focus:
 *  clicking a node focuses the page, but this card never filters itself — a flow
 *  chart of a single category is a two-node stub, and the other categories are
 *  the comparison you came for. It highlights instead. `outflows` is therefore
 *  the unfiltered set. */
export default function ExpenseFlowCard({
  outflows,
  selection,
  onToggleCategory,
  onToggleSubcat,
}: {
  outflows: Txn[]
  selection: CatSelection
  onToggleCategory: (cat: string) => void
  onToggleSubcat: (cat: string, sub: string) => void
}) {
  // Which category is expanded when nothing is focused. Kept across a focus so
  // clearing returns you where you were rather than snapping to the biggest.
  const [local, setLocal] = useState<string | null>(null)
  const inst = useRef<any>(null)

  const { cats, total } = useMemo(() => {
    const catMap = new Map<string, Map<string, number>>()
    outflows.forEach((t) => {
      if (t.amount >= 0) return
      const subs = catMap.get(t.cat) ?? new Map<string, number>()
      const sk = t.subcat ?? 'Other'
      subs.set(sk, (subs.get(sk) ?? 0) + Math.abs(t.amount))
      catMap.set(t.cat, subs)
    })
    const cats = [...catMap.entries()]
      .map(([name, subs]) => ({
        name,
        subs: [...subs.entries()].map(([n, value]) => ({ name: n, value })).sort((a, b) => b.value - a.value),
        total: [...subs.values()].reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)
    return { cats, total: cats.reduce((a, c) => a + c.total, 0) }
  }, [outflows])

  /* Two jobs, deliberately separate:
     - `expanded` is STRUCTURAL — the layout and the fitView pass need exactly one
       category open, so it's never empty (unlike the shared selection, which can
       be empty or multi).
     - `selection` is the SHARED focus, and only drives emphasis here.
     When a focus is active the expanded category is always one of the selected
     ones, so you never get the broken-looking "expanded but dimmed". */
  const focusOn = isActive(selection)
  const inScope = cats.filter((c) => catInScope(c.name, selection)) // cats is sorted desc
  const expanded = focusOn
    ? inScope[0]?.name ?? null
    : local && cats.some((c) => c.name === local)
      ? local
      : cats[0]?.name ?? null

  const { nodes, edges } = useMemo(() => {
    const CAT_X = 180
    const SUB_X = 350
    const CAT_GAP = 52
    const nodes: any[] = []
    const edges: any[] = []
    const topY = 20
    const centerY = topY + ((cats.length - 1) * CAT_GAP) / 2

    nodes.push({ id: 'total', type: 'flow', position: { x: 20, y: centerY }, data: { label: 'Total outflow', amount: fmt(total), color: 'var(--color-ink2)', kind: 'total' } })

    cats.forEach((c, i) => {
      const y = topY + i * CAT_GAP
      const color = catColor(c.name)
      const isExpanded = expanded === c.name
      // dimming is additive: with no focus it's always false, so the card renders
      // exactly as it did before cross-filtering existed
      const isDimmed = focusOn && !catInScope(c.name, selection)
      nodes.push({ id: `cat:${c.name}`, type: 'flow', position: { x: CAT_X, y }, data: { label: c.name, amount: fmt(c.total), pct: `${Math.round((c.total / total) * 100)}%`, color, kind: 'cat', selected: isExpanded, dimmed: isDimmed } })
      // `animated` stays bound to expansion, not the focus — a multi-select would
      // otherwise animate every edge at once
      edges.push({ id: `e-t-${c.name}`, source: 'total', target: `cat:${c.name}`, animated: isExpanded, style: { stroke: color, strokeWidth: edgeW(c.total / total, 16, 13), opacity: (isExpanded ? 0.85 : 0.28) * (isDimmed ? 0.5 : 1) } })

      if (isExpanded) {
        const subStartY = y - ((c.subs.length - 1) * 48) / 2
        c.subs.forEach((s, j) => {
          const subDimmed = focusOn && !subInScope(c.name, s.name, selection)
          nodes.push({ id: `sub:${c.name}:${s.name}`, type: 'flow', position: { x: SUB_X, y: subStartY + j * 48 }, data: { label: s.name, amount: fmt(s.value), color, kind: 'sub', dimmed: subDimmed } })
          edges.push({ id: `e-${c.name}-${s.name}`, source: `cat:${c.name}`, target: `sub:${c.name}:${s.name}`, animated: true, style: { stroke: color, strokeWidth: edgeW(s.value / c.total, 12, 11), opacity: 0.85 * (subDimmed ? 0.5 : 1) } })
        })
      }
    })
    return { nodes, edges }
  }, [cats, total, expanded, focusOn, selection])

  // refit when the expanded category (or dataset) changes. Two passes: an early
  // one, plus a later one after React Flow has measured node sizes and the grid
  // has settled the column width (otherwise the first fit can be to a stale width).
  useEffect(() => {
    const fit = () => inst.current?.fitView({ padding: 0.14, maxZoom: 1.15, duration: 300 })
    const a = window.setTimeout(fit, 50)
    const b = window.setTimeout(fit, 260)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
    // keyed to expansion, not the focus — dimming doesn't move the layout
  }, [expanded, total])

  // …and whenever the container resizes (the tile lives in a responsive grid, so
  // the first fit can land before the column width settles).
  const paneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const ro = new ResizeObserver(() => inst.current?.fitView({ padding: 0.15, maxZoom: 1.15 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <Tile className="flex flex-col">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-display text-[14px] font-bold text-ink">Category Outflow</h3>
        <span className="text-[11px] uppercase tracking-[0.06em] text-muted">click to focus the page</span>
      </header>

      {total === 0 ? (
        <div className="grid place-items-center py-20 text-center text-[12.5px] text-muted">
          No spending in the selected period.
        </div>
      ) : (
        <div ref={paneRef} style={{ height: 330 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(i) => (inst.current = i)}
            onNodeClick={(_, node) => {
              if (node.id.startsWith('cat:')) {
                const cat = node.id.slice(4)
                setLocal(cat)
                onToggleCategory(cat)
              } else if (node.id.startsWith('sub:')) {
                // ids are `sub:<cat>:<sub>`; both cat and sub names are taxonomy
                // keys and contain no ':'
                const [, cat, sub] = node.id.split(':')
                // `Other` is synthesized for txns with no subcat (see the cats memo)
                // and isn't in CATEGORY_TAXONOMY — it would be pruned on the way in
                // and match zero rows on the way out, with no chip to undo it.
                if (sub === 'Other') return
                setLocal(cat)
                onToggleSubcat(cat, sub)
              }
            }}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.15 }}
            minZoom={0.4}
            maxZoom={1.6}
            nodesConnectable={false}
            nodesDraggable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            preventScrolling={false}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} size={1} color="var(--hair-soft)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      )}
    </Tile>
  )
}
