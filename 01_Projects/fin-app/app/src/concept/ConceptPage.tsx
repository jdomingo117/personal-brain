import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import SegmentedTabs from '../components/SegmentedTabs'
import PacingList, { type BarComponent, type ZoomMode } from './PacingList'
import OptionBaselineRail from './OptionBaselineRail'
import OptionBulletBand from './OptionBulletBand'
import OptionDivergingDelta from './OptionDivergingDelta'
import OptionRailSparkline from './OptionRailSparkline'
import { fmt, glowColor } from '../data'
import Tile from '../components/Tile'

const ZOOM_TABS = [
  { id: 'accordion', label: 'Accordion' },
  { id: 'drill', label: 'Drill-in' },
]

const CONCEPT_TABS = [
  { id: 'recurring', label: 'Recurring Hub Accounts' },
  { id: 'pacing', label: 'Volatility & Pacing' },
]

const OPTION_TABS = [
  { id: 'A', label: 'Option A: Mock Auto Loan ($380/mo)' },
  { id: 'B', label: 'Option B: CityRail Transit ($32/mo)' },
]

function Key({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {swatch}
      <span className="text-[10px] text-muted">{children}</span>
    </span>
  )
}

/** The app's ThemeToggle reads the router context, which the concept page has no
 *  provider for — so drive the `dark` class directly, same key as index.html. */
function ConceptThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('halcyon-theme', next ? 'dark' : 'light')
    } catch {}
  }
  return (
    <button
      onClick={toggle}
      className="glass rounded-full px-3 py-2 text-[11px] font-semibold text-ink2 transition-colors hover:text-accent cursor-pointer"
      aria-pressed={dark}
    >
      {dark ? 'Light' : 'Dark'}
    </button>
  )
}

const RuleKey = () => <span className="h-[9px] w-px bg-[var(--color-ink)] opacity-60" />
const DashKey = () => (
  <span className="h-[9px] w-px" style={{ background: 'repeating-linear-gradient(var(--color-ink2) 0 2px, transparent 2px 4px)' }} />
)

