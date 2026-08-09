import { useState } from 'react'
import { Screen, ViewHeader, Grid } from '../components/Screen'
import Tile from '../components/Tile'
import { Button, Switch } from '../components/Controls'
import { useView } from '../router'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import {
  PasswordCard, EmailCard, SessionsCard, DangerZoneCard,
} from '../components/AccountSecurity'
import AuditLogCard from '../components/AuditLogCard'

const ACCENTS = [
  { name: 'Mint', accent: '#11b596', ink: '#0a7d67' },
  { name: 'Azure', accent: '#3b6fd4', ink: '#2a52a0' },
  { name: 'Gold', accent: '#c2a24e', ink: '#8a7228' },
  { name: 'Ink', accent: '#15181c', ink: '#15181c' },
]

export default function Settings() {
  const { motionOn, setMotionOn, dark, setDark, toast } = useView()
  const { profile, isAdmin, refreshData } = useData()
  const { user, signOut: doSignOut } = useAuth()
  const [redact, setRedact] = useState(false)
  const [accent, setAccent] = useState('Mint')
  
  const [editingCallsign, setEditingCallsign] = useState(false)
  const [newCallsign, setNewCallsign] = useState(profile.callsign)
  const [isSaving, setIsSaving] = useState(false)

  const saveCallsign = async () => {
    if (!newCallsign.trim() || newCallsign === profile.callsign) {
      setEditingCallsign(false)
      return
    }
    setIsSaving(true)
    const { error } = await supabase.functions.invoke('update-callsign', { body: { callsign: newCallsign } })
    if (error) toast({ title: 'Error updating callsign', sub: error.message })
    else await refreshData()
    setIsSaving(false)
    setEditingCallsign(false)
  }

  const initials =
    profile.callsign
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '—'

  // AuthContext revokes every refresh token for this user (scope: 'global')
  // and clears state; the route guards then redirect to /login.
  const signOut = () => doSignOut()

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
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl bg-ink text-lg font-semibold text-surface">
                {initials}
              </div>
              <div className="flex flex-col gap-1 min-w-[200px]">
                {editingCallsign ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCallsign}
                      onChange={(e) => setNewCallsign(e.target.value)}
                      className="bg-[var(--input-bg)] border border-[var(--hair)] rounded px-2 py-1 text-[16px] font-semibold text-ink outline-none focus:border-accent flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveCallsign()
                        if (e.key === 'Escape') setEditingCallsign(false)
                      }}
                      disabled={isSaving}
                    />
                    <button 
                      onClick={saveCallsign} 
                      disabled={isSaving}
                      className="text-[12px] font-bold text-accent hover:opacity-80 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <div className="text-[16px] font-semibold">{profile.callsign}</div>
                    <button 
                      onClick={() => { setNewCallsign(profile.callsign); setEditingCallsign(true); }}
                      className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-ink"
                      aria-label="Edit callsign"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                    </button>
                  </div>
                )}
                <div className="text-[12px] text-muted">
                  {user?.email ?? 'Private Wealth'} · {isAdmin ? <span className="font-medium text-accent">Admin</span> : 'Member tier'}
                </div>
              </div>
            </div>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Tile>

        <PasswordCard />
        <EmailCard />
        <SessionsCard />
        {isAdmin && <AuditLogCard />}
        <DangerZoneCard />
      </Grid>
    </Screen>
  )
}
