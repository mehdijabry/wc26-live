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
// We import the broadcast logic directly because Cloudflare Workers don't
// allow same-worker fetches (would be a self-loop). admin.ts and index.ts
// share the same Env shape — see broadcastCore() in index.ts for details.
import { broadcastCore, sendWebPush } from './index'
import type { Env, PushSub } from './index'

export interface AdminEnv {
  CACHE: KVNamespace
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  // Push scheduler DO — same binding declared in wrangler.toml. Used
  // by /admin/push/scheduled to list / cancel / reschedule queued
  // kickoff alerts.
  SCHEDULER?: DurableObjectNamespace
  // Set via wrangler secret put — see deploy notes.
  ADMIN_PASSWORD_HASH?: string
  ADMIN_PASSWORD_SALT?: string
  ADMIN_SESSION_SECRET?: string
  // Optional — analytics endpoints return mocked data if these aren't
  // configured, so the panel is still usable on day 1.
  CF_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
  CF_ZONE_ID?: string
  GSC_SERVICE_ACCOUNT?: string  // JSON string of GCP service account key (legacy)
  GSC_SITE_URL?: string         // e.g. 'sc-domain:pressing90.live' or 'https://pressing90.live/'
  // OAuth 3-legged flow — preferred since service accounts can't be
  // added to Search Console properties without Google Workspace.
  // Set these via wrangler secret put after running the one-shot
  // local script (scripts/get-gsc-refresh-token.mjs).
  GSC_CLIENT_ID?: string
  GSC_CLIENT_SECRET?: string
  GSC_REFRESH_TOKEN?: string
  // Resend for transactional email
  RESEND_API_KEY?: string
  RESEND_FROM?: string          // e.g. 'WC26 Live <hello@pressing90.live>'
  // Make.com webhook that posts to the Facebook Page. Set via
  // `wrangler secret put MAKE_FB_WEBHOOK_URL`. When unset, the
  // share-facebook action returns a friendly 'not configured' error.
  MAKE_FB_WEBHOOK_URL?: string
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
  if (pathname === '/admin/stats/visits') return handleVisits(env, req)
  if (pathname === '/admin/reels/script' && req.method === 'POST') {
    // 100% Arabic voice-over script for the matchday reel. TTS chokes on
    // Latin names and digits, so gpt-oss transliterates every team and
    // competition name into Arabic (beIN/Kooora spelling) and writes
    // every number OUT IN WORDS.
    const body = await req.json().catch(() => null) as {
      matches?: Array<{ home?: string; away?: string; league?: string; time?: string; live?: boolean; score?: string }>
    } | null
    const matches = (body?.matches ?? []).slice(0, 10)
    if (matches.length === 0) return jsonResp({ error: 'no_matches' }, 400)
    type GptOut = { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }
    const ai = (env as unknown as { AI?: { run: (model: string, input: unknown) => Promise<GptOut> } }).AI
    if (!ai) return jsonResp({ error: 'ai_unavailable' }, 502)
    const lines = matches.map((m, i) =>
      `${i + 1}. ${m.home} vs ${m.away} — competition: ${m.league}` +
      (m.live ? ` — LIVE now${m.score ? `, score ${m.score}` : ''}` : m.time ? ` — kick-off at ${m.time} local time` : '')
    ).join('\n')
    const prompt =
      `Write an Arabic voice-over script for a short vertical video announcing today's football matches.\n\n` +
      `STRICT RULES:\n` +
      `- 100% Arabic script. NO Latin characters AT ALL. NO digits AT ALL.\n` +
      `- Transliterate every team and competition name into Arabic exactly as Arabic sports media (beIN SPORTS, Kooora) write them.\n` +
      `- Every number (kick-off times, scores) must be written out in Arabic WORDS (e.g. "السادسة مساءً", "هدفين مقابل هدف واحد").\n` +
      `- Tone: energetic TV announcer. Short sentences. 90 words maximum.\n` +
      `- Open with: أبرز مباريات اليوم على بريسينغ تسعين.\n` +
      `- One short sentence per match.\n` +
      `- Close with: تابعوا النتائج لحظة بلحظة على موقعنا بريسينغ تسعين دوت لايف.\n\n` +
      `Matches:\n${lines}`
    try {
      const out = await ai.run('@cf/openai/gpt-oss-120b', {
        instructions: 'You are an Arabic sports TV announcer. Output ONLY the final Arabic script — no preamble, no notes, no quotes.',
        input: [{ role: 'user', content: prompt }],
        max_output_tokens: 900,
        reasoning: { effort: 'low' },
      })
      let script = ''
      for (const item of out.output ?? []) {
        if (item.type !== 'message') continue
        for (const c of item.content ?? []) {
          if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') script += c.text
        }
      }
      script = script.trim()
      const arabicChars = (script.match(/[؀-ۿ]/g) ?? []).length
      const ratio = script.length ? arabicChars / script.replace(/\s/g, '').length : 0
      if (!script || ratio < 0.7) return jsonResp({ error: 'script_not_arabic', ratio: Number(ratio.toFixed(2)) }, 502)
      // Belt-and-braces: strip any stray digits the model let through.
      script = script.replace(/[0-9٠-٩]+/g, '').replace(/\s{2,}/g, ' ')
      return jsonResp({ ok: true, script })
    } catch (e) {
      return jsonResp({ error: 'script_failed', detail: String(e) }, 502)
    }
  }

