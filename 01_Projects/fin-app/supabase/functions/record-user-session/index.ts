import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const SessionSchema = z.object({
  user_agent: z.string().max(500).nullable().optional(),
})

Deno.serve(
  withAuth({ schema: SessionSchema }, async (ctx) => {
    const { error } = await ctx.db.rpc('record_user_session', {
      p_user_agent: ctx.body.user_agent ?? null,
    })
    if (error) throw error
    await ctx.audit('session.recorded')
    return { success: true }
  }),
)
