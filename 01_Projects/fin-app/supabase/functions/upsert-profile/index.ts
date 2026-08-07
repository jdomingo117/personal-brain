import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'

const MappingSchema = z.object({
  date_col: z.string(),
  desc_col: z.string(),
  amount_col: z.string().optional().nullable(),
  debit_col: z.string().optional().nullable(),
  credit_col: z.string().optional().nullable(),
  date_format: z.string().default('DD/MM/YYYY'),
})

const StaticProfileSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  mappings: MappingSchema,
})

Deno.serve(
  withAuth({ schema: StaticProfileSchema }, async (ctx) => {
    const { data, error } = await ctx.db
      .from('static_profiles')
      .insert({ ...ctx.body, user_id: ctx.user.id, tenant_id: ctx.tenantId })
      .select()
      .single()
    if (error) throw error

    await ctx.audit('static_profile.created', { profile_id: data.id })
    return data
  }),
)
