import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const AddSchema = z.object({
  action: z.literal('add'),
  account_id: z.string().uuid(),
  value: z.string().min(1).max(80),
})
const RemoveSchema = z.object({
  action: z.literal('remove'),
  id: z.string().uuid(),
})
const IdentifierSchema = z.discriminatedUnion('action', [AddSchema, RemoveSchema])

Deno.serve(
  withAuth({ schema: IdentifierSchema }, async (ctx) => {
    if (ctx.body.action === 'remove') {
      const { data, error } = await ctx.db
        .from('account_identifiers')
        .delete()
        .eq('id', ctx.body.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return { success: false }
      await ctx.audit('account_identifier.removed', { identifier_id: data.id })
      return { success: true }
    }

    // Identifiers are matched as digits only. Deriving the kind here prevents
    // a browser from storing an arbitrary lookup key or claiming a stronger
    // identifier type than it supplied.
    const value = ctx.body.value.replace(/\D/g, '')
    if (!value) throw new Error('An identifier must contain at least one digit.')

    const { data: account, error: accountErr } = await ctx.db
      .from('accounts')
      .select('id')
      .eq('id', ctx.body.account_id)
      .maybeSingle()
    if (accountErr) throw accountErr
    if (!account) throw new Error('Account not found.')

    const { data, error } = await ctx.db
      .from('account_identifiers')
      .insert({
        tenant_id: ctx.tenantId,
        account_id: account.id,
        kind: value.length <= 6 ? 'mask' : 'account_number',
        value,
        source: 'user',
      })
      .select('id, account_id, kind, value, source')
      .single()
    if (error) throw error

    await ctx.audit('account_identifier.added', { identifier_id: data.id, account_id: account.id })
    return data
  }),
)
