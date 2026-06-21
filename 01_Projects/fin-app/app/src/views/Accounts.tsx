import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import Area from '../components/charts/Area'
import AllocationDonut from '../components/AllocationDonut'
import AccountRow from '../components/AccountRow'
import { data } from '../data'

export default function Accounts() {
  return (
    <Screen>
      <ViewHeader index="02 — Wealth" title="Accounts" sub="Holdings, allocation & trajectory" />
      <Grid>
        <Tile title="Net worth trajectory" tag="12 months" span={2}>
          <div className="mt-1">
            <Area series={[{ data: data.netWorthTrend, color: 'var(--color-accent)' }]} labels={data.cashflow.months} height={220} />
          </div>
        </Tile>
        <Tile title="Allocation">
          <AllocationDonut data={data.allocation} />
        </Tile>
        <Tile title="Linked accounts" tag={`${data.accounts.length} linked`} span={3}>
          {data.accounts.map((a) => (
            <AccountRow key={a.name} acct={a} />
          ))}
        </Tile>
      </Grid>
    </Screen>
  )
}
