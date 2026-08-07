import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loudly at boot rather than defaulting to '' and surfacing as a confusing
// "network error" on the first auth call.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy app/.env.example to app/.env and fill it in (values are printed by `npx supabase start`).',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE rather than the implicit flow: the authorization code is exchanged
    // for tokens using a one-time verifier, so a code intercepted from the
    // redirect URL (browser history, referrer headers, proxy logs) is useless
    // on its own. Required for the OAuth and magic-link callbacks.
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    // We handle the callback explicitly on /auth/callback so that the code
    // exchange happens on a known route instead of on whatever page the user
    // happens to land on.
    detectSessionInUrl: false,
  },
})
