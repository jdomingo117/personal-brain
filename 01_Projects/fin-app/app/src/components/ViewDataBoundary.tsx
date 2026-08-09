import type { ReactNode } from 'react'
import { useData } from '../contexts/DataContext'
import { Grid, Screen, ViewHeader } from './Screen'
import Tile from './Tile'

type Props = { index: string; title: string; sub?: string; children: ReactNode }

export function ViewLoadingState({ index, title, sub }: Omit<Props, 'children'>) {
  return <Screen><ViewHeader index={index} title={title} sub={sub} /><Grid>
    {[1, 2, 3, 4, 5, 6].map((key) => <Tile key={key} className={key < 4 ? 'h-32 animate-pulse' : 'h-52 animate-pulse'}><div className="h-3 w-24 rounded bg-[var(--hair)]" /></Tile>)}
  </Grid></Screen>
}

export default function ViewDataBoundary({ index, title, sub, children }: Props) {
  const { loadState, loadError, isRefreshing, refreshError, refreshData } = useData()

  if (loadState === 'loading') {
    return <ViewLoadingState index={index} title={title} sub={sub} />
  }

  if (loadState === 'error') {
    return <Screen><ViewHeader index={index} title={title} sub={sub} /><Grid><Tile span={3}>
      <div className="py-12 text-center"><p className="text-[15px] font-medium">Financial data is unavailable</p><p className="mt-2 text-[13px] text-muted">{loadError}</p>
        <button type="button" className="mt-4 rounded-md border border-[var(--hair)] px-3 py-2 text-[13px] hover:border-accent" onClick={() => void refreshData()}>Retry</button>
      </div>
    </Tile></Grid></Screen>
  }

  return <>{children}{(isRefreshing || refreshError) && <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border border-[var(--hair)] bg-surface px-4 py-3 text-[13px] shadow-lg" role="status">
    {refreshError ? <><p>{refreshError}</p><button type="button" className="mt-2 font-semibold text-accent" onClick={() => void refreshData()}>Retry</button></> : <p className="text-muted">Refreshing financial data…</p>}
  </div>}</>
}