  if (pathname === '/admin/reels/tts' && req.method === 'POST') {
    // Voice-over for the Reel composer. Edge TTS is dead (Microsoft now
    // 403s both datacenter IPs and browser origins), so:
    //   Arabic (or any voice when a key is set) → ElevenLabs
    //     (ELEVENLABS_API_KEY secret, eleven_multilingual_v2)
    //   en/fr without a key → Workers AI MeloTTS (free, no Arabic)
    const body = await req.json().catch(() => null) as { text?: string; voice?: string } | null
    const text = (body?.text ?? '').trim().slice(0, 2500)
    const voice = (body?.voice ?? 'ar').slice(0, 60)
    if (!text) return jsonResp({ error: 'empty_text' }, 400)
    const wantsArabic = voice.startsWith('ar')
    const el = (env as unknown as { ELEVENLABS_API_KEY?: string }).ELEVENLABS_API_KEY
    try {
      if (el) {
        // ElevenLabs voice ids: allow the caller to pass one directly
        // (20-char alphanumeric), else a solid multilingual male default.
        const voiceId = /^[A-Za-z0-9]{16,32}$/.test(voice) ? voice : 'pNInz6obpgDQGcFmaJgB'
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': el, 'content-type': 'application/json' },
          body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
        })
        if (!r.ok) return jsonResp({ error: 'elevenlabs_failed', status: r.status, detail: (await r.text()).slice(0, 300) }, 502)
        // Buffer the WHOLE mp3 before answering — passing the stream
        // through can get cut mid-flight and the browser then decodes a
        // truncated voice-over (reel shorter than the speech).
        const audio = await r.arrayBuffer()
        return new Response(audio, {
          headers: { 'content-type': 'audio/mpeg', 'content-length': String(audio.byteLength), 'cache-control': 'no-store' },
        })
      }
      if (wantsArabic) {
        return jsonResp({ error: 'arabic_needs_elevenlabs', hint: 'Set the ELEVENLABS_API_KEY worker secret to unlock Arabic voice-overs.' }, 400)
      }
      // Free path: Workers AI MeloTTS (en / fr).
      const lang = voice.startsWith('fr') ? 'fr' : 'en'
      const ai = (env as unknown as { AI: { run: (model: string, input: Record<string, unknown>) => Promise<{ audio?: string }> } }).AI
      const out = await ai.run('@cf/myshell-ai/melotts', { prompt: text, lang })
      if (!out?.audio) return jsonResp({ error: 'melotts_no_audio' }, 502)
      const bin = Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0))
      return new Response(bin, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } })
    } catch (e) {
      return jsonResp({ error: 'tts_failed', detail: String(e) }, 502)
    }
  }
  // ─── Facebook automation (automation.ts) ───────────────────────
  if (pathname === '/admin/automation/settings' && req.method === 'GET') {
    const { loadAutomationSettings } = await import('./automation')
    return jsonResp({ settings: await loadAutomationSettings(env as unknown as Parameters<typeof loadAutomationSettings>[0]) })
  }
  if (pathname === '/admin/automation/settings' && req.method === 'POST') {
    const body = await req.json().catch(() => null) as { settings?: Record<string, unknown> } | null
    const { saveAutomationSettings } = await import('./automation')
    const settings = await saveAutomationSettings(env as unknown as Parameters<typeof saveAutomationSettings>[0], (body?.settings ?? {}) as Parameters<typeof saveAutomationSettings>[1])
    return jsonResp({ ok: true, settings })
  }
  if (pathname === '/admin/automation/status' && req.method === 'GET') {
    const { localParts, readLog, getCount, studioConfigured, listTales } = await import('./automation')
    const e2 = env as unknown as Parameters<typeof readLog>[0]
    const { date, hour, minute } = localParts()
    const url = new URL(req.url)
    const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') ?? '') ? url.searchParams.get('date')! : date
    const [article, ft, story, reel, post, goalreel] = await Promise.all(['article', 'ft', 'story', 'reel', 'post', 'goalreel'].map((c) => getCount(e2, day, c as Parameters<typeof getCount>[2])))
    const ex = env as unknown as { STUDIO_URL?: string; MAKE_FB_WEBHOOK_URL?: string; MAKE_FB_VIDEO_WEBHOOK_URL?: string; FB_PAGE_TOKEN?: string }
    let studioHealth: unknown = null
    if (studioConfigured(e2)) {
      try { const h = await fetch(`${ex.STUDIO_URL}/health`, { signal: AbortSignal.timeout(8000) }); studioHealth = h.ok ? await h.json() : { error: h.status } } catch (e) { studioHealth = { error: String(e).slice(0, 80) } }
    }
    return jsonResp({
      date: day, localTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      counts: { article, ft, story, reel, post, goalreel },
      config: { studio: studioConfigured(e2), studioUrl: ex.STUDIO_URL ?? null, studioHealth, postWebhook: !!ex.MAKE_FB_WEBHOOK_URL, videoWebhook: !!ex.MAKE_FB_VIDEO_WEBHOOK_URL, pageToken: !!ex.FB_PAGE_TOKEN },
      log: await readLog(e2, day),
      tales: await listTales(e2).catch(() => []),
    })
  }
  if (pathname === '/admin/automation/insights' && req.method === 'GET') {
    // Facebook insights review (playbook, 2026-09-18): reels + page series + recommendations, cached 6 h (?refresh=1 forces a new read).
    const url = new URL(req.url)
    const { playbookReviewData } = await import('./review')
    try {
      const d = await playbookReviewData(env as unknown as Parameters<typeof playbookReviewData>[0], { days: Number(url.searchParams.get('days') ?? 7), limit: Number(url.searchParams.get('limit') ?? 25), refresh: url.searchParams.get('refresh') === '1' })
      return jsonResp({ ok: true, ...d })
    } catch (e) { return jsonResp({ ok: false, error: String(e).slice(0, 300) }, 502) }
  }
  if (pathname.startsWith('/admin/tiktok/')) {
    // TikTok (2026-09-18): status, OAuth URL for the browser, disconnect, manual publish (dry run by default).
    const tk = await import('./tiktok'); const e3 = env as unknown as Parameters<typeof tk.tiktokStatus>[0]
    try {
      if (pathname === '/admin/tiktok/status' && req.method === 'GET') return jsonResp({ ok: true, ...(await tk.tiktokStatus(e3)) })
      if (pathname === '/admin/tiktok/connect-url' && req.method === 'POST') return jsonResp({ ok: true, url: await tk.tiktokConnectUrl(e3), redirectUri: tk.TIKTOK_REDIRECT })
      if (pathname === '/admin/tiktok/disconnect' && req.method === 'POST') { await tk.tiktokDisconnect(e3); return jsonResp({ ok: true }) }
      if (pathname === '/admin/tiktok/publish' && req.method === 'POST') {
        const b = await req.json().catch(() => ({})) as { url?: string; caption?: string; privacy?: string; mode?: string; dry?: boolean }
        if (!b.url) return jsonResp({ ok: false, error: 'url required' }, 400)
        const r = await tk.tiktokPublish(e3, { videoUrl: String(b.url), caption: tk.tiktokCaption(String(b.caption ?? '')), privacy: b.privacy as Parameters<typeof tk.tiktokPublish>[1]['privacy'], mode: (b.mode === 'inbox' ? 'inbox' : 'direct'), dry: b.dry !== false })
        return jsonResp(r)
      }
    } catch (e) { return jsonResp({ ok: false, error: String(e).slice(0, 300) }, 502) }
  }
  if (pathname === '/admin/automation/token' && req.method === 'GET') {
    const { fbTokenStatus } = await import('./automation')
    return jsonResp(await fbTokenStatus(env as unknown as Parameters<typeof fbTokenStatus>[0]))
  }
  if (pathname === '/admin/automation/token' && req.method === 'POST') {
    // Body: { token } pasted by Mehdi. Never logged, never echoed back.
    const body = await req.json().catch(() => null) as { token?: string } | null
    const { installUserToken } = await import('./automation')
    try { return jsonResp(await installUserToken(env as unknown as Parameters<typeof installUserToken>[0], String(body?.token ?? ''))) }
    catch (e) { return jsonResp({ ok: false, error: String(e).replace(/EAA[\w]+/g, '***') }, 400) }
  }
  if (pathname === '/admin/automation/run' && req.method === 'POST') {
    const body = await req.json().catch(() => null) as { job?: string } | null
    const { runJobNow } = await import('./automation')
    const r = await runJobNow(env as unknown as Parameters<typeof runJobNow>[0], body?.job ?? '', (body ?? {}) as Record<string, unknown>)
    return jsonResp(r, r.ok ? 200 : 400)
  }
  if (pathname === '/admin/subscriptions') return handleListSubscriptions(env)
  if (pathname === '/admin/users') return handleListUsers(env)
  if (pathname === '/admin/brackets') return handleListBrackets(env)
  if (pathname === '/admin/site-health') return handleSiteHealth(env)

  // Public site feature flags (WC26 archive visibility, Arabic articles).
  if (pathname === '/admin/site/settings' && req.method === 'GET') {
    const { loadSiteSettings } = await import('./index')
    return jsonResp({ settings: await loadSiteSettings(env as unknown as Parameters<typeof loadSiteSettings>[0]) })
  }
  if (pathname === '/admin/site/settings' && req.method === 'POST') {
    const { saveSiteSettings } = await import('./index')
    const body = await req.json().catch(() => null) as { settings?: unknown } | null
    if (!body?.settings || typeof body.settings !== 'object') return jsonResp({ error: 'missing_settings' }, 400)
    const saved = await saveSiteSettings(
      env as unknown as Parameters<typeof saveSiteSettings>[0],
      body.settings as Parameters<typeof saveSiteSettings>[1]
    )
    return jsonResp({ ok: true, settings: saved })
  }

  // Push auto-alert settings + last-tick diagnostics.
  if (pathname === '/admin/push/settings' && req.method === 'GET') {
    const { loadPushSettings } = await import('./index')
    const settings = await loadPushSettings(env as unknown as Parameters<typeof loadPushSettings>[0])
    return jsonResp({ settings })
  }
  if (pathname === '/admin/push/settings' && req.method === 'POST') {
    const { savePushSettings, loadPushSettings } = await import('./index')
    const body = await req.json().catch(() => null) as { settings?: unknown } | null
    if (!body?.settings) return jsonResp({ error: 'missing_settings' }, 400)
    await savePushSettings(
      env as unknown as Parameters<typeof savePushSettings>[0],
      body.settings as Parameters<typeof savePushSettings>[1]
    )
    const saved = await loadPushSettings(env as unknown as Parameters<typeof loadPushSettings>[0])
    return jsonResp({ ok: true, settings: saved })
  }
  if (pathname === '/admin/push/diag' && req.method === 'GET') {
    const { readPushDiag } = await import('./index')
    const diag = await readPushDiag(env as unknown as Parameters<typeof readPushDiag>[0])
    return jsonResp({ diag })
  }

  // News pipeline (auto-published articles, Phase 1 manual approval flow)
  if (pathname === '/admin/news/list') return handleListNews(env, req)
  if (pathname.startsWith('/admin/news/') && req.method === 'POST') {
    return handleNewsAction(env, req, pathname)
  }

  // Social posts — AI generator + scheduler for the Facebook page.
  // Separate from the news pipeline: free-form posts that promote the
  // site, optionally scheduled for a future time (fired by the cron).
  if (pathname === '/admin/social/generate' && req.method === 'POST') {
    return handleSocialGenerate(env, req)
  }
  if (pathname === '/admin/social/list' && req.method === 'GET') {
    return handleSocialList(env)
  }
  if (pathname === '/admin/social/create' && req.method === 'POST') {
    return handleSocialCreate(env, req)
  }
  if (pathname.startsWith('/admin/social/') && req.method === 'POST') {
    return handleSocialAction(env, req, pathname)
  }

  // Scheduled-alerts management — list / cancel / postpone the
  // queued kickoff (T-60, T-15, T-0) pushes living in the DO.
  if (pathname === '/admin/push/scheduled' && req.method === 'GET') {
    return handleListScheduledPushes(env)
  }
  if (pathname === '/admin/push/scheduled/cancel' && req.method === 'POST') {
    return handleCancelScheduledPush(req, env)
  }
  if (pathname === '/admin/push/scheduled/reschedule' && req.method === 'POST') {
    return handleReschedulePush(req, env)
  }
  // Compose-form presets — give the operator a dropdown of the next
  // matches / recent articles so notification text is consistent.
  if (pathname === '/admin/push/preset/matches' && req.method === 'GET') {
    return handlePresetMatches(env)
  }
  if (pathname === '/admin/push/preset/articles' && req.method === 'GET') {
    return handlePresetArticles(env)
  }

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
    // Use GET, not HEAD — some Cloudflare-side configurations and
    // proxies strip Content-Range from HEAD responses. Limit=1 + the
    // count prefer header still returns the total via Content-Range
    // header. Fallback: parse the returned array length if the header
    // is missing for any reason.
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        prefer: 'count=exact',
      },
    })
    const range = r.headers.get('content-range') ?? ''
    if (range) {
      const total = range.split('/')[1]
      const n = total ? parseInt(total, 10) : NaN
      if (Number.isFinite(n)) return n
    }
    // Fallback — at least return >0 if there's any data so the overview
    // never reads suspiciously zero when the table is actually populated.
    const body = await r.json().catch(() => [])
    return Array.isArray(body) ? body.length : 0
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
  // Pick the right granularity: 24h → 24 hourly buckets, 7d → 7 daily,
  // 30d → 30 daily. The previous code used limit:1 hourly across every
  // range, which on 7d/30d returned a single bucket (basically empty)
  // and made the panel show zeros for longer ranges.
  const useDaily = range !== '24h'
  const groupName = useDaily ? 'httpRequests1dGroups' : 'httpRequests1hGroups'
  const bucketLimit = useDaily ? (range === '30d' ? 30 : 7) : 24
  const dateFilter = useDaily
    ? '{ date_geq: $sinceDate, date_leq: $untilDate }'
    : '{ datetime_geq: $since, datetime_leq: $until }'
  const sinceDate = since.slice(0, 10) // YYYY-MM-DD for date_geq
  const untilDate = until.slice(0, 10)
  // Single GraphQL request bundles all sub-queries. Each sub-query
  // grabs a different dimension breakdown so we render one rich panel
  // instead of one panel per round-trip.
  const query = {
    query: `query($zoneTag:String!, $since:Time!, $until:Time!, $sinceDate:Date!, $untilDate:Date!){
      viewer { zones(filter:{zoneTag:$zoneTag}){
        ${groupName}(limit:${bucketLimit}, filter:${dateFilter}){
          sum { requests pageViews bytes cachedRequests cachedBytes }
          uniq { uniques }
        }
        topNs: ${groupName}(limit:${bucketLimit}, filter:${dateFilter}){
          sum {
            countryMap{ clientCountryName requests }
            responseStatusMap{ edgeResponseStatus requests }
            contentTypeMap{ edgeResponseContentTypeName requests bytes }
            browserMap{ uaBrowserFamily pageViews }
          }
        }
      }}
    }`,
    variables: { zoneTag: env.CF_ZONE_ID, since, until, sinceDate, untilDate },
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
  type Bucket = {
    sum?: {
      requests?: number
      pageViews?: number
      bytes?: number
      cachedRequests?: number
      cachedBytes?: number
      countryMap?: Array<{ clientCountryName?: string; requests?: number }>
      responseStatusMap?: Array<{ edgeResponseStatus?: number; requests?: number }>
      contentTypeMap?: Array<{ edgeResponseContentTypeName?: string; requests?: number; bytes?: number }>
      browserMap?: Array<{ uaBrowserFamily?: string; pageViews?: number }>
    }
    uniq?: { uniques?: number }
  }
  const data = await resp.json() as {
    data?: { viewer?: { zones?: Array<Record<string, Bucket[]>> } }
  }
  const zone = data?.data?.viewer?.zones?.[0]
  const groups: Bucket[] = (zone?.[groupName] as Bucket[]) ?? []
  const topGroups: Bucket[] = (zone?.topNs as Bucket[]) ?? []
  // Aggregate across buckets — the previous code only read index [0] which
  // worked when limit was 1 but breaks now that we ask for 24/7/30 buckets.
  const totalReq = groups.reduce((s, g) => s + (g.sum?.requests ?? 0), 0)
  const totalPV = groups.reduce((s, g) => s + (g.sum?.pageViews ?? 0), 0)
  const totalBytes = groups.reduce((s, g) => s + (g.sum?.bytes ?? 0), 0)
  const cachedReq = groups.reduce((s, g) => s + (g.sum?.cachedRequests ?? 0), 0)
  const cachedBytes = groups.reduce((s, g) => s + (g.sum?.cachedBytes ?? 0), 0)
  const cacheReqPct = totalReq > 0 ? Math.round((cachedReq / totalReq) * 1000) / 10 : 0
  const cacheBytesPct = totalBytes > 0 ? Math.round((cachedBytes / totalBytes) * 1000) / 10 : 0
  // 'uniques' across multiple buckets is NOT additive — Cloudflare counts
  // distinct visitors per bucket, so summing double-counts repeat visitors.
  // The conservative answer is max(bucket uniques) which is the closest
  // proxy to "distinct visitors over the period" without the dedup query.
  const maxUniques = groups.reduce((m, g) => Math.max(m, g.uniq?.uniques ?? 0), 0)
  // Merge country counts across buckets so the leaderboard reflects the
  // full range, not just the most recent slice.
  const countryTotals = new Map<string, number>()
  for (const g of topGroups) {
    for (const c of g.sum?.countryMap ?? []) {
      const name = c.clientCountryName ?? '??'
      countryTotals.set(name, (countryTotals.get(name) ?? 0) + (c.requests ?? 0))
    }
  }
  const topCountries = Array.from(countryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, requests]) => ({
      code: name.slice(0, 2).toUpperCase(),
      name,
      requests,
    }))
  // Roll up the other dimension breakdowns the same way as countryMap.
  const statusTotals = new Map<number, number>()
  const browserTotals = new Map<string, number>()
  const contentTotals = new Map<string, { requests: number; bytes: number }>()
  for (const g of topGroups) {
    for (const s of g.sum?.responseStatusMap ?? []) {
      const code = s.edgeResponseStatus ?? 0
      statusTotals.set(code, (statusTotals.get(code) ?? 0) + (s.requests ?? 0))
    }
    for (const b of g.sum?.browserMap ?? []) {
      const name = b.uaBrowserFamily ?? '??'
      browserTotals.set(name, (browserTotals.get(name) ?? 0) + (b.pageViews ?? 0))
    }
    for (const c of g.sum?.contentTypeMap ?? []) {
      const name = c.edgeResponseContentTypeName ?? '??'
      const cur = contentTotals.get(name) ?? { requests: 0, bytes: 0 }
      contentTotals.set(name, {
        requests: cur.requests + (c.requests ?? 0),
        bytes: cur.bytes + (c.bytes ?? 0),
      })
    }
  }
  const topStatuses = Array.from(statusTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([code, requests]) => ({ code, requests }))
  const topBrowsers = Array.from(browserTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, pageViews]) => ({ name, pageViews }))
  const topContentTypes = Array.from(contentTotals.entries())
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 6)
    .map(([name, v]) => ({ name, requests: v.requests, bytes: formatBytes(v.bytes) }))

  return jsonResp({
    configured: true,
    range,
    mock: {
      requests: totalReq,
      pageViews: totalPV,
      uniques: maxUniques,
      bandwidth: formatBytes(totalBytes),
      cachedRequests: cachedReq,
      cachedBytes: formatBytes(cachedBytes),
      cacheReqPct,    // 0..100 — percent of requests served from cache
      cacheBytesPct,  // 0..100 — percent of bytes served from cache
      topCountries,
      topStatuses,
      topBrowsers,
      topContentTypes,
    },
  })
}