function OptionCard({
  id, name, blurb, Bar, legend, zoom, pros, cons,
}: {
  id: string
  name: string
  blurb: string
  Bar: BarComponent
  legend: React.ReactNode
  zoom: ZoomMode
  pros: string[]
  cons: string[]
}) {
  return (
    <div className="glass flex flex-col p-5">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[14px] font-bold text-ink">
          <span className="mr-1.5 text-muted">{id}</span>
          {name}
        </h3>
        <span className="text-[11px] uppercase tracking-[0.06em] text-muted">scrollable · 7 categories</span>
      </header>
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted">{blurb}</p>

      <PacingList Bar={Bar} zoom={zoom} legend={legend} />

      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--hair-soft)] pt-3">
        <ul className="space-y-1">
          {pros.map((p) => (
            <li key={p} className="flex gap-1.5 text-[10.5px] leading-snug text-ink2">
              <span className="text-pos">+</span>
              {p}
            </li>
          ))}
        </ul>
        <ul className="space-y-1">
          {cons.map((c) => (
            <li key={c} className="flex gap-1.5 text-[10.5px] leading-snug text-muted">
              <span className="text-neg">−</span>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// Concept Commitments Data mapping for Options demo
interface ConceptCommitment {
  id: string
  label: string
  cat: string
  subcat: string
  amount: number
  cadence: string
  accountA: string
  accountB: string
  charges: string[]
}

const CONCEPT_COMMITMENTS: ConceptCommitment[] = [
  { id: '1', label: 'Rent Transfer', cat: 'Home', subcat: 'Rent', amount: 2100, cadence: 'Monthly', accountA: 'Operations Checking', accountB: 'Operations Checking', charges: ['07.01', '06.01', '05.01'] },
  { id: '2', label: 'Auto-Invest', cat: 'Investing', subcat: 'Auto-invest', amount: 1000, cadence: 'Monthly', accountA: 'Operations Checking', accountB: 'Operations Checking', charges: ['07.08', '06.08', '05.08'] },
  { id: '3', label: 'Vanguard Brokerage', cat: 'Investing', subcat: 'Brokerage', amount: 600, cadence: 'Monthly', accountA: 'Operations Checking', accountB: 'Operations Checking', charges: ['07.09', '06.09', '05.09'] },
  { id: '4', label: 'Helios Energy', cat: 'Bills & utilities', subcat: 'Electricity & gas', amount: 138.20, cadence: 'Monthly', accountA: 'Operations Checking', accountB: 'Operations Checking', charges: ['07.03', '06.03', '05.03'] },
  { id: '5', label: 'Aqua Utility', cat: 'Bills & utilities', subcat: 'Water', amount: 55.10, cadence: 'Monthly', accountA: 'Operations Checking', accountB: 'Operations Checking', charges: ['07.04', '06.04', '05.04'] },
  { id: '6', label: 'CityRail Monthly Pass', cat: 'Transport', subcat: 'Public transport', amount: 32, cadence: 'Monthly', accountA: 'Operations Checking', accountB: 'Auto Loan // Vehicle', charges: ['07.05', '06.05', '05.05'] },
  { id: '7', label: 'Beacon Broadband', cat: 'Bills & utilities', subcat: 'Internet', amount: 79, cadence: 'Monthly', accountA: 'Sapphire Credit Line', accountB: 'Sapphire Credit Line', charges: ['07.11', '06.11', '05.11'] },
  { id: '8', label: 'Nexus Mobile', cat: 'Bills & utilities', subcat: 'Mobile', amount: 45, cadence: 'Monthly', accountA: 'Sapphire Credit Line', accountB: 'Sapphire Credit Line', charges: ['07.12', '06.12', '05.12'] },
  { id: '9', label: 'Nova Stream', cat: 'Lifestyle', subcat: 'Streaming', amount: 15.99, cadence: 'Monthly', accountA: 'Sapphire Credit Line', accountB: 'Sapphire Credit Line', charges: ['07.11', '06.11', '05.11'] },
  { id: '10', label: 'Nimbus Cloud', cat: 'Lifestyle', subcat: 'Software & digital services', amount: 29, cadence: 'Monthly', accountA: 'Sapphire Credit Line', accountB: 'Sapphire Credit Line', charges: ['07.02', '06.02', '05.02'] },
  { id: '11', label: 'Vertex Gym', cat: 'Lifestyle', subcat: 'Memberships', amount: 49, cadence: 'Monthly', accountA: 'Sapphire Credit Line', accountB: 'Sapphire Credit Line', charges: ['06.22', '05.22', '04.22'] },
  { id: '12', label: 'Habitat Insurance', cat: 'Home', subcat: 'Home insurance', amount: 32, cadence: 'Monthly', accountA: 'Sapphire Credit Line', accountB: 'Sapphire Credit Line', charges: ['07.10', '04.10', '01.10'] },
  { id: '13', label: 'Auto Loan Payment', cat: 'Transport', subcat: 'Loan', amount: 380, cadence: 'Monthly', accountA: 'Auto Loan // Vehicle', accountB: '', charges: ['07.15', '06.15', '05.15'] },
]

export default function ConceptPage() {
  const [activeTab, setActiveTab] = useState('recurring')
  const [zoom, setZoom] = useState<ZoomMode>('accordion')

  // Recurring Hub Accounts demo states
  const [selectedOption, setSelectedOption] = useState<'A' | 'B'>('A')
  const [indicatorStyle, setIndicatorStyle] = useState<'tint' | 'coin' | 'bezel'>('tint')
  const [hoveredAccount, setHoveredAccount] = useState<string | null>(null)
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null)

  // Compute account data based on selection
  const commitments = useMemo(() => {
    return CONCEPT_COMMITMENTS.filter(c => {
      if (selectedOption === 'B' && c.id === '13') return false // Skip Auto Loan Payment in Option B
      return true
    })
  }, [selectedOption])

  const accountBreakdown = useMemo(() => {
    const totals = new Map<string, number>()
    commitments.forEach(c => {
      const acc = selectedOption === 'A' ? c.accountA : c.accountB
      totals.set(acc, (totals.get(acc) ?? 0) + c.amount)
    })

    const grandTotal = [...totals.values()].reduce((a, b) => a + b, 0)
    const glowMap: Record<string, 'cyan' | 'amber' | 'red'> = {
      'Operations Checking': 'cyan',
      'Sapphire Credit Line': 'amber',
      'Auto Loan // Vehicle': 'red',
    }

    return [...totals.entries()].map(([name, val]) => ({
      name,
      amount: val,
      percentage: grandTotal > 0 ? (val / grandTotal) * 100 : 0,
      glow: glowMap[name] || 'cyan',
    })).sort((a, b) => b.amount - a.amount)
  }, [commitments, selectedOption])

  // Pacing List layout wrapper
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1220px] px-6 py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-ink2 font-display text-[17px] font-black text-ink">
                H
              </span>
              <h1 className="font-display text-[26px] font-black tracking-tight text-ink">Halcyon Playground</h1>
            </div>
            <p className="mt-1.5 max-w-[640px] text-[12.5px] leading-relaxed text-muted">
              Interactive sandbox to review recommended designs and alternative layouts before they ship in the product.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <SegmentedTabs
              tabs={CONCEPT_TABS}
              active={activeTab}
              onChange={(id) => setActiveTab(id)}
              layoutId="concept-main-tabs"
            />
            <ConceptThemeToggle />
          </div>
        </header>

        {activeTab === 'pacing' ? (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hair-soft)] pb-4">
              <div>
                <h2 className="font-display text-[18px] font-bold text-ink">Category volatility &amp; pacing</h2>
                <p className="text-[12px] text-muted">Compare four bar treatments for category budget pacing.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted">Zoom mode</span>
                <SegmentedTabs
                  tabs={ZOOM_TABS}
                  active={zoom}
                  onChange={(id) => setZoom(id as ZoomMode)}
                  layoutId="concept-zoom"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <OptionCard
                id="A"
                name="Baseline rail"
                blurb="The CapacityMeter you already ship, re-pointed at a rolling baseline. Fill is the category hue up to the baseline rule and red past it, so overspend is the only red on screen. Volatility rides along as a 3-step glyph."
                Bar={OptionBaselineRail}
                zoom={zoom}
                legend={
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
                    <Key swatch={<span className="h-[7px] w-4 rounded-full bg-[var(--cat-2)]" />}>spend</Key>
                    <Key swatch={<RuleKey />}>last period</Key>
                    <Key swatch={<DashKey />}>on-pace</Key>
                    <Key swatch={<span className="flex items-end gap-[2px]">{[3, 6, 9].map((h) => <span key={h} className="w-[3px] rounded-[1px] bg-[var(--color-ink2)]" style={{ height: h }} />)}</span>}>volatility</Key>
                  </div>
                }
                pros={[
                  'Reuses the meter language already in the app',
                  'Lightest ink — scans fastest at 7+ rows',
                  'Red appears only where you actually overspent',
                ]}
                cons={[
                  'Volatility is a glyph you must decode',
                  'Says "more than last period", not "unusual"',
                  'One noisy baseline month skews every row',
                ]}
              />

              <OptionCard
                id="B"
                name="Bullet + volatility band"
                blurb="A Stephen Few bullet. The pale band is the ±1σ normal range across the last 6 periods, so volatility becomes width — a wide band is an unpredictable category. The caret is the projected finish: inside the band is an ordinary period, outside it is the thing worth looking at."
                Bar={OptionBulletBand}
                zoom={zoom}
                legend={
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
                    <Key swatch={<span className="h-[6px] w-4 rounded-[2px] bg-[var(--cat-2)]" />}>spend</Key>
                    <Key swatch={<span className="h-[10px] w-4 rounded-[2px] bg-[var(--hair)]" />}>normal range (±1σ)</Key>
                    <Key swatch={<svg width="7" height="5"><path d="M0,0 L7,0 L3.5,4.5 Z" fill="var(--color-ink2)" /></svg>}>projected finish</Key>
                    <Key swatch={<span className="h-[9px] w-[2px] rounded-full bg-[var(--color-ink)]" />}>last period</Key>
                    <Key swatch={<DashKey />}>on-pace</Key>
                  </div>
                }
                pros={[
                  'Volatility is positional — no glyph to learn',
                  'Answers "is this unusual?", not just "is this more?"',
                  'Band absorbs a freak baseline month',
                ]}
                cons={[
                  'Five marks per row — by far the densest',
                  'σ needs ~6 periods of history to mean anything',
                  'Band + caret are new idioms for the app',
                ]}
              />

              <OptionCard
                id="C"
                name="Diverging delta"
                blurb="Answers a different question: not where you are but where you'll land. Zero is the baseline; bars grow left when the projected finish saves against last period, right when it overshoots. Reads as a % saved ledger."
                Bar={OptionDivergingDelta}
                zoom={zoom}
                legend={
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
                    <Key swatch={<span className="h-[7px] w-4 rounded-sm bg-[var(--color-pos)]" />}>projected saving</Key>
                    <Key swatch={<span className="h-[7px] w-4 rounded-sm bg-[var(--color-neg)]" />}>projected overspend</Key>
                    <Key swatch={<RuleKey />}>baseline</Key>
                  </div>
                }
                pros={[
                  'Direct hit on "% saved" — no mental arithmetic',
                  'Sorting by delta makes the worst row jump out',
                  'Symmetry reads well at a glance',
                ]}
                cons={[
                  'Loses absolute spend — $2 and $2,000 look alike',
                  'Wholly dependent on a projection this early',
                  'Half the track is spent on empty space',
                ]}
              />

              <OptionCard
                id="D"
                name="Rail + sparkline"
                blurb="Option A with the glyph swapped for the actual history — volatility as shape rather than statistic. A flat line is a fixed cost; a jagged one is discretionary. The hollow dot is the current, unfinished period."
                Bar={OptionRailSparkline}
                zoom={zoom}
                legend={
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-1">
                    <Key swatch={<span className="h-[7px] w-4 rounded-full bg-[var(--cat-2)]" />}>spend</Key>
                    <Key swatch={<RuleKey />}>last period</Key>
                    <Key swatch={<DashKey />}>on-pace</Key>
                    <Key swatch={<svg width="16" height="9"><path d="M0,7 L5,3 L10,8 L16,1" fill="none" stroke="var(--color-ink2)" strokeWidth="1.2" /></svg>}>6-period history</Key>
                  </div>
                }
                pros={[
                  'Volatility is legible without a legend',
                  'Shows trend direction, which no other option does',
                  'Sparkline reveals *why* a category is volatile',
                ]}
                cons={[
                  'Eats ~60px of width — the rail gets squeezed',
                  'Two charts per row; busiest at 7 rows',
                  'Sparkline is unreadable at sub-row scale',
                ]}
              />
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* Tab 2: Recurring Hub Accounts */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--hair-soft)] pb-4">
              <div>
                <h2 className="font-display text-[18px] font-bold text-ink">Recurring Outflow Funding Accounts</h2>
                <p className="text-[12px] text-muted">Demonstrates Option A and Option B mapping and breakdown visuals.</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-[11.5px] text-muted font-medium">Select mapping:</span>
                  <SegmentedTabs
                    tabs={OPTION_TABS}
                    active={selectedOption}
                    onChange={(id) => {
                      setSelectedOption(id as 'A' | 'B')
                      setFocusedRowId(null)
                    }}
                    layoutId="option-selector"
                  />
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="text-[11.5px] text-muted font-medium font-semibold text-accent-ink">Style Option:</span>
                  <SegmentedTabs
                    tabs={[
                      { id: 'tint', label: 'Option 1: Data Tint' },
                      { id: 'coin', label: 'Option 2: Monogram Stamp' },
                      { id: 'bezel', label: 'Option 3: Left Bezel' },
                    ]}
                    active={indicatorStyle}
                    onChange={(id) => setIndicatorStyle(id as 'tint' | 'coin' | 'bezel')}
                    layoutId="indicator-selector"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.3fr]">
              {/* Left Column: Visual card */}
              <div className="flex flex-col gap-4">
                <Tile title="Funding accounts breakdown" tag="Monthly run rate">
                  <div className="mb-6 mt-1 select-none">
                    {/* proportion bar graphic */}
                    <div className="flex h-4 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/5 p-0.5 border border-[var(--hair-soft)]">
                      {accountBreakdown.map((acc) => {
                        const isHovered = hoveredAccount === acc.name
                        const isOtherHovered = hoveredAccount !== null && !isHovered
                        return (
                          <div
                            key={acc.name}
                            onMouseEnter={() => setHoveredAccount(acc.name)}
                            onMouseLeave={() => setHoveredAccount(null)}
                            style={{
                              width: `${acc.percentage}%`,
                              background: glowColor[acc.glow],
                            }}
                            className={`h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full cursor-pointer ${
                              isOtherHovered ? 'opacity-30' : 'opacity-100 shadow-[0_0_12px_rgba(var(--color-accent),0.1)]'
                            }`}
                          />
                        )
                      })}
                    </div>

                    {/* legend list */}
                    <div className="mt-5 space-y-3">
                      {accountBreakdown.map((acc) => {
                        const isHovered = hoveredAccount === acc.name
                        const isOtherHovered = hoveredAccount !== null && !isHovered
                        return (
                          <div
                            key={acc.name}
                            onMouseEnter={() => setHoveredAccount(acc.name)}
                            onMouseLeave={() => setHoveredAccount(null)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border border-transparent transition-all duration-200 cursor-pointer ${
                              isHovered
                                ? 'bg-black/[0.03] dark:bg-white/[0.03] border-[var(--hair)]'
                                : isOtherHovered
                                ? 'opacity-35'
                                : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: glowColor[acc.glow], boxShadow: `0 0 6px ${glowColor[acc.glow]}` }}
                              />
                              <span className="text-[12.5px] font-semibold text-ink">{acc.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[12.5px] font-bold text-ink tabular-nums">{fmt(acc.amount)}</span>
                              <span className="ml-2 text-[11px] font-medium text-muted tabular-nums">{Math.round(acc.percentage)}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Tile>

                {/* Pros and cons of Option */}
                <div className="glass p-5">
                  <h3 className="font-display text-[13.5px] font-bold text-ink mb-2">
                    {selectedOption === 'A' ? 'Pros & Cons of Option A (Recommended)' : 'Pros & Cons of Option B'}
                  </h3>
                  <div className="space-y-3 text-[11.5px] leading-relaxed">
                    {selectedOption === 'A' ? (
                      <>
                        <p className="text-ink2">
                          Option A injects a mock **Auto Loan Payment** of `$380.00/mo` directly under `Transport` category to reflect the `Auto Loan // Vehicle` account's share.
                        </p>
                        <ul className="space-y-1">
                          <li className="flex gap-1 text-ink2"><span className="text-pos font-bold">+</span> **Highly realistic**: Perfectly reconciles the Auto Loan debt account in the outflow list with a corresponding fixed charge.</li>
                          <li className="flex gap-1 text-ink2"><span className="text-pos font-bold">+</span> **Visual balance**: Checking pays for Rent/Living ($3,925), credit card pays for Subscriptions ($250), and Auto Loan reflects the vehicle cost ($380).</li>
                          <li className="flex gap-1 text-muted"><span className="text-neg font-bold">−</span> **Synthetic data**: Injects one custom transaction row that is calculated dynamically rather than parsed from the raw statement.</li>
                        </ul>
                      </>
                    ) : (
                      <>
                        <p className="text-ink2">
                          Option B relies purely on existing ledger records and maps the `$32.00/mo` `CityRail` monthly pass to the `Auto Loan // Vehicle` account.
                        </p>
                        <ul className="space-y-1">
                          <li className="flex gap-1 text-ink2"><span className="text-pos font-bold">+</span> **Strictly organic**: Injects no mock data; uses the raw transit pass as the vehicle/transit commitment.</li>
                          <li className="flex gap-1 text-muted"><span className="text-neg font-bold">−</span> **Visual skew**: The Auto Loan account looks tiny and irrelevant ($32/mo vs checking's $3.8k/mo), which contradicts the account's actual liability weight.</li>
                          <li className="flex gap-1 text-muted"><span className="text-neg font-bold">−</span> **Mismatched naming**: Labeling a public transit ticket as the payment for a "Vehicle Loan" account is technically incorrect.</li>
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive directory mockup */}
              <Tile title="Commitments directory (Concept mockup)" tag={`${commitments.length} commitments`}>
                <div className="space-y-2 mt-2 select-none">
                  {commitments.map((c) => {
                    const accName = selectedOption === 'A' ? c.accountA : c.accountB
                    const glowMap: Record<string, string> = {
                      'Operations Checking': 'cyan',
                      'Sapphire Credit Line': 'amber',
                      'Auto Loan // Vehicle': 'red',
                    }
                    const accGlow = glowMap[accName] || 'cyan'

                    const isDimmedByAccountHover = hoveredAccount !== null && hoveredAccount !== accName
                    const isHighlightedByAccountHover = hoveredAccount !== null && hoveredAccount === accName
                    const isFocused = focusedRowId === c.id

                    return (
                      <div
                        key={c.id}
                        onClick={() => setFocusedRowId(isFocused ? null : c.id)}
                        style={{
                          borderLeft: indicatorStyle === 'bezel'
                            ? `3px solid ${glowColor[accGlow as 'cyan' | 'amber' | 'red']}`
                            : undefined
                        }}
                        className={`relative rounded-lg p-2.5 transition-all duration-200 border-t border-[var(--hair-soft)] cursor-pointer ${
                          isFocused && indicatorStyle !== 'bezel'
                            ? 'bg-accent/10 border-l-2 border-accent pl-2'
                            : isHighlightedByAccountHover
                            ? 'bg-black/[0.03] dark:bg-white/[0.03]'
                            : 'border-l border-transparent'
                        } ${isDimmedByAccountHover ? 'opacity-25 scale-[0.98]' : 'opacity-100 scale-100'}`}
                      >
                        <div className="flex items-center justify-between relative z-10">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {/* Option 2: Monogram Stamp */}
                              {indicatorStyle === 'coin' && (
                                <span
                                  style={{
                                    borderColor: `color-mix(in srgb, ${glowColor[accGlow as 'cyan' | 'amber' | 'red']} 40%, transparent)`,
                                    background: `color-mix(in srgb, ${glowColor[accGlow as 'cyan' | 'amber' | 'red']} 8%, transparent)`,
                                    color: glowColor[accGlow as 'cyan' | 'amber' | 'red'],
                                  }}
                                  className="flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[8px] font-black tracking-tighter shrink-0 select-none mr-0.5"
                                >
                                  {accName === 'Operations Checking' ? 'C' : accName === 'Sapphire Credit Line' ? 'S' : 'A'}
                                </span>
                              )}

                              {/* Clean simple status dot for other styles */}
                              {indicatorStyle !== 'coin' && (
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] shrink-0" />
                              )}

                              <span className="text-[12.5px] font-semibold text-ink truncate">{c.label}</span>
                            </div>
                            <div className="mt-0.5 pl-3.5 text-[11px] text-muted">
                              {c.cat} · {c.subcat}
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className="text-[12.5px] font-semibold tabular-nums"
                              style={{
                                color: indicatorStyle === 'tint'
                                  ? glowColor[accGlow as 'cyan' | 'amber' | 'red']
                                  : 'var(--color-ink)'
                              }}
                            >
                              {fmt(c.amount)}
                            </div>
                            <div className="text-[10px] text-muted">{c.cadence}</div>
                          </div>
                        </div>

                        {/* expanded drawer detail */}
                        <AnimatePresence>
                          {isFocused && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2.5 pl-3 border-l border-accent pt-1 text-[11px] space-y-1.5">
                                <div className="text-[9.5px] font-bold uppercase tracking-wider text-muted mb-1">
                                  Recent Ledgers
                                </div>
                                <div className="space-y-0.5">
                                  {c.charges.map((ch, idx) => (
                                    <div key={idx} className="flex justify-between tabular-nums pr-4">
                                      <span className="text-muted">Charge on {ch}</span>
                                      <span className="text-ink font-semibold">{fmt(c.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-[10px] text-muted pt-1">
                                  Funded via: <span className="font-semibold text-ink2">{accName}</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </Tile>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
