// Origin allowlist. `ALLOWED_ORIGINS` is a comma-separated list set per
// environment (supabase/.env.local for the local stack, project secrets in
// prod). A wildcard here would let any site on the internet drive these
// endpoints with a stolen token, so an unlisted origin gets no CORS headers
// back at all and the browser blocks the response.
const DEFAULT_ORIGINS = [
  'http://localhost:5300',
  'http://127.0.0.1:5300',
]

const allowedOrigins = (): string[] => {
  const configured = Deno.env.get('ALLOWED_ORIGINS')
  if (!configured) return DEFAULT_ORIGINS
  return configured.split(',').map((o) => o.trim()).filter(Boolean)
}

const BASE_HEADERS = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

/**
 * CORS headers for a specific request. Echoes the caller's Origin only when it
 * is on the allowlist; `Vary: Origin` keeps caches from serving one origin's
 * response to another.
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const headers: Record<string, string> = { ...BASE_HEADERS, Vary: 'Origin' }
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin')
  // Non-browser callers (curl, server-to-server) send no Origin and are not
  // subject to the same-origin policy, so there is nothing to enforce here.
  if (!origin) return true
  return allowedOrigins().includes(origin)
}
