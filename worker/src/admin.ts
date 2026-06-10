/**
 * Admin panel backend — auth, analytics, push controls, email, DB stats.
 *
 * Every endpoint here requires a session cookie issued by
 * /admin/auth/login (verifies the password against the stored
 * SHA-256(salt + ':' + password) hash with constantTimeEqual). The
 * session is a JWT-style HMAC-signed token stored in an
 * httpOnly + secure cookie 'wc26_admin' valid for 8h.
 *
 * The admin slug ('admin-panel-1992' on the frontend) is not relied
 * on for security — it's only an obscurity layer to keep bots out of
 * the login surface. Real authentication is the password + HMAC
 * session.
 */

import {
  rateLimit,
  readBoundedJson,
  safeString,
} from './security'

export interface AdminEnv {
  CACHE: KVNamespace
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  // Set via wrangler secret put — see deploy notes.
  ADMIN_PASSWORD_HASH?: string
  ADMIN_PASSWORD_SALT?: string
  ADMIN_SESSION_SECRET?: string
  // Optional — analytics endpoints return mocked data if these aren't
  // configured, so the panel is still usable on day 1.
  CF_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
  CF_ZONE_ID?: string
  GSC_SERVICE_ACCOUNT?: string  // JSON string of GCP service account key
  GSC_SITE_URL?: string         // e.g. 'sc-domain:pressing90.live'
  // Resend for transactional email
  RESEND_API_KEY?: string
  RESEND_FROM?: string          // e.g. 'WC26 Live <hello@pressing90.live>'
}

// ─────────────────────────────────────────────────────────────────────
// Auth — login + session cookie + middleware
// ─────────────────────────────────────────────────────────────────────

const SESSION_COOKIE = 'wc26_admin'
const SESSION_TTL_SECONDS = 8 * 3600

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Token shape: {expSec}.{nonce}.{hmacHex(secret, payload)} */
async function issueSession(env: AdminEnv): Promise<string> {
  const secret = env.ADMIN_SESSION_SECRET ?? env.ADMIN_PASSWORD_HASH ?? 'fallback'
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const payload = `${exp}.${nonce}`
  const sig = await hmacSign(secret, payload)
  return `${payload}.${sig}`
}

async function verifySession(env: AdminEnv, token: string | null): Promise<boolean> {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [expStr, nonce, sig] = parts
  const exp = parseInt(expStr, 10)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false
  const secret = env.ADMIN_SESSION_SECRET ?? env.ADMIN_PASSWORD_HASH ?? 'fallback'
  const expected = await hmacSign(secret, `${exp}.${nonce}`)
  return constantTimeEqual(sig, expected)
}

function getCookie(req: Request, name: string): string | null {
  const h = req.headers.get('cookie') ?? ''
  for (const pair of h.split(';')) {
    const [k, ...v] = pair.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

/**
 * Extract the admin session token from EITHER the Authorization header
 * (preferred — works cross-origin without Safari's ITP blocking us)
 * OR the legacy cookie set by older clients.
 */
function extractToken(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  return getCookie(req, SESSION_COOKIE)
}

/**
 * Middleware: every admin endpoint EXCEPT /admin/auth/login must run
 * this and return early with 401 if it fails.
 */
async function requireSession(req: Request, env: AdminEnv): Promise<Response | null> {
  const token = extractToken(req)
  if (!(await verifySession(env, token))) {
    return jsonResp({ error: 'unauthorised' }, 401)
  }
  return null
}

function jsonResp(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  })
}

// ─────────────────────────────────────────────────────────────────────
// Route dispatcher — call from worker/src/index.ts
// ─────────────────────────────────────────────────────────────────────