/** Format a raw byte count for display: 1234 → '1.2 KB', etc. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function mockCfData() {
  return {
    requests: 12340,
    pageViews: 8921,
    uniques: 3412,
    bandwidth: '890 MB',
    cachedRequests: 8420,
    cachedBytes: '612 MB',
    cacheReqPct: 68.2,
    cacheBytesPct: 68.7,
    topCountries: [
      { code: 'FR', name: 'France', requests: 4210 },
      { code: 'MA', name: 'Morocco', requests: 2870 },
      { code: 'US', name: 'United States', requests: 1650 },
      { code: 'CA', name: 'Canada', requests: 890 },
      { code: 'DE', name: 'Germany', requests: 620 },
    ],
    topStatuses: [
      { code: 200, requests: 11000 },
      { code: 304, requests: 800 },
      { code: 404, requests: 320 },
      { code: 500, requests: 12 },
    ],
    topBrowsers: [
      { name: 'Chrome', pageViews: 5400 },
      { name: 'Safari', pageViews: 2100 },
      { name: 'Firefox', pageViews: 800 },
    ],
    topContentTypes: [
      { name: 'html', requests: 4800, bytes: '120 MB' },
      { name: 'js',   requests: 3200, bytes: '410 MB' },
      { name: 'css',  requests: 1100, bytes: '90 MB' },
      { name: 'png',  requests: 2200, bytes: '180 MB' },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────
// Google Search Console
// ─────────────────────────────────────────────────────────────────────

async function handleGsc(env: AdminEnv, _req: Request): Promise<Response> {
  if (!env.GSC_SITE_URL) {
    return jsonResp({
      configured: false,
      message:
        'Set GSC_SITE_URL + (GSC_CLIENT_ID + GSC_CLIENT_SECRET + GSC_REFRESH_TOKEN) via wrangler secret put. See scripts/get-gsc-refresh-token.mjs. Sample mocked data returned.',
      mock: mockGscData(),
    })
  }
  // Prefer OAuth (works without Workspace) over service account.
  const hasOAuth = env.GSC_CLIENT_ID && env.GSC_CLIENT_SECRET && env.GSC_REFRESH_TOKEN
  if (!hasOAuth && !env.GSC_SERVICE_ACCOUNT) {
    return jsonResp({
      configured: false,
      message:
        'Set GSC_CLIENT_ID + GSC_CLIENT_SECRET + GSC_REFRESH_TOKEN (preferred) OR GSC_SERVICE_ACCOUNT via wrangler secret put. Sample mocked data returned.',
      mock: mockGscData(),
    })
  }
  try {
    const accessToken = hasOAuth
      ? await mintGscAccessTokenOAuth(env.GSC_CLIENT_ID!, env.GSC_CLIENT_SECRET!, env.GSC_REFRESH_TOKEN!)
      : await mintGscAccessToken(env.GSC_SERVICE_ACCOUNT!)
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
    // The Search Analytics endpoint lives under /webmasters/v3/, NOT /v1/.
    // The /v1/ subtree only exposes URL Inspection and sitemap APIs;
    // hitting /v1/sites/.../searchAnalytics returns Google's 404 HTML page,
    // which made worker JSON parsing throw earlier.
    const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GSC_SITE_URL)}/searchAnalytics/query`
    // Wrap each call so a Google API error (403 scope missing, 401
    // refresh-token revoked, 404 GSC_SITE_URL not a verified property…)
    // surfaces as a parseable string instead of crashing inside Promise.all.
    async function gscPost(payload: object): Promise<unknown> {
      const r = await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await r.text()
      if (!r.ok) throw new Error(`gsc API ${r.status}: ${text.slice(0, 300)}`)
      try { return JSON.parse(text) } catch { throw new Error('gsc non-JSON response: ' + text.slice(0, 200)) }
    }
    const [queries, pages, totals] = await Promise.all([
      gscPost(body('query')),
      gscPost(body('page')),
      gscPost({ startDate, endDate }),
    ])
    // Flatten the GSC payload into the same shape the UI's mock path uses
    // — saves us a second renderer on the frontend. When the site is too
    // young for Google to have indexed it, .rows is missing/empty and we
    // surface zeros (the bandeau will say so).
    type Row = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }
    const totalsRows: Row[] = (totals as { rows?: Row[] }).rows ?? []
    const total = totalsRows[0] ?? {}
    const qRows: Row[] = (queries as { rows?: Row[] }).rows ?? []
    const pRows: Row[] = (pages as { rows?: Row[] }).rows ?? []
    const clicks = total.clicks ?? 0
    const impressions = total.impressions ?? 0
    return jsonResp({
      configured: true,
      mock: {
        clicks,
        impressions,
        ctr: impressions ? `${((clicks / impressions) * 100).toFixed(2)}%` : '0.00%',
        position: Number((total.position ?? 0).toFixed(1)),
        topQueries: qRows.slice(0, 8).map((r) => ({
          query: r.keys?.[0] ?? '—',
          clicks: r.clicks ?? 0,
          impressions: r.impressions ?? 0,
        })),
        topPages: pRows.slice(0, 8).map((r) => ({
          url: r.keys?.[0] ?? '—',
          clicks: r.clicks ?? 0,
          impressions: r.impressions ?? 0,
        })),
      },
    })
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

/**
 * OAuth refresh_token → access_token (~1h validity).
 * This is the recommended path for individual GSC accounts (non-Workspace).
 * The refresh_token is obtained once via scripts/get-gsc-refresh-token.mjs
 * and stays valid until the user revokes it from their Google account.
 */
