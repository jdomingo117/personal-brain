import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const DeleteAccountSchema = z.object({
  id: z.string().uuid(),
})

Deno.serve(
  // Destructive: transactions cascade away with the account, so this needs
  // more than plain membership.
  withAuth({ schema: DeleteAccountSchema, requireRole: 'admin' }, async (ctx) => {
    // ON DELETE CASCADE removes the account's transactions with it. RLS scopes
    // the delete to the caller's tenant, so an id belonging to another tenant
    // matches no rows rather than erroring.
    const { data, error } = await ctx.db
      .from('accounts')
      .delete()
      .eq('id', ctx.body.id)
      .select()

    if (error) throw error
    if (!data || data.length === 0) {
      // Identical response whether the account never existed or belongs to
      // someone else — distinguishing them would confirm the id is real.
      return { success: false, error: 'Not found' }
    }

    await ctx.audit('account.deleted', { account_id: ctx.body.id })
    return { success: true }
  }),
)
