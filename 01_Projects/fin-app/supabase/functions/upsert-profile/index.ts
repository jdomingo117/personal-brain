import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { withAuth } from '../_shared/withAuth.ts'
import { profileFingerprint } from '../_shared/profileFingerprint.ts'

const MappingSchema = z.object({
  dateCol: z.string().min(1).max(200),
  descCol: z.string().min(1).max(200),
  amountCol: z.string().max(200).optional().nullable(),
  debitCol: z.string().max(200).optional().nullable(),
  creditCol: z.string().max(200).optional().nullable(),
  invertAmount: z.boolean().optional(),
  categoryCol: z.string().max(200).optional().nullable(),
  subcategoryCol: z.string().max(200).optional().nullable(),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY']).optional(),
})

const StaticProfileSchema = z.object({
  headers: z.array(z.string().min(1).max(200)).min(1).max(200),
  displayName: z.string().min(1).max(120),
  mappings: MappingSchema,
}).superRefine(({ headers, mappings }, ctx) => {
  const known = new Set(headers)
  for (const key of [
    'dateCol', 'descCol', 'amountCol', 'debitCol', 'creditCol',
    'categoryCol', 'subcategoryCol',
  ] as const) {
    const column = mappings[key]
    if (column && !known.has(column)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mappings', key],
        message: 'Mapped column must exist in headers',
      })
    }
  }
})

Deno.serve(
  withAuth({ schema: StaticProfileSchema }, async (ctx) => {
    const headerFingerprint = await profileFingerprint(ctx.body.headers)
    const { data, error } = await ctx.db
      .from('static_profiles')
      .upsert({
        user_id: ctx.user.id,
        tenant_id: ctx.tenantId,
        name: ctx.body.displayName,
        header_fingerprint: headerFingerprint,
        mappings: ctx.body.mappings,
      }, { onConflict: 'tenant_id,header_fingerprint' })
      .select()
      .single()
    if (error) throw error

    await ctx.audit('static_profile.saved', {
      profile_id: data.id,
      header_fingerprint: headerFingerprint,
    })
    return data
  }),
)
