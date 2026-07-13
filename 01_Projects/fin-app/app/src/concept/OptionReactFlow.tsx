import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { buildHierarchy, catColor, fmtUsd } from './flowData'

/* A card node. Categories are clickable to expand their sub-categories. */
function FlowNode({ data }: { data: { label: string; amount: string; pct?: string; color: string; kind: string; selected?: boolean } }) {
  const isTotal = data.kind === 'total'
  return (
    <div
      style={{
        minWidth: isTotal ? 132 : 148,
        padding: '7px 12px',
        borderRadius: 12,
        background: 'var(--toast-bg)',
        border: `1px solid ${data.selected ? data.color : 'var(--hair)'}`,
        borderLeft: `4px solid ${data.color}`,
        boxShadow: data.selected ? `0 0 0 3px color-mix(in srgb, ${data.color} 22%, transparent)` : 'var(--shadow-glass)',
        fontFamily: 'Hanken Grotesk, sans-serif',
        cursor: data.kind === 'cat' ? 'pointer' : 'default',
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

export default function OptionReactFlow({ dark }: { dark: boolean }) {
  const { cats, total } = buildHierarchy()
  const [selected, setSelected] = useState<string | null>(cats[0]?.name ?? null)
  const inst = useRef<any>(null)

  const { nodes, edges } = useMemo(() => {
    const CAT_GAP = 62
    const nodes: any[] = []
    const edges: any[] = []
    const topY = 20
    const centerY = topY + ((cats.length - 1) * CAT_GAP) / 2

    nodes.push({ id: 'total', type: 'flow', position: { x: 20, y: centerY }, data: { label: 'Total outflow', amount: fmtUsd(total), color: dark ? '#8b95a1' : '#5b636d', kind: 'total' }, draggable: true })

    cats.forEach((c, i) => {
      const y = topY + i * CAT_GAP
      const color = catColor(c.name, dark)
      nodes.push({ id: `cat:${c.name}`, type: 'flow', position: { x: 320, y }, data: { label: c.name, amount: fmtUsd(c.total), pct: `${Math.round((c.total / total) * 100)}%`, color, kind: 'cat', selected: selected === c.name } })
      edges.push({ id: `e-t-${c.name}`, source: 'total', target: `cat:${c.name}`, animated: true, style: { stroke: color, strokeWidth: Math.max(1.5, (c.total / total) * 46), opacity: selected && selected !== c.name ? 0.25 : 0.8 } })

      if (selected === c.name) {
        const subStartY = y - ((c.subs.length - 1) * 48) / 2
        c.subs.forEach((s, j) => {
          nodes.push({ id: `sub:${c.name}:${s.name}`, type: 'flow', position: { x: 640, y: subStartY + j * 48 }, data: { label: s.name, amount: fmtUsd(s.value), color, kind: 'sub' } })
          edges.push({ id: `e-${c.name}-${s.name}`, source: `cat:${c.name}`, target: `sub:${c.name}:${s.name}`, animated: true, style: { stroke: color, strokeWidth: Math.max(1.4, (s.value / c.total) * 22), opacity: 0.85 } })
        })
      }
    })
    return { nodes, edges }
  }, [cats, total, selected, dark])

  // refit the view whenever the expanded set changes
  useEffect(() => {
    const id = window.setTimeout(() => inst.current?.fitView({ padding: 0.16, maxZoom: 1.15, duration: 450 }), 30)
    return () => window.clearTimeout(id)
  }, [selected, dark])

  return (
    <div style={{ height: 470 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(i) => (inst.current = i)}
        onNodeClick={(_, node) => {
          if (node.id.startsWith('cat:')) {
            const name = node.id.slice(4)
            setSelected((s) => (s === name ? null : name))
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.16, maxZoom: 1.15 }}
        minZoom={0.4}
        maxZoom={1.6}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={22} size={1} color={dark ? 'rgba(255,255,255,0.07)' : 'rgba(20,24,28,0.06)'} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
