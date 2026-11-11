import {useId,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react'
import {addDays,addMonths,dateParts,periodContaining,today,type PeriodConfig} from '../../lib/budget'

const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const monthLabel=new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'})
const dayLabel=new Intl.DateTimeFormat('en-AU',{dateStyle:'full',timeZone:'UTC'})
const rangeLabel=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})
const asUTC=(date:string)=>new Date(`${date}T00:00:00Z`)
const displayDate=(date:string)=>date.split('-').reverse().join('/')
const mondayOffset=(date:string)=>(asUTC(date).getUTCDay()+6)%7

function parseDate(text:string):string {
  const trimmed=text.trim()
  const parts=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  const iso=parts?`${parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`:trimmed
  try{dateParts(iso);return iso}catch{return ''}
}

export default function BudgetStartCalendar({value,config,onChange}:{value:string;config:PeriodConfig;onChange:(date:string)=>void}) {
  const id=useId()
  const localToday=today({now:()=>new Date()},config.timezone)
  const [input,setInput]=useState(()=>displayDate(value))
  const [cursor,setCursor]=useState(()=>parseDate(value)||localToday)
  const [touched,setTouched]=useState(false)
  const focusDay=useRef(false),grid=useRef<HTMLTableElement>(null)
  const first=`${cursor.slice(0,7)}-01`,last=addMonths(first,0,31)
  const offset=mondayOffset(first)
  const cells=Array.from({length:offset+dateParts(last).day},(_,index)=>index<offset?null:addDays(first,index-offset))
  let coverage=''
  if(value)try{
    const period=periodContaining(value,config)
    coverage=rangeLabel.formatRange(asUTC(period.start),asUTC(addDays(period.end,-1)))
  }catch{/* A missing anchor or an out-of-range date has no valid period yet. */}

  useLayoutEffect(()=>{
    if(!focusDay.current)return
    focusDay.current=false
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus()
  },[cursor])

  function choose(date:string){
    setInput(displayDate(date))
    setCursor(date)
    onChange(date)
  }
  function move(event:KeyboardEvent<HTMLButtonElement>,date:string) {
    const offsets:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-mondayOffset(date),End:6-mondayOffset(date)}
    if(!(event.key in offsets)&&event.key!=='PageUp'&&event.key!=='PageDown')return
    event.preventDefault()
    let next:string
    try{
      next=event.key in offsets?addDays(date,offsets[event.key]):addMonths(date,(event.key==='PageUp'?-1:1)*(event.shiftKey?12:1))
    }catch{return}
    if(next!==cursor){focusDay.current=true;setCursor(next)}
  }

  return <div className="budget-start-calendar">
    <label className="field-label" htmlFor={id}>Start with the period containing</label>
    <input id={id} className="budget-calendar-input" type="text" placeholder="DD/MM/YYYY" value={input}
      aria-describedby={`${id}-format ${id}-period`} aria-invalid={touched&&!value}
      onBlur={()=>{setTouched(true);if(value)setInput(displayDate(value))}}
      onChange={event=>{
        const text=event.target.value,date=parseDate(text)
        setInput(text)
        if(date)setCursor(date)
        if(date!==value)onChange(date)
      }}/>
    <p id={`${id}-format`} className={`detail-copy ${touched&&!value?'text-neg':'text-muted'}`}>{touched&&!value?'Enter a valid date in day/month/year order.':'Enter a date (DD/MM/YYYY) or choose a day below.'}</p>
    <div className="budget-calendar-nav">
      <button type="button" aria-label="Previous month" disabled={first==='0001-01-01'} onClick={()=>setCursor(addMonths(cursor,-1))}>‹</button>
      <span id={`${id}-month`} aria-live="polite">{monthLabel.format(asUTC(first))}</span>
      <button type="button" aria-label="Next month" disabled={first==='9999-12-01'} onClick={()=>setCursor(addMonths(cursor,1))}>›</button>
    </div>
    <table ref={grid} className="budget-calendar-grid" role="grid" aria-labelledby={`${id}-month`}>
      <thead><tr>{weekdays.map(day=><th key={day} scope="col" abbr={day}>{day.slice(0,2)}</th>)}</tr></thead>
      <tbody>{Array.from({length:Math.ceil(cells.length/7)},(_,week)=><tr key={week}>
        {Array.from({length:7},(_,column)=>{
          const date=cells[week*7+column]
          return <td key={column} aria-selected={date?date===value:undefined}>{date&&
            <button type="button" data-date={date} tabIndex={date===cursor?0:-1}
              aria-label={dayLabel.format(asUTC(date))} aria-current={date===localToday?'date':undefined}
              onClick={()=>choose(date)} onKeyDown={event=>move(event,date)}>{dateParts(date).day}</button>}
          </td>
        })}
      </tr>)}</tbody>
    </table>
    <p id={`${id}-period`} className="budget-calendar-period" aria-live="polite"><span>Budget covers</span><strong>{coverage||'Choose a valid date and rhythm.'}</strong></p>
  </div>
}
