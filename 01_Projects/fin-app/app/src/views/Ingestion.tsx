import { useState } from 'react'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import { Button, Chip } from '../components/Controls'
import { useView } from '../router'
import { data } from '../data'

const CATS = ['Food', 'Housing', 'Transit', 'Subs', 'Retail', 'Invest']

export default function Ingestion() {
  const { toast } = useView()
  const [amount, setAmount] = useState('')
  const [merchant, setMerchant] = useState('')
  const [cat, setCat] = useState('Food')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    toast({ title: 'Transaction logged', sub: `${merchant || 'Merchant'} · ${cat} · $${amount || '0'}` })
    setAmount('')
    setMerchant('')
  }

  return (
    <Screen>
      <ViewHeader index="05 — Ingestion" title="Ingestion engine" sub="Log activity & broadcast milestones" />
      <Grid>
        <Tile title="New transaction" span={2}>
          <form onSubmit={submit} className="mt-1 grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="micro text-muted">Amount</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="micro text-muted">Merchant</span>
                <input
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="Titan Market"
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
                />
              </label>
            </div>
            <div className="grid gap-1.5">
              <span className="micro text-muted">Category</span>
              <div className="flex flex-wrap gap-2">
                {CATS.map((c) => (
                  <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                    {c}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <Button type="submit">Log transaction</Button>
            </div>
          </form>
        </Tile>

        <Tile title="Milestone broadcast" tag="simulate">
          <p className="mb-3 text-[12.5px] text-muted">Fire a milestone toast.</p>
          <div className="grid gap-2.5">
            {data.achievements.map((a) => (
              <button
                key={a.id}
                onClick={() => toast({ title: a.title, sub: a.sub })}
                className="rounded-[12px] border border-[var(--hair)] px-4 py-3 text-left transition hover:bg-black/[0.02]"
              >
                <div className="text-[13px] font-semibold">{a.title}</div>
                <div className="text-[11.5px] text-muted">+{a.points} · {a.sub}</div>
              </button>
            ))}
          </div>
        </Tile>
      </Grid>
    </Screen>
  )
}
