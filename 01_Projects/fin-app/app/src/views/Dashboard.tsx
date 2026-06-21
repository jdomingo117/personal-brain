import HeroCard from '../components/HeroCard'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import Stat from '../components/Stat'
import CapacityMeter from '../components/CapacityMeter'
import AllocationDonut from '../components/AllocationDonut'
import Ledger from '../components/Ledger'
import { data, fmt, fmtCents } from '../data'

export default function Dashboard() {
  const inc = data.cashflow.income.at(-1)!
  const spend = data.cashflow.expense.at(-1)!
  const savings = Math.round(((inc - spend) / inc) * 100)
  return (
    <Screen>
      <ViewHeader index="01 — Command" title="Dashboard" sub="Your finances at a glance" />
      <Grid>
        {/* hero morph target */}
        <div className="md:col-span-2">
          <HeroCard variant="tile" />
        </div>

        <Tile title="Standing" tag="Tier 05">
          <Stat label="Rank" value={data.operator.rank.current} small />
          <div className="mt-2 text-[12px] text-muted">
            {fmt(data.operator.rank.toNext)} to {data.operator.rank.next}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-[var(--track)]">
            <div className="h-full rounded bg-accent" style={{ width: `${data.operator.rank.progress * 100}%` }} />
          </div>
        </Tile>

        <Tile>
          <Stat label="Income · cycle" value={fmt(inc)} delta={`+${savings}% savings rate`} small />
        </Tile>
        <Tile>
          <Stat label="Spending · cycle" value={fmt(spend)} delta={`${Math.round((spend / inc) * 100)}% of inflow`} dir="down" small />
        </Tile>
        <Tile>
          <Stat label="Liquid cash" value={fmtCents(data.operator.liquidCash)} delta="2 accounts" small />
        </Tile>

        <Tile title="Budget capacity" tag="this cycle" span={2}>
          {data.shields.slice(0, 4).map((s, i) => (
            <CapacityMeter key={s.category} shield={s} delay={i * 0.05} />
          ))}
        </Tile>
        <Tile title="Allocation">
          <AllocationDonut data={data.allocation} />
        </Tile>

        <Tile title="Recent activity" tag="last 5" span={3}>
          <Ledger rows={data.transactions.slice(0, 5)} />
        </Tile>
      </Grid>
    </Screen>
  )
}