export async function handleAdmin(
  req: Request,
  env: AdminEnv,
  pathname: string
): Promise<Response | null> {
  if (!pathname.startsWith('/admin/')) return null

  // Login endpoint — rate-limit aggressively to defeat brute force.
  if (pathname === '/admin/auth/login' && req.method === 'POST') {
    const rl = await rateLimit(env, req, { route: 'admin:login', limit: 8 })
    if (rl.blocked) return jsonResp({ error: 'rate limited' }, 429)
    return handleLogin(req, env)
  }
  if (pathname === '/admin/auth/logout' && req.method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      },
    })
  }
  if (pathname === '/admin/auth/session' && req.method === 'GET') {
    const token = extractToken(req)
    const ok = await verifySession(env, token)
    return jsonResp({ ok })
  }

  // Everything else requires a valid session.
  const guard = await requireSession(req, env)
  if (guard) return guard

  // Read-only data fetches
  if (pathname === '/admin/stats/overview') return handleOverview(env)
  if (pathname === '/admin/stats/cloudflare') return handleCloudflareAnalytics(env, req)
  if (pathname === '/admin/stats/gsc') return handleGsc(env, req)
  if (pathname === '/admin/subscriptions') return handleListSubscriptions(env)
  if (pathname === '/admin/users') return handleListUsers(env)
  if (pathname === '/admin/brackets') return handleListBrackets(env)
  if (pathname === '/admin/site-health') return handleSiteHealth(env)

  // Write-side actions
  if (pathname === '/admin/push/broadcast' && req.method === 'POST') {
    return handleAdminBroadcast(req, env)
  }
  if (pathname === '/admin/push/single' && req.method === 'POST') {
    return handleAdminSinglePush(req, env)
  }
  if (pathname === '/admin/email/send' && req.method === 'POST') {
    return handleAdminEmail(req, env)
  }
  if (pathname === '/admin/cache/clear' && req.method === 'POST') {
    return handleCacheClear(req, env)
  }

  return jsonResp({ error: 'not found' }, 404)
}

// ─────────────────────────────────────────────────────────────────────
// Auth handlers
// ─────────────────────────────────────────────────────────────────────

async function handleLogin(req: Request, env: AdminEnv): Promise<Response> {
  const raw = await readBoundedJson(req, 1024)
  if (!raw || typeof raw !== 'object') return jsonResp({ error: 'bad request' }, 400)
  const password = safeString((raw as { password?: unknown }).password, 100)
  if (!password) return jsonResp({ error: 'missing password' }, 400)
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_PASSWORD_SALT) {
    return jsonResp({ error: 'admin not configured' }, 503)
  }
  const candidateHash = await sha256(`${env.ADMIN_PASSWORD_SALT}:${password}`)
  if (!constantTimeEqual(candidateHash, env.ADMIN_PASSWORD_HASH)) {
    // Same response shape as 'success' minus the cookie — don't leak
    // whether the user exists / password is correct.
    return jsonResp({ error: 'invalid credentials' }, 401)
  }
  const token = await issueSession(env)
  // Return token in BOTH cookie (legacy / same-origin) AND body
  // (Authorization header, cross-origin). The frontend will prefer
  // the body token and stash it in sessionStorage so cross-origin
  // setups (pressing90.live → wc26-api.workers.dev) work in browsers
  // with strict 3rd-party-cookie blocking (Safari ITP, Brave, Firefox).
  return new Response(JSON.stringify({ ok: true, token }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie':
        `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; ` +
        `Max-Age=${SESSION_TTL_SECONDS}`,
    },
  })
}

// ─────────────────────────────────────────────────────────────────────
// Stats / overview
// ─────────────────────────────────────────────────────────────────────

async function handleOverview(env: AdminEnv): Promise<Response> {
  // Pull DB counts in parallel — cheap PostgREST HEAD-style requests
  // that ask for count via Prefer header.
  const [subs, profiles, brackets] = await Promise.all([
    sbCount(env, 'push_subscriptions'),
    sbCount(env, 'profiles'),
    sbCount(env, 'bracket_predictions'),
  ])
  return jsonResp({
    subs,
    profiles,
    brackets,
    workerVersion: 'wc26-api',
    fetchedAt: new Date().toISOString(),
  })
}

