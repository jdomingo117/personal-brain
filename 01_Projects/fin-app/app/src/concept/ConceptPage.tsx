import { useState } from 'react'
import OptionReactFlow from './OptionReactFlow'
import OptionNivoSankey from './OptionNivoSankey'
import OptionNivoSunburst from './OptionNivoSunburst'
import { buildHierarchy, fmtUsd } from './flowData'

const OPTIONS = [
  {
    n: 'A',
    name: 'React Flow — interactive node canvas',
    lib: '@xyflow/react',
    desc: 'Drag, zoom and pan a live canvas. Edges animate and thicken with spend; click a category to expand its sub-categories. Best if you want an explorable, playful diagram.',
    render: (dark: boolean) => <OptionReactFlow dark={dark} />,
  },
  {
    n: 'B',
    name: 'Sankey — proportional flow ribbons',
    lib: '@nivo/sankey',
    desc: 'The classic money-flow. Ribbon width = dollars, Total → category → sub-category, all at once. Hover to trace a strand. Best for a precise, information-dense read.',
    render: (dark: boolean) => <OptionNivoSankey dark={dark} />,
  },
  {
    n: 'C',
    name: 'Sunburst — radial hierarchy',
    lib: '@nivo/sunburst',
    desc: 'Concentric rings — categories inner, sub-categories outer; angle = dollars. Click a wedge to zoom in, click centre to zoom out. Compact and striking. Best as a space-efficient centrepiece.',
    render: (dark: boolean) => <OptionNivoSunburst dark={dark} />,
  },
]

export default function ConceptPage() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const { cats, total } = buildHierarchy()

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('halcyon-theme', next ? 'dark' : 'light')
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-surface)' }} className="text-ink">
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent-ink">Concept · Expenses</div>
            <h1 className="font-display text-[34px] font-black tracking-[-0.02em]">Outflow → Category → Sub-category</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              Three interactive, library-driven takes on the spending flow. Same data
              {' '}(<span className="tabular-nums">{fmtUsd(total)}</span> across {cats.length} categories, all-time). Pick one to build into the Expenses page.
            </p>
          </div>
          <button
            onClick={toggle}
            className="rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-black/[0.03]"
          >
            {dark ? '☀︎ Light' : '☾ Dark'}
          </button>
        </header>

        <div className="grid gap-6">
          {OPTIONS.map((o) => (
            <section key={o.n} className="glass rounded-[20px] p-5 md:p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] border border-accent bg-[var(--accent-wash)] font-display text-[15px] font-bold text-accent-ink">
                    {o.n}
                  </span>
                  <div>
                    <h2 className="font-display text-[17px] font-bold text-ink">{o.name}</h2>
                    <p className="mt-1 max-w-[720px] text-[12.5px] leading-relaxed text-muted">{o.desc}</p>
                  </div>
                </div>
                <code className="rounded-[7px] bg-[var(--hair-soft)] px-2 py-1 text-[11px] font-semibold text-ink2">{o.lib}</code>
              </div>
              <div className="rounded-[14px] border border-[var(--hair-soft)] bg-[var(--glass-fill)]">
                {o.render(dark)}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-8 text-center text-[12px] text-muted">
          Standalone concept page · not linked from the app · once you choose, I'll build it into Expenses ▸ Analytics.
        </p>
      </div>
    </div>
  )
}
