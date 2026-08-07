import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const AccountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  type: z.enum(['Liquid', 'Savings', 'Invest', 'Debt', 'Credit Card', 'Loan']),
  balance: z.number().int().optional(), // Cents — omitted when a connected account's provider owns it
  currency: z.string().length(3).default('AUD'),
  credit_limit: z.number().int().optional(),
})

Deno.serve(
  withAuth({ schema: AccountSchema }, async (ctx) => {
    const { id, ...fields } = ctx.body

    // user_id and tenant_id are stamped from the verified JWT, never taken
    // from the request body — otherwise a caller could write into another
    // tenant simply by supplying its id.
    const payload = { ...fields, user_id: ctx.user.id, tenant_id: ctx.tenantId }

    if (id) {
      // A connected account's balance is provider-authoritative — strip it
      // from the payload regardless of what the client sent, rather than
      // trust the client to know not to include it (e.g. an unrelated rename
      // would otherwise restate a balance the client no longer owns).
      const { data: connection } = await ctx.db
        .from('account_connections').select('id').eq('account_id', id).maybeSingle()
      if (connection) delete payload.balance

      // No .eq('user_id', ...) needed: RLS scopes the update to the caller's
      // tenant, and a mismatched id simply matches no rows.
      const { data, error } = await ctx.db
        .from('accounts').update(payload).eq('id', id).select().single()
      if (error) throw error
      await ctx.audit('account.updated', { account_id: id })
      return data
    }

    if (payload.balance === undefined) return { error: 'balance is required to create an account.' }

    const { data, error } = await ctx.db
      .from('accounts').insert(payload).select().single()
    if (error) throw error
    await ctx.audit('account.created', { account_id: data.id })
    return data
  }),
)
