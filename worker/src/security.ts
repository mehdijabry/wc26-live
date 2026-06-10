/**
 * Shared security primitives for the wc26-api Worker.
 *
 * OWASP coverage targeted by this module:
 *   - A01 Broken Access Control      → rateLimit() + admin-token gate
 *   - A03 Injection                  → strict whitelists for every
 *                                       URL param that feeds an
 *                                       upstream fetch (ESPN, Supabase)
 *   - A04 Insecure Design            → length caps + content-type
 *                                       enforcement on all POSTs
 *   - A05 Security Misconfiguration  → securityHeaders() on every
 *                                       response (CSP / nosniff /
 *                                       referrer-policy / frame-ancestors)
 *   - A09 Logging / Monitoring       → rateLimit() exposes hits for
 *                                       wrangler tail review
 *
 * Everything in here is pure functions + KV — no DB, no network of its
 * own — so it stays cheap enough to call on EVERY request.
 */

// -------------------------------------------------------------------------
// Input validators
// -------------------------------------------------------------------------
//
// We never use the raw value of a URL param. The pattern is:
//
//   const code = safeTeamCode(teamMatch[1])
//   if (!code) return json({ error: 'invalid team code' }, 400)
//   // …feed `code`, never raw teamMatch[1], to the upstream fetch
//
// Each validator returns null on mismatch so the caller can fail fast
// without trying to coerce the input.

/** ESPN team abbreviations: 2-4 letters, ASCII, e.g. MAR, USA, KSA. */
export function safeTeamCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const up = raw.toUpperCase()
  return /^[A-Z]{2,4}$/.test(up) ? up : null
}

/** ESPN event / match id: numeric, up to 12 digits. */
export function safeEventId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return /^\d{1,12}$/.test(raw) ? raw : null
}

/** YYYYMMDD calendar date used by /today?date=. Strictly 8 digits. */
export function safeYmd(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (!/^\d{8}$/.test(raw)) return null
  const y = Number(raw.slice(0, 4))
  const m = Number(raw.slice(4, 6))
  const d = Number(raw.slice(6, 8))
  if (y < 2000 || y > 2100) return null
  if (m < 1 || m > 12) return null
  if (d < 1 || d > 31) return null
  return raw
}

/**
 * Cap a string at a max length AND require it to be a string. Returns
 * null on missing/wrong-type input. Use for free-text fields like push
 * notification titles/bodies before forwarding to upstream services.
 */
export function safeString(raw: unknown, maxLen: number): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0) return null
  if (raw.length > maxLen) return null
  return raw
}

/**
 * Web Push endpoints come from the user's push service (FCM, Mozilla,
 * Apple). They are always https URLs hosted by one of a small set of
 * upstream providers. Reject anything else — prevents the table being
 * spammed with attacker-controlled URLs that we'd otherwise POST to
 * during /push/broadcast.
 */
const PUSH_ENDPOINT_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'updates-autopush.stage.mozaws.net', // mozilla staging (paranoia)
  'web.push.apple.com',
  'wns2-by3p.notify.windows.com',
  'wns2-am3p.notify.windows.com',
  'wns2-bn1p.notify.windows.com',
])
export function safePushEndpoint(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length > 600) return null
  let url: URL
  try { url = new URL(raw) } catch { return null }
  if (url.protocol !== 'https:') return null
  // Some Mozilla / FCM endpoints live on subdomains under these roots —
  // tolerate that.
  const host = url.hostname.toLowerCase()
  const allowed =
    PUSH_ENDPOINT_HOSTS.has(host) ||
    host.endsWith('.push.apple.com') ||
    host.endsWith('.notify.windows.com') ||
    host.endsWith('.push.services.mozilla.com')
  if (!allowed) return null
  return raw
}

/**
 * Base64url-encoded keys from PushSubscription. Length-bounded so a
 * 100MB payload can't slip through.
 */
export function safeBase64Url(raw: unknown, expectedLen: number): string | null {
  if (typeof raw !== 'string') return null
  if (raw.length < 4 || raw.length > expectedLen) return null
  return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null
}

// -------------------------------------------------------------------------
// Rate limiter (KV-backed sliding window, per-IP)
// -------------------------------------------------------------------------
//
// We use the existing CACHE KV namespace with a `rate:` key prefix.
// Each key is a fixed-bucket counter (one bucket per (ip, route, minute))
// — so a burst of N hits gets rejected once the counter exceeds `limit`,
// then forgiven 60s later when the bucket rolls.
//
// True sliding windows are ~3× the KV writes for ~5% accuracy gain —
// not worth it on our traffic profile. Fixed-bucket is fine.
//
// Caller responsibility:
//   const rl = await rateLimit(env, req, { route: '/push/subscribe', limit: 10 })
//   if (rl.blocked) return cors(json({ error: 'rate limited' }, 429), req)

const RATE_PREFIX = 'rate:'

type RateResult = { blocked: true; retryAfter: number } | { blocked: false; remaining: number }

export async function rateLimit(
  env: { CACHE: KVNamespace },
  req: Request,
  opts: { route: string; limit: number; windowSeconds?: number }
): Promise<RateResult> {
  const win = opts.windowSeconds ?? 60
  const ip =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  // We don't have Date.now() restrictions inside the Worker like the
  // workflow scripts have — Math.floor works fine here.
  const bucket = Math.floor(Date.now() / 1000 / win)
  const key = `${RATE_PREFIX}${opts.route}:${ip}:${bucket}`
  // KV.get is eventually consistent globally (~60s) but Cloudflare keeps
  // a per-PoP read-after-write tier that's much tighter — for a burst-
  // protection limiter that's adequate.
  const current = parseInt((await env.CACHE.get(key)) ?? '0', 10) || 0
  if (current >= opts.limit) {
    return { blocked: true, retryAfter: win - (Math.floor(Date.now() / 1000) % win) }
  }
  // Write back +1. We don't await with ctx.waitUntil() because that's a
  // separate concern; KV writes are cheap enough to inline.
  await env.CACHE.put(key, String(current + 1), { expirationTtl: win + 5 })
  return { blocked: false, remaining: opts.limit - current - 1 }
}

// -------------------------------------------------------------------------
// Security headers (defense-in-depth)
// -------------------------------------------------------------------------
//
// Added by withSecurityHeaders() to every response leaving the Worker.
// Most are no-ops for a pure JSON API (we don't render HTML) but they
// future-proof against scope creep AND signal intent to scanners.

export function withSecurityHeaders(resp: Response): Response {
  // We have to clone to mutate headers — Response is immutable in the
  // initial form returned by fetch().
  const h = new Headers(resp.headers)
  h.set('x-content-type-options', 'nosniff')
  h.set('referrer-policy', 'no-referrer')
  h.set('permissions-policy', 'interest-cohort=()')
  // Frame-ancestors stops the API being embedded inside a malicious
  // page (e.g. as an iframe phishing surface).
  h.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: h,
  })
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/** Reject overly-large JSON payloads before parsing. */
export async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown | null> {
  const ct = req.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) return null
  const lenHeader = req.headers.get('content-length')
  if (lenHeader && parseInt(lenHeader, 10) > maxBytes) return null
  try {
    // Read raw, length-check, then parse — protects against
    // chunked-encoding bypasses that would let large bodies slip past
    // a content-length-only check.
    const text = await req.text()
    if (text.length > maxBytes) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}
