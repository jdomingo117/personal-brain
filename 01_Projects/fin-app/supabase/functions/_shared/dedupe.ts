/**
 * Server-side deduplication.
 *
 * Mirrors app/src/lib/csv/dedupe.ts exactly — the two must stay in step, since
 * the client uses it to preview which rows will be skipped and the server uses
 * it to decide. The server's answer is the one that counts: the client's hash
 * is never trusted or transmitted, because a caller who could choose their own
 * dedupe hash could overwrite another row or bypass duplicate detection.
 */

function canonicalDescription(desc: string | null | undefined): string {
  return String(desc ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface DedupeInput {
  accountId: string
  date: string
  amountCents: number
  originalDescription: string | null | undefined
}

/** Lowercase hex sha256, matching the client implementation byte for byte. */
export async function dedupeHashHex(tx: DedupeInput): Promise<string> {
  const input = [
    tx.accountId,
    tx.date,
    String(tx.amountCents),
    canonicalDescription(tx.originalDescription),
  ].join(' ')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Postgres `bytea` literal for a hex digest, for insertion via PostgREST. */
export const toByteaLiteral = (hex: string) => `\\x${hex}`

/**
 * Identity hash for a provider-sourced row (Up Bank, etc).
 *
 * Deliberately NOT mirrored client-side — there is no client preview for an
 * API sync the way there is for a CSV staging table, so this exists only
 * here, not in app/src/lib/csv/dedupe.ts.
 *
 * Deliberately does NOT include amount, date or description, unlike the CSV
 * hash above, which is content-addressed because a CSV row carries no stable
 * id of its own. A provider transaction DOES carry one, and its amount, date
 * and description are NOT stable: a HELD transaction's amount changes when
 * it settles (a $1 fuel pre-auth becomes $80), and some merchants' printed
 * description changes too. Since this hash is also the join key
 * transfer_decisions uses to attach a durable user verdict to a leg
 * (20260806030000_transfer_decision_outranks_category.sql), a hash that
 * moved on settlement would silently orphan every transfer decision on that
 * row and vacate its slot in idx_transactions_dedupe for a later duplicate
 * to occupy. Hashing only the provider's own stable id avoids both.
 *
 * Also cannot collide with a CSV row's hash by construction: the preimages
 * differ in shape ("<uuid> <date> <cents> <desc>" vs
 * "provider:<name>:v1 <externalId>"), so a cross-scheme collision would be a
 * SHA-256 preimage attack, not something that happens by accident.
 */
export async function providerDedupeHashHex(provider: string, externalId: string): Promise<string> {
  const input = `provider:${provider}:v1 ${externalId}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
