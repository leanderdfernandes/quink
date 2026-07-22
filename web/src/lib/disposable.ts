// Disposable-domain blocking for the email-link fallback (ux-spec §2).
//
// Email VERIFICATION is the real abuse control — this list is a cheap second layer,
// not the wall itself. It is deliberately small: an exhaustive list is unmaintainable
// and a false positive blocks a real signup, which costs more than a leaked free tier.
// Google OAuth (the primary path) skips this entirely.

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'throwawaymail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mailnesia.com',
  'mintemail.com',
  'spamgourmet.com',
  'tempinbox.com',
  'emailondeck.com',
  'moakt.com',
  'mohmal.com',
  'burnermail.io',
])

export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase().trim()
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false
}