async function mintGscAccessTokenOAuth(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await r.json() as { access_token?: string; error?: string; error_description?: string }
  if (!data.access_token) {
    throw new Error(`OAuth refresh failed: ${data.error_description ?? data.error ?? 'unknown'}`)
  }
  return data.access_token
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
  const masked = rows.map((row) => ({
    provider: providerFromEndpoint(row.endpoint),
    tail: row.endpoint.slice(-8),
    ua: row.user_agent ?? null,
    lang: row.lang ?? null,
    created_at: row.created_at ?? null,
    alias: null,
    fullEndpoint: row.endpoint,
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
  // select=* avoids 'column does not exist' errors that turn the whole
  // response into {code, message} instead of an array. The admin
  // shouldn't be filtering columns at the query level anyway — they
  // need to see whatever's there.
  return sbListRows(env, 'profiles')
}

async function handleListBrackets(env: AdminEnv): Promise<Response> {
  return sbListRows(env, 'bracket_predictions')
}

async function sbListRows(env: AdminEnv, table: string): Promise<Response> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/${table}?select=*&order=` +
    // updated_at if it exists; PostgREST falls back gracefully if not.
    'updated_at.desc.nullslast&limit=200'
  const r = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  })
  let body: unknown
  try { body = await r.json() } catch { body = null }
  // If Supabase returned an error object instead of an array (e.g. the
  // ORDER column doesn't exist), retry without the order clause so the
  // admin still gets to see the rows.
  if (!Array.isArray(body)) {
    const retry = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=200`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    })
    try { body = await retry.json() } catch { body = null }
  }
  if (!Array.isArray(body)) {
    // Surface the underlying error so it's visible in the panel
    // (better than silently returning empty).
    return jsonResp({ rows: [], error: body }, 200)
  }
  return jsonResp({ rows: body })
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
  // KV liveness — split into read + write checks so the panel can
  // distinguish 'KV unreachable' (catastrophic) from 'KV writes
  // quota-exhausted for the day' (degraded but the cron's reads still
  // work). On the free tier, writes cap at 1000/day; reads are
  // effectively unlimited.
  let kvReadOk = false
  let kvWriteOk = false
  let kvDetail = ''
  try {
    // Read a guaranteed-existing key written by the cron. Falls back
    // to ANY get — even a miss returning null counts as 'reachable',
    // since the failure mode for KV being down is a thrown error.
    await env.CACHE.get('admin:health-probe')
    kvReadOk = true
  } catch (e) {
    kvDetail = 'read: ' + String(e).slice(0, 80)
  }
  if (kvReadOk) {
    try {
      await env.CACHE.put('admin:health-probe', '1', { expirationTtl: 60 })
      kvWriteOk = true
    } catch (e) {
      // 'KV put() limit exceeded for the day.' lands here on free tier
      // once we burn through 1000 puts. Surface the reason so the
      // operator knows what's degraded.
      kvDetail = 'write: ' + String(e).slice(0, 120)
    }
  }
  return jsonResp({
    espnOk,
    espnMs,
    // kvOk stays in the response for older clients but represents
    // the consolidated 'is KV usable' verdict — reads alone are
    // enough for most worker paths to keep functioning.
    kvOk: kvReadOk,
    kvReadOk,
    kvWriteOk,
    kvDetail: kvDetail || undefined,
    serverTime: new Date().toISOString(),
  })
}

// ─────────────────────────────────────────────────────────────────────
// Write actions
// ─────────────────────────────────────────────────────────────────────

// ─── Scheduled-push management ─────────────────────────────────────
//
// The KickoffScheduler Durable Object holds the queue of pre-kickoff
// alerts (T-60 / T-15 / T-0 per match). These three handlers expose
// LIST / CANCEL / RESCHEDULE so the operator can intervene from the
// admin panel: e.g. cancel a planned alert for a friendly the user
// doesn't care about, or postpone an alert if ESPN's kickoff time
// turns out to be wrong.