async function sbCount(env: AdminEnv, table: string): Promise<number> {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*`, {
      method: 'HEAD',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        prefer: 'count=exact',
        range: '0-0',
      },
    })
    const range = r.headers.get('content-range') ?? '0/0'
    const total = range.split('/')[1] ?? '0'
    return parseInt(total, 10) || 0
  } catch {
    return 0
  }
}

// ─────────────────────────────────────────────────────────────────────
// Cloudflare Analytics — GraphQL
// ─────────────────────────────────────────────────────────────────────

async function handleCloudflareAnalytics(env: AdminEnv, req: Request): Promise<Response> {
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) {
    return jsonResp({
      configured: false,
      message:
        'Set CF_API_TOKEN + CF_ZONE_ID via wrangler secret put. Sample mocked data is returned for the UI.',
      mock: mockCfData(),
    })
  }
  const range = new URL(req.url).searchParams.get('range') ?? '24h'
  const sinceHours = range === '7d' ? 24 * 7 : range === '30d' ? 24 * 30 : 24
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString()
  const until = new Date().toISOString()
  const query = {
    query: `query($zoneTag:String!, $since:Time!, $until:Time!){
      viewer { zones(filter:{zoneTag:$zoneTag}){
        httpRequests1hGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until}){
          sum { requests pageViews bytes }
          uniq { uniques }
        }
        topNs: httpRequests1hGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until}){
          sum {
            countryMap{ clientCountryName requests }
            responseStatusMap{ edgeResponseStatus requests }
          }
        }
      }}
    }`,
    variables: { zoneTag: env.CF_ZONE_ID, since, until },
  }
  const resp = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CF_API_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(query),
  })
  if (!resp.ok) {
    return jsonResp({ configured: true, error: 'cf api error', status: resp.status }, 502)
  }
  const data = await resp.json()
  return jsonResp({ configured: true, range, raw: data })
}

function mockCfData() {
  return {
    requests: 12340,
    pageViews: 8921,
    uniques: 3412,
    bandwidth: '890 MB',
    topCountries: [
      { code: 'FR', name: 'France', requests: 4210 },
      { code: 'MA', name: 'Morocco', requests: 2870 },
      { code: 'US', name: 'United States', requests: 1650 },
      { code: 'CA', name: 'Canada', requests: 890 },
      { code: 'DE', name: 'Germany', requests: 620 },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────
// Google Search Console
// ─────────────────────────────────────────────────────────────────────

async function handleGsc(env: AdminEnv, _req: Request): Promise<Response> {
  if (!env.GSC_SERVICE_ACCOUNT || !env.GSC_SITE_URL) {
    return jsonResp({
      configured: false,
      message:
        'Set GSC_SERVICE_ACCOUNT (JSON) + GSC_SITE_URL via wrangler secret put. Add the service account email as a user in Google Search Console (Restricted access). Sample mocked data returned.',
      mock: mockGscData(),
    })
  }
  try {
    const accessToken = await mintGscAccessToken(env.GSC_SERVICE_ACCOUNT)
    // Last 7 days top queries + pages
    const today = new Date()
    const startDate = new Date(today.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const endDate = today.toISOString().slice(0, 10)
    const body = (dim: string) => ({
      startDate,
      endDate,
      dimensions: [dim],
      rowLimit: 25,
    })
    const url = `https://searchconsole.googleapis.com/v1/sites/${encodeURIComponent(env.GSC_SITE_URL)}/searchAnalytics/query`
    const [queries, pages, totals] = await Promise.all([
      fetch(url, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body('query')) }).then((r) => r.json()),
      fetch(url, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(body('page')) }).then((r) => r.json()),
      fetch(url, { method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ startDate, endDate }) }).then((r) => r.json()),
    ])
    return jsonResp({ configured: true, totals, queries, pages })
  } catch (e) {
    return jsonResp({ configured: true, error: 'gsc failed', message: String(e) }, 502)
  }
}

function mockGscData() {
  return {
    clicks: 142,
    impressions: 4280,
    ctr: '3.32%',
    position: 18.2,
    topQueries: [
      { query: 'where to watch world cup 2026', clicks: 32, impressions: 480 },
      { query: 'morocco squad world cup 2026', clicks: 18, impressions: 290 },
      { query: 'wc26 schedule', clicks: 12, impressions: 210 },
      { query: '8 second goalkeeper rule', clicks: 9, impressions: 180 },
      { query: 'best third placed teams rule', clicks: 7, impressions: 160 },
    ],
    topPages: [
      { url: '/watch/canada', clicks: 45, impressions: 1200 },
      { url: '/team/mar', clicks: 28, impressions: 890 },
      { url: '/explained/format', clicks: 22, impressions: 680 },
    ],
  }
}

