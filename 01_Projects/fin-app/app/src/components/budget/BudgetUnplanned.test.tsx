import {describe,it,expect} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import BudgetUnplanned,{hasUnplanned} from './BudgetUnplanned'
import type {BudgetPresentation} from '../../lib/budgetPresentation'

const known=(cents:number)=>({availability:'known',cents,freshness:'current',coverage:'partial',provisional:false})
const p=(phase:string,unallocated:unknown)=>({phase,income:{expected:known(938141),unallocated}}) as unknown as BudgetPresentation
const render=(pres:BudgetPresentation,ok=false,hasBills=false)=>renderToStaticMarkup(<BudgetUnplanned presentation={pres} ok={ok} setOk={()=>{}} hasBills={hasBills} canWrite onAddBill={()=>{}} onSave={()=>{}} onFindBills={()=>{}}/>)

describe('unplanned pay prompt',()=>{
  it('names the amount, its share of pay, and three plain choices, bills first when there are none',()=>{
    const html=render(p('current',known(586826)))
    expect(html).toContain('$5,868.26 of your pay isn’t planned yet')
    expect(html).toContain('That’s 63% of the $9,381.41 you expect this budget.')
    expect(html).toContain('Your bills first')
    expect(html).toContain('>Add a bill<')
    expect(html).toContain('Find bills in my spending')
    expect(html).toContain('>Save for something<')
    expect(html).toContain('That’s fine for now')
  })
  it('shrinks to one line once the owner keeps it as a buffer',()=>{
    const html=render(p('current',known(586826)),true)
    expect(html).toContain('$5,868.26 kept unplanned as a buffer.')
    expect(html).not.toContain('Add a bill')
  })
  it('stays out of the way when nothing is unplanned, when it is unknown, or for a past budget',()=>{
    expect(render(p('current',known(0)))).toBe('')
    expect(render(p('current',{availability:'unavailable'}))).toBe('')
    expect(render(p('past',known(500)))).toBe('')
    expect(hasUnplanned(p('future',known(1)))).toBe(true)
  })
})