async function handleListScheduledPushes(env: AdminEnv): Promise<Response> {
  if (!env.SCHEDULER) return jsonResp({ queue: [], note: 'scheduler DO not bound' })
  try {
    const stub = env.SCHEDULER.get(env.SCHEDULER.idFromName('singleton'))
    const r = await stub.fetch('https://do/inspect')
    const data = (await r.json()) as { queue?: Array<{ id: string; fireAt: number; notif: { title: string; body: string; url?: string; tag?: string } }> }
    const queue = (data.queue ?? []).map((it) => {
      // id shape: '<matchId>-<leadMinutes>' (see scheduledKickoffFor).
      const dashIdx = it.id.lastIndexOf('-')
      const matchId = dashIdx >= 0 ? it.id.slice(0, dashIdx) : it.id
      const leadMinutes = dashIdx >= 0 ? Number(it.id.slice(dashIdx + 1)) : null
      return {
        id: it.id,
        matchId,
        leadMinutes: Number.isFinite(leadMinutes ?? NaN) ? leadMinutes : null,
        fireAt: it.fireAt,
        fireAtIso: new Date(it.fireAt).toISOString(),
        title: it.notif.title,
        body: it.notif.body,
        url: it.notif.url ?? '/today',
        tag: it.notif.tag ?? null,
      }
    })
    return jsonResp({ queue })
  } catch (e) {
    return jsonResp({ error: 'inspect failed', detail: String(e) }, 500)
  }
}

async function handleCancelScheduledPush(req: Request, env: AdminEnv): Promise<Response> {
  if (!env.SCHEDULER) return jsonResp({ error: 'scheduler DO not bound' }, 503)
  const body = (await req.json().catch(() => null)) as { id?: string } | null
  if (!body?.id) return jsonResp({ error: 'id required' }, 400)
  // Also clear the cron's per-(match, lead) sentinel so the next 5-min
  // tick doesn't immediately re-queue the alert we just cancelled. The
  // operator's intent is "no, don't send this one" — the cron will
  // respect that until the sentinel TTL expires.
  try { await env.CACHE.put(`alert:kickoff:${body.id}`, 'cancelled') } catch { /* KV quota — proceed */ }
  const stub = env.SCHEDULER.get(env.SCHEDULER.idFromName('singleton'))
  const r = await stub.fetch('https://do/cancel', {
    method: 'POST',
    body: JSON.stringify({ id: body.id }),
  })
  return new Response(await r.text(), {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  })
}

async function handleReschedulePush(req: Request, env: AdminEnv): Promise<Response> {
  if (!env.SCHEDULER) return jsonResp({ error: 'scheduler DO not bound' }, 503)
  const body = (await req.json().catch(() => null)) as { id?: string; deltaMinutes?: number; newFireAt?: number } | null
  if (!body?.id) return jsonResp({ error: 'id required' }, 400)
  if (typeof body.deltaMinutes !== 'number' && typeof body.newFireAt !== 'number') {
    return jsonResp({ error: 'deltaMinutes or newFireAt required' }, 400)
  }
  const stub = env.SCHEDULER.get(env.SCHEDULER.idFromName('singleton'))
  const r = await stub.fetch('https://do/reschedule', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return new Response(await r.text(), {
    status: r.status,
    headers: { 'content-type': 'application/json' },
  })
}

// ─── Compose-form presets ──────────────────────────────────────────
//
// The operator no longer types kickoff times or team names from
// memory. /preset/matches feeds the dropdown with the next N upcoming
// WC events; /preset/articles surfaces recent published articles for
// the "New article" notification preset. Both keep notification text
// consistent across broadcasts.

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'

async function handlePresetMatches(env: AdminEnv): Promise<Response> {
  // Use cached scoreboard so we don't hammer ESPN every time the
  // compose form opens. 5-min staleness is fine — kickoffs don't move
  // minute-by-minute.
  const cacheKey = 'admin:preset:matches'
  try {
    const cached = await env.CACHE.get(cacheKey)
    if (cached) return new Response(cached, { headers: { 'content-type': 'application/json' } })
  } catch { /* read-fail — fall through to ESPN */ }
  try {
    const r = await fetch(`${ESPN_BASE}/scoreboard?limit=200`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit)
    const data = (await r.json()) as {
      events?: Array<{
        id?: string
        date?: string
        status?: { type?: { state?: string } }
        competitions?: Array<{
          competitors?: Array<{
            homeAway?: string
            team?: { shortDisplayName?: string; displayName?: string; abbreviation?: string; flag?: { href?: string } }
          }>
          venue?: { fullName?: string }
        }>
      }>
    }
    const now = Date.now()
    const upcoming = (data.events ?? [])
      .filter((ev) => ev.status?.type?.state === 'pre' && ev.date && Date.parse(ev.date) > now)
      .sort((a, b) => Date.parse(a.date!) - Date.parse(b.date!))
      .slice(0, 10)
      .map((ev) => {
        const comp = ev.competitions?.[0]
        const home = comp?.competitors?.find((c) => c.homeAway === 'home')
        const away = comp?.competitors?.find((c) => c.homeAway === 'away')
        return {
          id: ev.id,
          date: ev.date,
          home: home?.team?.shortDisplayName ?? home?.team?.displayName ?? '?',
          away: away?.team?.shortDisplayName ?? away?.team?.displayName ?? '?',
          homeAbbr: home?.team?.abbreviation ?? null,
          awayAbbr: away?.team?.abbreviation ?? null,
          venue: comp?.venue?.fullName ?? null,
        }
      })
    const payload = JSON.stringify({ matches: upcoming })
    try { await env.CACHE.put(cacheKey, payload, { expirationTtl: 300 }) } catch { /* KV quota — return without caching */ }
    return new Response(payload, { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return jsonResp({ error: 'espn fetch failed', detail: String(e), matches: [] }, 502)
  }
}

async function handlePresetArticles(env: AdminEnv): Promise<Response> {
  // Recent published articles — last 10, newest first. Used by the
  // 'New article' preset to pre-fill title/url consistently.
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/articles?status=eq.published&select=id,slug,title,excerpt,published_at&order=published_at.desc.nullslast&limit=10`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  if (!r.ok) return jsonResp({ error: 'supabase fetch failed', status: r.status, articles: [] }, 502)
  const rows = (await r.json()) as Array<{ id: string; slug: string; title: string; excerpt: string | null; published_at: string | null }>
  return jsonResp({ articles: rows })
}

async function handleAdminBroadcast(req: Request, env: AdminEnv): Promise<Response> {
  // Validate inputs the same way the public /push/broadcast does so the
  // semantics stay identical.
  const raw = await readBoundedJson(req, 4 * 1024)
  if (!raw || typeof raw !== 'object') return jsonResp({ error: 'bad json' }, 400)
  const p = raw as { title?: unknown; body?: unknown; url?: unknown; tag?: unknown; icon?: unknown }
  const title = safeString(p.title, 100) ?? 'WC26 Live'
  const body = safeString(p.body, 240) ?? 'Match update'
  const targetUrl = safeString(p.url, 200) ?? '/today'
  if (!targetUrl.startsWith('/')) return jsonResp({ error: 'url must be relative' }, 400)
  const tag = safeString(p.tag, 60) ?? 'admin-broadcast'
  const rawIcon = safeString(p.icon, 200)
  const icon = rawIcon && rawIcon.startsWith('/') ? rawIcon : undefined
  // Direct call instead of internal fetch — Workers refuse same-host
  // fetches (loop guard). The admin session check above already
  // authorised the caller; broadcastCore is pure data + push fan-out.
  const result = await broadcastCore(env as unknown as Env, { title, body, url: targetUrl, tag, icon })
  return jsonResp({ ok: true, ...result })
}

async function handleAdminSinglePush(req: Request, env: AdminEnv): Promise<Response> {
  const raw = await readBoundedJson(req, 4 * 1024)
  if (!raw || typeof raw !== 'object') return jsonResp({ error: 'bad json' }, 400)
  const p = raw as { endpoint?: unknown; title?: unknown; body?: unknown; url?: unknown }
  const endpoint = safeString(p.endpoint, 600)
  if (!endpoint) return jsonResp({ error: 'missing endpoint' }, 400)
  // Resolve the full subscription row (we need p256dh + auth keys for
  // sendWebPush). Same lookup the public /push/test does, inlined to
  // avoid the same-worker fetch loop.
  const lookupResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=endpoint,p256dh,auth&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  const rows = (await lookupResp.json()) as Array<{ endpoint: string; p256dh: string; auth: string }>
  const row = rows[0]
  if (!row) return jsonResp({ error: 'subscription not found' }, 404)
  const sub: PushSub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
  const title = safeString(p.title, 100) ?? 'WC26 Live'
  const body = safeString(p.body, 240) ?? 'Test'
  const url = safeString(p.url, 200) ?? '/today'
  const r = await sendWebPush(env as unknown as Env, sub, { title, body, url, tag: 'wc26-admin-test' })
  return jsonResp({ ok: r.ok, status: r.status }, r.ok ? 200 : 502)
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

// ─── News pipeline endpoints ────────────────────────────────────────
//
// GET  /admin/news/list?status=draft  → list articles (default: draft)
// POST /admin/news/<id>/approve       → status='published', published_at=now()
// POST /admin/news/<id>/reject        → status='archived', archived_at=now()
// POST /admin/news/<id>/delete        → hard delete
// POST /admin/news/<id>/edit          → update title/body/excerpt
// POST /admin/news/trigger            → kick the cron pipeline once (debug)

async function handleListNews(env: AdminEnv, req: Request): Promise<Response> {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'draft'
  const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50'))
  try {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/articles?status=eq.${encodeURIComponent(status)}&select=id,slug,title,excerpt,body,image_url,source_url,source_name,score,status,pinned_to_home,title_ar,created_at,published_at,archived_at&order=created_at.desc&limit=${limit}`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      }
    )
    if (!r.ok) {
      // Bubble Supabase's own error text up so the panel surfaces
      // "relation 'articles' does not exist" instead of a bare 500.
      const detail = await r.text()
      const tableMissing = /relation .* does not exist|undefined_table|articles/i.test(detail)
      return jsonResp({
        error: tableMissing ? 'table_missing' : 'supabase_list_failed',
        hint: tableMissing
          ? 'Run worker/sql/articles.sql in the Supabase SQL editor first.'
          : 'Supabase returned a non-2xx response.',
        supabase_status: r.status,
        supabase_body: detail.slice(0, 500),
      }, 500)
    }
    const rows = await r.json()
    return jsonResp({ articles: rows })
  } catch (e) {
    return jsonResp({ error: 'list_threw', message: String(e) }, 500)
  }
}

