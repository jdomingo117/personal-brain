import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const EmptySchema = z.object({}).strict()

Deno.serve(
  withAuth({ schema: EmptySchema, requireRole: 'owner' }, async (ctx) => {
    const { data, error } = await ctx.db
      .from('profiles')
      .update({ deletion_scheduled_at: null })
      .eq('id', ctx.user.id)
      .not('deletion_scheduled_at', 'is', null)
      .select('id')
      .maybeSingle()
    if (error) throw error

    if (data) await ctx.audit('account.deletion_cancelled')
    return { success: true, restored: !!data }
  }),
)
