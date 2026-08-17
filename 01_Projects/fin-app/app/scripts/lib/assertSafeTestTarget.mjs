const PERSONAL_LOCAL_URLS = new Set([
  'http://127.0.0.1:54321',
  'http://localhost:54321',
])

export function assertSafeTestTarget(env = process.env) {
  const url = env.SUPABASE_URL ?? env.API_URL ?? ''
  const targetId = env.HALCYON_TEST_TARGET_ID ?? ''
  const confirmed = env.HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES === 'isolated-only'

  if (!url || !targetId || !confirmed || PERSONAL_LOCAL_URLS.has(url.replace(/\/$/, ''))) {
    throw new Error([
      'Refusing to run live fixtures against an unverified Supabase target.',
      'Use a separately isolated stack (never port 54321), then set:',
      '  SUPABASE_URL=<isolated URL>',
      '  HALCYON_TEST_TARGET_ID=<distinct isolated project id>',
      '  HALCYON_ALLOW_DESTRUCTIVE_TEST_FIXTURES=isolated-only',
      'See SYSTEM_INTEGRITY.md.',
    ].join('\n'))
  }

  return { url, targetId }
}