async function handleNewsAction(env: AdminEnv, req: Request, pathname: string): Promise<Response> {
  // /admin/news/<id>/<action>  OR  /admin/news/trigger
  const parts = pathname.split('/').filter(Boolean) // ['admin','news', id, action]
  const tail = parts[2]
  const action = parts[3]

  if (tail === 'trigger' && !action) {
    // Auto-pick #1 + insert immediately (kept for cron-style debug).
    const { runNewsPipeline } = await import('./news')
    const report = await runNewsPipeline(env as unknown as Parameters<typeof runNewsPipeline>[0])
    return jsonResp({ ok: true, triggered: true, report })
  }

  if (action === 'post-image' && req.method === 'POST') {
    // Branded FB post card, generated by the ADMIN BROWSER (canvas) and
    // uploaded here just before approve/share-facebook. Stored in KV,
    // served publicly at /post-img/<id>/<lang>.png (see index.ts), and
    // picked up by the FB publish paths below in place of the raw
    // article image. 7-day TTL — a card is only needed at publish time.
    const lang = new URL(req.url).searchParams.get('lang') === 'ar' ? 'ar' : 'en'
    const bytes = await req.arrayBuffer()
    if (bytes.byteLength < 1_000 || bytes.byteLength > 4_000_000) {
      return jsonResp({ error: 'bad_size', size: bytes.byteLength }, 400)
    }
    await env.CACHE.put(`postimg:${tail}:${lang}`, bytes, { expirationTtl: 7 * 86_400 })
    return jsonResp({ ok: true, url: `${WORKER_PUBLIC}/post-img/${tail}/${lang}.png` })
  }

  if (tail === 'backfill-images' && !action && req.method === 'POST') {
    // Verbose backfill: returns per-article diagnostics so we can see
    // which step fails — regex match, ESPN API status, image array
    // length — without re-deploying for every debug round.
    const list = await fetch(
      `${env.SUPABASE_URL}/rest/v1/articles?select=id,source_url,image_url,title&image_url=is.null&limit=100`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    )
    if (!list.ok) return jsonResp({ error: 'list_failed', status: list.status }, 500)
    const rows = await list.json() as Array<{ id: string; source_url: string; title: string }>
    const { fetchOgImage } = await import('./news')
    const details: Array<Record<string, unknown>> = []
    for (const row of rows) {
      const espnMatch = row.source_url.match(/espn\.com\/[^?]*\/id\/(\d+)/i)
      let espnApiStatus: number | string = 'not-called'
      let espnShape: string = 'not-called'
      if (espnMatch) {
        try {
          const r = await fetch(`https://now.core.api.espn.com/v1/sports/news/${espnMatch[1]}`, {
            headers: {
              'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
              accept: 'application/json',
            },
          })
          espnApiStatus = r.status
          if (r.ok) {
            const j = await r.json() as Record<string, unknown>
            // Dump top-level keys + whether each common image-bearing
            // key is an array. Lets us see at a glance which shape ESPN
            // is serving today: { images: [...] } vs { headlines: [{
            // images: [...] }] } vs something new.
            const keys = Object.keys(j).slice(0, 10).join(',')
            const imgsLen = Array.isArray(j.images) ? `images[${j.images.length}]` : 'no-images'
            const hLen = Array.isArray(j.headlines) ? `headlines[${j.headlines.length}]` : 'no-headlines'
            espnShape = `keys={${keys}} ${imgsLen} ${hLen}`
          }
        } catch (e) { espnApiStatus = 'threw:' + String(e) }
      }
      const img = await fetchOgImage(row.source_url)
      if (img) {
        await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'PATCH',
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'content-type': 'application/json',
            prefer: 'return=minimal',
          },
          body: JSON.stringify({ image_url: img }),
        })
      }
      details.push({
        id: row.id,
        title: row.title.slice(0, 50),
        source_url: row.source_url,
        espn_id_matched: espnMatch ? espnMatch[1] : null,
        espn_api_status: espnApiStatus,
        espn_shape: espnShape,
        final_image: img,
        patched: !!img,
      })
    }
    return jsonResp({ ok: true, scanned: rows.length, patched: details.filter((d) => d.patched).length, details })
  }

  if (tail === 'poll' && !action) {
    // Return top 10 candidates skipping anything already in DB. The
    // operator picks which one to produce. Optional `keyword` query
    // param narrows the selection to title/description matches.
    // Optional `sources` param (comma-separated names) restricts which
    // RSS feeds are polled — e.g. "BBC Sport,Footmercato".
    const url = new URL(req.url)
    const keyword = url.searchParams.get('keyword') ?? undefined
    const sourcesRaw = url.searchParams.get('sources')
    const sources = sourcesRaw
      ? sourcesRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined
    // mode=botola swaps the RSS pool for the Moroccan-outlet searches.
    const mode = url.searchParams.get('mode') === 'botola' ? 'botola' as const : undefined
    const { pollTopCandidates } = await import('./news')
    const result = await pollTopCandidates(
      env as unknown as Parameters<typeof pollTopCandidates>[0],
      10,
      keyword || undefined,
      sources,
      mode
    )
    return jsonResp({ ok: true, ...result })
  }

  if (tail === 'reject-candidate' && !action && req.method === 'POST') {
    // Persist a 'never show this again' marker for a polled candidate
    // the operator declined. Frontend should remove the row from its
    // local state on a 200 OK.
    const body = await req.json().catch(() => null) as { candidate?: { link: string; title: string; source: string } } | null
    if (!body?.candidate?.link) return jsonResp({ error: 'missing_candidate' }, 400)
    const { rejectCandidate } = await import('./news')
    const result = await rejectCandidate(
      env as unknown as Parameters<typeof rejectCandidate>[0],
      body.candidate
    )
    return jsonResp(result, result.ok ? 200 : 502)
  }

  if (tail === 'produce' && !action && req.method === 'POST') {
    // Run AI rewrite + insert on a single candidate the operator
    // already saw in /poll. The candidate payload is echoed back so
    // we don't refetch RSS.
    const body = await req.json().catch(() => null) as { candidate?: unknown } | null
    if (!body?.candidate) return jsonResp({ error: 'missing_candidate' }, 400)
    const { produceFromCandidate } = await import('./news')
    const result = await produceFromCandidate(
      env as unknown as Parameters<typeof produceFromCandidate>[0],
      body.candidate as Parameters<typeof produceFromCandidate>[1]
    )
    return jsonResp(result)
  }

  if (!tail || !action) return jsonResp({ error: 'bad_path' }, 400)
  const id = tail

  if (action === 'approve') {
    // Site flags decide whether this article ships bilingual.
    const { loadPushSettings, loadSiteSettings, broadcastCore } = await import('./index')
    const settings = await loadPushSettings(env as unknown as Parameters<typeof loadPushSettings>[0])
    const site = await loadSiteSettings(env as unknown as Parameters<typeof loadSiteSettings>[0])

    // Step 0 (Arabic mode ON): translate BEFORE flipping to published so
    // the article goes live with both languages at once — no window where
    // the site/FB see EN-only. Skipped if a translation already exists
    // (re-approve after unpublish). Translation failure never blocks the
    // publish: we log and ship EN-only.
    let arCols: { title_ar?: string; excerpt_ar?: string; body_ar?: string } = {}
    if (site.arabicArticles) {
      try {
        const cur = await fetchArticleRow(env, id)
        if (cur && !(cur.title_ar && cur.body_ar) && cur.title && cur.body) {
          const { translateArticleToArabic } = await import('./news')
          const ar = await translateArticleToArabic(
            env as unknown as Parameters<typeof translateArticleToArabic>[0],
            { title: cur.title, excerpt: cur.excerpt ?? '', body: cur.body }
          )
          if (ar) arCols = ar
          else console.log('[news:ar] translation returned null — publishing EN-only for', id)
        }
      } catch (e) {
        console.log('[news:ar] translation step failed — publishing EN-only:', e)
      }
    }

    const result = await updateArticle(env, id, { status: 'published', published_at: nowIso(), archived_at: null, ...arCols })
    // Parse the published row once — used by both side-effects below.
    let a: { slug?: string; title?: string; excerpt?: string | null; image_url?: string | null; title_ar?: string | null; excerpt_ar?: string | null } | undefined
    try {
      const data = await result.clone().json() as { article?: typeof a }
      a = data.article
    } catch { /* ignore */ }

    // Side-effect 1: fire a broadcast push so subscribers get a tap-to-
    // read link. Gated on the articlePublished setting. Bullet-proof —
    // push failures don't roll the publish back.
    try {
      if (a?.slug && a?.title && settings.enabled && settings.articlePublished.enabled) {
        await broadcastCore(env as unknown as Parameters<typeof broadcastCore>[0], {
          title: `📰 ${a.title}`,
          body: a.excerpt?.slice(0, 140) ?? 'Tap to read on Pressing 90.',
          url: `/news/${a.slug}`,
          tag: `article-${a.slug}`,
        })
      }
    } catch (e) {
      console.log('[push] article publish broadcast failed:', e)
    }

    // Side-effect 2: auto-publish to the Facebook page via the Make
    // webhook. Gated on the facebookAutoPost toggle so the operator can
    // mute it. Same bullet-proof contract — a webhook failure never
    // rolls back the publish. Skips silently if FB isn't configured.
    try {
      if (a?.slug && a?.title && settings.facebookAutoPost.enabled && env.MAKE_FB_WEBHOOK_URL) {
        // ?ref=fb — picked up by the site's analytics beacon so these
        // visits are attributed to Facebook in the admin visitor stats.
        const link = `https://pressing90.live/news/${a.slug}?ref=fb`
        const message = `${a.title}${a.excerpt ? '\n\n' + a.excerpt : ''}\n\n👉 ${link}`
        // Branded split card (photo + generated panel + QR) uploaded by
        // the admin browser just before this call; raw image fallback.
        const cardEn = await fbCardUrl(env, id, 'en')
        await postToFacebookWebhook(env, { message, link, title: a.title, image_url: cardEn ?? a.image_url ?? null })
        // Bilingual: a SECOND post in Arabic, linking to the Arabic view
        // (?lang=ar) so the click lands on the right language. Only when
        // the article actually carries a translation. The AR card only
        // exists when the translation predated the approve — otherwise
        // reuse the EN card (brand-consistent beats raw).
        if (site.arabicArticles && a.title_ar) {
          const linkAr = `${link}&lang=ar`
          const messageAr = `${a.title_ar}${a.excerpt_ar ? '\n\n' + a.excerpt_ar : ''}\n\n👉 ${linkAr}`
          const cardAr = await fbCardUrl(env, id, 'ar')
          await postToFacebookWebhook(env, { message: messageAr, link: linkAr, title: a.title_ar, image_url: cardAr ?? cardEn ?? a.image_url ?? null })
        }
      }
    } catch (e) {
      console.log('[fb] article auto-post failed:', e)
    }
    return result
  }
  // Manual (re)translation from the admin — for articles published while
  // Arabic mode was off, or to regenerate a translation the editor
  // didn't like. Overwrites the AR columns; EN untouched.
  if (action === 'translate-ar') {
    const cur = await fetchArticleRow(env, id)
    if (!cur?.title || !cur.body) return jsonResp({ error: 'article_not_found' }, 404)
    const { translateArticleToArabic } = await import('./news')
    const ar = await translateArticleToArabic(
      env as unknown as Parameters<typeof translateArticleToArabic>[0],
      { title: cur.title, excerpt: cur.excerpt ?? '', body: cur.body }
    )
    if (!ar) return jsonResp({ error: 'translation_failed' }, 502)
    return updateArticle(env, id, ar)
  }
  if (action === 'reject')  return updateArticle(env, id, { status: 'archived',  archived_at: nowIso() })
  if (action === 'unpublish') return updateArticle(env, id, { status: 'draft',  published_at: null })
  if (action === 'republish') return updateArticle(env, id, { status: 'published', published_at: nowIso(), archived_at: null })
  // Toggle the home-page pin flag. NewsTicker filters by pinned_to_home
  // so unpinning instantly drops the article from the carousel without
  // changing its publication state — it stays readable at /news/<slug>.
  if (action === 'pin')   return updateArticle(env, id, { pinned_to_home: true  })
  if (action === 'unpin') return updateArticle(env, id, { pinned_to_home: false })
  if (action === 'delete') {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        prefer: 'return=minimal',
      },
    })
    if (!r.ok) return jsonResp({ error: 'delete_failed', status: r.status }, 500)
    return jsonResp({ ok: true, deleted: id })
  }
  if (action === 'share-facebook') {
    // Push the article to the Facebook Page via a Make.com webhook.
    // Make's pre-verified Facebook connection does the actual posting,
    // so we don't need Meta business verification on our own app.
    if (!env.MAKE_FB_WEBHOOK_URL) {
      return jsonResp({ error: 'fb_not_configured', hint: 'Set MAKE_FB_WEBHOOK_URL secret' }, 400)
    }
    // Pull the article so we send a clean, complete payload.
    const ar = await fetch(
      `${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&select=slug,title,excerpt,image_url,title_ar,excerpt_ar&limit=1`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    )
    const rows = await ar.json().catch(() => []) as Array<{ slug?: string; title?: string; excerpt?: string | null; image_url?: string | null; title_ar?: string | null; excerpt_ar?: string | null }>
    const a = rows[0]
    if (!a?.slug || !a?.title) return jsonResp({ error: 'article_not_found' }, 404)
    // ?ref=fb — the site's analytics beacon reads it so Facebook-driven
    // visits show up as 'facebook' in the admin visitor stats.
    const link = `https://pressing90.live/news/${a.slug}?ref=fb`
    const message = `${a.title}${a.excerpt ? '\n\n' + a.excerpt : ''}\n\n👉 ${link}`
    const cardEn = await fbCardUrl(env, id, 'en')
    try {
      const hook = await fetch(env.MAKE_FB_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, link, title: a.title, image_url: cardEn ?? fbProxiedImage(a.image_url) }),
      })
      if (!hook.ok) return jsonResp({ error: 'webhook_failed', status: hook.status }, 502)
      // Same contract as the Approve auto-post: when the article carries an
      // Arabic version AND the Arabic switch is on, publish the Arabic post
      // too (links to ?lang=ar). One click = both languages, no second step.
      let postedAr = false
      try {
        const { loadSiteSettings } = await import('./index')
        const site = await loadSiteSettings(env as unknown as Parameters<typeof loadSiteSettings>[0])
        if (site.arabicArticles && a.title_ar) {
          const linkAr = `${link}&lang=ar`
          const messageAr = `${a.title_ar}${a.excerpt_ar ? '\n\n' + a.excerpt_ar : ''}\n\n👉 ${linkAr}`
          const cardAr = await fbCardUrl(env, id, 'ar')
          const hookAr = await fetch(env.MAKE_FB_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: messageAr, link: linkAr, title: a.title_ar, image_url: cardAr ?? cardEn ?? fbProxiedImage(a.image_url) }),
          })
          postedAr = hookAr.ok
        }
      } catch (e) {
        console.log('[fb] arabic manual post failed:', e)
      }
      return jsonResp({ ok: true, posted: link, postedArabic: postedAr })
    } catch (e) {
      return jsonResp({ error: 'webhook_error', detail: String(e) }, 502)
    }
  }
  if (action === 'edit') {
    const body = await req.json().catch(() => null) as Partial<{ title: string; excerpt: string; body: string; image_url: string }> | null
    if (!body) return jsonResp({ error: 'bad_body' }, 400)
    const allowed: Record<string, unknown> = {}
    if (typeof body.title === 'string') allowed.title = body.title
    if (typeof body.excerpt === 'string') allowed.excerpt = body.excerpt
    if (typeof body.body === 'string') allowed.body = body.body
    if (typeof body.image_url === 'string') allowed.image_url = body.image_url
    return updateArticle(env, id, allowed)
  }
  return jsonResp({ error: 'unknown_action' }, 400)
}

