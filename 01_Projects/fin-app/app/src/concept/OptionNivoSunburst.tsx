import { ResponsiveSunburst } from '@nivo/sunburst'
import { buildHierarchy, catColor, fmtUsd } from './flowData'

type Datum = { name: string; color?: string; value?: number; children?: Datum[] }

function nivoTheme(dark: boolean) {
  return {
    fontFamily: 'Hanken Grotesk, sans-serif',
    fontSize: 11,
    text: { fill: dark ? '#eef1f4' : '#15181c', fontFamily: 'Hanken Grotesk, sans-serif' },
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

export default function OptionNivoSunburst({ dark }: { dark: boolean }) {
  const { cats } = buildHierarchy()
  const data: Datum = {
    name: 'Total',
    children: cats.map((c) => ({
      name: c.name,
      color: catColor(c.name, dark),
      children: c.subs.map((s) => ({ name: s.name, value: s.value })),
    })),
  }

  return (
    <div style={{ height: 470 }}>
      <ResponsiveSunburst
        data={data}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        id="name"
        value="value"
        cornerRadius={3}
        borderWidth={dark ? 1.5 : 2}
        borderColor={dark ? '#181c22' : '#eceef1'}
        colors={(node: { data: Datum }) => node.data.color ?? '#888'}
        inheritColorFromParent
        childColor={{ from: 'color', modifiers: [['brighter', dark ? 0.35 : 0.5]] }}
        enableArcLabels
        arcLabel="id"
        arcLabelsSkipAngle={11}
        arcLabelsTextColor={{ from: 'color', modifiers: [['darker', dark ? -2.2 : 2.4]] }}
        theme={nivoTheme(dark)}
        tooltip={({ id, value, percentage, color }: any) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: dark ? '#1c2128' : '#fff', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.22)', fontFamily: 'Hanken Grotesk, sans-serif', fontSize: 12, color: dark ? '#eef1f4' : '#15181c' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
            <strong>{id}</strong> {fmtUsd(value)} · {percentage.toFixed(1)}%
          </div>
        )}
        motionConfig="gentle"
        transitionMode="pushIn"
      />
    </div>
  )
}
