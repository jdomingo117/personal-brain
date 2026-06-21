import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import Area from '../components/charts/Area'
import ObjectiveRing from '../components/ObjectiveRing'
import { data, fmt, glowColor } from '../data'

export default function Income() {
  return (
    <Screen>
      <ViewHeader index="03 — Inflow" title="Income" sub="Earning streams & savings objectives" />
      <Grid>
        <Tile title="Income streams" tag={`${data.income.length} active`} span={2}>
          {data.income.map((s) => (
            <div key={s.source} className="flex items-center gap-[13px] border-b border-[var(--hair-soft)] py-[13px] last:border-0">
              <span className="h-8 w-[3px] flex-shrink-0 rounded" style={{ background: glowColor[s.glow] }} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{s.source}</div>
                <div className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-muted">{s.cadence}</div>
              </div>
              <div className="text-[15px] font-semibold tabular-nums text-pos">{fmt(s.amount)}</div>
            </div>
          ))}
        </Tile>
        <Tile title="Monthly inflow" tag="12 mo">
          <div className="mt-1">
            <Area series={[{ data: data.cashflow.income, color: 'var(--color-pos)' }]} labels={data.cashflow.months} height={200} />
          </div>
        </Tile>
        <Tile title="Savings objectives" tag="mission tracks" span={3}>
          <div className="flex justify-around gap-4 pt-2">
            {data.objectives.map((o, i) => (
              <ObjectiveRing key={o.name} obj={o} index={i} />
            ))}
          </div>
        </Tile>
      </Grid>
    </Screen>
  )
}