// ─────────────────────────────────────────────────────────────────────
// Social posts — AI generator + scheduler for the Facebook page
// ─────────────────────────────────────────────────────────────────────

/** Fallback image so every FB post has a visual even when the source
 *  article / generated post has no image of its own. The Make scenario
 *  uses "Create a Post with Photos", which needs a REAL, publicly
 *  reachable raster image — /og.png doesn't exist (the SPA returns HTML
 *  for unknown paths, which Facebook rejects with OAuthException 100),
 *  so we point at the 512×512 PWA icon which is a genuine PNG. */
export const FB_FALLBACK_IMAGE = 'https://pressing90.live/icon-512.png'

const WORKER_PUBLIC = 'https://wc26-api.nameless-violet-5dc1.workers.dev'

/** Public URL of the branded post card uploaded for this article+lang,
 *  or null when the admin browser didn't upload one (canvas failure,
 *  very old tab…) — callers then fall back to the raw article image. */
async function fbCardUrl(env: AdminEnv, id: string, lang: 'en' | 'ar'): Promise<string | null> {
  const v = await env.CACHE.get(`postimg:${id}:${lang}`, 'stream')
  if (!v) return null
  try { await v.cancel() } catch { /* just an existence probe */ }
  return `${WORKER_PUBLIC}/post-img/${id}/${lang}.png`
}

