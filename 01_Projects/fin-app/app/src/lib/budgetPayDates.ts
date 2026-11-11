import {addDays,addMonths,dateParts,daysBetween} from './budget'

export type PayPattern={cadence:'weekly'|'fortnightly'|'monthly';last_paid:string;dates:string[]}

/**
 * Suggests expected pay dates inside [start, end) from dated earned-income
 * receipts. Only receipts of at least half the largest one count as pay, so
 * small credits (interest, refunds) don't set the rhythm. Needs three such
 * receipts with a steady weekly, two-weekly or monthly gap; otherwise null and
 * the owner enters dates. A suggestion only, always shown and editable.
 */
export function suggestPayDates(receipts:{date:string;income_cents:number}[],start:string,end:string):PayPattern|null{
  dateParts(start);dateParts(end)
  const largest=Math.max(0,...receipts.map(r=>r.income_cents))
  if(largest<=0)return null
  const pay=[...new Set(receipts.filter(r=>r.income_cents*2>=largest).map(r=>r.date))].sort()
  if(pay.length<3)return null
  const gaps=pay.slice(1).map((d,i)=>daysBetween(pay[i],d)).sort((a,b)=>a-b)
  const gap=gaps[Math.floor(gaps.length/2)]
  const steady=(lo:number,hi:number)=>gaps.filter(g=>g>=lo&&g<=hi).length*3>=gaps.length*2
  const last=pay[pay.length-1]
  const dates:string[]=[]
  if(gap>=6&&gap<=8&&steady(6,8)||gap>=13&&gap<=15&&steady(13,15)){
    const step=gap<=8?7:14
    for(let d=addDays(last,step),i=0;d<end&&i<400;d=addDays(d,step),i++)if(d>=start)dates.push(d)
    return {cadence:step===7?'weekly':'fortnightly',last_paid:last,dates}
  }
  if(gap>=27&&gap<=33&&steady(26,34)){
    const day=dateParts(last).day
    for(let k=1;k<400;k++){const d=addMonths(last,k,day);if(d>=end)break;if(d>=start)dates.push(d)}
    return {cadence:'monthly',last_paid:last,dates}
  }
  return null
}
