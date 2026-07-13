import { ResponsiveSankey } from '@nivo/sankey'
import { buildHierarchy, catColor } from './flowData'

function nivoTheme(dark: boolean) {
  return {
    fontFamily: 'Hanken Grotesk, sans-serif',
    fontSize: 11,
    text: { fill: dark ? '#eef1f4' : '#15181c', fontFamily: 'Hanken Grotesk, sans-serif' },
    labels: { text: { fontWeight: 600 } },
    tooltip: {
      container: {
        background: dark ? '#1c2128' : '#ffffff',
        color: dark ? '#eef1f4' : '#15181c',
        fontSize: 12,
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
      },
    },
  }
}

export default function OptionNivoSankey({ dark }: { dark: boolean }) {
  const { cats, total } = buildHierarchy()

  const nodes: { id: string }[] = [{ id: 'Total outflow' }]
  const links: { source: string; target: string; value: number }[] = []
  const colorById: Record<string, string> = { 'Total outflow': dark ? '#8b95a1' : '#5b636d' }

  cats.forEach((c) => {
    const color = catColor(c.name, dark)
    nodes.push({ id: c.name })
    colorById[c.name] = color
    links.push({ source: 'Total outflow', target: c.name, value: c.total })
    c.subs.forEach((s) => {
      nodes.push({ id: s.name })
      colorById[s.name] = color
      links.push({ source: c.name, target: s.name, value: s.value })
    })
  })

  return (
    <div style={{ height: 470 }}>
      <ResponsiveSankey
        data={{ nodes, links }}
        margin={{ top: 14, right: 160, bottom: 14, left: 110 }}
        align="justify"
        colors={(node: { id: string }) => colorById[node.id] ?? '#888'}
        nodeOpacity={1}
        nodeHoverOthersOpacity={0.25}
        nodeThickness={15}
        nodeSpacing={9}
        nodeBorderWidth={0}
        nodeBorderRadius={3}
        linkOpacity={0.34}
        linkHoverOpacity={0.7}
        linkHoverOthersOpacity={0.06}
        linkContract={2}
        enableLinkGradient
        labelPosition="outside"
        labelOrientation="horizontal"
        labelPadding={8}
        label={(node: { id: string; value: number }) => (node.value >= total * 0.018 ? node.id : '')}
        labelTextColor={dark ? '#eef1f4' : '#15181c'}
        theme={nivoTheme(dark)}
        animate
      />
    </div>
  )
}
