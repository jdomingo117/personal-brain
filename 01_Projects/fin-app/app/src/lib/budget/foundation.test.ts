import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import * as client from './index.ts'
import * as server from '../../../../supabase/functions/_shared/budget/index.ts'
import type { FlexLimit, GoalInput, LineBalance } from './types.ts'

const timezone = 'Australia/Sydney'
const monthly = { frequency: 'monthly' as const, timezone }
const fortnightly = { frequency: 'fortnightly' as const, timezone, anchor: '2026-10-01' }
const line = (id: string, overrides: Partial<LineBalance> = {}): LineBalance => ({ id, kind:'everyday', opening:0, allocation:10000, reallocation:0, usage:0, ...overrides })
const goal = (overrides: Partial<GoalInput> = {}): GoalInput => ({
  target:90000, reserveRemaining:30000, netPurchases:0, contribution:10000, state:'saving',
  asOf:'2026-10-20', schedule:{frequency:'monthly',anchor:'2026-10-01',dayOfMonth:1},
  includedContributionDates:['2026-10-01'], ...overrides,
})

for (const [name, engine] of [['browser',client],['server',server]] as const) describe(`${name} Budget calculation foundation`, () => {
  it.each([NaN, Infinity, -Infinity, .01, Number.MAX_SAFE_INTEGER+1, undefined, null, '100'])('rejects non-cent value %s', value => {
    expect(() => engine.cents(value as number)).toThrow()
  })
  it('retains integer precision at JSON/bigint boundaries and cancellation intermediates', () => {
    expect(engine.aggregateCents('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER)
    expect(engine.sumCents([Number.MAX_SAFE_INTEGER,1,-1])).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => engine.sumCents([Number.MAX_SAFE_INTEGER,1])).toThrow(/supported/)
    expect(() => engine.aggregateCents('9007199254740992')).toThrow()
    expect(() => engine.aggregateCents('1e3')).toThrow()
    expect(() => engine.aggregateCents('1.0')).toThrow()
    expect(engine.fromBigInt(-BigInt(-2147483648))).toBe(2147483648)
    expect(engine.ceilDivide(101,3)).toBe(34)
    expect(engine.ceilDivide(Number.MAX_SAFE_INTEGER,2)).toBe(4503599627370496)
    expect(() => engine.ceilDivide(1,0)).toThrow()
  })
  it.each(['2026-02-29','2026-04-31','2026-13-01','0000-01-01','2026-1-01','2026-10-20T00:00:00Z','not-a-date'])('rejects impossible/non-local date %s', value => {
    expect(() => engine.dateParts(value)).toThrow()
  })
  it('handles century leap years, month ends and preserved desired day', () => {
    expect(engine.addDays('2000-02-28',1)).toBe('2000-02-29')
    expect(engine.addDays('1900-02-28',1)).toBe('1900-03-01')
    expect(engine.addDays('0099-12-31',1)).toBe('0100-01-01')
    expect(engine.addMonths('2024-01-31',1)).toBe('2024-02-29')
    expect(engine.addMonths('2024-02-29',1,31)).toBe('2024-03-31')
    expect(() => engine.addDays('9999-12-31',1)).toThrow()
  })
  it('uses injected timezone-local today across UTC midnight and DST', () => {
    const clock = {now:()=>new Date('2026-10-04T13:30:00Z')}
    expect(engine.today(clock,timezone)).toBe('2026-10-05')
    expect(engine.today(clock,'America/Los_Angeles')).toBe('2026-10-04')
    expect(engine.currentPeriod(clock,fortnightly).start).toBe('2026-10-01')
    expect(() => engine.today(clock,'Invalid/Timezone')).toThrow()
    expect(() => engine.today({now:()=>new Date(NaN)},timezone)).toThrow()
    expect(() => engine.today(clock,'+10:00')).toThrow()
  })
  it('preserves monthly and fortnightly half-open boundaries, including before the anchor', () => {
    expect(engine.periodContaining('2024-02-29',monthly)).toEqual({start:'2024-02-01',end:'2024-03-01',timezone,frequency:'monthly',transition:false})
    expect(engine.periodContaining('2026-10-15',fortnightly).start).toBe('2026-10-15')
    expect(engine.periodContaining('2026-09-30',fortnightly)).toMatchObject({start:'2026-09-17',end:'2026-10-01'})
    const p=engine.periodContaining('2026-10-04',fortnightly)
    expect(engine.daysBetween(p.start,p.end)).toBe(14)
    expect(engine.remainingDays(p,'2026-10-01')).toBe(13)
    expect(engine.remainingDays(p,'2026-10-14')).toBe(0)
    expect(engine.remainingDays(p,'2026-09-01')).toBe(14)
    expect(engine.remainingDays(p,p.end)).toBe(0)
  })
  it('builds contiguous bridge/full windows without prorating or rewriting the current period', () => {
    const current=engine.periodContaining('2026-10-04',fortnightly)
    const saved=JSON.stringify(current)
    const change=engine.frequencyTransition(current,monthly)
    expect(change.initial).toMatchObject({start:'2026-10-15',end:'2026-11-01',transition:true})
    expect(change.continuing).toMatchObject({start:'2026-11-01',end:'2026-12-01',transition:false})
    expect(JSON.stringify(current)).toBe(saved)
    engine.validatePeriod(change.initial)
    const next=engine.frequencyTransition(engine.periodContaining('2026-10-04',monthly),{...fortnightly,anchor:'2026-11-01'})
    expect(next.initial).toMatchObject({start:'2026-11-01',end:'2026-11-15'})
    expect(next.continuing.start).toBe(next.initial.end)
    expect(() => engine.frequencyTransition(current,fortnightly)).toThrow(/anchor/)
    const aligned=engine.frequencyTransition({...current,start:'2026-09-17',end:'2026-10-01'},monthly)
    expect(aligned.initial.transition).toBe(false)
  })
  it('counts actual inclusive contribution dates, clamps month ends without drifting, and excludes counted dates', () => {
    expect(engine.contributionDates({frequency:'monthly',anchor:'2026-01-31',dayOfMonth:31},'2026-01-01','2026-04-30')).toEqual(['2026-01-31','2026-02-28','2026-03-31','2026-04-30'])
    expect(engine.contributionDates({frequency:'fortnightly',anchor:'2026-10-01'},'2026-10-01','2026-10-31',['2026-10-01'])).toEqual(['2026-10-15','2026-10-29'])
    expect(engine.contributionDates({frequency:'monthly',anchor:'2026-10-01',dayOfMonth:1},'2026-10-01','2026-10-15',['2026-10-01'])).toEqual([])
    expect(engine.contributionDates({frequency:'monthly',anchor:'2026-10-15',dayOfMonth:1},'2026-10-01','2026-11-01')).toEqual(['2026-11-01'])
    expect(engine.contributionDates({frequency:'fortnightly',anchor:'9999-12-31'},'9999-12-31','9999-12-31')).toEqual(['9999-12-31'])
    expect(() => engine.contributionDates({frequency:'monthly',anchor:'2026-01-01',dayOfMonth:0},'2026-01-01','2026-02-01')).toThrow()
    expect(() => engine.contributionDates({frequency:'monthly',anchor:'2026-01-01',dayOfMonth:0},'2026-02-01','2026-01-01')).toThrow()
    expect(engine.contributionDates({frequency:'monthly',anchor:'9999-12-31',dayOfMonth:1},'9999-12-01','9999-12-15')).toEqual([])
  })
  it('reconciles the approved resource example, without carried reserves or category children as fresh income', () => {
    expect(engine.resourceSummary(600000,0,[{id:'fixed',kind:'fixed',amount:250000},{id:'reserves',kind:'reserve',amount:50000},{id:'savings',kind:'contribution',amount:100000},{id:'everyday',kind:'everyday',amount:180000}])).toEqual({resources:600000,allocated:580000,unallocated:20000,fundingGap:0})
    expect(engine.resourceSummary(0,100,[{id:'line',kind:'reserve',amount:101}]).fundingGap).toBe(1)
    expect(() => engine.resourceSummary(0,0,[{id:'x',kind:'fixed',amount:1},{id:'x',kind:'fixed',amount:1}])).toThrow(/twice/)
    expect(() => engine.resourceSummary(-1,0,[])).toThrow()
  })
  it('conserves allocation moves, exposes negative usage/carry and does not mutate inputs', () => {
    const a=Object.freeze(line('a',{allocation:40000,usage:35000})), b=Object.freeze(line('b',{allocation:70000,usage:76000}))
    const moved=engine.moveAllocation(a,b,5000)
    expect(engine.lineRemaining(moved.source)).toBe(0)
    expect(engine.lineRemaining(moved.destination)).toBe(-1000)
    expect(engine.sumCents([moved.source.reallocation,moved.destination.reallocation])).toBe(0)
    expect(a.reallocation).toBe(0)
    expect(() => engine.moveAllocation(a,b,5001)).toThrow(/insufficient/)
    expect(() => engine.moveAllocation(a,a,1)).toThrow()
    expect(engine.lineRemaining(line('refund',{opening:-100,usage:-500}))).toBe(10400)
    expect(engine.carryForward(b,true)).toEqual({nextOpening:-6000,priorVariance:-6000})
    expect(engine.carryForward(b,false)).toEqual({nextOpening:0,priorVariance:-6000})
    expect(engine.defaultRollover('reserve')).toBe(true)
    expect(engine.defaultRollover('everyday')).toBe(false)
    expect(engine.defaultRollover('fixed')).toBe(false)
    expect(() => engine.lineRemaining(line('savings',{kind:'contribution'}))).toThrow(/Contributions/)
  })
  it('partitions everyday once and merges removed limits without losing carry or activity', () => {
    const limits:FlexLimit[]=[
      {id:'groceries',scope:{kind:'global',categoryId:'food',subcategoryId:'groceries'},allocation:70000,opening:0,reallocation:0,usage:76000},
      {id:'dining',scope:{kind:'global',categoryId:'food',subcategoryId:'dining'},allocation:40000,opening:0,reallocation:0,usage:35000},
    ]
    const other={opening:0,reallocation:0,usage:40000}
    expect(engine.flexPool(180000,limits,other)).toMatchObject({otherAllocation:70000,otherRemaining:30000,remaining:29000,usage:151000})
    const carried=[{...limits[0],opening:-5000},limits[1]]
    const before=engine.flexPool(180000,carried,other)
    const after=engine.removeFlexLimit(180000,carried,other,'groceries')
    expect(after.pool.remaining).toBe(before.remaining)
    expect(after.pool.opening).toBe(-5000)
    expect(after.pool.usage).toBe(before.usage)
    expect(after.pool.otherAllocation).toBe(140000)
    expect(() => engine.flexPool(1,limits,other)).toThrow(/exceed/)
    expect(() => engine.flexPool(180000,[limits[0],{...limits[1],scope:{kind:'category',categoryId:'food'}}],other)).toThrow(/overlap/)
    expect(() => engine.flexPool(180000,[limits[0],{...limits[1],scope:limits[0].scope}],other)).toThrow(/Duplicate/)
    expect(engine.flexPool(180000,[limits[0],{...limits[1],scope:{kind:'custom',categoryId:'food',customSubcategoryId:'groceries'}}],other).remaining).toBe(29000)
  })
  it('keeps reserve earmarks distinct from recorded savings, and counts refunds once', () => {
    expect(engine.reserveBalance({opening:30000,allocation:10000,reallocation:0,netExpense:25000})).toBe(15000)
    expect(engine.reserveBalance({opening:30000,allocation:10000,reallocation:0,netExpense:20000})).toBe(20000)
    expect(engine.reserveBalance({opening:0,allocation:100,reallocation:0,netExpense:101})).toBe(-1)
    const evidence=[{id:'e1',movementId:'pair',amount:6000,sourceCapacity:10000,kind:'bank-observed' as const,reversed:false},{id:'e2',movementId:'pair',amount:4000,sourceCapacity:10000,kind:'bank-observed' as const,reversed:false}]
    expect(engine.contributionProgress(10000,evidence)).toMatchObject({recorded:10000,outstanding:0,abovePlan:0,bankObserved:10000,userConfirmed:0})
    expect(() => engine.contributionProgress(10000,[evidence[0],{...evidence[1],amount:4001}])).toThrow(/claimed/)
    expect(() => engine.contributionProgress(10000,[evidence[0],evidence[0]])).toThrow(/Duplicate/)
    expect(engine.contributionProgress(10000,[{...evidence[0],reversed:true}]).outstanding).toBe(10000)
    expect(engine.contributionProgress(5000,[{...evidence[0],kind:'user-confirmed'}])).toMatchObject({abovePlan:1000,bankObserved:0,userConfirmed:6000})
  })
  it('calculates the snowboard golden vector using future dates, not monthly/2', () => {
    expect(engine.goalTiming(goal(),'2027-10-20')).toEqual({state:'estimated',contributionsNeeded:6,estimatedDate:'2027-04-01'})
    expect(engine.dueDateFunding(goal(),'2026-12-01')).toMatchObject({dates:['2026-11-01','2026-12-01'],suggestedContribution:30000,shortfall:40000})
    expect(engine.dueDateFunding(goal({asOf:'2026-10-01'}),'2026-10-15')).toMatchObject({state:'due-now',suggestedContribution:null,shortfall:60000})
    expect(engine.dueDateFunding(goal({asOf:'2026-10-01',includedContributionDates:[],schedule:{frequency:'fortnightly',anchor:'2026-10-01'}}),'2026-10-31')).toMatchObject({dates:['2026-10-01','2026-10-15','2026-10-29'],suggestedContribution:20000})
    expect(engine.dueDateFunding(goal({target:30101}),'2026-12-01').suggestedContribution).toBe(51)
  })
  it('retains purchase achievement through partial purchase/refund and does not auto-refill completed goals', () => {
    const partial=goal({reserveRemaining:15000,netPurchases:25000})
    expect(engine.goalProgress(partial)).toMatchObject({coverage:40000,gap:50000})
    expect(engine.goalProgress(goal({...partial,reserveRemaining:20000,netPurchases:20000})).coverage).toBe(40000)
    expect(engine.goalProgress(goal({reserveRemaining:0,netPurchases:90000,state:'purchase-recorded'}))).toMatchObject({targetCoveredInPlan:true,nextContribution:0})
    expect(engine.goalProgress(goal({reserveRemaining:0,netPurchases:40000,state:'purchase-recorded'})).nextContribution).toBe(0)
  })
  it('suppresses invented dates for paused/unpriced/zero/covered/horizon-limited goals', () => {
    expect(engine.goalTiming(goal({target:null}),'2027-01-01').state).toBe('unpriced')
    for(const state of ['draft','paused','purchase-recorded','archived'] as const) expect(engine.goalTiming(goal({state}),'2027-01-01').estimatedDate).toBeNull()
    expect(engine.goalTiming(goal({contribution:0}),'2027-01-01').state).toBe('inactive')
    expect(engine.goalTiming(goal({reserveRemaining:90000}),'2027-01-01')).toEqual({state:'covered',contributionsNeeded:0,estimatedDate:null})
    expect(engine.suggestionGoalTiming(goal({target:200000}))).toMatchObject({state:'beyond-horizon',contributionsNeeded:17,estimatedDate:null})
    expect(engine.goalProgress(goal({reserveRemaining:-1000})).gap).toBe(91000)
  })
  it('property: many periods contain their dates, abut and retain exact local-day lengths', () => {
    for(let n=-800;n<=800;n+=7) {
      const date=engine.addDays('2026-10-01',n)
      for(const config of [monthly,fortnightly]) {
        const p=engine.periodContaining(date,config), next=engine.periodContaining(p.end,config)
        expect(p.start<=date && date<p.end).toBe(true)
        expect(next.start).toBe(p.end)
        engine.validatePeriod(p)
        if(config.frequency==='fortnightly')expect(engine.daysBetween(p.start,p.end)).toBe(14)
      }
    }
  })
  it('property: exact money conservation and no loss on partition removal', () => {
    for(let n=1;n<=250;n++) {
      const a=line('a',{opening:-n,allocation:n*7,usage:n*2}), b=line('b',{allocation:n,usage:n*2})
      const moved=engine.moveAllocation(a,b,n)
      expect(engine.sumCents([engine.lineRemaining(moved.source),engine.lineRemaining(moved.destination)])).toBe(engine.sumCents([engine.lineRemaining(a),engine.lineRemaining(b)]))
      const limits:FlexLimit[]=[{id:'x',scope:{kind:'category',categoryId:'food'},allocation:n,opening:-n,reallocation:0,usage:n*2}]
      const other={opening:n,reallocation:0,usage:-n}
      expect(engine.removeFlexLimit(n*3,limits,other,'x').pool.remaining).toBe(engine.flexPool(n*3,limits,other).remaining)
      const needed=engine.ceilDivide(n*101,7)
      expect(needed*7>=n*101 && (needed-1)*7<n*101).toBe(true)
    }
  })
})

describe('Budget deployment mirror boundary', () => {
  it('keeps every production module byte-identical between browser and server', () => {
    const frontend=resolve(__dirname), backend=resolve(__dirname,'../../../../supabase/functions/_shared/budget')
    const files=readdirSync(frontend).filter(n=>n.endsWith('.ts')&&!n.endsWith('.test.ts')).sort()
    expect(readdirSync(backend).sort()).toEqual(files)
    for(const file of files) {
      const source=readFileSync(resolve(frontend,file),'utf8')
      expect(readFileSync(resolve(backend,file),'utf8'),file).toBe(source)
      expect(source).not.toMatch(/concept\/|localStorage|supabaseClient|new Date\(\)|Date\.now\(/)
    }
  })
})
