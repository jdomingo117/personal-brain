// Pure recurring signal shared by Expenses and the server Budget adapter.
// No account/UI imports, wall clock, AI, monthly totals or database mutations.
import { CADENCES, CADENCE_DAYS, CADENCE_MONTHS, CADENCE_TOLERANCE } from './cadence.ts'
import type { Cadence } from './cadence.ts'
import { ERRATIC_CV, STEADY_CV, cv, mean, median } from './stats.ts'
export interface Charge { transactionId?: string; date: string; amount: number }
type RecurringKind='fixed'|'variable'
type RecurringStatus='active'|'dormant'
export interface Signal { cadence:Cadence; kind:RecurringKind; status:RecurringStatus; confidence:'high'|'medium'|'low'; charges:Charge[]; expected:number; amountCv:number; medianGap:number; conformance:number; lastCharged:string; nextExpected:string; priceChange?:{from:number;to:number;date:string} }
const MIN_OBSERVATIONS=3, MIN_CONFORMANCE=0.6, DORMANT_CYCLES=1.5, CONFIDENT_OBSERVATIONS=6
const parse=(s:string)=>new Date(s+'T00:00:00Z')
const iso=(d:Date)=>d.toISOString().slice(0,10)
const daysBetween=(a:string,b:string)=>Math.round((+parse(b)-+parse(a))/86400000)
export function nextSignalDate(from:string,cadence:Cadence):string {
 const d=parse(from),months=CADENCE_MONTHS[cadence]
 if(!months)return iso(new Date(+d+CADENCE_DAYS[cadence]*86400000))
 const m=d.getUTCMonth()+months,y=d.getUTCFullYear(),last=new Date(Date.UTC(y,m+1,0)).getUTCDate()
 return iso(new Date(Date.UTC(y,m,Math.min(d.getUTCDate(),last))))
}
const expectedFor=(kind:RecurringKind,amounts:number[])=>kind==='fixed'?amounts[amounts.length-1]:mean(amounts)
function detectStepChange(charges: Charge[]): { from: number; to: number; date: string } | null {
  // Prefix/suffix Welford moments keep a price-step scan linear and numerically
  // stable. No repeated segment copies over a merchant's history.
  const moments=(xs:Charge[])=>{
    let n=0,m=0,m2=0
    return xs.map(c=>{n++;const delta=c.amount-m;m+=delta/n;m2+=delta*(c.amount-m);return {mean:m,cv:m>0?Math.sqrt(Math.max(0,m2/n))/m:0}})
  }
  const left=moments(charges),right=moments([...charges].reverse()).reverse()
  for(let split=2;split<=charges.length-2;split++){
    const before=left[split-1],after=right[split]
    if(before.cv>=STEADY_CV||after.cv>=STEADY_CV)continue
    if(Math.abs(after.mean-before.mean)/before.mean<STEADY_CV)continue
    return {from:before.mean,to:after.mean,date:charges[split].date}
  }
  return null
}


export function detectRecurringSignal(input:Charge[],today:string):Signal|null {
  if (input.length < MIN_OBSERVATIONS) return null

  const charges = [...input].sort((a,b) => a.date.localeCompare(b.date))

  const gaps = charges.slice(1).map((c, i) => daysBetween(charges[i].date, c.date))
  const medianGap = median(gaps)

  const cadence = CADENCES.find((c) => Math.abs(medianGap - CADENCE_DAYS[c]) <= CADENCE_TOLERANCE[c])
  if (!cadence) return null // gap sits in a dead zone → genuinely not periodic

  const tol = CADENCE_TOLERANCE[cadence]
  const conformance = gaps.filter((g) => Math.abs(g - CADENCE_DAYS[cadence]) <= tol).length / gaps.length
  if (conformance < MIN_CONFORMANCE) return null

  // A commitment is predictable in AMOUNT as well as in date. Without this, a
  // hardware store visited most months reads as a monthly commitment: the cadence
  // is real, but $45 one month and $210 the next is shopping, not a standing
  // charge. `ERRATIC_CV` is the same threshold the pacing rail bands on.
  const amounts = charges.map((c) => c.amount)
  const amountCv = cv(amounts)
  if (amountCv >= ERRATIC_CV) return null

  let kind: RecurringKind = amountCv < STEADY_CV ? 'fixed' : 'variable'
  // A single price step (e.g. a subscription's one-time price rise) makes
  // the whole run look "variable" by CV alone, losing the more useful signal
  // that this is a fixed cost which changed price once. Only worth checking
  // when the plain CV test didn't already call it fixed.
  let priceChange: Signal['priceChange']
  if (kind === 'variable') {
    const step = detectStepChange(charges)
    if (step) {
      kind = 'fixed'
      priceChange = step
    }
  }
  const lastCharged = charges[charges.length - 1].date
  const silentFor = daysBetween(lastCharged, today)
  const status: RecurringStatus = silentFor > DORMANT_CYCLES * CADENCE_DAYS[cadence] ? 'dormant' : 'active'
  const expected = expectedFor(kind, amounts)


 return {cadence,kind,status,charges,expected,amountCv,medianGap,conformance,lastCharged,nextExpected:nextSignalDate(lastCharged,cadence),priceChange,
 confidence:cadence==='Annual'?(charges.length>=4?'high':'medium'):charges.length>=CONFIDENT_OBSERVATIONS?'high':charges.length>MIN_OBSERVATIONS?'medium':'low'}
}
