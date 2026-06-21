import { useState } from 'react'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import { Switch } from '../components/Controls'
import { useView } from '../router'
import { data } from '../data'

const ACCENTS = [
  { name: 'Mint', accent: '#11b596', ink: '#0a7d67' },
  { name: 'Azure', accent: '#3b6fd4', ink: '#2a52a0' },
  { name: 'Gold', accent: '#c2a24e', ink: '#8a7228' },
  { name: 'Ink', accent: '#15181c', ink: '#15181c' },
]

export default function Settings() {
  const { motionOn, setMotionOn, dark, setDark } = useView()
  const [redact, setRedact] = useState(false)
  const [accent, setAccent] = useState('Mint')

  const pickAccent = (a: (typeof ACCENTS)[number]) => {
    setAccent(a.name)
    document.documentElement.style.setProperty('--color-accent', a.accent)
    document.documentElement.style.setProperty('--color-accent-ink', a.ink)
  }
  const toggleRedact = () => {
    const next = !redact
    setRedact(next)
    document.documentElement.classList.toggle('redacted', next)
  }

  return (
    <Screen>
      <ViewHeader index="⚙ — Configuration" title="Settings" sub="Interface, identity & preferences" />
      <Grid>
        <Tile title="Interface" span={2}>
          <Switch on={dark} onToggle={() => setDark(!dark)} label="Dark mode" />
          <div className="border-t border-[var(--hair-soft)]" />
          <Switch on={motionOn} onToggle={() => setMotionOn(!motionOn)} label="Ambient motion & scene" />
          <div className="border-t border-[var(--hair-soft)]" />
          <Switch on={redact} onToggle={toggleRedact} label="Redact balances" />
        </Tile>

        <Tile title="Accent">
          <div className="flex gap-3 pt-1">
            {ACCENTS.map((a) => (
              <button
                key={a.name}
                onClick={() => pickAccent(a)}
                aria-label={a.name}
                className={`h-9 w-9 rounded-full ring-offset-2 transition ${accent === a.name ? 'ring-2 ring-ink' : ''}`}
                style={{ background: a.accent }}
              />
            ))}
          </div>
          <div className="mt-3 text-[12px] text-muted">{accent}</div>
        </Tile>

        <Tile title="Profile" span={3}>
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-ink text-lg font-semibold text-surface">AM</div>
            <div>
              <div className="text-[16px] font-semibold">{data.operator.callsign}</div>
              <div className="text-[12px] text-muted">Private Wealth · {data.operator.rank.current} tier</div>
            </div>
          </div>
        </Tile>
      </Grid>
    </Screen>
  )
}
