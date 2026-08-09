import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { LIMITS } from '../_shared/rateLimit.ts'
import { runLinkTransfers } from '../_shared/runLinkTransfers.ts'
import { runInvestmentCashLinks } from '../_shared/runInvestmentCashLinks.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const LinkTransfersSchema = z.union([
  z.object({ scope: z.literal('all') }),
  z.object({
    scope: z.literal('window'),
    from: z.string().regex(ISO_DATE),
    to: z.string().regex(ISO_DATE),
  }),
])

Deno.serve(
  withAuth({ schema: LinkTransfersSchema, rateLimit: LIMITS.writePerUser }, async (ctx) => {
    let from: string
    let to: string
    if (ctx.body.scope === 'all') {
      const [{ data: earliest }, { data: latest }] = await Promise.all([
        ctx.db.from('transactions').select('date').order('date', { ascending: true }).limit(1).maybeSingle(),
        ctx.db.from('transactions').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (!earliest || !latest) {
        return { created: 0, kept: 0, removed: 0, auto: 0, suggested: 0, overflowedAmounts: [] }
      }
      from = earliest.date
      to = latest.date
    } else {
      from = ctx.body.from
      to = ctx.body.to
    }

    const [result, investmentCash] = await Promise.all([
      runLinkTransfers(ctx.db, ctx.tenantId, from, to, ctx.body.scope === 'all'),
      runInvestmentCashLinks(ctx.db, ctx.admin(), ctx.tenantId, from, to),
    ])
    await ctx.audit('transfers.linked', {
      from, to, ...result, overflowed_amounts: result.overflowedAmounts.length,
      investment_cash: investmentCash,
    })
    return { ...result, investmentCash }
  }),
)
