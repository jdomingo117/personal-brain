import { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import SceneBackground from '../../three/SceneBackground'
import ThemeToggle from '../../components/ThemeToggle'
import { ViewContext, useView } from '../../router'
import '../../index.css'
import './concept.css'

const destinations = ['Dashboard', 'Accounts', 'Income', 'Expenses', 'Budget', 'Ledger']
const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const allowance = 1200
const recorded = 715.4
const estimated = 1042
const pending = 62
const layouts = {
  tiles: { label: 'Original tiles', note: 'A glass overview and a separate tile for upcoming items.' },
  statement: { label: 'Statement', note: 'One quiet glass surface for the overview, with upcoming items in ruled rows.' },
  open: { label: 'Open overview', note: 'The amount and forecast sit directly on the softened scene, separated from the details by rules.' },
}

function Concept() {
  const parent = useView()
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [quiet, setQuiet] = useState(true)
  const [layout, setLayout] = useState<keyof typeof layouts>('statement')

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])

  return <ViewContext.Provider value={{ ...parent, view: 'budget', dark, setDark }}>
    <SceneBackground view="budget" dark={dark} quiet={quiet} />
    <div className="ambient-shell">
      <header className="ambient-masthead"><span>HALCYON</span><span>Design concept · Sample figures</span></header>
      <div className="ambient-frame">
        <aside className="ambient-rail" aria-label="Halcyon workspace">
          {destinations.map((name, index) => <div key={name} className={name === 'Budget' ? 'ambient-current' : undefined}>
            <span aria-hidden="true">0{index + 1}</span><span>{name}</span>
          </div>)}
        </aside>
        <main className="ambient-scroll" aria-label="Budget concept preview" tabIndex={0}>
          <div className="ambient-content" data-layout={layout}>
            <header className="ambient-title">
              <div><p className="ambient-kicker">05 · Budget</p><h1>Budget</h1><p>1–30 November · Monthly plan</p></div>
              <fieldset className="ambient-choices">
                <legend>Background</legend>
                <button type="button" aria-pressed={!quiet} onClick={() => setQuiet(false)}>Shared</button>
                <button type="button" aria-pressed={quiet} onClick={() => setQuiet(true)}>Softened</button>
              </fieldset>
            </header>
            <fieldset className="ambient-choices ambient-layout-choices" aria-describedby="layout-note">
              <legend>Layout</legend>
              {(Object.keys(layouts) as (keyof typeof layouts)[]).map(option => <button
                key={option} type="button" aria-pressed={layout === option} onClick={() => setLayout(option)}
              >{layouts[option].label}</button>)}
            </fieldset>
            <p className="ambient-layout-note" id="layout-note">{layouts[layout].note}</p>
            <p className="ambient-section-label">Overview</p>
            <section className="glass ambient-hero" aria-labelledby="remaining-label">
              <div>
                <h2 id="remaining-label" className="ambient-kicker">Everyday spending left</h2>
                <p className="ambient-amount">{money.format(allowance - recorded)}</p>
                <p className="ambient-secondary">Of your {money.format(allowance)} allowance</p>
                <div className="ambient-estimate">
                  <div><h3>Estimated everyday spending</h3><strong>{money.format(estimated)}</strong></div>
                  <div className="ambient-meter" aria-hidden="true">
                    <span style={{ width: `${recorded / allowance * 100}%` }} />
                    <span style={{ width: `${(estimated - recorded) / allowance * 100}%` }} />
                  </div>
                  <p>{money.format(recorded)} recorded · {money.format(pending)} pending separately</p>
                </div>
              </div>
              <div className="ambient-next">
                <p className="ambient-kicker">Your next step</p>
                <h3>Check pending charges</h3>
                <p>There’s {money.format(pending)} pending. Take a look before relying on your remaining allowance.</p>
                <details><summary>See pending charges</summary><p>Groceries · {money.format(42)}<br />Transport · {money.format(20)}</p></details>
              </div>
            </section>
            <section className="workflow-surface ambient-detail" aria-labelledby="plan-label">
              <h2 id="plan-label">Coming up</h2>
              <dl>
                <div><dt>Internet bill</dt><dd><small>18 November</small><strong>{money.format(79)}</strong></dd></div>
                <div><dt>Weekend away</dt><dd><small>Planned contribution</small><strong>{money.format(100)}</strong></dd></div>
              </dl>
            </section>
          </div>
        </main>
      </div>
      <footer className="ambient-dock"><ThemeToggle docked /></footer>
    </div>
  </ViewContext.Provider>
}

createRoot(document.getElementById('root')!).render(<Concept />)
