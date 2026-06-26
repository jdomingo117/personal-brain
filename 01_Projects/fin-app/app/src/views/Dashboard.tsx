import { useState } from 'react'
import HeroCard from '../components/HeroCard'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import Stat from '../components/Stat'
import CapacityMeter from '../components/CapacityMeter'
import AllocationDonut from '../components/AllocationDonut'
import Ledger from '../components/Ledger'
import Area from '../components/charts/Area'
import Bar from '../components/charts/Bar'
import { data, fmt, fmtCents, glowColor, type Glow } from '../data'

function getAccountIcon(type: string, name: string) {
  const t = type.toLowerCase()
  const n = name.toLowerCase()

  if (n.includes('car') || n.includes('auto') || n.includes('vehicle')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    )
  }
  if (t === 'debt' || n.includes('credit') || n.includes('card')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
        <line x1="6" x2="10" y1="14" y2="14" />
      </svg>
    )
  }
  if (t === 'invest' || n.includes('ira') || n.includes('fund') || n.includes('vtsax')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="m3 16 4-4 4 4 9-9" />
        <path d="M16 7h4v4" />
      </svg>
    )
  }
  if (t === 'savings' || n.includes('reserve') || n.includes('yield')) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  )
}

export default function Dashboard() {
  const inc = data.cashflow.income.at(-1)!
  const spend = data.cashflow.expense.at(-1)!
  const savings = Math.round(((inc - spend) / inc) * 100)
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')

  return (
    <Screen>
      <ViewHeader index="01 — Command" title="Dashboard" sub="Your finances at a glance" />
      {/* 
        GRID LAYOUT GUIDE:
        - The <Grid> wrapper is defined in 'app/src/components/Screen.tsx'.
        - On desktop, it is a 3-column layout (class 'xl:grid-cols-3').
        - On mobile/tablet, it defaults to a 1-column layout.
      */}
      <Grid>
        {/* 
          Row 1: Three Hero KPI Cards 
          Each card takes up 1 column by default, filling the 3-column row on desktop.
        */}
        <div className="relative">
          <HeroCard variant="tile" />
        </div>

        <Tile>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">30-day income flow</div>
          <div className="mt-2 text-[32px] font-bold tabular-nums tracking-tight">{fmt(inc)}</div>
          <div className="mt-1.5 text-[12.5px] font-semibold text-pos">▲ +4.2% vs last month · {savings}% savings rate</div>
        </Tile>

        <Tile>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">30-day expense flow</div>
          <div className="mt-2 text-[32px] font-bold tabular-nums tracking-tight">{fmt(spend)}</div>
          <div className="mt-1.5 text-[12.5px] font-semibold text-neg">▼ -1.8% vs last month · {Math.round((spend / inc) * 100)}% of inflow</div>
        </Tile>

        {/* 
          Row 2: Custom Flex Layout for Precise Proportions
          - 'md:col-span-2 xl:col-span-3' makes this row span the full width of the grid.
          - 'flex flex-col xl:flex-row' makes the items stack vertically on tablet, and sit side-by-side on desktop.
          - 'gap-3.5' controls the horizontal/vertical spacing between the tiles.
        */}
        <div className="md:col-span-2 xl:col-span-3 flex flex-col xl:flex-row gap-3.5">
          {/* 
            Left Tile Wrapper (Cumulative Net Worth):
            - 'xl:w-[55%]' sets a precise horizontal width proportion (55% on desktop).
            - Change this percentage (e.g. xl:w-[60%]) to adjust the chart card's width.
          */}
          <div className="w-full xl:w-[55%] flex-shrink-0 flex flex-col">
            <Tile
              title="Cumulative net worth"
              tag={
                <div className="flex items-center gap-1.5 -my-1">
                  <button
                    onClick={() => setChartType('line')}
                    className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.06em] uppercase transition ${
                      chartType === 'line'
                        ? 'bg-ink text-surface'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setChartType('bar')}
                    className={`px-2.5 py-0.5 rounded-[5px] text-[10px] font-bold tracking-[0.06em] uppercase transition ${
                      chartType === 'bar'
                        ? 'bg-ink text-surface'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Bar
                  </button>
                </div>
              }
              className="h-full pb-3.5"
            >
              <div className="mt-1">
                {chartType === 'line' ? (
                  <Area key="line" series={[{ data: data.netWorthTrend, color: 'var(--color-accent)' }]} labels={data.cashflow.months} height={240} />
                ) : (
                  <Bar key="bar" series={[{ data: data.netWorthTrend, color: 'var(--color-accent)' }]} labels={data.cashflow.months} height={240} />
                )}
              </div>
            </Tile>
          </div>

          {/* 
            Right Tile Wrapper (Asset Allocation):
            - 'xl:flex-1' makes this tile dynamically take up all remaining horizontal space on desktop (100% - 55% = 45%).
            - Changing the left tile's percentage automatically recalculates this card's width.
          */}
          <div className="w-full xl:flex-1 flex flex-col">
            <Tile title="Asset allocation" className="h-full pb-3.5">
              <AllocationDonut data={data.allocation} />
            </Tile>
          </div>
        </div>

        {/* 
          Row 3: Holdings & Budget Capacity
          - 'Holdings' has no 'span' prop, meaning it defaults to 1 column.
          - 'Budget capacity' has 'span={2}' which translates to 'md:col-span-2' on tablet/desktop.
          - Together they fill the 3 columns (1 + 2 = 3).
        */}
        <Tile title="Holdings" tag={`${data.accounts.length} linked`}>
          <div className="mt-2 grid gap-1.5">
            {data.accounts.map((a) => (
              <div
                key={a.name}
                className="flex items-center gap-3 py-2 px-2.5 -mx-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] rounded-[10px] cursor-pointer transition duration-200"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `color-mix(in srgb, ${glowColor[a.glow as Glow]} 12%, transparent)`,
                    color: glowColor[a.glow as Glow],
                  }}
                >
                  {getAccountIcon(a.type, a.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink truncate">{a.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.06em] text-muted mt-0.5">{a.type}</div>
                </div>
                <div className={`text-[13.5px] font-bold tabular-nums ${a.balance < 0 ? 'text-neg' : 'text-ink'}`}>
                  {fmtCents(a.balance)}
                </div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile title="Budget capacity" tag="this cycle" span={2}>
          {data.shields.slice(0, 4).map((s, i) => (
            <CapacityMeter key={s.category} shield={s} delay={i * 0.05} />
          ))}
        </Tile>

        {/* 
          Row 4: Recent Activity 
          - 'span={3}' translates to 'md:col-span-2 xl:col-span-3', stretching this card across the full width (3 columns) at the bottom.
        */}
        <Tile title="Recent activity" tag="last 5" span={3}>
          <Ledger rows={data.transactions.slice(0, 5)} />
        </Tile>
      </Grid>
    </Screen>
  )
}
