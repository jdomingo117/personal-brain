/**
 * AES-256-GCM for third-party API tokens (SRD Law 4).
 *
 * Format: "v<keyVersion>.<b64url iv>.<b64url ciphertext||tag>"
 *   keyVersion — which entry of PROVIDER_TOKEN_KEYS encrypted this string, so
 *                a key rotation is a deploy (add a new highest version) and
 *                not a flag day (nothing has to migrate atomically).
 *   iv         — 12 random bytes, fresh per encryption, never reused. GCM
 *                with a repeated (key, iv) pair leaks the XOR of both
 *                plaintexts AND the authentication subkey — a full forgery
 *                break, not a degradation. Random-per-call is the only safe
 *                discipline in a stateless isolate, which cannot keep a
 *                counter across invocations.
 *   tag        — 128-bit, appended by Web Crypto to the ciphertext, not
 *                stored separately.
 *
 * The key itself lives only in this Edge Function's environment
 * (PROVIDER_TOKEN_KEYS) — never in Postgres, never as an argument to a SQL
 * function (which would put it in pg_stat_statements and the WAL), never
 * logged. `importKey(..., extractable: false)` so a later bug cannot
 * `exportKey` it into a log line either.
 */

export interface TokenAad {
  tenantId: string
  provider: string
  connectionId: string
}

export class TokenDecryptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenDecryptError'
  }
}

function aadBytes(aad: TokenAad): Uint8Array {
  // Binds the ciphertext to the exact row it lives in. Without this, an
  // attacker with write access to private.provider_credentials could copy
  // another tenant's ciphertext into their own row and have the sync
  // function decrypt and use a token they never possessed — with it, that
  // decryption fails the auth tag instead.
  return new TextEncoder().encode(`${aad.tenantId}:${aad.provider}:${aad.connectionId}`)
}

function parseKeyMap(): Map<number, Uint8Array> {
  const raw = Deno.env.get('PROVIDER_TOKEN_KEYS')
  if (!raw) throw new Error('PROVIDER_TOKEN_KEYS is not configured')
  let parsed: Record<string, string>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('PROVIDER_TOKEN_KEYS is not valid JSON')
  }
  const map = new Map<number, Uint8Array>()
  for (const [version, b64] of Object.entries(parsed)) {
    map.set(Number(version), Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
  }
  return map
}

function highestVersion(map: Map<number, Uint8Array>): number {
  return Math.max(...map.keys())
}

async function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

const b64url = {
  encode: (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s: string): Uint8Array => {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=')
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  },
}

/** Encrypts under the highest available key version. */
export async function encryptToken(plaintext: string, aad: TokenAad): Promise<{ ciphertext: string; keyVersion: number }> {
  const keys = parseKeyMap()
  const keyVersion = highestVersion(keys)
  const key = await importKey(keys.get(keyVersion)!)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadBytes(aad) },
    key,
    new TextEncoder().encode(plaintext),
  )

  const ciphertext = `v${keyVersion}.${b64url.encode(iv)}.${b64url.encode(new Uint8Array(encrypted))}`
  return { ciphertext, keyVersion }
}

/**
 * Decrypts a stored token. Throws TokenDecryptError on any failure — GCM
 * reports tampering and a wrong key identically (an "OperationError" with no
 * further detail), and neither raw error is useful to a caller, so the
 * caller should map this to connection status='error' rather than surface it.
 */
export async function decryptToken(ciphertext: string, aad: TokenAad): Promise<string> {
  const parts = ciphertext.split('.')
  if (parts.length !== 3 || !parts[0].startsWith('v')) {
    throw new TokenDecryptError('malformed ciphertext')
  }
  const keyVersion = Number(parts[0].slice(1))
  const keys = parseKeyMap()
  const keyBytes = keys.get(keyVersion)
  if (!keyBytes) throw new TokenDecryptError(`no key for version ${keyVersion}`)

  const key = await importKey(keyBytes)
  const iv = b64url.decode(parts[1])
  const data = b64url.decode(parts[2])

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: aadBytes(aad) },
      key,
      data,
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    throw new TokenDecryptError('decryption failed')
  }
}

/** Masks everything but the last 4 characters, for token_hint / display. */
export function tokenHint(token: string): string {
  return token.slice(-4)
}

/**
 * Strips anything that looks like an Up PAT from a string before it can
 * reach a log line or an audit/error column. Applied to any provider error
 * body that might echo back part of the request (e.g. an auth failure
 * message including the Authorization header it received).
 */
export function redactProviderTokens(text: string): string {
  return text.replace(/up:yeah:[A-Za-z0-9._-]+/g, 'up:yeah:[redacted]')
}