/** Service-account → access token via Google's OAuth2 JWT bearer flow. */
async function mintGscAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const header = { alg: 'RS256', typ: 'JWT' }
  const b64u = (o: object) =>
    btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const signingInput = `${b64u(header)}.${b64u(claims)}`
  // Convert PEM → CryptoKey
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const sigB64u = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const jwt = `${signingInput}.${sigB64u}`
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const data = await r.json() as { access_token?: string }
  if (!data.access_token) throw new Error('failed to mint gsc token')
  return data.access_token
}

// ─────────────────────────────────────────────────────────────────────
// DB views (subs / users / brackets)
// ─────────────────────────────────────────────────────────────────────

async function handleListSubscriptions(env: AdminEnv): Promise<Response> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,user_agent,lang,created_at&order=created_at.desc&limit=200`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  const rows = (await r.json()) as Array<{ endpoint: string; user_agent?: string; lang?: string; created_at?: string }>
  // Mask the endpoint URL — show provider + tail for traceability without
  // leaking the full push token in the admin UI.
  const masked = rows.map((row) => ({
    provider: providerFromEndpoint(row.endpoint),
    tail: row.endpoint.slice(-8),
    ua: row.user_agent ?? null,
    lang: row.lang ?? null,
    created_at: row.created_at ?? null,
    fullEndpoint: row.endpoint,   // included so 'send single' can reuse
  }))
  return jsonResp({ count: masked.length, rows: masked })
}

function providerFromEndpoint(url: string): string {
  try {
    const host = new URL(url).hostname
    if (host.includes('fcm.googleapis.com')) return 'FCM (Chrome/Android)'
    if (host.includes('mozilla.com')) return 'Mozilla (Firefox)'
    if (host.includes('push.apple.com')) return 'Apple (Safari/iOS)'
    if (host.includes('notify.windows.com')) return 'Microsoft (Edge)'
    return host
  } catch {
    return 'unknown'
  }
}

async function handleListUsers(env: AdminEnv): Promise<Response> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?select=id,alias,share_slug,updated_at,total_score&order=updated_at.desc&limit=200`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  const rows = await r.json()
  return jsonResp({ rows })
}

