import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const EmptySchema = z.object({}).strict()

function currentSessionId(authHeader: string | null): string | null {
  const token = authHeader?.replace(/^Bearer\s+/, '')
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.session_id === 'string' ? json.session_id : null
  } catch {
    return null
  }
}

Deno.serve(
  withAuth({ schema: EmptySchema }, async (ctx) => {
    // withAuth has already verified the signed JWT. This only extracts its
    // session identifier so the registry keeps the current device active.
    const sessionId = currentSessionId(ctx.req.headers.get('Authorization'))
    if (!sessionId) throw new Error('Current session could not be identified.')

    const { data, error } = await ctx.db
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_reason: 'user_revoked_others' })
      .eq('user_id', ctx.user.id)
      .is('revoked_at', null)
      .neq('gotrue_session_id', sessionId)
      .select('id')
    if (error) throw error

    await ctx.audit('session.others_revoked', { sessions_revoked: data?.length ?? 0 })
    return { success: true, sessions_revoked: data?.length ?? 0 }
  }),
)