/** Wrap a source image URL through our /fb-img proxy so Facebook always
 *  fetches a reachable image from our origin (press-site CDNs frequently
 *  block FB's fetcher → OAuthException 100). Images already served from
 *  our own domains are passed through untouched. Empty → brand fallback. */
export function fbProxiedImage(raw?: string | null): string {
  const src = (raw && raw.trim()) ? raw.trim() : FB_FALLBACK_IMAGE
  if (src.startsWith(WORKER_PUBLIC) || src.startsWith('https://pressing90.live/')) return src
  return `${WORKER_PUBLIC}/fb-img?u=${encodeURIComponent(src)}`
}

/** POST the post payload to the Make.com webhook that publishes to FB. */
/**
 * Real-visitor aggregates from the `hits` table (written by the public
 * /hit beacon — one row per pageview, country from Cloudflare geo).
 * ?days=7|30. PostgREST aggregates aren't enabled on this project, so
 * we page through raw rows (1k/page, hard cap 20k) and reduce here.
 */
async function handleVisits(env: Env, req: Request): Promise<Response> {
  const url = new URL(req.url)
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') ?? '7', 10) || 7))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  type HitRow = { ts: string; country: string | null; source: string | null; lang: string | null; new_session: boolean }
  const rows: HitRow[] = []
  for (let page = 0; page < 20; page++) {
    const r = await fetch(
      `${env.SUPABASE_URL}/rest/v1/hits?ts=gte.${encodeURIComponent(since)}&select=ts,country,source,lang,new_session&order=ts.desc&limit=1000&offset=${page * 1000}`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    )
    if (!r.ok) return jsonResp({ error: 'supabase fetch failed', status: r.status }, 502)
    const batch = await r.json().catch(() => []) as HitRow[]
    rows.push(...batch)
    if (batch.length < 1000) break
  }
  const count = (key: (h: HitRow) => string | null | undefined) => {
    const m = new Map<string, number>()
    for (const h of rows) {
      const k = key(h) || '—'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, count: n }))
  }
  // days=1 → hourly buckets ('YYYY-MM-DDTHH', sorts naturally); else daily.
  const byDay = count((h) => (days === 1 ? h.ts.slice(0, 13) : h.ts.slice(0, 10)))
    .sort((a, b) => a.key.localeCompare(b.key))
  return jsonResp({
    ok: true,
    days,
    pageviews: rows.length,
    sessions: rows.filter((h) => h.new_session).length,
    byCountry: count((h) => h.country).slice(0, 15),
    bySource: count((h) => h.source).slice(0, 10),
    byLang: count((h) => h.lang).slice(0, 5),
    byDay,
  })
}

export async function postToFacebookWebhook(
  env: { MAKE_FB_WEBHOOK_URL?: string },
  payload: { message: string; link?: string | null; image_url?: string | null; title?: string }
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!env.MAKE_FB_WEBHOOK_URL) return { ok: false, error: 'fb_not_configured' }
  try {
    const hook = await fetch(env.MAKE_FB_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, image_url: fbProxiedImage(payload.image_url) }),
    })
    if (!hook.ok) return { ok: false, status: hook.status, error: 'webhook_failed' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

const SITE_URL = 'https://pressing90.live'

// POST /admin/social/generate  { topic } → AI-written FB post promoting the site
async function handleSocialGenerate(env: AdminEnv, req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as { topic?: string } | null
  const topic = body?.topic?.trim()
  if (!topic) return jsonResp({ error: 'missing_topic' }, 400)
  const { generateSocialPost } = await import('./news')
  const result = await generateSocialPost(
    env as unknown as Parameters<typeof generateSocialPost>[0],
    topic
  )
  if (!result.message) return jsonResp({ error: 'ai_failed', raw: result.raw?.slice(0, 300) }, 502)
  return jsonResp({ ok: true, message: result.message })
}

// GET /admin/social/list → all social posts, newest first
async function handleSocialList(env: AdminEnv): Promise<Response> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/social_posts?select=*&order=created_at.desc&limit=100`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  )
  if (!r.ok) return jsonResp({ error: 'list_failed', status: r.status, posts: [] }, 200)
  const posts = await r.json().catch(() => [])
  return jsonResp({ ok: true, posts })
}

// POST /admin/social/create { message, link?, image_url?, scheduled_at? }
// scheduled_at present → status 'scheduled'; absent → 'draft'
async function handleSocialCreate(env: AdminEnv, req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as {
    message?: string; link?: string; image_url?: string; scheduled_at?: string
  } | null
  const message = body?.message?.trim()
  if (!message) return jsonResp({ error: 'missing_message' }, 400)
  const row = {
    message,
    link: body?.link?.trim() || SITE_URL,
    image_url: body?.image_url?.trim() || null,
    scheduled_at: body?.scheduled_at || null,
    status: body?.scheduled_at ? 'scheduled' : 'draft',
  }
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/social_posts`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  if (!r.ok) return jsonResp({ error: 'create_failed', status: r.status, detail: await r.text() }, 502)
  const created = await r.json().catch(() => [])
  return jsonResp({ ok: true, post: Array.isArray(created) ? created[0] : created })
}

// POST /admin/social/<id>/<action>  action ∈ publish | delete
async function handleSocialAction(env: AdminEnv, req: Request, pathname: string): Promise<Response> {
  const parts = pathname.replace('/admin/social/', '').split('/')
  const id = parts[0]
  const action = parts[1]
  if (!id || !action) return jsonResp({ error: 'bad_path' }, 400)

  if (action === 'delete') {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/social_posts?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, prefer: 'return=minimal' },
    })
    if (!r.ok) return jsonResp({ error: 'delete_failed', status: r.status }, 502)
    return jsonResp({ ok: true, deleted: id })
  }

  if (action === 'publish') {
    // Pull the post, push it to Facebook now, mark published.
    const ar = await fetch(
      `${env.SUPABASE_URL}/rest/v1/social_posts?id=eq.${encodeURIComponent(id)}&select=message,link,image_url&limit=1`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    )
    const rows = await ar.json().catch(() => []) as Array<{ message?: string; link?: string | null; image_url?: string | null }>
    const post = rows[0]
    if (!post?.message) return jsonResp({ error: 'post_not_found' }, 404)
    const sent = await postToFacebookWebhook(env, { message: post.message, link: post.link, image_url: post.image_url, title: post.message.slice(0, 80) })
    if (!sent.ok) return jsonResp({ error: sent.error ?? 'webhook_failed', status: sent.status }, 502)
    await fetch(`${env.SUPABASE_URL}/rest/v1/social_posts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'published', published_at: nowIso() }),
    })
    return jsonResp({ ok: true, published: id })
  }

  return jsonResp({ error: 'unknown_action' }, 400)
}

async function updateArticle(env: AdminEnv, id: string, patch: Record<string, unknown>): Promise<Response> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  })
  if (!r.ok) return jsonResp({ error: 'update_failed', status: r.status, detail: await r.text() }, 500)
  const rows = await r.json() as unknown[]
  return jsonResp({ ok: true, article: rows[0] })
}

type ArticleRow = {
  id: string; slug?: string; title?: string; excerpt?: string | null; body?: string
  title_ar?: string | null; excerpt_ar?: string | null; body_ar?: string | null
}
async function fetchArticleRow(env: AdminEnv, id: string): Promise<ArticleRow | null> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(id)}&select=id,slug,title,excerpt,body,title_ar,excerpt_ar,body_ar&limit=1`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  )
  if (!r.ok) return null
  const rows = await r.json() as ArticleRow[]
  return rows[0] ?? null
}

function nowIso(): string {
  return new Date().toISOString()
}
