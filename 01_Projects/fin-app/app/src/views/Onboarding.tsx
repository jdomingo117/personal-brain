import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabaseClient'
import { useView } from '../router'
import { Button } from '../components/Controls'
import Tile from '../components/Tile'
import { useData } from '../contexts/DataContext'

export default function Onboarding() {
  const { go, toast } = useView()
  const { refreshData } = useData()
  const [step, setStep] = useState(1)
  const [callsign, setCallsign] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountType, setAccountType] = useState('Liquid')
  const [loading, setLoading] = useState(false)
  const [checkingProfile, setCheckingProfile] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('id, callsign').eq('id', user.id).maybeSingle().then(({ data }) => {
          if (data) {
            setCallsign(data.callsign || '')
            // Skip Operator Initialization if they already customized their callsign
            if (data.callsign && !data.callsign.startsWith('Operator-')) {
              setStep(2)
            }
          }
          setCheckingProfile(false)
        })
      } else {
        setCheckingProfile(false)
      }
    })
  }, [])

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const { error } = await supabase.functions.invoke('update-callsign', { body: { callsign } })
      if (error) throw error
      
      setStep(2)
    } catch (err: any) {
      toast({ title: 'Error', sub: err.message })
    } finally {
      setLoading(false)
    }
  }

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase.functions.invoke('upsert-account', {
        body: {
          name: accountName,
          type: accountType,
          balance: 0,
          currency: 'AUD'
        }
      })
      if (error) throw error
      
      toast({ title: 'System booted', sub: 'Welcome to Halcyon' })
      await refreshData()
      go('dashboard')
    } catch (err: any) {
      toast({ title: 'Error', sub: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center p-6"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="w-full max-w-[400px]">
        {checkingProfile && (
          <div className="flex items-center justify-center p-8 text-[13px] text-muted">
            Checking operator status...
          </div>
        )}
        
        {!checkingProfile && step === 1 && (
          <Tile title="Operator Initialization">
            <p className="mb-4 text-[13px] text-muted">Enter your preferred callsign for the terminal.</p>
            <form onSubmit={submitProfile} className="grid gap-4">
              <label className="grid gap-1.5">
                <span className="micro text-muted">Callsign</span>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="e.g. Alex Mercer"
                  required
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
                />
              </label>
              <div className="mt-2">
                <Button type="submit" className="w-full justify-center">
                  {loading ? 'Processing...' : 'Continue'}
                </Button>
              </div>
            </form>
          </Tile>
        )}

        {!checkingProfile && step === 2 && (
          <Tile title="Primary Account Setup">
            <p className="mb-4 text-[13px] text-muted">Create your first ledger account to begin logging transactions.</p>
            <form onSubmit={submitAccount} className="grid gap-4">
              <label className="grid gap-1.5">
                <span className="micro text-muted">Account Name</span>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g. Everyday Checking"
                  required
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] bg-[var(--input-bg)] px-3.5 text-[14px] outline-none focus:border-accent focus:ring-4 focus:ring-[var(--accent-wash)]"
                />
              </label>
              
              <label className="grid gap-1.5">
                <span className="micro text-muted">Account Type</span>
                <select 
                  value={accountType} 
                  onChange={e => setAccountType(e.target.value)}
                  className="min-h-[46px] rounded-[10px] border border-[var(--hair)] px-3 text-[14px]"
                >
                  <option value="Liquid">Liquid (Checking/Cash)</option>
                  <option value="Savings">Savings</option>
                  <option value="Invest">Investment</option>
                  <option value="Debt">Debt (Credit Card/Loan)</option>
                </select>
              </label>

              <div className="mt-2">
                <Button type="submit" className="w-full justify-center">
                  {loading ? 'Initializing...' : 'Initialize Ledger'}
                </Button>
              </div>
            </form>
          </Tile>
        )}
      </div>
    </motion.div>
  )
}
