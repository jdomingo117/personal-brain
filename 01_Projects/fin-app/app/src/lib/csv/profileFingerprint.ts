/** Stable identity for an exact CSV header layout. The pipe join deliberately
 * matches the legacy static_profiles.name value so the migration can backfill
 * existing profiles without having the original header array. */
export async function profileFingerprint(headers: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(headers.join('|'))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function profileDisplayName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.csv$/i, '').trim()
  return (withoutExtension || 'Saved CSV layout').slice(0, 120)
}

