/** Server mirror of app/src/lib/csv/profileFingerprint.ts. Keep the exact
 * serialization stable: the database migration hashes legacy names that were
 * written as headers.join('|'). */
export async function profileFingerprint(headers: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(headers.join('|'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

