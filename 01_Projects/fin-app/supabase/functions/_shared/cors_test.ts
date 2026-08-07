/**
 * Unit tests for the CORS allowlist.
 *
 * These assert the headers the function *produces*. They deliberately do not
 * go through `supabase functions serve`: the local edge runtime rewrites
 * access-control-allow-origin to "*" on the way out, which masks whatever the
 * function set. Deployed functions are not proxied that way, so the value
 * asserted here is the one that ships.
 *
 *   deno test supabase/functions/_shared/cors_test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { corsHeadersFor, isAllowedOrigin } from './cors.ts'

const withOrigin = (origin?: string) =>
  new Request('http://localhost/fn', {
    method: 'POST',
    headers: origin ? { Origin: origin } : {},
  })

Deno.test('allowed origin is echoed back verbatim', () => {
  const headers = corsHeadersFor(withOrigin('http://localhost:5300'))
  assertEquals(headers['Access-Control-Allow-Origin'], 'http://localhost:5300')
})

Deno.test('the allowlist never answers with a wildcard', () => {
  for (const origin of ['http://localhost:5300', 'https://evil.example', undefined]) {
    const headers = corsHeadersFor(withOrigin(origin))
    assertEquals(headers['Access-Control-Allow-Origin'] === '*', false)
  }
})

Deno.test('disallowed origin gets no allow-origin header at all', () => {
  const headers = corsHeadersFor(withOrigin('https://evil.example'))
  assertEquals('Access-Control-Allow-Origin' in headers, false)
})

Deno.test('Vary: Origin is always set so caches do not cross origins', () => {
  assertEquals(corsHeadersFor(withOrigin('http://localhost:5300')).Vary, 'Origin')
  assertEquals(corsHeadersFor(withOrigin('https://evil.example')).Vary, 'Origin')
})

Deno.test('isAllowedOrigin gates browser callers', () => {
  assertEquals(isAllowedOrigin(withOrigin('http://localhost:5300')), true)
  assertEquals(isAllowedOrigin(withOrigin('http://127.0.0.1:5300')), true)
  assertEquals(isAllowedOrigin(withOrigin('https://evil.example')), false)
  // Sub-string tricks must not pass.
  assertEquals(isAllowedOrigin(withOrigin('http://localhost:5300.evil.example')), false)
  assertEquals(isAllowedOrigin(withOrigin('http://evil.example/http://localhost:5300')), false)
})

Deno.test('a request with no Origin is not blocked', () => {
  // curl and server-to-server callers send no Origin and are not subject to
  // the same-origin policy, so there is nothing for CORS to enforce. The JWT
  // check is what protects these callers.
  assertEquals(isAllowedOrigin(withOrigin(undefined)), true)
})