async function handleListBrackets(env: AdminEnv): Promise<Response> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/bracket_predictions?select=user_id,final_winner,third_place_winner,golden_boot,updated_at&order=updated_at.desc&limit=200`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  const rows = await r.json()
  return jsonResp({ rows })
}

async function handleSiteHealth(env: AdminEnv): Promise<Response> {
  // KV self-check + ESPN ping latency.
  const espnStart = Date.now()
  let espnOk = false
  let espnMs = 0
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=1', {
      cf: { cacheTtl: 0 },
    })
    espnOk = r.ok
    espnMs = Date.now() - espnStart
  } catch { /* swallow */ }
  // KV liveness — write + read a sentinel key.
  let kvOk = false
  try {
    await env.CACHE.put('admin:health-probe', '1', { expirationTtl: 60 })
    kvOk = (await env.CACHE.get('admin:health-probe')) === '1'
  } catch { /* swallow */ }
  return jsonResp({
    espnOk,
    espnMs,
    kvOk,
    serverTime: new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────────
// Write actions
// ─────────────────────────────────────────────────────────────────────

async function handleAdminBroadcast(req: Request, env: AdminEnv): Promise<Response> {
  // Delegate to the existing broadcast endpoint internally via a fetch
  // — keeps the implementation in one place. We mint a temporary admin
  // token from the existing ADMIN_TOKEN secret… actually simpler: call
  // broadcastCore directly. We re-fetch the body and call the existing
  // logic via the public path so we don't duplicate. Easiest: forward
  // via the existing /push/broadcast handler.
  // For minimal moving parts we just inline the same fan-out logic.
  const raw = await readBoundedJson(req, 4 * 1024)
  if (!raw || typeof raw !== 'object') return jsonResp({ error: 'bad json' }, 400)
  const p = raw as { title?: unknown; body?: unknown; url?: unknown; tag?: unknown }
  const title = safeString(p.title, 100) ?? 'WC26 Live'
  const body = safeString(p.body, 240) ?? 'Match update'
  const targetUrl = safeString(p.url, 200) ?? '/today'
  if (!targetUrl.startsWith('/')) return jsonResp({ error: 'url must be relative' }, 400)
  const tag = safeString(p.tag, 60) ?? 'admin-broadcast'
  // We can't call functions from index.ts here without circular import;
  // we forward via the public /push/broadcast endpoint, which already
  // has all the fan-out + 410-prune logic. The session check above
  // already authorised this caller; we sign with the static ADMIN_TOKEN
  // we already have so /push/broadcast accepts the inbound call.
  const adminToken = (env as AdminEnv & { ADMIN_TOKEN?: string }).ADMIN_TOKEN
  if (!adminToken) return jsonResp({ error: 'ADMIN_TOKEN not set' }, 503)
  const inner = await fetch(new URL(req.url).origin + '/push/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify({ title, body, url: targetUrl, tag }),
  })
  const data = await inner.json()
  return jsonResp(data, inner.status)
}

async function handleAdminSinglePush(req: Request, env: AdminEnv): Promise<Response> {
  const raw = await readBoundedJson(req, 4 * 1024)
  if (!raw || typeof raw !== 'object') return jsonResp({ error: 'bad json' }, 400)
  const p = raw as { endpoint?: unknown; title?: unknown; body?: unknown; url?: unknown }
  const endpoint = safeString(p.endpoint, 600)
  if (!endpoint) return jsonResp({ error: 'missing endpoint' }, 400)
  // Forward through the existing /push/test endpoint.
  const inner = await fetch(new URL(req.url).origin + '/push/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint, title: p.title, body: p.body, url: p.url }),
  })
  return jsonResp(await inner.json(), inner.status)
}

async function handleAdminEmail(req: Request, env: AdminEnv): Promise<Response> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    return jsonResp({ configured: false, message: 'Set RESEND_API_KEY + RESEND_FROM' }, 503)
  }
  const raw = await readBoundedJson(req, 16 * 1024)
  if (!raw || typeof raw !== 'object') return jsonResp({ error: 'bad json' }, 400)
  const p = raw as { to?: unknown; subject?: unknown; html?: unknown; text?: unknown }
  const to = safeString(p.to, 200)
  const subject = safeString(p.subject, 200)
  const html = safeString(p.html, 50_000)
  const text = safeString(p.text, 50_000)
  if (!to || !subject || (!html && !text)) {
    return jsonResp({ error: 'to + subject + (html or text) required' }, 400)
  }
  // Very basic email regex — enough to reject typos. Resend will
  // validate properly server-side.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return jsonResp({ error: 'invalid email' }, 400)
  }
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: env.RESEND_FROM, to, subject, html, text }),
  })
  const data = await resp.json()
  return jsonResp(data, resp.ok ? 200 : 502)
}

async function handleCacheClear(req: Request, env: AdminEnv): Promise<Response> {
  const raw = await readBoundedJson(req, 1024)
  if (!raw || typeof raw !== 'object') return jsonResp({ error: 'bad json' }, 400)
  const prefix = safeString((raw as { prefix?: unknown }).prefix, 64)
  if (!prefix) return jsonResp({ error: 'missing prefix' }, 400)
  // KV has no native 'delete by prefix' — we list, then delete.
  // Safety: cap the wipe at 100 keys per call so we can't accidentally
  // nuke the whole cache.
  const list = await env.CACHE.list({ prefix, limit: 100 })
  let deleted = 0
  for (const key of list.keys) {
    await env.CACHE.delete(key.name)
    deleted++
  }
  return jsonResp({ deleted, prefix })
}
