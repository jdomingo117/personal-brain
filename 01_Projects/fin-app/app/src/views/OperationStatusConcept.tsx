import { useState } from 'react'
import { Button, Chip } from '../components/Controls'
import { BackgroundOperationNotice, InlineActivity, OperationProgress, OperationStatusPanel, OperationSteps } from '../components/OperationStatus'
import { Grid, Screen, ViewHeader } from '../components/Screen'
import Tile from '../components/Tile'
import type { OperationStep } from '../lib/operationStatus'

type RecommendedState = 'working' | 'ready' | 'error'

const reviewSteps: OperationStep[] = [
  { id: 'protect', label: 'Protecting manual, bank and reconciled classifications', state: 'complete' },
  { id: 'review', label: 'Reviewing merchant groups', detail: 'Group 1 of 3', state: 'current' },
  { id: 'ready', label: 'Preparing suggestions for your review', state: 'upcoming' },
]

function RecommendedPanel({ state }: { state: RecommendedState }) {
  if (state === 'ready') {
    return <OperationStatusPanel state="succeeded" title="Suggestions ready" description="42 changes suggested · 18 protected · 7 unresolved. Nothing has been changed." />
  }

  if (state === 'error') {
    return <OperationStatusPanel state="failed" title="Couldn’t prepare suggestions" description="Your transactions are unchanged. Check the connection and try the preview again." action={<Button className="!min-h-10" onClick={() => undefined}>Try preview again</Button>} />
  }

  return (
    <OperationStatusPanel state="working" title="Preparing your review" description="Checking 500 eligible transactions. This is a preview only—no transaction changes are being made.">
      <OperationSteps steps={reviewSteps} label="Review preparation stages" />
      <div className="mt-4"><OperationProgress label="Merchant groups reviewed" progress={{ kind: 'determinate', current: 1, total: 3 }} detail="One of three bounded merchant groups is complete." /></div>
    </OperationStatusPanel>
  )
}

export default function OperationStatusConcept() {
  const [recommendedState, setRecommendedState] = useState<RecommendedState>('working')
  const [backgroundActive, setBackgroundActive] = useState(true)

  return (
    <Screen>
      <div className="mx-auto max-w-[1320px] px-1 pb-12 pt-2 sm:px-3">
        <ViewHeader index="LAB — FEEDBACK" title="Operation status patterns" sub="A review page for loading, progress and completion feedback. These are visual concepts only; no operation runs here." />

        <section className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
          <Tile title="Recommended · staged foreground progress" tag="use for engine review, import and reconciliation" className="!p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hair-soft)] pb-5">
              <div><p className="control-label">Categorisation-review preview</p><p className="mt-1 detail-copy">Uses honest work units and calm status changes—not an invented percentage.</p></div>
              <div className="flex flex-wrap gap-2" aria-label="Preview state">
                <Chip active={recommendedState === 'working'} onClick={() => setRecommendedState('working')}>Working</Chip>
                <Chip active={recommendedState === 'ready'} onClick={() => setRecommendedState('ready')}>Ready</Chip>
                <Chip active={recommendedState === 'error'} onClick={() => setRecommendedState('error')}>Error</Chip>
              </div>
            </div>
            <div className="mt-5"><RecommendedPanel state={recommendedState} /></div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--hair-soft)] pt-4 detail-copy"><span><b className="text-ink2">Why it is recommended:</b> evidence of work, meaningful scope and a clear no-write promise.</span><span><b className="text-ink2">Best when:</b> the user must wait for a result before deciding.</span></div>
          </Tile>

          <Tile title="Pattern selector" tag="decision guide" className="!p-6">
            <div className="grid gap-4">
              <PatternRule delay="Under 2 seconds" title="Inline activity" detail="Keep feedback on the initiating control. Do not interrupt reading with a panel." />
              <PatternRule delay="2–10 seconds or unknown" title="Activity + named stage" detail="Show the active region, explain the current safe operation and retain a stable layout." recommended />
              <PatternRule delay="Long or countable work" title="Real progress or completed steps" detail="Use rows, files, merchant groups or server checkpoints—not estimated percentages." recommended />
              <PatternRule delay="Background-safe work" title="Persistent activity status" detail="Let people continue elsewhere, with a visible completion or failure outcome." />
            </div>
          </Tile>
        </section>

        <Grid>
          <Tile title="Short write" tag="inline activity">
            <p className="body-copy">For a normal save or undo, the button itself carries the feedback. The surrounding form stays stable.</p>
            <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-5 py-3 text-[12px] font-bold uppercase tracking-[0.1em] text-surface"><InlineActivity label="Saving change" size="compact" />Saving change</button><span className="detail-copy">No separate overlay needed.</span></div>
          </Tile>

          <Tile title="Countable import" tag="determinate progress">
            <p className="body-copy">Use a true measure whenever the system knows it. Here, the completed-row count is the progress—not a cosmetic animation.</p>
            <div className="mt-5 outcome-panel"><OperationProgress label="Validating statement rows" progress={{ kind: 'determinate', current: 1248, total: 2000 }} detail="1,248 of 2,000 rows complete · no data has been written yet." /><div className="mt-5 border-t border-[var(--hair-soft)] pt-5"><OperationProgress label="Committing the import atomically" progress={{ kind: 'indeterminate' }} detail="The server does not expose a row checkpoint here, so this stays an honest named activity state." /></div></div>
          </Tile>

          <Tile title="Background sync" tag="persistent status">
            <p className="body-copy">Use this when it is safe for the person to keep navigating while a provider or long-running task continues.</p>
            <div className="mt-5"><BackgroundOperationNotice state={backgroundActive ? 'working' : 'succeeded'} title={backgroundActive ? 'Account sync in progress' : 'Account sync complete'} detail={backgroundActive ? 'Macquarie Savings · checkpoint 4 of 7 saved' : '18 new transactions checked · no action needed'} action={<button type="button" onClick={() => setBackgroundActive((active) => !active)} className="min-h-10 rounded-lg border border-[var(--hair)] px-3 text-[12px] font-semibold text-ink">{backgroundActive ? 'Show complete' : 'Replay'}</button>} /></div>
          </Tile>
        </Grid>

        <Tile title="Shared rules for every waiting state" tag="trust and accessibility" span={3} className="mt-3.5 !p-6">
          <div className="grid gap-5 md:grid-cols-3">
            <Rule title="Show the system heard the action" detail="Change the initiating control immediately, then show a nearby status surface only if the wait persists." />
            <Rule title="Describe work, not magic" detail="Name the actual stage—validating, protecting decisions, matching, writing, or syncing. Never fake a percentage." />
            <Rule title="Finish visibly and accessibly" detail="Use semantic progress/status roles, announce completion without moving focus, and provide a static reduced-motion equivalent." />
          </div>
        </Tile>
      </div>
    </Screen>
  )
}

function PatternRule({ delay, title, detail, recommended = false }: { delay: string; title: string; detail: string; recommended?: boolean }) {
  return <div className={`rounded-xl border p-4 ${recommended ? 'border-accent/50 bg-[var(--accent-wash)]' : 'border-[var(--hair)] bg-[var(--input-bg)]'}`}><div className="flex items-center justify-between gap-3"><p className="micro text-muted">{delay}</p>{recommended && <span className="rounded-full border border-accent/35 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-accent-ink">Recommended</span>}</div><p className="mt-2 control-label">{title}</p><p className="mt-2 detail-copy">{detail}</p></div>
}

function Rule({ title, detail }: { title: string; detail: string }) {
  return <div><p className="control-label">{title}</p><p className="mt-2 body-copy">{detail}</p></div>
}
