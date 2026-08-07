import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const ConfirmSchema = z.object({
  confirm: z.literal('DELETE'),
})

/**
 * Schedules account deletion after a 30-day grace period.
 *
 * Deliberately not an immediate delete. Session theft is the realistic threat
 * here, and an irreversible "delete everything" button reachable from a
 * hijacked session turns a containable incident into permanent loss of
 * someone's financial history. The grace window makes the action recoverable
 * by the real owner, who is also told about it by email.
 *
 * Requires 'owner': a tenant admin should not be able to delete the owner's
 * account.
 */
Deno.serve(
  withAuth({ schema: ConfirmSchema, requireRole: 'owner' }, async (ctx) => {
    const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await ctx.db
      .from('profiles')
      .update({ deletion_scheduled_at: scheduledFor })
      .eq('id', ctx.user.id)

    if (error) throw error

    await ctx.audit('account.deletion_scheduled', {
      scheduled_for: scheduledFor,
      grace_days: 30,
    })

    // Revoke every refresh token for this user so the scheduled deletion
    // cannot be silently reversed from a session the attacker still holds.
    const admin = ctx.admin()
    const { error: signOutError } = await admin.auth.admin.signOut(ctx.user.id, 'global')
    if (signOutError) {
      console.error('failed to revoke sessions on deletion', signOutError.message)
    }

    return { success: true, scheduled_for: scheduledFor }
  }),
)
