import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import OskoLinker from '../components/OskoLinker'
import { Button } from '../components/Controls'
import { useView } from '../router'

/** Dedicated decision inbox for bank-to-bank and bank-to-investment movements.
 * Statement import deliberately lives elsewhere: this page can be revisited
 * whenever the rail badge reports pending work, without carrying upload state. */
export default function TransferReview() {
  const { go } = useView()

  return (
    <Screen>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ViewHeader
          index="06 — Reconciliation"
          title="Transfer review"
          sub="Resolve movements between accounts without distorting income or spending"
        />
        <div className="pt-1.5">
          <Button variant="ghost" onClick={() => go('ingestion')}>Import a statement</Button>
        </div>
      </div>
      <Grid>
        <Tile title="Reconciliation inbox" tag="Decisions update analytics" span={3} className="workflow-surface">
          <OskoLinker />
        </Tile>
      </Grid>
    </Screen>
  )
}
