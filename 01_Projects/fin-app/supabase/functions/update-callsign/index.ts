import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const CallsignSchema = z.object({
  callsign: z.string().trim().min(1).max(120),
})

Deno.serve(
  withAuth({ schema: CallsignSchema }, async (ctx) => {
    const { data, error } = await ctx.db
      .from('profiles')
      .update({ callsign: ctx.body.callsign })
      .eq('id', ctx.user.id)
      .select('id, callsign')
      .single()
    if (error) throw error

    await ctx.audit('profile.callsign_updated')
    return data
  }),
)
