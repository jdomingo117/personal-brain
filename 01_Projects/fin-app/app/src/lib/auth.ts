import { supabase } from './supabaseClient'

/**
 * Auth operations, with the user-enumeration rules applied in one place.
 *
 * The guiding rule: an unauthenticated caller must never be able to learn
 * whether an email address has an account here. That means sign-up, magic
 * link and password reset all return the same "check your inbox" outcome
 * regardless of whether the address exists, and a failed sign-in never
 * distinguishes "no such user" from "wrong password".
 *
 * For a personal-finance product this matters more than usual: confirming
 * that someone banks with you is itself a disclosure, and a confirmed address
 * list is what makes credential stuffing and phishing worth an attacker's time.
 */

export const AUTH_REDIRECT = `${window.location.origin}/auth/callback`
export const RESET_REDIRECT = `${window.location.origin}/auth/reset`

/** Generic message for every credential failure. Never say which part failed. */
const GENERIC_SIGNIN_ERROR = 'Those details did not match an account.'
const GENERIC_INBOX_MESSAGE = 'If that address has an account, a link is on its way.'

export interface AuthResult {
  ok: boolean
  /** Safe to show the user. Never contains server internals. */
  message: string
}

function isRateLimited(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (!error) return { ok: true, message: 'Signed in.' }

  if (isRateLimited(error.message)) {
    return { ok: false, message: 'Too many attempts. Wait a moment and try again.' }
  }
  // Everything else collapses to one message. GoTrue already returns a
  // uniform "Invalid login credentials" for bad password vs unknown user, and
  // flattening here keeps it that way if that ever changes.
  return { ok: false, message: GENERIC_SIGNIN_ERROR }
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: AUTH_REDIRECT },
  })

  if (error) {
    if (isRateLimited(error.message)) {
      return { ok: false, message: 'Too many attempts. Wait a moment and try again.' }
    }
    // Weak-password and malformed-email errors describe the caller's own
    // input and disclose nothing about who is registered, so they are shown.
    if (/password/i.test(error.message)) {
      return { ok: false, message: error.message }
    }
    if (/email/i.test(error.message) && /invalid|valid/i.test(error.message)) {
      return { ok: false, message: 'That email address does not look valid.' }
    }
    return { ok: false, message: 'Could not complete sign-up. Try again.' }
  }

  // Signing up with an address that already exists returns success with no
  // session — GoTrue's deliberate anti-enumeration behaviour. The previous
  // code treated this as a bug to apologise for; it is the correct response,
  // and the message below is written so both cases read identically.
  return { ok: true, message: GENERIC_INBOX_MESSAGE }
}

export async function sendMagicLink(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Do not create an account as a side effect of requesting a magic link:
    // otherwise anyone can mint accounts for addresses they do not own, and
    // the differing outcomes leak which addresses are already registered.
    options: { shouldCreateUser: false, emailRedirectTo: AUTH_REDIRECT },
  })
  if (error && isRateLimited(error.message)) {
    return { ok: false, message: 'Too many requests. Wait a moment and try again.' }
  }
  return { ok: true, message: GENERIC_INBOX_MESSAGE }
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: RESET_REDIRECT,
  })
  if (error && isRateLimited(error.message)) {
    return { ok: false, message: 'Too many requests. Wait a moment and try again.' }
  }
  return { ok: true, message: GENERIC_INBOX_MESSAGE }
}

export type OAuthProvider = 'google' | 'github'

export async function signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: AUTH_REDIRECT,
      // Ask the provider to re-confirm which account to use rather than
      // silently reusing whatever is signed in on the device.
      queryParams: provider === 'google' ? { prompt: 'select_account' } : {},
    },
  })
  if (error) return { ok: false, message: 'Could not reach the provider. Try again.' }
  return { ok: true, message: 'Redirecting…' }
}

/**
 * Sets a new password after a reset link, or changes it while signed in.
 *
 * Supabase requires an active session for updateUser — the reset link
 * provides a short-lived recovery session, which is why /auth/reset must
 * exchange the code before calling this.
 */
export async function setPassword(newPassword: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    if (/password/i.test(error.message)) return { ok: false, message: error.message }
    return { ok: false, message: 'Could not update the password. Request a new link.' }
  }
  return { ok: true, message: 'Password updated.' }
}

/**
 * Changes the password of a signed-in user, re-verifying the current one
 * first.
 *
 * Supabase's updateUser does not require the old password, so without this
 * check anyone with a hijacked session — a borrowed laptop, a stolen token —
 * could set a new password and lock the real owner out. Re-authentication
 * makes possession of the session insufficient on its own.
 */
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<AuthResult> {
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })
  if (reauthError) return { ok: false, message: 'Current password is incorrect.' }
  if (currentPassword === newPassword) {
    return { ok: false, message: 'New password must differ from the current one.' }
  }
  return setPassword(newPassword)
}

/**
 * Starts an email change. Supabase sends a confirmation to BOTH addresses
 * when secure email change is enabled, so losing control of one alone is not
 * enough to move the account.
 */
export async function changeEmail(newEmail: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: AUTH_REDIRECT },
  )
  if (error) {
    if (isRateLimited(error.message)) {
      return { ok: false, message: 'Too many requests. Wait a moment and try again.' }
    }
    return { ok: false, message: 'Could not start the email change.' }
  }
  return {
    ok: true,
    message: 'Confirmation sent. Check both your old and new address.',
  }
}

/** Password rules, checked client-side for feedback and by GoTrue for real. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = []
  // Length is the property that actually resists offline cracking; character
  // -class rules mostly push people toward predictable substitutions.
  if (password.length < 12) problems.push('Use at least 12 characters.')
  if (/^\d+$/.test(password)) problems.push('Digits alone are easy to guess.')
  if (/^(.)\1+$/.test(password)) problems.push('Avoid a single repeated character.')
  return problems
}
