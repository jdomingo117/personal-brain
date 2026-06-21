import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import Area from '../components/charts/Area'
import Ledger from '../components/Ledger'
import CapacityMeter from '../components/CapacityMeter'
import { data } from '../data'

export default function Expenses() {
  return (
    <Screen>
      <ViewHeader index="04 — Outflow" title="Expenses" sub="Cash flow, ledger & budget capacity" />
      <Grid>
        <Tile title="Cash flow" tag="income vs spending · 12 mo" span={3}>
          <div className="mt-1">
            <Area
              series={[
                { data: data.cashflow.income, color: 'var(--color-pos)', fill: false },
                { data: data.cashflow.expense, color: 'var(--color-neg)' },
              ]}
              labels={data.cashflow.months}
              height={200}
            />
          </div>
        </Tile>
        <Tile title="Recent transactions" tag={`${data.transactions.length}`} span={2}>
          <Ledger rows={data.transactions} />
        </Tile>
        <Tile title="Budget capacity">
          {data.shields.slice(0, 4).map((s, i) => (
            <CapacityMeter key={s.category} shield={s} delay={i * 0.05} />
          ))}
        </Tile>
      </Grid>
    </Screen>
  )
}
