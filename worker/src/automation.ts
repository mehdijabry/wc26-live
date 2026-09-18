/**
 * Pressing 90' — Facebook automation ("l'usine").
 *
 * Runs from the per-minute cron tick (see scheduled() in index.ts) and
 * from the news pipeline. Everything it publishes is ENGLISH ONLY
 * (Mehdi's rule, 2026-09-06): Arabic stays a manual-studio feature.
 *
 *   • Morning (08:00 Morocco): "Today's matches" post (card) + story
 *     pages (6 matches each) + one reel (English voice via Workers AI
 *     MeloTTS, signature music mixed by the studio).
 *   • Every minute: one FULL-TIME score post per tick (≥ 8 min apart,
 *     capped per day) for the big competitions only.
 *   • Every 2 h (news cron): the freshly produced article is published
 *     WITHOUT approval when it passes the quality gates, then posted
 *     (split card) + a story.
 *   • 04:00: media older than 7 days is deleted from Supabase Storage.
 *
 * Rendering happens on the Render-hosted studio (studio/), a node-canvas
 * + ffmpeg service. Reels are asynchronous: the studio calls back
 * POST /studio/callback when the mp4 is ready.
 *
 * Facebook goes through Make.com webhooks (no Page token here):
 *   MAKE_FB_WEBHOOK_URL         photo posts (existing scenario)
 *   MAKE_FB_VIDEO_WEBHOOK_URL   scenario 2: webhook → "Upload a Video"
 *                               {kind:'video', video_url, description, title}
 *   FB_PAGE_TOKEN               optional Page access token → stories
 *                               (photo_stories) + real Reels via Graph API
 * A missing webhook just skips that output (logged), never throws.
 */
import { TALES, TALE_LABELS, TALE_SUBJECTS, type Tale, type TaleCover, type TaleLang, type TaleText } from './tales'
import type { Env } from './index'
import { enqueueGoalAnim, processGoalAnim, goalAnimCallback, goalAnimJob, goalAnimQueue, resetGoalAnim, pickBestGoal, buildScene, type GoalAnimItem } from './goalanim'

export const SITE = 'https://pressing90.live'
export const WORKER_PUBLIC = 'https://wc26-api.nameless-violet-5dc1.workers.dev'
const TZ = 'Africa/Casablanca'
const BUCKET = 'media'
const MIN_GAP_MS = 8 * 60_000  // spacing between automated posts

// ─── Settings (KV) ─────────────────────────────────────────────────
export interface AutomationSettings {
  enabled: boolean          // master kill-switch
  articles: boolean; articlesPerDay: number
  matchday: boolean; morningHour: number
  ftPosts: boolean; ftPerDay: number
  stories: boolean; storiesPerDay: number
  reels: boolean
  goalAlerts: boolean; goalReelsPerDay: number   // reel per goal in the big competitions (Mehdi, 2026-09-08)
  maxPostsPerDay: number                          // global Facebook feed budget (posts + reels), anti-spam (Mehdi, 2026-09-13)
  barcaDaily: boolean                             // Barça first: goals always posted, Barça match first, FT reel, 09:00 « برشلونة اليوم » digest (Mehdi, 2026-09-13)
  resultsReel: boolean                            // evening "full-time results" reel, all finished big matches
  tales: boolean; taleDay: number; taleHour: number   // Football Stories: weekly story day (0=Sun … 6=Sat) + hour (Morocco)
  freeVoices: boolean                                  // "free production": no ElevenLabs — Orion (EN), MeloTTS (FR), music only (AR)
  taleLangs: { en: boolean; fr: boolean; ar: boolean }  // languages published for each story (admin toggles)
  taleGapMin: number                                    // minutes between the language versions
  taleAutoGen: boolean                                  // daily: draft the next story from the subject bank when the reserve runs low
  taleOrder: string                                     // publication order of the languages, e.g. "en,ar,fr"
  mainLang: 'ar' | 'en'                                 // language of captions + voices for matchday / FT / goals / articles (audit 2026-09-11: 97 % Arabic-speaking audience)
  articleReels: boolean                                 // article digest reels (2-3 s average play time → off)
  barcaFtStyle: 'poster' | 'reel'                       // Barça full time: editorial poster (photo, scorers + player bust) or the animated reel (2026-09-14)
  lineups: boolean                                      // Barça lineups: predicted XI (last confirmed XI) 6-3 h before kick-off, confirmed XI when ESPN publishes it (2026-09-14)
  talesPerDay: number                                   // Football Stories per day (first N of taleSlots) — Mehdi, 2026-09-16: 3
  taleSlots: string                                     // publication slots, local time "HH:MM,HH:MM,…" — first reel 08:30, last reel (2 AR + 2 EN every 15 min) 19:30
  taleVariants: number                                  // reels per story and language: same body, different cover (thumbnail) + caption — 4
  taleVariantGapMin: number                             // minutes between two variants — 15
  goalScope: 'barca' | 'barca+morocco'                  // goal reels: Barça matches only, or also Moroccan scorers
  taleArt: 'photos' | 'comic'                           // story visuals: free-licence photos only (Mehdi, 2026-09-16: « ne crée rien ») or AI comic panels
  goalAnim: boolean                                     // « كيف جاء الهدف » (2026-09-18): narrated recreation of the best goal of each finished match of the day
  goalAnimPerDay: number                                // daily cap of goal recreations (each render takes ~30 min on the studio)
  goalAnimScope: 'all' | 'barca'                        // every match of the pool, or Barça matches only
  goalAnimFps: number                                   // render frame rate (20 = ~30 min per reel on the 0.1-CPU studio)
}
export const DEFAULT_AUTOMATION: AutomationSettings = {
  enabled: false,
  articles: true, articlesPerDay: 12,
  matchday: true, morningHour: 8,
  ftPosts: true, ftPerDay: 8,
  stories: true, storiesPerDay: 10,
  reels: true,
  goalAlerts: true, goalReelsPerDay: 20,
  maxPostsPerDay: 18,
  barcaDaily: true,
  resultsReel: true,
  tales: true, taleDay: 5, taleHour: 17,
  freeVoices: true,   // Mehdi, 2026-09-10: free Microsoft neural voices by default (Jamal MA / Andrew / Henri)
  taleLangs: { en: true, fr: true, ar: true }, taleGapMin: 90,
  taleAutoGen: true,
  taleOrder: 'en,ar,fr',
  barcaFtStyle: 'poster', lineups: true,
  talesPerDay: 3, taleVariants: 2, taleVariantGapMin: 15, goalScope: 'barca', taleSlots: '08:30,13:30,18:45', taleArt: 'photos',
  mainLang: 'ar', articleReels: false,
  goalAnim: true, goalAnimPerDay: 4, goalAnimScope: 'all', goalAnimFps: 20,
}
const KEY = 'auto:settings'
export async function loadAutomationSettings(env: Env): Promise<AutomationSettings> {
  try {
    const raw = await env.CACHE.get(KEY)
    if (!raw) return DEFAULT_AUTOMATION
    return { ...DEFAULT_AUTOMATION, ...(JSON.parse(raw) as Partial<AutomationSettings>) }
  } catch { return DEFAULT_AUTOMATION }
}
export async function saveAutomationSettings(env: Env, patch: Partial<AutomationSettings>): Promise<AutomationSettings> {
  const cur = await loadAutomationSettings(env)
  const next: AutomationSettings = { ...cur }
  for (const k of Object.keys(DEFAULT_AUTOMATION) as Array<keyof AutomationSettings>) {
    const v = patch[k]
    if (typeof v === typeof DEFAULT_AUTOMATION[k]) (next as unknown as Record<string, unknown>)[k] = v
  }
  next.articlesPerDay = Math.max(0, Math.min(30, next.articlesPerDay))
  next.ftPerDay = Math.max(0, Math.min(30, next.ftPerDay))
  next.storiesPerDay = Math.max(0, Math.min(30, next.storiesPerDay))
  next.morningHour = Math.max(0, Math.min(23, next.morningHour))
  next.goalReelsPerDay = Math.max(0, Math.min(60, Number(next.goalReelsPerDay ?? 20)))
  next.maxPostsPerDay = Math.max(5, Math.min(60, Number(next.maxPostsPerDay ?? 18)))
  next.taleDay = Math.max(0, Math.min(6, Number(next.taleDay ?? 5)))
  next.taleHour = Math.max(0, Math.min(23, Number(next.taleHour ?? 17)))
  next.taleGapMin = Math.max(5, Math.min(600, Number(next.taleGapMin ?? 90)))
  next.goalAnimPerDay = Math.max(0, Math.min(12, Number(next.goalAnimPerDay ?? 4)))
  next.goalAnimFps = Math.max(8, Math.min(25, Number(next.goalAnimFps ?? 20)))
  if (next.goalAnimScope !== 'barca') next.goalAnimScope = 'all'
  next.taleLangs = { en: next.taleLangs?.en !== false, fr: next.taleLangs?.fr !== false, ar: next.taleLangs?.ar !== false }
  const ord = String(next.taleOrder ?? 'en,ar,fr').split(',').map((x) => x.trim()).filter((x) => ['en', 'fr', 'ar'].includes(x))
  next.taleOrder = [...new Set([...ord, 'en', 'ar', 'fr'])].join(',')
  next.mainLang = next.mainLang === 'en' ? 'en' : 'ar'
  await env.CACHE.put(KEY, JSON.stringify(next))
  return next
}

// ─── Local time (Morocco) ───────────────────────────────────────────
export function localParts(d = new Date()): { date: string; hour: number; minute: number; label: string } {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(d)) p[x.type] = x.value
  const label = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return { date: `${p.year}-${p.month}-${p.day}`, hour: parseInt(p.hour, 10) % 24, minute: parseInt(p.minute, 10), label }
}
function localTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}
const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven']
const MIN_WORDS: Record<number, string> = { 0: '', 5: 'oh five', 10: 'ten', 15: 'fifteen', 20: 'twenty', 30: 'thirty', 40: 'forty', 45: 'forty-five', 50: 'fifty' }
/** "21:45" → "nine forty-five PM" — TTS-friendly. */
function spokenTime(iso: string): string {
  const [h, m] = localTime(iso).split(':').map((x) => parseInt(x, 10))
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hw = HOUR_WORDS[h % 12]
  const mw = MIN_WORDS[m] ?? String(m)
  return mw ? `${hw} ${mw} ${ampm}` : `${hw} ${ampm}`
}

// ─── Log + counters (KV, per local day) ────────────────────────────
export interface AutoLogEntry { t: string; job: string; ok: boolean; note: string }
export async function log(env: Env, date: string, job: string, ok: boolean, note: string): Promise<void> {
  console.log(`[auto] ${job} ${ok ? 'ok' : 'FAIL'} — ${note}`)
  const k = `auto:log:${date}`
  try {
    const cur = JSON.parse((await env.CACHE.get(k)) ?? '[]') as AutoLogEntry[]
    cur.unshift({ t: new Date().toISOString(), job, ok, note: note.slice(0, 700) })   // 700: four variant URLs fit (2026-09-16)
    await env.CACHE.put(k, JSON.stringify(cur.slice(0, 300)), { expirationTtl: 8 * 86400 })
  } catch { /* logging never throws */ }
}
export async function readLog(env: Env, date: string): Promise<AutoLogEntry[]> {
  try { return JSON.parse((await env.CACHE.get(`auto:log:${date}`)) ?? '[]') as AutoLogEntry[] } catch { return [] }
}
export type Counter = 'article' | 'ft' | 'story' | 'reel' | 'post' | 'goalreel' | 'goalanim'
export async function getCount(env: Env, date: string, c: Counter): Promise<number> {
  return parseInt((await env.CACHE.get(`auto:count:${date}:${c}`)) ?? '0', 10) || 0
}
/** Everything that lands in the Facebook feed today (photo posts + every reel; stories excluded). */
export async function fbPostsToday(env: Env, date: string): Promise<number> {
  const [post, ft, reel] = await Promise.all([getCount(env, date, 'post'), getCount(env, date, 'ft'), getCount(env, date, 'reel')])
  return post + ft + reel
}
export async function bump(env: Env, date: string, c: Counter): Promise<void> {
  const n = (await getCount(env, date, c)) + 1
  await env.CACHE.put(`auto:count:${date}:${c}`, String(n), { expirationTtl: 3 * 86400 })
  if (c !== 'story' && c !== 'reel') await env.CACHE.put('auto:lastpost', new Date().toISOString(), { expirationTtl: 86400 })
}
async function recentlyPosted(env: Env): Promise<boolean> {
  const last = await env.CACHE.get('auto:lastpost')
  return !!last && Date.now() - Date.parse(last) < MIN_GAP_MS
}

// ─── Supabase Storage (bucket `media`, public) ─────────────────────
function sbHeaders(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, ...extra }
}
export function mediaUrl(env: Env, key: string): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`
}
export async function putMedia(env: Env, key: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  const url = `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`
  const put = () => fetch(url, { method: 'POST', headers: sbHeaders(env, { 'content-type': contentType, 'x-upsert': 'true' }), body: body as BodyInit })
  let r = await put()
  if (!r.ok) {
    const t = await r.text()
    if (/bucket not found/i.test(t)) {
      const c = await fetch(`${env.SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST', headers: sbHeaders(env, { 'content-type': 'application/json' }),
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
      })
      if (!c.ok && c.status !== 409) throw new Error(`storage bucket create ${c.status}: ${(await c.text()).slice(0, 200)}`)
      r = await put()
      if (!r.ok) throw new Error(`storage put ${r.status}: ${(await r.text()).slice(0, 200)}`)
    } else throw new Error(`storage put ${r.status}: ${t.slice(0, 200)}`)
  }
  return mediaUrl(env, key)
}
/** Delete media older than `days` (runs once a day). Returns count. */
export async function cleanupMedia(env: Env, days = 7): Promise<number> {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST', headers: sbHeaders(env, { 'content-type': 'application/json' }),
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'created_at', order: 'asc' } }),
  })
  if (!r.ok) throw new Error(`storage list ${r.status}`)
  const items = await r.json() as Array<{ name: string; created_at?: string }>
  const cutoff = Date.now() - days * 86_400_000
  const old = items.filter((i) => i.created_at && Date.parse(i.created_at) < cutoff && !i.name.startsWith('P90-')).map((i) => i.name)
  if (old.length === 0) return 0
  const d = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE', headers: sbHeaders(env, { 'content-type': 'application/json' }),
    body: JSON.stringify({ prefixes: old }),
  })
  if (!d.ok) throw new Error(`storage delete ${d.status}`)
  return old.length
}

// ─── Studio client (Render) ─────────────────────────────────────────
export function studioConfigured(env: Env): boolean {
  return !!(env.STUDIO_URL && env.STUDIO_SECRET)
}
export async function studio(env: Env, path: string, body: unknown): Promise<Record<string, unknown>> {
  if (!studioConfigured(env)) throw new Error('studio_not_configured (STUDIO_URL / STUDIO_SECRET)')
  const r = await fetch(`${env.STUDIO_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-secret': env.STUDIO_SECRET! },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({})) as Record<string, unknown>
  if (!r.ok || j.error) throw new Error(`studio ${path} → ${j.error ?? r.status}`)
  return j
}
export async function renderImage(env: Env, type: string, data: unknown): Promise<string> {
  const j = await studio(env, '/render/image', { type, data })
  if (typeof j.url !== 'string') throw new Error('studio returned no url')
  return j.url
}

// ─── Facebook ──────────────────────────────────────────────────────
// Posts  → Make scenario 1 (MAKE_FB_WEBHOOK_URL): {message, link,
//          image_url, title} → "Create a Post with Photos".
// Videos → Make scenario 2 (MAKE_FB_VIDEO_WEBHOOK_URL): {kind:'video',
//          video_url, description, title} → "Upload a Video" (Facebook
//          shows short 9:16 videos as reels).
// Stories → Graph API only. Make's Facebook Pages app has neither a
//          story module nor a generic "API call" module, so stories
//          need a Page access token (FB_PAGE_TOKEN). When that token is
//          present the worker also publishes REAL reels through the
//          Reels API instead of the Make video post.
// Make's free plan allows 2 active scenarios — hence one per output.
async function hook(url: string | undefined, payload: unknown): Promise<{ ok: boolean; status?: number }> {
  if (!url) return { ok: false, status: 0 }
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
    return { ok: r.ok, status: r.status }
  } catch { return { ok: false } }
}
/**
 * Photo post. With a Page token we publish through the Graph API
 * (`/{page}/photos` → post_id) so the link can be commented right away
 * (Mehdi, 2026-09-07: "automatise les commentaires sur tous les posts")
 * — and Make's operations are no longer consumed. Make stays as fallback.
 */
export async function fbPost(env: Env, p: { message: string; link: string; image_url: string; title: string; comment?: string }): Promise<{ ok: boolean; status?: number; id?: string; note?: string }> {
  // Mehdi, 2026-09-08: photo posts go through MAKE (that rendering is the
  // one the mobile app shows reliably); the worker then finds the new post
  // in the Page feed and comments the link. Graph API only as fallback.
  if (env.MAKE_FB_WEBHOOK_URL) {
    const r = await hook(env.MAKE_FB_WEBHOOK_URL, { kind: 'post', message: p.message, link: p.link, image_url: p.image_url, title: p.title })
    if (r.ok) {
      if (!p.comment || !env.FB_PAGE_TOKEN) return { ok: true, status: r.status, note: 'make post' }
      const id = await findRecentPost(env, p.message, 6)
      if (id) {
        const c = await fbComment(env, id, p.comment)
        return { ok: true, status: r.status, id, note: `make post ${id} · ${c.ok ? 'link commented' : 'comment failed: ' + (c.note ?? '')}` }
      }
      await enqueuePendingComment(env, p.message, p.comment)
      return { ok: true, status: r.status, note: 'make post · comment pending (post not visible yet, retry every minute)' }
    }
    console.log('[fb] make webhook failed', r.status, '→ graph fallback')
  }
  if (env.FB_PAGE_TOKEN) {
    try {
      const { id: pid, token } = await pageAuth(env)
      const ph = await graph(env, token, 'POST', `/${pid}/photos`, { url: p.image_url, published: 'false', temporary: 'true' })
      const j = await graph(env, token, 'POST', `/${pid}/feed`, { message: p.message, attached_media: JSON.stringify([{ media_fbid: String(ph.id) }]) })
      const postId = String(j.id ?? '')
      let note = `graph post ${postId} (make fallback)`
      if (postId && p.comment) { const c = await fbComment(env, postId, p.comment); note += c.ok ? ' · link commented' : ` · comment failed: ${c.note ?? ''}` }
      return { ok: true, status: 200, id: postId, note }
    } catch (e) { return { ok: false, note: `make failed and graph failed: ${String(e).slice(0, 120)}` } }
  }
  return { ok: false, note: 'no publishing channel (MAKE_FB_WEBHOOK_URL / FB_PAGE_TOKEN missing)' }
}

/** Multi-photo post through the Graph API (Mehdi, 2026-09-14: full-time scores = one photo per match, one grouped post). */
export async function fbAlbumPost(env: Env, p: { message: string; photos: string[]; comment?: string }): Promise<{ ok: boolean; id?: string; note?: string }> {
  if (!env.FB_PAGE_TOKEN) return { ok: false, note: 'FB_PAGE_TOKEN missing' }
  try {
    const { id: pid, token } = await pageAuth(env)
    const ids: string[] = []
    for (const url of p.photos.slice(0, 10)) { const ph = await graph(env, token, 'POST', `/${pid}/photos`, { url, published: 'false', temporary: 'true' }); ids.push(String(ph.id)) }
    const j = await graph(env, token, 'POST', `/${pid}/feed`, { message: p.message, attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))) })
    const postId = String(j.id ?? '')
    let note = `album post ${postId} (${ids.length} photos)`
    if (postId && p.comment) { const c = await fbComment(env, postId, p.comment); note += c.ok ? ' · link commented' : ` · comment failed: ${c.note ?? ''}` }
    return { ok: true, id: postId, note }
  } catch (e) { return { ok: false, note: String(e).slice(0, 160) } }
}

const normLine = (s: string) => s.split('\n')[0].toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ').trim().slice(0, 60)
/** Find the Page post whose first line matches `message`, created in the last 15 min. */
async function findRecentPost(env: Env, message: string, attempts = 1): Promise<string | null> {
  const want = normLine(message)
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(10000)
    try {
      const { id: pid, token } = await pageAuth(env)
      const j = await graph(env, token, 'GET', `/${pid}/posts`, { fields: 'id,message,created_time', limit: '8' })
      const rows = (j.data ?? []) as Array<{ id: string; message?: string; created_time: string }>
      const hit = rows.find((r) => normLine(r.message ?? '') === want && Date.now() - Date.parse(r.created_time) < 15 * 60_000)
      if (hit) return hit.id
    } catch (e) { console.log('[fb] findRecentPost', e) }
  }
  return null
}
type PendingComment = { message: string; comment: string; until: number }
async function enqueuePendingComment(env: Env, message: string, comment: string): Promise<void> {
  const raw = await env.CACHE.get('auto:pendingcomments')
  const q = (raw ? JSON.parse(raw) : []) as PendingComment[]
  q.push({ message, comment, until: Date.now() + 30 * 60_000 })
  await env.CACHE.put('auto:pendingcomments', JSON.stringify(q), { expirationTtl: 3600 })
}
/**
 * Re-publish through Make posts that had been created through the Graph
 * API (invisible in the mobile app, 2026-09-08). One item every 3 min
 * from the tick; the old API post is deleted once the new one is out.
 */
type RepublishItem = { oldId: string; kind: 'article' | 'matchday'; slug?: string }
export async function enqueueRepublish(env: Env, items: RepublishItem[]): Promise<void> {
  const raw = await env.CACHE.get('auto:republish')
  const q = (raw ? JSON.parse(raw) : []) as RepublishItem[]
  q.push(...items)
  await env.CACHE.put('auto:republish', JSON.stringify(q), { expirationTtl: 6 * 3600 })
}
export async function processRepublishQueue(env: Env, date: string, label: string): Promise<void> {
  const raw = await env.CACHE.get('auto:republish')
  if (!raw) return
  const q = JSON.parse(raw) as RepublishItem[]
  const item = q.shift()
  if (q.length) await env.CACHE.put('auto:republish', JSON.stringify(q), { expirationTtl: 6 * 3600 }); else await env.CACHE.delete('auto:republish')
  if (!item) return
  try {
    let r: { ok: boolean; note?: string } = { ok: false }
    if (item.kind === 'matchday') {
      const pool = await bigMatchesToday(env)
      const img = await renderImage(env, 'matchday-post', { matches: pool.slice(0, 6).map(toDraw), dateLabel: label })
      r = await fbPost(env, { message: matchdayMessageAr(pool, label), link: `${SITE}/today?lang=ar&ref=fb`, image_url: img, title: `مباريات اليوم — ${labelAr()}`, comment: `⚽ النتائج المباشرة والتشكيلات: ${SITE}/today?lang=ar&ref=fb` })
    } else if (item.slug) {
      const rr = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?slug=eq.${encodeURIComponent(item.slug)}&select=title,slug,excerpt,image_url&limit=1`, { headers: sbHeaders(env) })
      const row = ((await rr.json().catch(() => [])) as Array<{ title: string; slug: string; excerpt?: string | null; image_url?: string | null }>)[0]
      if (!row) throw new Error('article not found ' + item.slug)
      const link = `${SITE}/news/${row.slug}?ref=fb`
      let card: string | null = null
      try { card = await renderImage(env, 'article-post', { title: row.title, slug: row.slug, image_url: row.image_url }) } catch { /* raw image */ }
      const image = card ?? (row.image_url ? `${WORKER_PUBLIC}/fb-img?u=${encodeURIComponent(row.image_url)}` : `${SITE}/icon-512.png`)
      r = await fbPost(env, { message: `${row.title}${row.excerpt ? '\n\n' + row.excerpt : ''}\n\n👉 Full article on pressing90.live (link in the comments)`, link, image_url: image, title: row.title, comment: `📰 Read the full article: ${link}` })
    }
    if (r.ok) {
      const { token } = await pageAuth(env)
      const d = await fetch(`${GRAPH}/${item.oldId}?access_token=${encodeURIComponent(token)}`, { method: 'DELETE' })
      const dj = await d.json().catch(() => ({})) as { success?: boolean }
      await log(env, date, 'republish', true, `${item.kind}${item.slug ? ' ' + item.slug : ''} → ${r.note ?? 'ok'} · old API post ${dj.success ? 'deleted' : 'NOT deleted'}`)
    } else await log(env, date, 'republish', false, `${item.kind} ${item.slug ?? ''}: ${r.note ?? 'failed'} (old post kept)`)
  } catch (e) { await log(env, date, 'republish', false, `${item.kind} ${item.slug ?? ''}: ${String(e).slice(0, 160)}`) }
}

/** Per-minute: comment the link under posts that were not visible yet when published. */
export async function processPendingComments(env: Env, date: string): Promise<void> {
  const raw = await env.CACHE.get('auto:pendingcomments')
  if (!raw) return
  const q = (JSON.parse(raw) as PendingComment[]).filter((x) => x.until > Date.now())
  const keep: PendingComment[] = []
  for (const x of q) {
    const id = await findRecentPost(env, x.message, 1)
    if (!id) { keep.push(x); continue }
    const c = await fbComment(env, id, x.comment)
    await log(env, date, 'link-comment', c.ok, `${c.ok ? 'commented' : 'failed: ' + (c.note ?? '')} under "${x.message.split('\n')[0].slice(0, 40)}"`)
  }
  if (keep.length) await env.CACHE.put('auto:pendingcomments', JSON.stringify(keep), { expirationTtl: 3600 })
  else await env.CACHE.delete('auto:pendingcomments')
}

const GRAPH = 'https://graph.facebook.com/v21.0'
type GraphJson = Record<string, unknown> & { id?: string | number; error?: { message?: string; code?: number } }
async function graph(env: Env, token: string, method: 'GET' | 'POST', path: string, params: Record<string, string>): Promise<GraphJson> {
  const url = new URL(`${GRAPH}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)
  const r = await fetch(url.toString(), { method })
  const j = await r.json().catch(() => ({})) as GraphJson
  if (!r.ok || j.error) {
    // Expired / invalid session → forget the derived page auth so the
    // next call re-derives from FB_PAGE_TOKEN (or surfaces the problem).
    if (j.error?.code === 190) {
      pageAuthCache = null; await env.CACHE.delete('auto:fb:pageauth').catch(() => {})
      try { await checkTokenAndAlert(env, localParts().date, `sur une erreur Graph 190 (${String(j.error?.message ?? '').slice(0, 80)})`) } catch (e) { console.log('[token-alert]', e) }
    }
    throw new Error(`graph ${method} ${path} → ${r.status} ${j.error?.message ?? ''}`.trim())
  }
  return j
}
/**
 * FB_PAGE_TOKEN may be either a Page token or a (long-lived) USER token:
 * with a user token we list /me/accounts and pick the Pressing 90' page
 * (its access_token is a page token, permanent when the user token is
 * long-lived). Cached 6 h in KV; wiped on error 190.
 */
type PageAuth = { id: string; name: string; token: string; source: 'page' | 'user'; userExpiresAt?: number }
let pageAuthCache: PageAuth | null = null

/**
 * Token lifecycle (Mehdi, 2026-09-07 — the token pasted the day before
 * was a 2-hour one and everything stopped at 23:00):
 *   1. FB_PAGE_TOKEN may be a short-lived USER token straight from the
 *      Graph API Explorer. With FB_APP_ID + FB_APP_SECRET the worker
 *      exchanges it for a 60-day token itself and keeps that in KV
 *      (`auto:fb:usertoken`) — no manual "Extend" step.
 *   2. The Page token derived from a long-lived user token never expires.
 *   3. `refreshUserToken()` re-exchanges the KV token when it is within
 *      10 days of expiry (called from the nightly slot), so it stays alive
 *      as long as Mehdi doesn't revoke the app.
 */
type StoredUserToken = { token: string; expiresAt: number; obtainedAt: number; fromSecret?: string }
async function exchangeLongLived(env: Env, token: string): Promise<StoredUserToken | null> {
  if (!env.FB_APP_ID || !env.FB_APP_SECRET) return null
  const u = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(env.FB_APP_ID)}&client_secret=${encodeURIComponent(env.FB_APP_SECRET)}&fb_exchange_token=${encodeURIComponent(token)}`
  const r = await fetch(u)
  const j = await r.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: { message?: string } }
  if (!r.ok || !j.access_token) throw new Error(`token exchange failed: ${j.error?.message ?? r.status}`)
  const stored: StoredUserToken = { token: j.access_token, expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : 0, obtainedAt: Date.now(), fromSecret: (env.FB_PAGE_TOKEN ?? '').slice(0, 24) }
  await env.CACHE.put('auto:fb:usertoken', JSON.stringify(stored))
  return stored
}
async function currentUserToken(env: Env): Promise<{ token: string; expiresAt?: number; source: string }> {
  const raw = await env.CACHE.get('auto:fb:usertoken')
  if (raw) {
    const s = JSON.parse(raw) as StoredUserToken
    // A NEW secret pasted by Mehdi (e.g. with extra permissions) must win
    // over the stored long-lived token derived from the previous one.
    const sameSecret = !s.fromSecret || s.fromSecret === (env.FB_PAGE_TOKEN ?? '').slice(0, 24)
    if (sameSecret && (!s.expiresAt || s.expiresAt > Date.now() + 60_000)) return { token: s.token, expiresAt: s.expiresAt, source: 'kv (long-lived)' }
    if (!sameSecret) { pageAuthCache = null; await env.CACHE.delete('auto:fb:pageauth') }
  }
  const env_ = env.FB_PAGE_TOKEN
  if (!env_) throw new Error('FB_PAGE_TOKEN not set')
  // Fresh secret from the Explorer → turn it into a long-lived one right away.
  try {
    const ex = await exchangeLongLived(env, env_)
    if (ex) return { token: ex.token, expiresAt: ex.expiresAt, source: 'exchanged (long-lived)' }
  } catch (e) { console.log('[fb] exchange failed:', e) }
  return { token: env_, source: 'secret as-is' }
}
/** Nightly: re-exchange the long-lived token when < 10 days remain. */
export async function refreshUserToken(env: Env): Promise<string> {
  const raw = await env.CACHE.get('auto:fb:usertoken')
  if (!raw) return 'no stored token'
  const s = JSON.parse(raw) as StoredUserToken
  if (s.expiresAt && s.expiresAt - Date.now() < 10 * 86400_000) {
    const ex = await exchangeLongLived(env, s.token)
    if (ex) { pageAuthCache = null; await env.CACHE.delete('auto:fb:pageauth'); return `renewed until ${new Date(ex.expiresAt).toISOString().slice(0, 10)}` }
  }
  return `ok until ${s.expiresAt ? new Date(s.expiresAt).toISOString().slice(0, 10) : 'never'}`
}
async function pageAuth(env: Env): Promise<PageAuth> {
  if (pageAuthCache) return pageAuthCache
  const cached = await env.CACHE.get('auto:fb:pageauth')
  if (cached) { pageAuthCache = JSON.parse(cached) as PageAuth; return pageAuthCache }
  const ut = await currentUserToken(env)
  const tok = ut.token
  const r = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=50&access_token=${encodeURIComponent(tok)}`)
  const j = await r.json().catch(() => ({})) as { data?: Array<{ id: string; name: string; access_token: string }>; error?: { message?: string } }
  let auth: PageAuth
  if (r.ok && Array.isArray(j.data) && j.data.length > 0) {
    const pick = j.data.find((p) => /pressing\s*90/i.test(p.name)) ?? j.data[0]
    auth = { id: pick.id, name: pick.name, token: pick.access_token, source: 'user', userExpiresAt: ut.expiresAt }
  } else {
    const me = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(tok)}`).then((x) => x.json()).catch(() => ({})) as { id?: string; name?: string; error?: { message?: string } }
    if (!me.id) throw new Error(`FB_PAGE_TOKEN invalid: ${me.error?.message ?? j.error?.message ?? 'unknown error'}`)
    auth = { id: String(me.id), name: me.name ?? '', token: tok, source: 'page' }
  }
  // No TTL: a page token derived from a long-lived user token does not
  // expire; the cache is wiped on error 190 or when the user token is renewed.
  await env.CACHE.put('auto:fb:pageauth', JSON.stringify(auth))
  pageAuthCache = auth
  return auth
}
// ─── Admin panel: token checker + paste-a-new-token (Mehdi, 2026-09-08) ───
// The token value never leaves the worker: the panel only sees validity,
// expiry, scopes and the page it resolves to.
export const REQUIRED_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content', 'pages_manage_posts', 'pages_manage_engagement', 'business_management']
export type FbTokenStatus = {
  ok: boolean; valid: boolean; source: string; note?: string
  expiresAt: number | null; daysLeft: number | null; obtainedAt: number | null
  scopes: string[]; missing: string[]; page: { id: string; name: string } | null
  appId: string | null; explorerUrl: string | null
  fbSaysNever?: boolean; dataAccessExpiresAt?: number | null   // debug_token details
}
async function debugToken(env: Env, token: string): Promise<{ is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[]; error?: { message?: string } } | null> {
  if (!env.FB_APP_ID || !env.FB_APP_SECRET) return null
  const app = `${env.FB_APP_ID}|${env.FB_APP_SECRET}`
  const r = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(app)}`)
  const j = await r.json().catch(() => ({})) as { data?: { is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[]; error?: { message?: string } }; error?: { message?: string } }
  return j.data ?? { is_valid: false, error: j.error }
}
export async function fbTokenStatus(env: Env): Promise<FbTokenStatus> {
  const explorerUrl = env.FB_APP_ID ? `https://developers.facebook.com/tools/explorer/${env.FB_APP_ID}/?method=GET&path=me%2Faccounts&version=v21.0` : 'https://developers.facebook.com/tools/explorer/'
  const base: FbTokenStatus = { ok: false, valid: false, source: 'none', expiresAt: null, daysLeft: null, obtainedAt: null, scopes: [], missing: REQUIRED_SCOPES, page: null, appId: env.FB_APP_ID ?? null, explorerUrl }
  let ut: { token: string; expiresAt?: number; source: string }
  try { ut = await currentUserToken(env) } catch (e) { return { ...base, note: String(e).replace(/EAA[\w]+/g, '***') } }
  base.source = ut.source
  const raw = await env.CACHE.get('auto:fb:usertoken')
  if (raw) { try { base.obtainedAt = (JSON.parse(raw) as StoredUserToken).obtainedAt ?? null } catch { /* ignore */ } }
  let scopes: string[] = []
  let valid = false
  let expiresAt: number | null = ut.expiresAt ?? null
  const dbg = await debugToken(env, ut.token).catch(() => null)
  if (dbg) {
    valid = !!dbg.is_valid
    scopes = dbg.scopes ?? []
    // debug_token says 0 (= never) for admins of an app in dev mode, while
    // the exchange returned a 60-day expiry: show the earliest known date,
    // and tell the panel what Facebook itself reports.
    const fbExp = dbg.expires_at ? dbg.expires_at * 1000 : 0
    base.fbSaysNever = dbg.expires_at === 0
    base.dataAccessExpiresAt = dbg.data_access_expires_at ? dbg.data_access_expires_at * 1000 : null
    const known = [fbExp, expiresAt ?? 0].filter((x) => x > 0)
    expiresAt = known.length ? Math.min(...known) : 0
    if (!valid) base.note = dbg.error?.message ?? 'token invalid'
  } else {
    const perms = await fetch(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(ut.token)}`).then((r) => r.json()).catch(() => ({})) as { data?: Array<{ permission: string; status: string }>; error?: { message?: string } }
    valid = Array.isArray(perms.data)
    scopes = (perms.data ?? []).filter((x) => x.status === 'granted').map((x) => x.permission)
    if (!valid) base.note = perms.error?.message ?? 'token invalid'
  }
  let page: FbTokenStatus['page'] = null
  if (valid) { try { const a = await pageAuth(env); page = { id: a.id, name: a.name } } catch (e) { base.note = String(e).replace(/EAA[\w]+/g, '***').slice(0, 160) } }
  const daysLeft = expiresAt ? Math.floor((expiresAt - Date.now()) / 86400_000) : (expiresAt === 0 ? null : null)
  return { ...base, ok: valid && !!page, valid, expiresAt, daysLeft, scopes, missing: REQUIRED_SCOPES.filter((s) => !scopes.includes(s)), page }
}
/** A token pasted in the admin panel: validate → exchange (60 days) → store in KV → re-derive the Page token. */
export async function installUserToken(env: Env, token: string): Promise<FbTokenStatus> {
  const t = token.trim()
  if (!/^[A-Za-z0-9_\-|.]{40,}$/.test(t)) throw new Error('that does not look like a Facebook access token')
  const me = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(t)}`).then((r) => r.json()).catch(() => ({})) as { id?: string; error?: { message?: string } }
  if (!me.id) throw new Error(`Facebook rejected the token: ${me.error?.message ?? 'unknown error'}`)
  let stored: StoredUserToken | null = null
  try { stored = await exchangeLongLived(env, t) } catch (e) { throw new Error(`valid token but the 60-day exchange failed (${String(e).slice(0, 120)}) — FB_APP_SECRET set?`) }
  if (!stored) {
    // No app secret: keep the pasted token as-is (short-lived, but better than an expired one).
    stored = { token: t, expiresAt: 0, obtainedAt: Date.now(), fromSecret: (env.FB_PAGE_TOKEN ?? '').slice(0, 24) }
    await env.CACHE.put('auto:fb:usertoken', JSON.stringify(stored))
  }
  pageAuthCache = null; await env.CACHE.delete('auto:fb:pageauth')
  const st = await fbTokenStatus(env)
  const { date } = localParts()
  await log(env, date, 'fb-token', st.ok, st.ok ? `new token installed from the admin panel · page "${st.page?.name}" · expires ${st.expiresAt ? new Date(st.expiresAt).toISOString().slice(0, 10) : 'never'}` : `token installed but ${st.note ?? 'page not resolved'}`)
  return st
}

// ─── Token e-mail alerts (Mehdi, 2026-09-08: "informé par mail à l'avance,
// sinon instantanément au moment où il expire") ────────────────────────
// • hourly check (minute 7) + nightly after the auto-renewal;
// • instant on any Graph error 190 (invalid/expired token), rate-limited 6 h;
// • advance warnings at 14/10/7/5/3/2/1/0 days (one mail per threshold).
export async function sendMail(env: Env, subject: string, html: string): Promise<{ ok: boolean; note?: string }> {
  const ex = env as unknown as { RESEND_API_KEY?: string; RESEND_FROM?: string }
  if (!ex.RESEND_API_KEY || !ex.RESEND_FROM) return { ok: false, note: 'Resend not configured' }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${ex.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: ex.RESEND_FROM, to: KIT_EMAIL_TO, subject, html }),
    })
    const j = await r.json().catch(() => ({})) as { id?: string; message?: string }
    return r.ok ? { ok: true, note: `mail ${j.id ?? 'sent'}` } : { ok: false, note: `resend ${r.status} ${j.message ?? ''}` }
  } catch (e) { return { ok: false, note: String(e) } }
}
const ADMIN_URL = `${SITE}/admin`
function tokenMailHtml(title: string, lines: string[], st: FbTokenStatus | null): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const explorer = st?.explorerUrl ?? 'https://developers.facebook.com/tools/explorer/'
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:8px">
    <p style="margin:0 0 4px;color:#64748b;font-size:12px;letter-spacing:.08em">PRESSING 90' · TOKEN FACEBOOK</p>
    <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px">${esc(title)}</h2>
    ${lines.map((l) => `<p style="margin:0 0 8px;color:#334155;font-size:14px">${esc(l)}</p>`).join('')}
    <p style="margin:16px 0 10px;color:#0f172a;font-size:14px;font-weight:700">Pour renouveler (2 minutes) :</p>
    <a href="${explorer}" style="display:block;background:#1877f2;color:#fff;font-weight:700;padding:14px 20px;border-radius:10px;text-decoration:none;font-size:16px;text-align:center;margin:0 0 8px">1 · Ouvrir le Graph API Explorer (app pressing 90 story)</a>
    <p style="margin:0 0 14px;color:#475569;font-size:13px;line-height:1.5">Sur la page : « User Token » → <b>Get User Access Token</b> → garder toutes les permissions <b>pages_*</b> + <b>business_management</b> → <b>Generate Access Token</b> → cocher la page Pressing 90' dans la popup → copier le token.</p>
    <a href="${ADMIN_URL}" style="display:block;background:#d4af37;color:#0f172a;font-weight:700;padding:14px 20px;border-radius:10px;text-decoration:none;font-size:16px;text-align:center;margin:0 0 8px">2 · Coller dans le panel admin → Install token</a>
    <p style="margin:0;color:#475569;font-size:13px;line-height:1.5">Bloc « Facebook access token » du panel. Le worker l'échange en token 60 jours et tout repart sans autre action.</p>
    ${st ? `<p style="margin:18px 0 0;color:#94a3b8;font-size:12px">État vérifié auprès de Facebook : ${st.valid ? 'valide' : 'INVALIDE'} · page ${esc(st.page?.name ?? '?')} · expiration ${st.expiresAt ? new Date(st.expiresAt).toLocaleDateString('fr-FR') : 'inconnue'} · permissions manquantes : ${st.missing.length ? esc(st.missing.join(', ')) : 'aucune'}</p>` : ''}
  </div>`
}
const WARN_DAYS = new Set([14, 10, 7, 5, 3, 2, 1, 0])
export async function checkTokenAndAlert(env: Env, date: string, reason: string): Promise<string> {
  if (!env.FB_PAGE_TOKEN) return 'no token configured'
  let st: FbTokenStatus | null = null
  try { st = await fbTokenStatus(env) } catch (e) { st = null; console.log('[token-alert] status failed', e) }
  const invalid = !st || !st.valid || !st.ok
  if (invalid) {
    const gate = 'auto:tokenmail:expired'
    if (await env.CACHE.get(gate)) return `invalid (mail already sent < 6 h) — ${reason}`
    await env.CACHE.put(gate, '1', { expirationTtl: 6 * 3600 })
    const why = st?.note ?? 'Facebook refuse le token'
    const m = await sendMail(env, '🚨 Token Facebook expiré — stories, reels et commentaires de lien à l\'arrêt',
      tokenMailHtml('Le token Facebook ne fonctionne plus', [
        `Détecté ${reason}. Motif : ${why}.`,
        'Tant qu\'il n\'est pas remplacé : plus de stories, plus de commentaires de lien sous les posts/reels, plus de repli API. Les posts photo et vidéos via Make continuent.',
      ], st))
    await log(env, date, 'token-alert', m.ok, `EXPIRED mail (${reason}) → ${m.note ?? ''}`)
    return `invalid — mail ${m.ok ? 'sent' : 'failed: ' + (m.note ?? '')}`
  }
  const days = st!.daysLeft
  const dataDays = st!.dataAccessExpiresAt ? Math.floor((st!.dataAccessExpiresAt - Date.now()) / 86400_000) : null
  const soon = (days !== null && days <= 14) || (dataDays !== null && dataDays <= 7)
  if (!soon) return `ok — ${days === null ? 'no expiry' : days + ' days left'} (${reason})`
  const key = days !== null && days <= 14 ? days : Math.max(0, dataDays ?? 0)
  if (!WARN_DAYS.has(Math.max(0, key)) && key > 0) return `soon (${key} d) — next mail at the next threshold`
  const gate = `auto:tokenmail:warn:${days ?? 'x'}:${dataDays ?? 'x'}`
  if (await env.CACHE.get(gate)) return `soon (${key} d) — mail already sent`
  await env.CACHE.put(gate, '1', { expirationTtl: 40 * 86400 })
  const m = await sendMail(env, `⚠️ Token Facebook : expire dans ${key} jour${key > 1 ? 's' : ''}`,
    tokenMailHtml(`Le token Facebook expire dans ${key} jour${key > 1 ? 's' : ''}`, [
      days !== null ? `Expiration du token : ${new Date(st!.expiresAt!).toLocaleDateString('fr-FR')} (${days} j).` : '',
      dataDays !== null ? `Fin de l\'accès aux données Facebook (90 j après la connexion) : ${new Date(st!.dataAccessExpiresAt!).toLocaleDateString('fr-FR')} (${dataDays} j).` : '',
      'Le worker tente le renouvellement automatique chaque nuit à partir de J-10. Ce mail arrive à l\'avance au cas où ce renouvellement échouerait : régénérer un token maintenant évite toute coupure.',
    ].filter(Boolean), st))
  await log(env, date, 'token-alert', m.ok, `WARNING ${key} d (${reason}) → ${m.note ?? ''}`)
  return `soon (${key} d) — mail ${m.ok ? 'sent' : 'failed: ' + (m.note ?? '')}`
}

export const storiesConfigured = (env: Env) => !!env.FB_PAGE_TOKEN
export const reelsConfigured = (env: Env) => !!env.FB_PAGE_TOKEN || !!env.MAKE_FB_VIDEO_WEBHOOK_URL

/** Page story = unpublished photo, then /photo_stories (Graph API). */
export async function fbStory(env: Env, image_url: string, _message = ''): Promise<{ ok: boolean; status?: number; note?: string }> {
  if (!env.FB_PAGE_TOKEN) return { ok: false, status: 0, note: 'FB_PAGE_TOKEN not set — stories need a Page token (Make has no story module)' }
  try {
    const { id: pid, token, name } = await pageAuth(env)
    const up = await graph(env, token, 'POST', `/${pid}/photos`, { url: image_url, published: 'false' })
    const st = await graph(env, token, 'POST', `/${pid}/photo_stories`, { photo_id: String(up.id) })
    return { ok: true, status: 200, note: `story on ${name} ${String(st.post_id ?? st.success ?? 'ok')}` }
  } catch (e) { return { ok: false, note: String(e) } }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Reel: Reels API (start → hosted upload from URL → finish) when a Page
 *  token exists, else a plain video post through Make. */
/** Comment as the Page under a reel/video/post (needs pages_manage_engagement). */
export async function fbComment(env: Env, objectId: string, message: string): Promise<{ ok: boolean; note?: string }> {
  try {
    const { token } = await pageAuth(env)
    const j = await graph(env, token, 'POST', `/${objectId}/comments`, { message })
    return { ok: true, note: `comment ${String(j.id ?? 'ok')}` }
  } catch (e) { return { ok: false, note: String(e) } }
}
export async function fbReel(env: Env, p: { video_url: string; description: string; title: string }): Promise<{ ok: boolean; status?: number; note?: string; id?: string; viaMake?: boolean }> {
  // Mehdi, 2026-09-08 evening: reels published through the Reels API are
  // "published" for Graph (status complete, public, in /feed) but do NOT
  // render in the Facebook app — endless spinner on desktop, black
  // thumbnails, 0-5 views on 12 reels. Same family as the Graph photo
  // posts → Make ("Upload a Video" from URL) FIRST, Reels API as fallback.
  // The link comment is queued (auto:pendingcomments) because Make gives
  // no post id back and Facebook processes the video for a while.
  if (env.MAKE_FB_VIDEO_WEBHOOK_URL) {
    const r = await hook(env.MAKE_FB_VIDEO_WEBHOOK_URL, { kind: 'video', ...p })
    if (r.ok) return { ok: true, status: r.status, note: 'video post via Make', viaMake: true }
    if (!env.FB_PAGE_TOKEN) return { ok: false, status: r.status, note: `make ${r.status ?? 'error'}` }
    console.log('[fb] make video webhook failed → Reels API fallback', r.status)
  }
  if (env.FB_PAGE_TOKEN) {
    try {
      const { id: pid, token } = await pageAuth(env)
      const start = await graph(env, token, 'POST', `/${pid}/video_reels`, { upload_phase: 'start' })
      const videoId = String(start.video_id)
      const up = await fetch(`https://rupload.facebook.com/video-upload/v21.0/${videoId}`, {
        method: 'POST', headers: { Authorization: `OAuth ${token}`, file_url: p.video_url },
      })
      const upj = await up.json().catch(() => ({})) as { success?: boolean; debug_info?: unknown }
      if (!up.ok || !upj.success) throw new Error(`reel upload ${up.status}: ${JSON.stringify(upj).slice(0, 200)}`)
      // Hosted upload is asynchronous — wait for it before finishing.
      for (let i = 0; i < 12; i++) {
        const st = await graph(env, token, 'GET', `/${videoId}`, { fields: 'status' })
        const phase = (st.status as { uploading_phase?: { status?: string } } | undefined)?.uploading_phase?.status
        if (phase === 'complete') break
        if (phase === 'error') throw new Error('reel upload failed: ' + JSON.stringify(st.status).slice(0, 200))
        await sleep(5000)
      }
      const fin = await graph(env, token, 'POST', `/${pid}/video_reels`, { upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', description: p.description })
      return { ok: true, status: 200, note: `reel ${videoId} ${String(fin.success ?? '')} (Reels API fallback)`.trim(), id: videoId }
    } catch (e) {
      return { ok: false, note: `reels api failed: ${String(e).slice(0, 160)}` }
    }
  }
  return { ok: false, note: 'MAKE_FB_VIDEO_WEBHOOK_URL / FB_PAGE_TOKEN not set' }
}

/** Video story (Stories API): start → hosted upload from URL → finish.
 *  Mehdi, 2026-09-06: stories are 12 s videos (story card + Ken Burns +
 *  the stories jingle, exclusive to stories) — trial for a few days. */
export const STORY_SECONDS = 12
export async function fbVideoStory(env: Env, video_url: string): Promise<{ ok: boolean; status?: number; note?: string }> {
  if (!env.FB_PAGE_TOKEN) return { ok: false, status: 0, note: 'FB_PAGE_TOKEN not set' }
  try {
    const { id: pid, token, name } = await pageAuth(env)
    const start = await graph(env, token, 'POST', `/${pid}/video_stories`, { upload_phase: 'start' })
    const videoId = String(start.video_id)
    const up = await fetch(`https://rupload.facebook.com/video-upload/v21.0/${videoId}`, {
      method: 'POST', headers: { Authorization: `OAuth ${token}`, file_url: video_url },
    })
    const upj = await up.json().catch(() => ({})) as { success?: boolean }
    if (!up.ok || !upj.success) throw new Error(`story upload ${up.status}: ${JSON.stringify(upj).slice(0, 200)}`)
    for (let i = 0; i < 12; i++) {
      const st = await graph(env, token, 'GET', `/${videoId}`, { fields: 'status' })
      const phase = (st.status as { uploading_phase?: { status?: string } } | undefined)?.uploading_phase?.status
      if (phase === 'complete') break
      if (phase === 'error') throw new Error('story upload failed: ' + JSON.stringify(st.status).slice(0, 200))
      await sleep(5000)
    }
    const fin = await graph(env, token, 'POST', `/${pid}/video_stories`, { upload_phase: 'finish', video_id: videoId })
    return { ok: true, status: 200, note: `video story on ${name} ${String(fin.post_id ?? fin.success ?? 'ok')}` }
  } catch (e) { return { ok: false, note: String(e) } }
}

/** Queue a story video on the studio; the callback publishes it. */
async function queueVideoStory(env: Env, date: string, jobLabel: string, type: 'story-match' | 'story-article', data: unknown, fallbackImage: () => Promise<string>): Promise<void> {
  const jobId = `story-${date}-${Math.random().toString(36).slice(2, 7)}`
  await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'story', date, label: jobLabel, fallback: { type, data } }), { expirationTtl: 6 * 3600 })
  try {
    await studio(env, '/render/reel', { type, data, seconds: STORY_SECONDS, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
    await log(env, date, jobLabel, true, `story video queued (job ${jobId})`)
  } catch (e) {
    // Studio down → photo story right away rather than nothing.
    await env.CACHE.delete(`auto:job:${jobId}`)
    await log(env, date, jobLabel, false, `studio unavailable (${String(e).slice(0, 120)}) — falling back to a photo story`)
    try {
      const url = await fallbackImage()
      const r = await fbStory(env, url)
      if (r.ok) await bump(env, date, 'story')
      await log(env, date, jobLabel, r.ok, `${r.ok ? 'photo story posted' : 'photo story failed: ' + (r.note ?? '')} · ${url}`)
    } catch (e2) { await log(env, date, jobLabel, false, String(e2)) }
  }
}

// ─── Big-competition match pool (from the /today fan-out) ──────────
// Rank = display/priority order. National teams first (Mehdi's rule),
// then the club crowns, then the big-5 leagues and their cups.
const AUTO_LEAGUES: Record<string, { rank: number; label: string }> = {
  'fifa.world': { rank: 0, label: 'FIFA World Cup' }, 'uefa.nations': { rank: 1, label: 'UEFA Nations League' },
  'concacaf.nations.league': { rank: 2, label: 'CONCACAF Nations League' }, 'fifa.friendly': { rank: 2, label: 'International Friendlies' },
  'fifa.worldq.uefa': { rank: 1, label: 'World Cup Qualifiers · UEFA' }, 'fifa.worldq.caf': { rank: 1, label: 'World Cup Qualifiers · CAF' },
  'fifa.worldq.conmebol': { rank: 1, label: 'World Cup Qualifiers · CONMEBOL' }, 'fifa.worldq.afc': { rank: 2, label: 'World Cup Qualifiers · AFC' },
  'fifa.worldq.concacaf': { rank: 2, label: 'World Cup Qualifiers · CONCACAF' },
  'club.world.cup': { rank: 3, label: 'FIFA Club World Cup' }, 'uefa.super_cup': { rank: 3, label: 'UEFA Super Cup' },
  'uefa.champions': { rank: 4, label: 'UEFA Champions League' }, 'uefa.europa': { rank: 5, label: 'UEFA Europa League' }, 'uefa.europa.conf': { rank: 6, label: 'UEFA Conference League' },
  'conmebol.libertadores': { rank: 6, label: 'Copa Libertadores' }, 'caf.champions_league': { rank: 6, label: 'CAF Champions League' },
  'eng.1': { rank: 7, label: 'Premier League' }, 'esp.1': { rank: 7, label: 'LaLiga' }, 'ita.1': { rank: 8, label: 'Serie A' }, 'ger.1': { rank: 8, label: 'Bundesliga' }, 'fra.1': { rank: 8, label: 'Ligue 1' },
  'eng.fa': { rank: 9, label: 'FA Cup' }, 'eng.league_cup': { rank: 9, label: 'Carabao Cup' }, 'esp.copa_del_rey': { rank: 9, label: 'Copa del Rey' },
  'ita.coppa_italia': { rank: 9, label: 'Coppa Italia' }, 'fra.coupe_de_france': { rank: 9, label: 'Coupe de France' }, 'ger.dfb_pokal': { rank: 9, label: 'DFB-Pokal' },
}
// Friendlies only make the cut when one side is a household name.
const BIG_NATIONS = new Set(['morocco', 'france', 'spain', 'england', 'germany', 'italy', 'portugal', 'netherlands', 'belgium', 'croatia', 'argentina', 'brazil', 'uruguay', 'colombia', 'mexico', 'united states', 'usa', 'canada', 'japan', 'south korea', 'senegal', 'egypt', 'algeria', 'tunisia', 'nigeria', 'cameroon', 'ivory coast', "côte d'ivoire", 'ghana', 'saudi arabia', 'iran', 'australia', 'switzerland', 'denmark', 'sweden', 'norway', 'poland', 'austria', 'türkiye', 'turkey', 'serbia', 'scotland', 'wales', 'ecuador', 'chile', 'qatar', 'mali', 'south africa'])

export interface AutoMatch {
  id: string; rank: number; league: string; slug: string; kickoff: string
  state: 'pre' | 'in' | 'post'; completed: boolean; statusName: string
  home: string; away: string; homeLogo: string | null; awayLogo: string | null
  homeScore: string; awayScore: string; homePens?: string; awayPens?: string; venue?: string
  clock?: string
}
type DailyJson = { competitions?: Array<{ slug: string; label?: string; events?: Array<Record<string, unknown>> }> }

let poolMemo: { t: number; ymd: string; pool: AutoMatch[] } | null = null
export async function bigMatchesToday(env: Env, date?: string): Promise<AutoMatch[]> {
  const ymd = date ?? new Date().toISOString().slice(0, 10).replace(/-/g, '')
  // Several passes per tick (FT posts, goal alerts) share one fetch (40 s memo).
  if (poolMemo && poolMemo.ymd === ymd && Date.now() - poolMemo.t < 40_000) return poolMemo.pool
  const pool = await bigMatchesTodayUncached(env, ymd)
  poolMemo = { t: Date.now(), ymd, pool }
  return pool
}
async function bigMatchesTodayUncached(env: Env, ymd: string): Promise<AutoMatch[]> {
  // ESPN 403s Cloudflare egress IPs, so the scoreboards come through the
  // studio's /espn/today proxy (Render). Fallback: the worker's own
  // fan-out (works when ESPN lets the request through).
  let daily: DailyJson
  if (studioConfigured(env)) {
    const r = await fetch(`${env.STUDIO_URL}/espn/today?date=${ymd}&leagues=${Object.keys(AUTO_LEAGUES).join(',')}`, {
      headers: { 'x-studio-secret': env.STUDIO_SECRET!, 'user-agent': 'p90-worker/1.0' }, signal: AbortSignal.timeout(30000),
    })
    if (!r.ok) throw new Error(`studio espn proxy ${r.status}`)
    daily = await r.json() as DailyJson
  } else {
    const { fetchDaily } = await import('./index')
    daily = await (await fetchDaily(env, ymd)).json() as DailyJson
  }
  const out: AutoMatch[] = []
  for (const comp of daily.competitions ?? []) {
    const meta = AUTO_LEAGUES[comp.slug]
    if (!meta) continue
    for (const ev of comp.events ?? []) {
      const c = (ev.competitions as Array<Record<string, unknown>> | undefined)?.[0]
      const cs = c?.competitors as Array<Record<string, unknown>> | undefined
      const h = cs?.find((x) => x.homeAway === 'home'), a = cs?.find((x) => x.homeAway === 'away')
      const ht = h?.team as Record<string, string> | undefined, at = a?.team as Record<string, string> | undefined
      if (!ht || !at) continue
      const name = (t: Record<string, string>) => t.shortDisplayName ?? t.displayName ?? '?'
      const home = name(ht), away = name(at)
      if (comp.slug === 'fifa.friendly' && !BIG_NATIONS.has(home.toLowerCase()) && !BIG_NATIONS.has(away.toLowerCase())) continue
      const st = ev.status as { type?: { state?: string; completed?: boolean; name?: string }; displayClock?: string } | undefined
      const venue = (c?.venue as { fullName?: string } | undefined)?.fullName
      out.push({
        clock: st?.displayClock,
        id: String(ev.id), rank: meta.rank, league: meta.label, slug: comp.slug, kickoff: String(ev.date ?? ''),
        state: (st?.type?.state as AutoMatch['state']) ?? 'pre', completed: !!st?.type?.completed, statusName: st?.type?.name ?? '',
        home, away, homeLogo: ht.logo ?? null, awayLogo: at.logo ?? null,
        homeScore: String(h?.score ?? '0'), awayScore: String(a?.score ?? '0'),
        homePens: h?.shootoutScore != null ? String(h.shootoutScore) : undefined,
        awayPens: a?.shootoutScore != null ? String(a.shootoutScore) : undefined,
        venue,
      })
    }
  }
  return out.sort((x, y) => x.rank - y.rank || x.kickoff.localeCompare(y.kickoff))
}
/** Shape consumed by studio/draw.js. */
function toDraw(m: AutoMatch) {
  const live = m.state === 'in'
  return {
    home: m.home, away: m.away, homeLogo: m.homeLogo, awayLogo: m.awayLogo, league: m.league,
    time: m.kickoff ? localTime(m.kickoff) : 'VS', live,
    score: live || m.state === 'post' ? `${m.homeScore}–${m.awayScore}` : undefined,
  }
}

// ─── Copy (English only) ───────────────────────────────────────────
// ─── Arabic-first copy (Mehdi, 2026-09-11 audit: Algeria 35 %, Morocco 33 %, Egypt 11 %, Tunisia 10 %…) ───
const LEAGUE_AR: Record<string, string> = {
  'UEFA Champions League': 'دوري أبطال أوروبا', 'UEFA Europa League': 'الدوري الأوروبي', 'UEFA Conference League': 'دوري المؤتمر الأوروبي',
  'Premier League': 'الدوري الإنجليزي الممتاز', 'LaLiga': 'الدوري الإسباني', 'Serie A': 'الدوري الإيطالي', 'Bundesliga': 'الدوري الألماني', 'Ligue 1': 'الدوري الفرنسي',
  'FA Cup': 'كأس إنجلترا', 'Carabao Cup': 'كأس الرابطة الإنجليزية', 'Copa del Rey': 'كأس ملك إسبانيا', 'Coppa Italia': 'كأس إيطاليا', 'DFB-Pokal': 'كأس ألمانيا', 'Coupe de France': 'كأس فرنسا',
  'Copa Libertadores': 'كوبا ليبرتادوريس', 'CAF Champions League': 'دوري أبطال أفريقيا', 'FIFA World Cup': 'كأس العالم', 'FIFA Club World Cup': 'كأس العالم للأندية', 'UEFA Super Cup': 'كأس السوبر الأوروبي',
  'UEFA Nations League': 'دوري الأمم الأوروبية', 'CONCACAF Nations League': 'دوري أمم الكونكاكاف', 'International Friendlies': 'مباريات ودية دولية',
  'World Cup Qualifiers · UEFA': 'تصفيات كأس العالم · أوروبا', 'World Cup Qualifiers · CAF': 'تصفيات كأس العالم · أفريقيا', 'World Cup Qualifiers · CONMEBOL': 'تصفيات كأس العالم · أمريكا الجنوبية', 'World Cup Qualifiers · AFC': 'تصفيات كأس العالم · آسيا', 'World Cup Qualifiers · CONCACAF': 'تصفيات كأس العالم · الكونكاكاف',
}
export const leagueAr = (l: string) => LEAGUE_AR[l] ?? l
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
export function labelAr(date?: string): string { const d = new Date(`${date ?? localParts().date}T12:00:00Z`); return `${AR_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]}` }
const AR_TAGS = '#كرة_القدم #Pressing90'
// Closed questions (audit 2026-09-13: open questions got zero answers) — "X or Y?" on the headline match.
const predictionAr = (pool: AutoMatch[]) => pool[0] ? `توقعك: ${pool[0].home} أم ${pool[0].away}؟ 👇` : 'من يفوز اليوم؟ 👇'
const barcaDayLine = (pool: AutoMatch[]) => pool[0] && isBarca(pool[0]) ? `🔵🔴 يوم برشلونة: ${pool[0].home} 🆚 ${pool[0].away} — ${localTime(pool[0].kickoff)}` : ''
function matchdayMessageAr(pool: AutoMatch[], label: string): string {
  const lines: string[] = [`⚽ مباريات اليوم — ${labelAr()}`, ...(barcaDayLine(pool) ? [barcaDayLine(pool)] : []), '']
  let last = ''
  for (const m of pool.slice(0, 12)) {
    if (m.league !== last) { lines.push(`🏆 ${leagueAr(m.league)}`); last = m.league }
    lines.push(`🕒 ${localTime(m.kickoff)} · ${m.home} 🆚 ${m.away}`)
  }
  if (pool.length > 12) lines.push(`…و${pool.length - 12} مباريات أخرى`)
  lines.push('', '⏰ بتوقيت المغرب', predictionAr(pool), '👉 النتائج المباشرة والتشكيلات على pressing90.live (الرابط في التعليقات)', '', `⚽ Today's matches — ${label}`, '', `${AR_TAGS} #مباريات_اليوم #football`)
  return lines.join('\n')
}
function matchdayScriptAr(pool: AutoMatch[]): string {
  const parts = [`صباح الخير يا عشاق كرة القدم، ومرحبًا بكم في بريسينغ تسعين! هذه أبرز مباريات اليوم، ${labelAr()}.`]
  for (const m of pool) parts.push(`في ${leagueAr(m.league)}، ${m.home} ضد ${m.away} على الساعة ${localTime(m.kickoff)}.`)
  parts.push('تابعوا كل الأهداف مباشرة على بريسينغ تسعين دوت لايف. الرابط في التعليقات!')
  return parts.join(' ')
}
function reelCaptionAr(pool: AutoMatch[], label: string): string {
  const top = pool.slice(0, 5).map((m) => `${m.home} 🆚 ${m.away}`).join(' · ')
  return `⚽ مباريات اليوم — ${labelAr()}\n${barcaDayLine(pool) ? barcaDayLine(pool) + '\n' : ''}${top}\n\n${predictionAr(pool)}\n👉 النتائج المباشرة على pressing90.live (الرابط في التعليقات)\n\n⚽ Today's matches — ${label}\n\n${AR_TAGS} #مباريات_اليوم #football`
}
function ftMessageAr(m: AutoMatch): string {
  const pens = m.homePens && m.awayPens ? ` (${m.homePens}–${m.awayPens} بركلات الترجيح)` : ''
  return `⏱ نهاية المباراة\n\n${m.home} ${m.homeScore}–${m.awayScore} ${m.away}${pens}\n🏆 ${leagueAr(m.league)}\n\nنتيجة منطقية أم مفاجأة؟ 👇\n👉 كل نتائج اليوم على pressing90.live (الرابط في التعليقات)\n\n⏱ FULL TIME · ${m.home} ${m.homeScore}–${m.awayScore} ${m.away}\n\n${AR_TAGS} #نهاية_المباراة #football`
}
/** Arabic voice-over: full tashkeel first, then the Arabic narrator (Jamal, free) or Fahad (ElevenLabs). */
async function arabicVoice(env: Env, text: string, key: string): Promise<string | undefined> {
  const [v] = await diacritizeArabic(env, [text])
  return (await taleVoice(env, v ?? text, 'ar', key)) ?? undefined
}
function matchdayMessage(pool: AutoMatch[], label: string): string {
  const lines: string[] = [`⚽ TODAY'S MATCHES — ${label}`, '']
  let lastLeague = ''
  for (const m of pool.slice(0, 12)) {
    if (m.league !== lastLeague) { lines.push(`🏆 ${m.league}`); lastLeague = m.league }
    lines.push(`🕒 ${localTime(m.kickoff)} · ${m.home} vs ${m.away}`)
  }
  if (pool.length > 12) lines.push(`…and ${pool.length - 12} more`)
  lines.push('', '⏰ Morocco time', '👉 Live scores, odds & line-ups on pressing90.live (link in the comments)', '', '#football #livescores #Pressing90')
  return lines.join('\n')
}
function matchdayScript(pool: AutoMatch[], label: string): string {
  const parts = [`Good morning football fans, and welcome to Pressing Ninety! Here are today's big matches, ${label}.`]
  for (const m of pool) parts.push(`In the ${m.league}, ${m.home} take on ${m.away} at ${spokenTime(m.kickoff)}.`)
  parts.push('Follow every goal live on pressing ninety dot live. Link in bio!')
  return parts.join(' ')
}
function reelCaption(pool: AutoMatch[], label: string): string {
  const top = pool.slice(0, 5).map((m) => `${m.home} vs ${m.away}`).join(' · ')
  return `⚽ Today's matches — ${label}\n${top}\n\n👉 Live scores on pressing90.live (link in bio)\n\n#football #livescores #matchday #Pressing90 #soccer`
}
function ftMessage(m: AutoMatch): string {
  const pens = m.homePens && m.awayPens ? ` (${m.homePens}–${m.awayPens} on penalties)` : ''
  return `⏱ FULL TIME\n\n${m.home} ${m.homeScore}–${m.awayScore} ${m.away}${pens}\n🏆 ${m.league}\n\n👉 All today's results on pressing90.live (link in the comments)\n\n#football #fulltime #Pressing90`
}
function ftStatus(m: AutoMatch): 'FT' | 'AET' | 'PEN' {
  if (/PEN/i.test(m.statusName)) return 'PEN'
  if (/AET/i.test(m.statusName)) return 'AET'
  return 'FT'
}

// ─── Voice ──────────────────────────────────────────────────────────
// ElevenLabs male voice "Adam" (the one Mehdi uses for manual reels),
// Flash model = 0.5 credit/char (~400/day for the match-day reel).
// Workers AI MeloTTS (female, free) only as a fallback without a key.
const ELEVEN_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'      // Adam (male) — match-day reel
const ELEVEN_FEMALE_ID = 'EXAVITQu4vr4xnSDxMaL'    // Sarah (female, news read) — article reels (Mehdi, 2026-09-07)
export type VoiceEngine = 'eleven' | 'eleven-f' | 'aura' | 'melo'
/** Workers AI Deepgram Aura-1 (male voice "orion"), inside the daily free neurons. */
async function auraVoice(env: Env, text: string, key: string): Promise<string> {
  const ai = env.AI as { run: (model: string, input: Record<string, unknown>) => Promise<unknown> } | undefined
  if (!ai) throw new Error('AI binding missing')
  const out = await ai.run('@cf/deepgram/aura-1', { text: text.slice(0, 2000), speaker: 'orion', encoding: 'mp3' })
  let bytes: Uint8Array
  if (out instanceof ReadableStream) bytes = new Uint8Array(await new Response(out).arrayBuffer())
  else if (out instanceof ArrayBuffer) bytes = new Uint8Array(out)
  else if (out && typeof (out as { audio?: string }).audio === 'string') bytes = Uint8Array.from(atob((out as { audio: string }).audio), (c) => c.charCodeAt(0))
  else throw new Error('aura: unexpected output ' + Object.prototype.toString.call(out))
  if (bytes.byteLength < 2000) throw new Error('aura: empty audio')
  return putMedia(env, key, bytes, 'audio/mpeg')
}
async function englishVoice(env: Env, text: string, key: string, engine: VoiceEngine = 'eleven'): Promise<string> {
  // Free production mode (admin toggle): every ElevenLabs voice → Microsoft neural (Andrew), then Orion (Workers AI).
  if (engine !== 'aura' && engine !== 'melo' && (await loadAutomationSettings(env)).freeVoices) {
    try { return await edgeVoice(env, text, 'en', key) } catch (e) { console.log('[auto] edge tts failed', String(e).slice(0, 120)) }
    engine = 'aura'
  }
  if (engine === 'aura') return auraVoice(env, text, key)
  const el = (env as unknown as { ELEVENLABS_API_KEY?: string }).ELEVENLABS_API_KEY
  if (el && (engine === 'eleven' || engine === 'eleven-f')) {
    const voiceId = engine === 'eleven-f' ? ELEVEN_FEMALE_ID : ELEVEN_VOICE_ID
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': el, 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 2500), model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35 } }),
    })
    if (r.ok) return putMedia(env, key, await r.arrayBuffer(), 'audio/mpeg')
    console.log('[auto] elevenlabs failed', r.status, (await r.text()).slice(0, 200))
  }
  const ai = env.AI as { run: (model: string, input: Record<string, unknown>) => Promise<{ audio?: string }> } | undefined
  if (!ai) throw new Error('AI binding missing')
  const out = await ai.run('@cf/myshell-ai/melotts', { prompt: text.slice(0, 2500), lang: 'en' })
  if (!out?.audio) throw new Error('melotts returned no audio')
  const bin = Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0))
  return putMedia(env, key, bin, 'audio/mpeg')
}

// ─── Jobs ───────────────────────────────────────────────────────────
export async function runMatchday(env: Env, s: AutomationSettings, date: string, label: string): Promise<void> {
  const pool = prioritizeBarca(await bigMatchesToday(env), s.barcaDaily)
  if (pool.length === 0) { await log(env, date, 'matchday', true, 'no big matches today — nothing posted'); return }
  const barcaDay = !!s.barcaDaily && isBarca(pool[0])   // « يوم برشلونة » (2026-09-14): featured panel / slide for the Barça match
  const draw = (m: AutoMatch, i: number) => (barcaDay && i === 0 ? { ...toDraw(m), feature: true } : toDraw(m))
  // 1. Post
  try {
    const img = await renderImage(env, 'matchday-post', { matches: pool.slice(0, 6).map(draw), dateLabel: label, featured: barcaDay })
    const ar = s.mainLang !== 'en'
    const r = await fbPost(env, { message: ar ? matchdayMessageAr(pool, label) : matchdayMessage(pool, label), link: `${SITE}/today?${ar ? 'lang=ar&' : ''}ref=fb`, image_url: img, title: ar ? `مباريات اليوم — ${labelAr()}` : `Today's matches — ${label}`, comment: ar ? `⚽ النتائج المباشرة والتشكيلات: ${SITE}/today?lang=ar&ref=fb` : `⚽ Live scores, odds & line-ups: ${SITE}/today?ref=fb` })
    if (r.ok) await bump(env, date, 'post')
    await log(env, date, 'matchday-post', r.ok, r.ok ? `${pool.length} matches · ${r.note ?? ''} · ${img}` : `${r.note ?? r.status ?? 'error'}`)
  } catch (e) { await log(env, date, 'matchday-post', false, String(e)) }
  // 2. Stories (6 per page, max 3 pages)
  if (s.stories) {
    if (!storiesConfigured(env)) await log(env, date, 'matchday-story', false, 'skipped — stories need FB_PAGE_TOKEN (Graph API)')
    else if (!(await tokenOk(env, date, 'matchday-story'))) { /* logged */ }
    else {
      const pages: AutoMatch[][] = []
      for (let i = 0; i < Math.min(pool.length, 18); i += 6) pages.push(pool.slice(i, i + 6))
      for (let i = 0; i < pages.length; i++) {
        if ((await getCount(env, date, 'story')) + i >= s.storiesPerDay) break
        const data = { matches: pages[i].map((m, k) => (i === 0 ? draw(m, k) : toDraw(m))), dateLabel: label, page: i + 1, pages: pages.length, featured: barcaDay && i === 0 }
        await queueVideoStory(env, date, 'matchday-story', 'story-match', data, () => renderImage(env, 'matchday-story', data))
      }
    }
  }
  // 3. Reel (async — the studio calls /studio/callback when done)
  if (s.reels) await queueMatchdayReel(env, date, label, pool, barcaDay)
}

/**
 * Article reels (Mehdi, 2026-09-07): one reel for every TWO auto-
 * published articles — both story cards back to back, 10 s each, the
 * "articles" signature music, no voice. Articles wait in a KV queue
 * until a pair is complete (the queue survives quiet hours).
 */
type QueuedArticle = { title: string; slug: string; image_url: string | null; excerpt?: string | null }
export const ARTICLES_PER_REEL = 2
/** Spoken script (English, free male voice): title + one-line summary per article. */
function articlesReelScript(list: QueuedArticle[]): string {
  const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/[#*_`]/g, '').trim()
  const parts = ['Pressing Ninety news update.']
  list.forEach((x, i) => {
    const ex = clean(x.excerpt ?? '').slice(0, 220)
    parts.push(`${i === 0 ? '' : 'Next. '}${clean(x.title)}. ${ex}${ex && !/[.!?]$/.test(ex) ? '.' : ''}`)
  })
  parts.push('Read the full stories on pressing ninety dot live.')
  return parts.join(' ')
}
function articlesReelCaption(list: QueuedArticle[]): string {
  const lines = list.map((x) => `📰 ${x.title}`)
  return `${lines.join('\n')}\n\n👉 Full stories on pressing90.live (link in bio)\n\n#football #news #Pressing90 #soccer`
}
export async function enqueueArticleForReel(env: Env, date: string, art: QueuedArticle): Promise<void> {
  const raw = await env.CACHE.get('auto:reelqueue')
  const q = (raw ? JSON.parse(raw) : []) as QueuedArticle[]
  q.push(art)
  if (q.length < ARTICLES_PER_REEL) {
    await env.CACHE.put('auto:reelqueue', JSON.stringify(q), { expirationTtl: 3 * 86400 })
    await log(env, date, 'article-reel', true, `queued ${q.length}/${ARTICLES_PER_REEL} — waiting for the next article`)
    return
  }
  const pair = q.splice(0, ARTICLES_PER_REEL)
  await env.CACHE.put('auto:reelqueue', JSON.stringify(q), { expirationTtl: 3 * 86400 })
  await queueArticlesReel(env, date, pair)
}
export async function queueArticlesReel(env: Env, date: string, list: QueuedArticle[]): Promise<void> {
  if (!reelsConfigured(env)) { await log(env, date, 'article-reel', false, 'skipped — set MAKE_FB_VIDEO_WEBHOOK_URL or FB_PAGE_TOKEN'); return }
  try {
    const jobId = `areel-${date}-${Math.random().toString(36).slice(2, 7)}`
    // Voice-over: Aura (male, free tier). Falls back to no voice if TTS fails.
    let voiceUrl: string | undefined
    try { voiceUrl = await englishVoice(env, articlesReelScript(list), `voice-articles-${date}-${Math.random().toString(36).slice(2, 6)}.mp3`, 'eleven-f') }
    catch (e) { await log(env, date, 'article-reel', false, `voice failed (${String(e).slice(0, 100)}) — reel without voice`) }
    const comment = list.map((x) => `📰 ${x.title}\n${SITE}/news/${x.slug}?ref=fb-reel`).join('\n\n')
    await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'reel', label: 'article-reel', date, description: articlesReelCaption(list), title: list.map((x) => x.title).join(' · ').slice(0, 100), comment }), { expirationTtl: 6 * 3600 })
    await studio(env, '/render/reel', { type: 'articles', data: { articles: list }, seconds: 10 * list.length, voiceUrl, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
    await log(env, date, 'article-reel', true, `rendering ${list.length} articles (job ${jobId}): ${list.map((x) => x.title.slice(0, 40)).join(' + ')}`)
  } catch (e) { await log(env, date, 'article-reel', false, String(e)) }
}

/**
 * Article story KIT (Mehdi, 2026-09-07): Meta's Stories API cannot carry
 * a link sticker, so article stories are semi-automatic — the studio
 * renders the story video, then Mehdi gets an e-mail with a mobile page
 * (/story-kit/<id>) offering "copy the link" + "share to Facebook"
 * (native iOS share → Facebook story composer with the video loaded);
 * he adds the link sticker himself. No automatic publication.
 */
/** Story kits go to Mehdi's publishing inbox (his request, 2026-09-07). */
const KIT_EMAIL_TO = 'medplay.inc@gmail.com'
type StoryKit = { title: string; slug: string; link: string; video_url?: string; image_url?: string; created: string }
export async function queueStoryKit(env: Env, date: string, art: { title: string; slug: string; image_url: string | null }): Promise<void> {
  const jobId = `kit-${date}-${Math.random().toString(36).slice(2, 7)}`
  await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'story-kit', date, label: 'article-story-kit', article: art }), { expirationTtl: 6 * 3600 })
  try {
    await studio(env, '/render/reel', { type: 'story-article', data: art, seconds: STORY_SECONDS, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
    await log(env, date, 'article-story-kit', true, `story video rendering (job ${jobId}) — e-mail follows`)
  } catch (e) {
    await env.CACHE.delete(`auto:job:${jobId}`)
    await log(env, date, 'article-story-kit', false, `studio unavailable (${String(e).slice(0, 100)}) — sending the kit with the still image`)
    await finishStoryKit(env, date, art, null)
  }
}
async function finishStoryKit(env: Env, date: string, art: { title: string; slug: string; image_url: string | null }, video_url: string | null): Promise<void> {
  let image_url: string | undefined
  try { image_url = await renderImage(env, 'article-story', art) } catch { /* video only */ }
  if (!video_url && !image_url) { await log(env, date, 'article-story-kit', false, `no media for ${art.slug}`); return }
  const id = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12)
  const link = `${SITE}/news/${art.slug}?ref=fb-story`
  const kit: StoryKit = { title: art.title, slug: art.slug, link, video_url: video_url ?? undefined, image_url, created: new Date().toISOString() }
  await env.CACHE.put(`auto:kit:${id}`, JSON.stringify(kit), { expirationTtl: 3 * 86400 })
  const kitUrl = `${WORKER_PUBLIC}/story-kit/${id}`
  const mail = await sendKitEmail(env, kit, kitUrl)
  await log(env, date, 'article-story-kit', mail.ok, `${mail.ok ? 'e-mail sent' : 'e-mail failed: ' + mail.note} · ${kitUrl}`)
}
export async function readStoryKit(env: Env, id: string): Promise<StoryKit | null> {
  const raw = await env.CACHE.get(`auto:kit:${id}`)
  return raw ? JSON.parse(raw) as StoryKit : null
}
async function sendKitEmail(env: Env, kit: StoryKit, kitUrl: string): Promise<{ ok: boolean; note?: string }> {
  const ex = env as unknown as { RESEND_API_KEY?: string; RESEND_FROM?: string }
  if (!ex.RESEND_API_KEY || !ex.RESEND_FROM) return { ok: false, note: 'Resend not configured' }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:8px">
    <p style="margin:0 0 4px;color:#64748b;font-size:12px;letter-spacing:.08em">PRESSING 90' · STORY PRÊTE</p>
    <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px">${esc(kit.title)}</h2>
    ${kit.image_url ? `<img src="${kit.image_url}" alt="" style="width:100%;max-width:300px;border-radius:12px;display:block;margin:0 0 16px"/>` : ''}
    <a href="${kitUrl}" style="display:inline-block;background:#d4af37;color:#0f172a;font-weight:700;padding:14px 22px;border-radius:10px;text-decoration:none;font-size:16px">📱 Ouvrir le kit story →</a>
    <p style="color:#475569;font-size:13px;margin:18px 0 6px">Sur l'iPhone : <b>1 · Copier le lien</b> → <b>2 · Enregistrer + ouvrir Facebook</b> → Story → dernière vidéo → sticker <b>Lien</b> → coller → publier.</p>
    <p style="color:#94a3b8;font-size:12px;margin:0 0 6px">Première fois ? <a href="https://ssvvojhxyotlbcdosiog.supabase.co/storage/v1/object/public/media/P90-Story.shortcut" style="color:#b45309">Installer le raccourci « P90 Story »</a> (Raccourcis → Ajouter).</p>
    <p style="font-size:12px;color:#94a3b8;margin:0;word-break:break-all">Lien de l'article : ${esc(kit.link)}</p>
  </div>`
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${ex.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: ex.RESEND_FROM, to: KIT_EMAIL_TO, subject: `📱 Story prête : ${kit.title.slice(0, 70)}`, html }),
    })
    return r.ok ? { ok: true } : { ok: false, note: `resend ${r.status} ${(await r.text()).slice(0, 120)}` }
  } catch (e) { return { ok: false, note: String(e) } }
}

/** Voice-over + studio render of the match-day reel; published from the callback. */
export async function queueMatchdayReel(env: Env, date: string, label: string, pool: AutoMatch[], barcaDay = false): Promise<void> {
  if (!reelsConfigured(env)) { await log(env, date, 'matchday-reel', false, 'skipped — set MAKE_FB_VIDEO_WEBHOOK_URL or FB_PAGE_TOKEN'); return }
  try {
    const reelPool = pool.slice(0, 8)
    const ar = (await loadAutomationSettings(env)).mainLang !== 'en'
    const key = `voice-${date}-${Math.random().toString(36).slice(2, 6)}.mp3`
    const voiceUrl = ar ? await arabicVoice(env, matchdayScriptAr(reelPool), key) : await englishVoice(env, matchdayScript(reelPool, label), key)
    const jobId = `reel-${date}-${Math.random().toString(36).slice(2, 7)}`
    await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'reel', date, description: ar ? reelCaptionAr(reelPool, label) : reelCaption(reelPool, label), title: ar ? `مباريات اليوم — ${labelAr()}` : `Today's matches — ${label}`, comment: ar ? `⚽ النتائج المباشرة والتشكيلات: ${SITE}/today?lang=ar&ref=fb-reel` : `⚽ Live scores, odds & line-ups: ${SITE}/today?ref=fb-reel` }), { expirationTtl: 6 * 3600 })
    const cover = barcaDay ? { text: 'يوم برشلونة: هل يفوز الليلة؟', tone: 'barca' } : { text: 'مباريات اليوم: من يفوز؟', tone: 'matchday' }
    await studio(env, '/render/reel', { type: 'matchday', data: { matches: reelPool.map((m, i) => (i === 0 ? { ...toDraw(m), feature: barcaDay, cover } : toDraw(m))), heading: ar ? 'مباريات اليوم' : undefined, lang: ar ? 'ar' : 'en', special: barcaDay ? 'barca' : undefined }, voiceUrl, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
    await log(env, date, 'matchday-reel', true, `rendering ${reelPool.length} slides (job ${jobId}) — voice ${voiceUrl}`)
  } catch (e) { await log(env, date, 'matchday-reel', false, String(e)) }
}

/** Studio → worker: a reel finished rendering. */
export async function handleStudioCallback(req: Request, env: Env): Promise<Response> {
  if (!env.STUDIO_SECRET || req.headers.get('x-studio-secret') !== env.STUDIO_SECRET) return new Response('unauthorized', { status: 401 })
  const body = await req.json().catch(() => null) as { jobId?: string; ok?: boolean; url?: string; urls?: string[]; seconds?: number; error?: string } | null
  if (!body?.jobId) return new Response('bad request', { status: 400 })
  const raw = await env.CACHE.get(`auto:job:${body.jobId}`)
  const { date } = localParts()
  if (!raw) { await log(env, date, 'reel-callback', false, `unknown job ${body.jobId}`); return new Response('unknown job', { status: 404 }) }
  const job = JSON.parse(raw) as { kind: string; date: string; description?: string; title?: string; label?: string; fallback?: { type: string; data: unknown } }
  await env.CACHE.delete(`auto:job:${body.jobId}`)
  if (job.kind === 'goal-anim') { await goalAnimCallback(env, job as unknown as Parameters<typeof goalAnimCallback>[1], body as unknown as Parameters<typeof goalAnimCallback>[2]); return new Response('ok') }
  if (job.kind === 'preview') {
    // Render-only test (nothing published): the URL lands in the log.
    await log(env, job.date, job.label ?? 'preview', !!body.ok, body.ok && body.url ? `PREVIEW ready (${body.seconds ?? '?'}s, not published): ${(body.urls && body.urls.length > 1 ? body.urls : [body.url]).join(' · ')}` : `preview render failed: ${body.error ?? 'unknown'}`)
    return new Response('ok')
  }
  if (job.kind === 'story-kit') {
    const art = (job as { article?: { title: string; slug: string; image_url: string | null } }).article
    if (!art) return new Response('ok')
    if (!body.ok || !body.url) await log(env, job.date, 'article-story-kit', false, `video render failed (${body.error ?? 'unknown'}) — kit with the still image`)
    await finishStoryKit(env, job.date, art, body.ok && body.url ? body.url : null)
    return new Response('ok')
  }
  if (job.kind === 'story') {
    const jobLabel = job.label ?? 'story'
    if (!body.ok || !body.url) { await log(env, job.date, jobLabel, false, `story render failed: ${body.error ?? 'unknown'}`); return new Response('ok') }
    let r = await fbVideoStory(env, body.url)
    if (!r.ok && job.fallback) {
      // Stories API refused the video → photo story with the same card.
      try {
        const img = await renderImage(env, job.fallback.type === 'story-match' ? 'matchday-story' : 'article-story', job.fallback.data)
        const p = await fbStory(env, img)
        r = { ok: p.ok, status: p.status, note: `video story failed (${r.note ?? ''}) → photo story ${p.ok ? 'posted' : 'failed: ' + (p.note ?? '')}` }
      } catch (e) { r = { ok: false, note: `${r.note ?? ''} · fallback ${String(e)}` } }
    }
    if (r.ok) await bump(env, job.date, 'story')
    await log(env, job.date, jobLabel, r.ok, `${r.note ?? ''} · ${body.url}`)
    return new Response('ok')
  }
  if (job.kind === 'reel-variants') {
    // Same reel, N covers (2026-09-16): the first goes out now, the others every gapMin minutes (processReelQueue).
    const urls = body.urls && body.urls.length ? body.urls : body.url ? [body.url] : []
    if (!body.ok || !urls.length) { await log(env, job.date, job.label ?? 'tale-reel', false, `render failed: ${body.error ?? 'unknown'}`); return new Response('ok') }
    const jv = job as { variants?: Array<{ description: string; title: string; comment?: string }>; gapMin?: number; comment?: string }
    const gap = (jv.gapMin ?? 15) * 60_000
    const items: ReelQueueItem[] = urls.map((u, i) => ({ at: Date.now() + i * gap, video_url: u, description: jv.variants?.[i]?.description ?? job.description ?? '', title: jv.variants?.[i]?.title ?? job.title ?? '', comment: jv.variants?.[i]?.comment ?? jv.comment, label: job.label ?? 'tale-reel', date: job.date }))
    await pushReelQueue(env, items)
    await log(env, job.date, job.label ?? 'tale-reel', true, `${body.seconds ?? '?'}s · ${urls.length} variant(s) queued, one every ${gap / 60_000} min · ${urls[0]}`)
    return new Response('ok')
  }
  const reelLabel = job.label ?? 'matchday-reel'
  if (!body.ok || !body.url) { await log(env, job.date, reelLabel, false, `render failed: ${body.error ?? 'unknown'}`); return new Response('ok') }
  const r = await fbReel(env, { video_url: body.url, description: job.description ?? '', title: job.title ?? '' })
  if (r.ok) { await bump(env, job.date, 'reel'); if (reelLabel === 'goal-reel') await bump(env, job.date, 'goalreel') }
  await log(env, job.date, reelLabel, r.ok, r.ok ? `${body.seconds ?? '?'}s · ${r.note ?? ''} · ${body.url}` : `graph ${r.status ?? 'error'} ${r.note ?? ''} · ${body.url}`)
  // Links as a Page comment under the reel (reel descriptions aren't clickable).
  const comment = (job as { comment?: string }).comment
  if (r.ok && comment) {
    if (r.id) {
      const c = await fbComment(env, r.id, comment)
      await log(env, job.date, `${reelLabel}-comment`, c.ok, c.ok ? c.note ?? 'ok' : `${c.note ?? 'failed'} (needs pages_manage_engagement?)`)
    } else if (env.FB_PAGE_TOKEN) {
      // Make post: found later by its first line in /posts (every minute, 30 min).
      await enqueuePendingComment(env, job.description ?? '', comment)
      await log(env, job.date, `${reelLabel}-comment`, true, 'queued — commented once Facebook has processed the video')
    }
  }
  return new Response('ok')
}

// Reel publish queue (2026-09-16): cover variants of the same story, one every N minutes.
type ReelQueueItem = { at: number; video_url: string; description: string; title: string; comment?: string; label: string; date: string }
async function pushReelQueue(env: Env, items: ReelQueueItem[]): Promise<void> {
  const q = JSON.parse((await env.CACHE.get('auto:reel:queue')) ?? '[]') as ReelQueueItem[]
  q.push(...items)
  await env.CACHE.put('auto:reel:queue', JSON.stringify(q), { expirationTtl: 2 * 86400 })
}
export async function processReelQueue(env: Env, date: string): Promise<void> {
  const raw = await env.CACHE.get('auto:reel:queue'); if (!raw) return
  const q = JSON.parse(raw) as ReelQueueItem[]
  const idx = q.findIndex((x) => x.at <= Date.now()); if (idx < 0) return
  const [it] = q.splice(idx, 1)
  await env.CACHE.put('auto:reel:queue', JSON.stringify(q), { expirationTtl: 2 * 86400 })
  const r = await fbReel(env, { video_url: it.video_url, description: it.description, title: it.title })
  if (r.ok) await bump(env, date, 'reel')
  await log(env, date, it.label, r.ok, r.ok ? `variant · ${r.note ?? ''} · ${it.video_url}` : `graph ${r.status ?? 'error'} ${r.note ?? ''} · ${it.video_url}`)
  if (r.ok && it.comment) {
    if (r.id) { const c = await fbComment(env, r.id, it.comment); await log(env, date, `${it.label}-comment`, c.ok, c.ok ? c.note ?? 'ok' : `${c.note ?? 'failed'}`) }
    else if (env.FB_PAGE_TOKEN) { await enqueuePendingComment(env, it.description, it.comment) }
  }
}
// Full-time scores (Mehdi, 2026-09-14): « une photo pour chaque match mais dans une publication regroupée ».
// Finished matches wait in a small queue; the group goes out as one album post (one editorial poster per match)
// when no big match is still in play, or after 75 min, or with 6 matches, or at 23:40. Barça keeps its own poster.
type FtPending = { id: string; slug: string; league: string; home: string; away: string; homeLogo: string | null; awayLogo: string | null; homeScore: string; awayScore: string; homePens?: string; awayPens?: string; venue?: string; kickoff: string; ended: number; tries?: number }
const ftPendingKey = (date: string) => `auto:ftgroup:${date}`
async function ftPending(env: Env, date: string): Promise<FtPending[]> { try { return JSON.parse((await env.CACHE.get(ftPendingKey(date))) ?? '[]') as FtPending[] } catch { return [] } }
function ftGroupMessageAr(list: FtPending[], label: string): string {
  const byLeague = new Map<string, FtPending[]>()
  for (const m of list) { const k = leagueAr(m.league); byLeague.set(k, [...(byLeague.get(k) ?? []), m]) }
  const lines: string[] = [`⏱ نتائج المباريات — ${label}`, '']
  for (const [lg, ms] of byLeague) { lines.push(`🏆 ${lg}`); for (const m of ms) lines.push(`${m.home} ${m.homeScore}–${m.awayScore} ${m.away}${m.homePens && m.awayPens ? ` (${m.homePens}–${m.awayPens} بركلات الترجيح)` : ''}`); lines.push('') }
  lines.push('أي نتيجة فاجأتك أكثر؟ 👇', '👉 كل النتائج والتفاصيل على pressing90.live (الرابط في التعليقات)', '', '#كرة_القدم #نتائج #Pressing90')
  return lines.join('\n')
}
/** Render the posters and publish the grouped post. Returns a log note. */
async function flushFtGroup(env: Env, s: AutomationSettings, date: string, list: FtPending[], why: string): Promise<string> {
  const photos: string[] = []
  for (const m of list.slice(0, 10)) {
    const am = { ...m, rank: 0, state: 'post', completed: true, statusName: 'STATUS_FULL_TIME' } as unknown as AutoMatch
    try { photos.push(await renderImage(env, 'score', ftPosterData(am, await matchSummary(env, am), s.mainLang !== 'en' ? 'ar' : 'en'))) } catch (e) { await log(env, date, 'ft-group', false, `${m.home} v ${m.away}: render failed ${String(e).slice(0, 100)}`) }
  }
  if (photos.length === 0) throw new Error('no poster rendered')
  const r = await fbAlbumPost(env, { message: ftGroupMessageAr(list, localParts().label), photos, comment: '⏱ كل النتائج والتفاصيل: https://pressing90.live/today?lang=ar&ref=fb' })
  if (!r.ok) throw new Error(r.note ?? 'album failed')
  await bump(env, date, 'ft')
  await env.CACHE.put('auto:lastpost', String(Date.now()), { expirationTtl: 3600 })
  return `${list.length} matches (${why}) · ${r.note ?? ''} · ${photos[0]}`
}
export async function runFtPosts(env: Env, s: AutomationSettings, date: string, verbose = false, forceFlush = false): Promise<void> {
  const pool = await bigMatchesToday(env)
  const now = Date.now()
  const finished = pool.filter((m) => m.state === 'post' && m.completed)
  // 1. queue newly finished matches (Barça excluded: it gets its own poster below)
  const pending = await ftPending(env, date)
  let barca: AutoMatch | undefined
  let stale = 0, added = 0
  for (const m of finished) {
    const key = `auto:ft:${m.id}`
    if (await env.CACHE.get(key)) continue
    await env.CACHE.put(key, '1', { expirationTtl: 3 * 86400 })
    if (m.kickoff && now - Date.parse(m.kickoff) > 4 * 3600_000) { stale++; continue }   // ended long ago (worker was off) → skip quietly
    if (s.goalAnim && (s.goalAnimScope === 'all' || isBarca(m))) { try { await enqueueGoalAnim(env, date, { id: m.id, slug: m.slug, league: m.league, home: m.home, away: m.away, homeLogo: m.homeLogo, awayLogo: m.awayLogo, homeScore: m.homeScore, awayScore: m.awayScore, venue: m.venue, addedAt: now }) } catch (e) { await log(env, date, 'goal-anim', false, `enqueue failed: ${String(e).slice(0, 120)}`) } }
    if (s.barcaDaily && isBarca(m)) { barca = barca ?? m; continue }
    pending.push({ id: m.id, slug: m.slug, league: m.league, home: m.home, away: m.away, homeLogo: m.homeLogo, awayLogo: m.awayLogo, homeScore: m.homeScore, awayScore: m.awayScore, homePens: m.homePens, awayPens: m.awayPens, venue: m.venue, kickoff: m.kickoff, ended: now })
    added++
  }
  if (added) await env.CACHE.put(ftPendingKey(date), JSON.stringify(pending), { expirationTtl: 36 * 3600 })   // write only on change: an unconditional put every minute blew the 1 000 KV writes/day of the free plan (2026-09-16)
  // 2. Barça full time: editorial poster (or the animated reel, barcaFtStyle)
  if (barca) {
    if (await recentlyPosted(env)) { await env.CACHE.delete(`auto:ft:${barca.id}`); if (verbose) await log(env, date, 'ft-pass', true, 'Barça FT waits — a post went out less than 8 min ago'); return }
    try { if (s.barcaFtStyle === 'reel' && s.reels && reelsConfigured(env)) await queueBarcaFtReel(env, date, barca); else await queueBarcaFtPoster(env, date, barca) } catch (e) { await log(env, date, 'barca-ft', false, `${barca.home} v ${barca.away}: ${String(e).slice(0, 160)}`) }
    return
  }
  // 3. flush the group?
  if (pending.length === 0) { if (verbose) await log(env, date, 'ft-pass', true, `nothing pending — ${pool.length} big matches, ${finished.length} finished, ${stale} ended >4h ago`); return }
  const inPlay = pool.filter((m) => m.state === 'in').length
  const oldest = Math.min(...pending.map((m) => m.ended))
  const { hour, minute } = localParts()
  const why = forceFlush ? 'forced' : inPlay === 0 ? 'no match in play' : now - oldest > 75 * 60_000 ? 'waited 75 min' : pending.length >= 6 ? '6 matches' : hour === 23 && minute >= 40 ? 'end of day' : ''
  if (!why) { if (verbose) await log(env, date, 'ft-pass', true, `${pending.length} finished match(es) waiting — ${inPlay} still in play`); return }
  if (await recentlyPosted(env)) { if (verbose) await log(env, date, 'ft-pass', true, 'group waits — a post went out less than 8 min ago'); return }
  if ((await getCount(env, date, 'ft')) >= s.ftPerDay) { if (verbose) await log(env, date, 'ft-pass', true, `daily cap ${s.ftPerDay} grouped posts reached — ${pending.length} match(es) dropped`); await env.CACHE.delete(ftPendingKey(date)); return }
  if ((await fbPostsToday(env, date)) >= s.maxPostsPerDay) { if (verbose) await log(env, date, 'ft-pass', true, `daily budget ${s.maxPostsPerDay} posts reached`); return }
  try {
    const note = await flushFtGroup(env, s, date, pending, why)
    await env.CACHE.delete(ftPendingKey(date))
    await log(env, date, 'ft-group', true, note)
  } catch (e) {
    const tries = (pending[0].tries ?? 0) + 1
    if (tries >= 3) { await env.CACHE.delete(ftPendingKey(date)); await log(env, date, 'ft-group', false, `gave up after 3 attempts: ${String(e).slice(0, 140)}`) }
    else { pending.forEach((m) => { m.tries = tries }); await env.CACHE.put(ftPendingKey(date), JSON.stringify(pending), { expirationTtl: 36 * 3600 }); await log(env, date, 'ft-group', false, `attempt ${tries}: ${String(e).slice(0, 140)}`) }
  }
}

/**
 * Called by the news cron right after a draft was produced. Publishes
 * it without approval when the quality gates pass, then posts the split
 * card + a story. Failing a gate leaves it as a draft for Mehdi.
 */
export async function maybeAutoPublishArticle(env: Env, articleId: string): Promise<void> {
  const s = await loadAutomationSettings(env)
  if (!s.enabled || !s.articles) return
  const { date } = localParts()
  if ((await getCount(env, date, 'article')) >= s.articlesPerDay) { await log(env, date, 'article', true, `daily cap reached (${s.articlesPerDay}) — left as draft`); return }
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(articleId)}&select=id,slug,title,excerpt,body,image_url,status,score&limit=1`, { headers: sbHeaders(env) })
  const row = ((await r.json().catch(() => [])) as Array<{ id: string; slug: string; title: string; excerpt?: string | null; body: string; image_url?: string | null; status: string; score?: number }>)[0]
  if (!row) { await log(env, date, 'article', false, `row ${articleId} not found`); return }
  const gate =
    row.status !== 'draft' ? 'not a draft' :
    !row.title || row.title.length < 25 || row.title.length > 140 ? 'title length' :
    !row.body || row.body.replace(/\s+/g, ' ').length < 400 ? 'body too short' :
    !row.image_url ? 'no image' :
    /lorem ipsum|as an ai|i cannot|\[insert/i.test(row.title + ' ' + row.body) ? 'suspicious text' :
    null
  if (gate) { await log(env, date, 'article', false, `kept as draft (${gate}): ${row.title}`); return }
  // Site-side Arabic version (Mehdi, 2026-09-06: auto-published articles
  // must exist in Arabic on the SITE too — only the Facebook output stays
  // English). Same translator as the manual Approve; a failure never
  // blocks the publish, the article just ships EN-only and is logged.
  let arCols: { title_ar?: string; excerpt_ar?: string; body_ar?: string } = {}
  try {
    const { translateArticleToArabic } = await import('./news')
    const ar = await translateArticleToArabic(
      env as unknown as Parameters<typeof translateArticleToArabic>[0],
      { title: row.title, excerpt: row.excerpt ?? '', body: row.body }
    )
    if (ar) arCols = ar
    else await log(env, date, 'article-ar', false, `translation returned null — EN-only: ${row.title}`)
  } catch (e) { await log(env, date, 'article-ar', false, String(e)) }
  const nowIso = new Date().toISOString()
  const u = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH', headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify({ status: 'published', published_at: nowIso, archived_at: null, ...arCols }),
  })
  if (!u.ok) { await log(env, date, 'article', false, `publish failed ${u.status}`); return }
  await bump(env, date, 'article')
  await env.CACHE.put('auto:lastarticle', nowIso, { expirationTtl: 86400 })
  await log(env, date, 'article', true, `published${arCols.title_ar ? ' (EN+AR)' : ' (EN only)'}: ${row.title}`)
  // Facebook post — branded split card, raw photo as fallback.
  const ar = !!arCols.title_ar
  const link = `${SITE}/news/${row.slug}?${ar ? 'lang=ar&' : ''}ref=fb`
  let card: string | null = null
  try { card = await renderImage(env, 'article-post', { title: ar ? arCols.title_ar : row.title, slug: row.slug, image_url: row.image_url, lang: ar ? 'ar' : 'en' }) } catch (e) { await log(env, date, 'article-card', false, String(e)) }
  const image = card ?? `${WORKER_PUBLIC}/fb-img?u=${encodeURIComponent(row.image_url!)}`
  const message = ar
    ? `${arCols.title_ar}${arCols.excerpt_ar ? '\n\n' + arCols.excerpt_ar : ''}\n\nما رأيك؟ 👇\n👉 المقال كاملاً على pressing90.live (الرابط في التعليقات)\n\n${row.title}\n\n#كرة_القدم #أخبار #Pressing90`
    : `${row.title}${row.excerpt ? '\n\n' + row.excerpt : ''}\n\n👉 Full article on pressing90.live (link in the comments)`
  const p = await fbPost(env, { message, link, image_url: image, title: ar ? arCols.title_ar! : row.title, comment: ar ? `📰 اقرأ المقال كاملاً: ${link}` : `📰 Read the full article: ${link}` })
  if (p.ok) await bump(env, date, 'post')
  await log(env, date, 'article-post', p.ok, p.ok ? `${row.slug} · ${p.note ?? ''} · ${image}` : `${p.note ?? p.status ?? 'error'}`)
  // Story (QR + "visit our profile")
  // Article stories are semi-automatic (link sticker is manual on Meta):
  // the video is rendered and Mehdi receives the story kit by e-mail.
  if (s.stories) await queueStoryKit(env, date, { title: row.title, slug: row.slug, image_url: row.image_url ?? null })
  // Article reel: one per two published articles.
  if (s.reels && s.articleReels) await enqueueArticleForReel(env, date, { title: row.title, slug: row.slug, image_url: row.image_url ?? null, excerpt: row.excerpt ?? null })
}

/**
 * Article pacing (Mehdi, 2026-09-07 — the whole daily cap had gone out
 * between midnight and 3 am): no auto-publishing 00:00–06:59 Morocco,
 * and the cap is spread over the 07:00–24:00 window with a minimum gap
 * between two automated articles.
 */
export const ARTICLE_QUIET_UNTIL_HOUR = 7
export async function articleSlotOpen(env: Env, s: AutomationSettings): Promise<{ open: boolean; why: string }> {
  const { date, hour } = localParts()
  if (hour < ARTICLE_QUIET_UNTIL_HOUR) return { open: false, why: `quiet hours until ${ARTICLE_QUIET_UNTIL_HOUR}:00` }
  const done = await getCount(env, date, 'article')
  if (done >= s.articlesPerDay) return { open: false, why: `daily cap ${s.articlesPerDay} reached` }
  const windowMin = (24 - ARTICLE_QUIET_UNTIL_HOUR) * 60
  const gapMin = Math.max(30, Math.floor(windowMin / Math.max(1, s.articlesPerDay)))
  const last = await env.CACHE.get('auto:lastarticle')
  if (last && Date.now() - Date.parse(last) < gapMin * 60_000) {
    return { open: false, why: `pacing — next slot in ${Math.ceil((gapMin * 60_000 - (Date.now() - Date.parse(last))) / 60_000)} min (gap ${gapMin} min)` }
  }
  return { open: true, why: 'ok' }
}

/** Is the Page token usable right now? (expired tokens → false, logged once) */
async function tokenOk(env: Env, date: string, jobLabel: string): Promise<boolean> {
  if (!env.FB_PAGE_TOKEN) return false
  try { await pageAuth(env); return true } catch (e) { await log(env, date, jobLabel, false, `Facebook token unusable — ${String(e).slice(0, 160)}`); return false }
}

// ─── GOAL ALERTS (Mehdi, 2026-09-08: big-5 + Champions League + major cups) ───
// Every minute: compare each live match's score with the one stored in
// KV. Score went up → fetch the goal details (scorer, minute) through the
// studio's ESPN summary proxy → GOAL reel (card + free male voice + music)
// published through the Reels API with the live link commented.
// Scope chosen by Mehdi: the big-5 leagues, the Champions League and the
// major cups (World Cup, Club World Cup, Super Cup, the big-5 domestic
// cups). Europa/Conference, league cups, qualifiers and friendlies stay
// out — they would eat the daily cap before the UCL evening kicks off.
const GOAL_ALERT_SLUGS = new Set(['fifa.world', 'club.world.cup', 'uefa.super_cup', 'uefa.champions', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'eng.fa', 'esp.copa_del_rey', 'ita.coppa_italia', 'fra.coupe_de_france', 'ger.dfb_pokal'])
type GoalInfo = { scorer: string; minute: string; side: 'home' | 'away'; ownGoal?: boolean; penalty?: boolean; assist?: string; nationality?: string }
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`
function goalScript(m: AutoMatch, g: GoalInfo): string {
  const min = parseInt(g.minute, 10)
  const when = Number.isFinite(min) ? ` in the ${ordinal(min)} minute` : ''
  const who = g.scorer ? `${g.scorer}${g.ownGoal ? ', own goal' : g.penalty ? ', from the penalty spot' : ''}` : (g.side === 'home' ? m.home : m.away)
  const hs = Number(m.homeScore), as = Number(m.awayScore)
  const leader = hs === as ? `It's ${m.homeScore} all.` : hs > as ? `${m.home} lead ${m.homeScore} ${m.awayScore}.` : `${m.away} lead ${m.awayScore} ${m.homeScore}.`
  return `Goal! ${who}${when}. ${m.home} ${m.homeScore}, ${m.away} ${m.awayScore}. ${leader} ${m.league}. Follow it live on pressing ninety dot live.`
}
function goalReelData(m: AutoMatch, g: GoalInfo) {
  return { home: m.home, away: m.away, homeLogo: m.homeLogo, awayLogo: m.awayLogo, homeScore: m.homeScore, awayScore: m.awayScore, league: m.league, scorer: g.scorer, minute: g.minute, scoringSide: g.side, ownGoal: !!g.ownGoal, penalty: !!g.penalty, assist: g.assist ?? '' }
}
// Mehdi, 2026-09-08 evening: match reels (goal alerts) carry NO voice —
// music + visual only. `goalScript` stays available (`GOAL_VOICE = true`
// brings the free Orion voice back).
const GOAL_VOICE = false
// Priority goals (audit 2026-09-13): on 12 Sept the daily budget was gone by 14:40
// (Racing, Genoa, Paderborn) while Real Madrid 4-1, Arsenal, Lazio-Milan and
// Freiburg 5-0 went unposted — and the Zabiri goal (Moroccan striker) was the
// best post of the page (809 views). The last third of the budget is kept for
// big clubs and Maghreb players; ordinary matches get 2 reels, priority ones 3.
const BIG_CLUBS = ['real madrid', 'barcelona', 'atlético', 'atletico', 'man city', 'manchester city', 'man united', 'manchester united', 'liverpool', 'arsenal', 'chelsea', 'tottenham', 'spurs', 'bayern', 'dortmund', 'leverkusen', 'psg', 'paris', 'marseille', 'lyon', 'monaco', 'juventus', 'inter', 'milan', 'napoli', 'roma', 'ajax', 'porto', 'benfica', 'sporting', 'al ahly', 'wydad', 'raja', 'zamalek', 'espérance', 'esperance', 'usm alger', 'belouizdad', 'mc alger', 'morocco', 'algeria', 'tunisia', 'egypt', 'libya', 'mauritania', 'france', 'spain', 'england', 'germany', 'italy', 'portugal', 'brazil', 'argentina']
const MAGHREB_PLAYERS = ['hakimi', 'ziyech', 'nesyri', 'brahim', 'mazraoui', 'amrabat', 'ounahi', 'ezzalzouli', 'aguerd', 'bounou', 'el kaabi', 'rahimi', 'zabiri', 'saibari', 'ben seghir', 'khannouss', 'richardson', 'adli', 'chebbak', 'mahrez', 'bennacer', 'aouar', 'gouiri', 'amoura', 'bounedjah', 'slimani', 'belaili', 'belaïli', 'bensebaini', 'ait-nouri', 'aït-nouri', 'ait nouri', 'chaibi', 'khazri', 'msakni', 'sassi', 'laidouni', 'salah', 'marmoush', 'trezeguet', 'elneny', 'mostafa mohamed', 'zizo', 'hegazi', 'hamdallah', 'el shaarawy']
// Barça first (Mehdi, 2026-09-13): the page was born as a Barça fan page — its
// 5 150 inherited followers are Barça fans from the Maghreb.
export const isBarca = (m: AutoMatch) => /\b(fc )?barcelona\b|barça/i.test(`${m.home} ${m.away}`) && !/barcelona (sc|b|women)/i.test(`${m.home} ${m.away}`)
/** The Barça match goes first (headline question, first slide, first story). */
export function prioritizeBarca(pool: AutoMatch[], on = true): AutoMatch[] {
  if (!on) return pool
  const i = pool.findIndex(isBarca)
  return i > 0 ? [pool[i], ...pool.filter((_, k) => k !== i)] : pool
}
/** Preview helper: a Barça fixture tonight at 21:00 Morocco. */
function fakeBarcaMatch(date: string): AutoMatch {
  return { id: 'preview-barca', rank: 1, league: 'LaLiga', slug: 'esp.1', kickoff: `${date}T20:00:00Z`, state: 'pre', completed: false, statusName: 'STATUS_SCHEDULED', home: 'Barcelona', away: 'Valencia (APERÇU)', homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', awayLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/94.png', homeScore: '', awayScore: '' } as unknown as AutoMatch
}
// Mehdi, 2026-09-14 (stats review): goal reels are reserved for Barça matches and goals by Moroccan players — Zabiri's goal
// (857 views) is the best reel to date while rapid-fire goal reels of other matches got 17-45 views each.
// Primary signal: ESPN citizenship (studio /espn/summary); fallback: Moroccan internationals by name.
const MOROCCAN_PLAYERS = ['hakimi', 'ziyech', 'nesyri', 'brahim', 'mazraoui', 'amrabat', 'ounahi', 'ezzalzouli', 'abde', 'aguerd', 'bounou', 'el kaabi', 'rahimi', 'zabiri', 'saibari', 'ben seghir', 'khannouss', 'richardson', 'adli', 'akhomach', 'talbi', 'targhalline', 'igamane', 'el aynaoui', 'aboukhlal', 'boufal', 'cheddira', 'louza', 'sahraoui', 'nadir', 'belahyane', 'sabiri', 'masina', 'bouaddi', 'chair', 'el haddadi', 'diaz', 'díaz']
export const isMoroccanScorer = (g: GoalInfo): boolean => /morocco|maroc/i.test(g.nationality || '') || (!/./.test(g.nationality || '') && MOROCCAN_PLAYERS.some((p) => (g.scorer || '').toLowerCase().includes(p)))
function goalPriority(m: AutoMatch, g: GoalInfo): boolean {
  const teams = `${m.home} ${m.away}`.toLowerCase()
  if (BIG_CLUBS.some((c) => teams.includes(c))) return true
  const scorer = (g.scorer || '').toLowerCase()
  return !!scorer && MAGHREB_PLAYERS.some((p) => scorer.includes(p))
}
/** Thumbnail line of a goal reel from the score context (honest suspense, never clickbait — Meta demotes it). */
function goalCoverText(m: AutoMatch, g: GoalInfo, prev: [number, number]): string {
  const ch = Number(m.homeScore), ca = Number(m.awayScore); const [ph, pa] = prev
  const mine = g.side === 'home' ? ch : ca, theirs = g.side === 'home' ? ca : ch
  const min = parseInt(String(g.minute ?? ''), 10)
  const late = Number.isFinite(min) && min >= 85
  if (mine === theirs) return late ? 'تعادل قاتل!' : 'هدف التعادل!'
  if (mine === theirs + 1 && ph === pa) return late ? 'هدف قاتل!' : 'هدف التقدم!'
  if (mine > theirs + 1) return `الهدف رقم ${mine}!`
  if (mine < theirs) return 'هدف تقليص الفارق!'
  return late ? 'هدف قاتل!' : 'هدف!'
}
async function queueGoalReel(env: Env, date: string, m: AutoMatch, g: GoalInfo, prev: [number, number] = [0, 0]): Promise<void> {
  let voiceUrl: string | undefined
  if (GOAL_VOICE) {
    try { voiceUrl = await englishVoice(env, goalScript(m, g), `voice-goal-${m.id}-${Math.random().toString(36).slice(2, 6)}.mp3`, 'aura') }
    catch (e) { await log(env, date, 'goal-reel', false, `voice failed (${String(e).slice(0, 80)}) — reel without voice`) }
  }
  const jobId = `goal-${date}-${Math.random().toString(36).slice(2, 7)}`
  const line = `⚽ GOAL! ${g.scorer || (g.side === 'home' ? m.home : m.away)}${g.minute ? ` ${g.minute}` : ''} — ${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`
  await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({
    kind: 'reel', label: 'goal-reel', date, title: line.slice(0, 100),
    description: `⚽ هدف! ${g.scorer || (g.side === 'home' ? m.home : m.away)}${g.minute ? ` (${g.minute})` : ''} — ${m.home} ${m.homeScore}-${m.awayScore} ${m.away}\n🏆 ${leagueAr(m.league)}\n\nهدف عالمي أم عادي؟ 👇\n👉 النتائج المباشرة على pressing90.live (الرابط في التعليقات)\n\n${line}\n\n#كرة_القدم #هدف #Pressing90 #football`,
    comment: `⚽ تابع المباراة مباشرة: ${SITE}/today?lang=ar&ref=fb-reel`,
  }), { expirationTtl: 6 * 3600 })
  // Barça goal (Mehdi, 2026-09-14): special card on a confetti video with the stadium roar — only when Barça scores.
  const special = isBarca(m) && /barcelona|barça/i.test(g.side === 'home' ? m.home : m.away) ? 'barca' : undefined
  const cover = { text: special ? `${goalCoverText(m, g, prev)} 🔵🔴`.replace(' 🔵🔴', '') : goalCoverText(m, g, prev), tone: special ? 'barca' : 'goal' }
  await studio(env, '/render/reel', { type: 'goal', data: { ...goalReelData(m, g), special, cover }, voiceUrl, seconds: special ? 9 : 8, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
  await log(env, date, 'goal-reel', true, `rendering${special ? ' (Barça special)' : ''}: ${line} (job ${jobId})`)
}
async function goalDetails(env: Env, m: AutoMatch, side: 'home' | 'away'): Promise<GoalInfo> {
  const g: GoalInfo = { scorer: '', minute: m.clock ?? '', side }
  try {
    const r = await fetch(`${env.STUDIO_URL}/espn/summary?league=${encodeURIComponent(m.slug)}&event=${encodeURIComponent(m.id)}`, { headers: { 'x-studio-secret': env.STUDIO_SECRET!, 'user-agent': 'p90-worker/1.0' }, signal: AbortSignal.timeout(15000) })
    const j = await r.json() as { goals?: Array<{ minute: string; team: string; scorer: string; assist?: string; ownGoal: boolean; penalty: boolean; nationality?: string }> }
    const all = j.goals ?? []
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const team = norm(side === 'home' ? m.home : m.away)
    const mine = all.filter((x) => { const t = norm(x.team); return t === team || t.includes(team.split(' ')[0]) || team.includes(t.split(' ')[0]) })
    const last = (mine.length ? mine : all).at(-1)
    if (last) { g.scorer = last.scorer; g.minute = last.minute || g.minute; g.ownGoal = last.ownGoal; g.penalty = last.penalty; g.assist = last.assist || ''; g.nationality = last.nationality || '' }
  } catch { /* keep clock only */ }
  return g
}
export async function runGoalAlerts(env: Env, s: AutomationSettings, date: string): Promise<void> {
  if (!s.goalAlerts || !reelsConfigured(env)) return
  const live = (await bigMatchesToday(env)).filter((m) => m.state === 'in' && GOAL_ALERT_SLUGS.has(m.slug))
  for (const m of live) {
    const key = `auto:score:${m.id}`
    const prev = await env.CACHE.get(key)
    const cur = `${m.homeScore}-${m.awayScore}`
    if (prev === null) { await env.CACHE.put(key, cur, { expirationTtl: 8 * 3600 }); continue }   // first sight → baseline, no alert
    if (prev === cur) continue
    await env.CACHE.put(key, cur, { expirationTtl: 8 * 3600 })
    const [ph, pa] = prev.split('-').map(Number); const ch = Number(m.homeScore), ca = Number(m.awayScore)
    if (!(ch + ca > ph + pa)) { await log(env, date, 'goal-reel', true, `score corrected ${prev} → ${cur} (${m.home} v ${m.away}) — no alert`); continue }
    const side: 'home' | 'away' = ch > ph ? 'home' : 'away'
    const cap = s.goalReelsPerDay, reserve = Math.ceil(cap / 3)
    const count = await getCount(env, date, 'goalreel')
    const barca = s.barcaDaily && isBarca(m)   // Barça goals ignore the goal caps (only the global anti-spam budget applies)
    const g = await goalDetails(env, m, side)
    if (!barca && !(s.goalScope === 'barca+morocco' && isMoroccanScorer(g))) continue   // 2026-09-16: Barça matches only (goalScope), Moroccan scorers optional
    if (count >= cap && !barca) { await log(env, date, 'goal-reel', true, `daily cap ${cap} reached — ${m.home} ${cur} ${m.away} not posted`); continue }
    // Global anti-spam budget (Mehdi, 2026-09-13): goals are the elastic part — they only use what the
    // articles and full-time posts still due today will not need.
    const [usedAll, postN, ftN] = await Promise.all([fbPostsToday(env, date), getCount(env, date, 'post'), getCount(env, date, 'ft')])
    const due = Math.max(0, s.articlesPerDay - postN) + Math.max(0, s.ftPerDay - ftN)
    if (barca ? usedAll >= s.maxPostsPerDay : usedAll + due >= s.maxPostsPerDay) { await log(env, date, 'goal-reel', true, `daily budget ${s.maxPostsPerDay} posts (${usedAll} used, ${due} due) — ${m.home} ${cur} ${m.away} not posted`); continue }
    const prio = true   // every remaining goal is a priority goal (Barça or Moroccan scorer)
    const pmKey = `auto:goalcount:${m.id}`
    const perMatch = Number((await env.CACHE.get(pmKey)) ?? 0)
    const pmCap = prio ? 3 : 2
    if (perMatch >= pmCap) { await log(env, date, 'goal-reel', true, `per-match cap (${pmCap}) — ${m.home} ${cur} ${m.away}`); continue }
    await env.CACHE.put(pmKey, String(perMatch + 1), { expirationTtl: 8 * 3600 })
    try { await queueGoalReel(env, date, m, g, [ph, pa]) } catch (e) { await log(env, date, 'goal-reel', false, `${m.home} ${cur} ${m.away}: ${String(e).slice(0, 140)}`) }
  }
}

// ─── BARÇA FIRST (Mehdi, 2026-09-13) ───────────────────────────────────
// 1. Full-time reel after every Barça match (goal-card layout, both sides' scorers).
export type MatchGoal = { minute: string; team: string; scorer: string; assist?: string; ownGoal: boolean; penalty: boolean; text?: string; teamId?: string; scorerId?: string; nationality?: string; playId?: string; x?: number | null; y?: number | null; x2?: number | null; y2?: number | null }
async function matchGoals(env: Env, m: AutoMatch): Promise<MatchGoal[]> {
  try {
    const r = await fetch(`${env.STUDIO_URL}/espn/summary?league=${encodeURIComponent(m.slug)}&event=${encodeURIComponent(m.id)}`, { headers: { 'x-studio-secret': env.STUDIO_SECRET!, 'user-agent': 'p90-worker/1.0' }, signal: AbortSignal.timeout(15000) })
    const j = await r.json() as { goals?: MatchGoal[] }
    return j.goals ?? []
  } catch { return [] }
}
function scorersBySide(m: AutoMatch, goals: MatchGoal[]): { home: string; away: string } {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const h = norm(m.home)
  const side = (g: MatchGoal) => { const t = norm(g.team); return t === h || t.includes(h.split(' ')[0]) || h.includes(t.split(' ')[0]) ? 'home' : 'away' }
  const fmt = (g: MatchGoal) => `${(g.scorer || '').split(' ').slice(-1)[0] || 'Goal'}${g.penalty ? ' (p)' : ''}${g.ownGoal ? ' (og)' : ''} ${g.minute}`.trim()
  return { home: goals.filter((g) => side(g) === 'home').map(fmt).join(' · '), away: goals.filter((g) => side(g) === 'away').map(fmt).join(' · ') }
}
// Full match summary through the studio proxy (2026-09-14): goals + starting XIs + venue.
type XIPlayer = { name: string; full?: string; jersey: string; pos: string; place: number }
export type MatchSummary = { goals: MatchGoal[]; plays?: Array<{ t: string; type: string; id: string; team: string; text: string; x: number | null; y: number | null; x2: number | null; y2: number | null }>; rosters: Array<{ side: 'home' | 'away'; team: string; abbr: string; formation: string; players: XIPlayer[]; bench?: Array<XIPlayer & { in?: boolean }> }>; teams: Array<{ side: string; id: string; name: string; abbr: string; logo?: string; score?: string; color?: string; altColor?: string }>; venue: string; attendance: number; date: string; state: string }
export async function matchSummary(env: Env, m: Pick<AutoMatch, 'id' | 'slug'>, withPlays = false): Promise<MatchSummary> {
  const empty: MatchSummary = { goals: [], rosters: [], teams: [], venue: '', attendance: 0, date: '', state: '' }
  try {
    const r = await fetch(`${env.STUDIO_URL}/espn/summary?league=${encodeURIComponent(m.slug)}&event=${encodeURIComponent(m.id)}${withPlays ? '&plays=1' : ''}`, { headers: { 'x-studio-secret': env.STUDIO_SECRET!, 'user-agent': 'p90-worker/1.0' }, signal: AbortSignal.timeout(15000) })
    const j = await r.json() as Partial<MatchSummary>
    return { ...empty, ...j, goals: j.goals ?? [], rosters: j.rosters ?? [], teams: j.teams ?? [] }
  } catch { return empty }
}
function goalsWithSide(m: AutoMatch, goals: MatchGoal[]) {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const h = norm(m.home)
  return goals.map((g) => { const t = norm(g.team); const side = t === h || t.includes(h.split(' ')[0]) || h.includes(t.split(' ')[0]) ? 'home' : 'away'; return { side, scorer: g.scorer, minute: g.minute, penalty: g.penalty, ownGoal: g.ownGoal } })
}
/** Data for the editorial full-time poster (studio 'fulltime-post' / 'score'). */
function ftPosterData(m: AutoMatch, sum: MatchSummary, lang: 'ar' | 'en') {
  return { home: m.home, away: m.away, homeLogo: m.homeLogo, awayLogo: m.awayLogo, homeScore: m.homeScore, awayScore: m.awayScore, homePens: m.homePens, awayPens: m.awayPens, league: m.league, venue: sum.venue || m.venue || '', status: ftStatus(m), lang, goals: goalsWithSide(m, sum.goals), dateLabel: localParts().label }
}
/** Barça full time as an editorial poster (Mehdi, 2026-09-14: « fais-en la base des designs de tous les posts »). Returns the image URL. */
async function queueBarcaFtPoster(env: Env, date: string, m: AutoMatch, preview = false): Promise<string> {
  const sum = await matchSummary(env, m)
  const img = await renderImage(env, 'fulltime-post', ftPosterData(m, sum, 'ar'))
  if (preview) return img
  const sc = scorersBySide(m, sum.goals)
  const line = `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`
  const message = `⏱ نهاية المباراة\n\n${line}\n🏆 ${leagueAr(m.league)}${sc.home ? `\n⚽ ${m.home}: ${sc.home}` : ''}${sc.away ? `\n⚽ ${m.away}: ${sc.away}` : ''}\n\nنتيجة منطقية أم مفاجأة؟ 👇`
  const r = await fbPost(env, { message, link: `${SITE}/today?lang=ar&ref=fb`, image_url: img, title: `FT: ${line}`.slice(0, 100), comment: '⏱ كل النتائج والتفاصيل على pressing90.live' })
  if (r.ok) await bump(env, date, 'ft')
  await log(env, date, 'barca-ft', r.ok, r.ok ? `${line} · poster · ${r.note ?? ''} · ${img}` : `${r.note ?? r.status ?? 'error'}`)
  return img
}
// 3. Lineups (2026-09-14): predicted XI (= last confirmed XI) 6-3 h before kick-off, confirmed XI once ESPN publishes it (~1 h before).
type LineupXI = { formation: string; players: XIPlayer[] }
function lineupData(m: AutoMatch, side: 'home' | 'away', xi: LineupXI, predicted: boolean, venue?: string) {
  return { home: m.home, away: m.away, homeLogo: m.homeLogo, awayLogo: m.awayLogo, league: m.league, leagueAr: leagueAr(m.league), venue: venue || m.venue || '', dateLabel: localParts().label, formation: xi.formation, players: xi.players, predicted, kit: side, teamLabel: 'FC BARCELONA', season: '2026 / 27' }
}
function lineupMessage(m: AutoMatch, side: 'home' | 'away', xi: LineupXI, predicted: boolean): string {
  const opp = side === 'home' ? m.away : m.home
  const names = xi.players.map((p) => `${p.jersey ? `${p.jersey} ` : ''}${p.name}`).join(' · ')
  return `${predicted ? '📋 التشكيلة المتوقعة لبرشلونة' : '📋 التشكيلة الرسمية لبرشلونة'} أمام ${opp}\n\n${xi.formation ? `📐 ${xi.formation}\n` : ''}${names}\n\n🏆 ${leagueAr(m.league)}\n\n${predicted ? 'ما رأيك في هذه التشكيلة؟ 👇' : 'موافق على الاختيارات؟ 👇'}`
}
export async function runBarcaLineups(env: Env, s: AutomationSettings, date: string, force = false, only?: 'predicted' | 'confirmed'): Promise<string> {
  if (!s.lineups || !s.barcaDaily) return 'off'
  const m = (await bigMatchesToday(env)).find((x) => isBarca(x) && x.state !== 'post')
  if (!m) return 'no Barça match today'
  const side: 'home' | 'away' = /barcelona|barça/i.test(m.home) ? 'home' : 'away'
  const mins = m.kickoff ? (Date.parse(m.kickoff) - Date.now()) / 60_000 : NaN
  const post = async (xi: LineupXI, predicted: boolean, venue: string | undefined, key: string): Promise<string> => {
    if ((await fbPostsToday(env, date)) >= s.maxPostsPerDay) return `daily budget ${s.maxPostsPerDay} posts reached`
    await env.CACHE.put(key, '1', { expirationTtl: 2 * 86400 })
    const img = await renderImage(env, 'lineup-post', lineupData(m, side, xi, predicted, venue))
    const r = await fbPost(env, { message: lineupMessage(m, side, xi, predicted), link: `${SITE}/today?lang=ar&ref=fb`, image_url: img, title: `${predicted ? 'Predicted' : 'Confirmed'} XI: ${m.home} v ${m.away}`.slice(0, 100), comment: '📋 التشكيلات والنتيجة مباشرة على pressing90.live' })
    if (r.ok) await bump(env, date, 'post')
    await log(env, date, 'barca-lineup', r.ok, r.ok ? `${predicted ? 'predicted' : 'confirmed'} XI (${xi.formation}) · ${r.note ?? ''} · ${img}` : `${r.note ?? r.status ?? 'error'}`)
    return `${predicted ? 'predicted' : 'confirmed'} XI posted`
  }
  // confirmed: from 75 min before kick-off (ESPN publishes the XI about an hour before) until 20 min after
  if (only !== 'predicted' && (force || (mins <= 75 && mins >= -20))) {
    const key = `auto:lineup:${m.id}:confirmed`
    if (await env.CACHE.get(key)) { if (force) return 'confirmed XI already posted' }
    else {
      const sum = await matchSummary(env, m)
      const r = sum.rosters.find((x) => x.side === side)
      if (r && r.players.length >= 11) {
        const xi: LineupXI = { formation: r.formation, players: r.players }
        await env.CACHE.put('auto:lineup:last', JSON.stringify({ ...xi, opponent: side === 'home' ? m.away : m.home, date }), { expirationTtl: 30 * 86400 })
        return post(xi, false, sum.venue, key)
      }
      if (force) return `no XI on ESPN yet (${r ? r.players.length : 0} starters)`
    }
  }
  // predicted: 6 h → 3 h before kick-off, from the last confirmed XI
  if (only !== 'confirmed' && (force || (mins <= 360 && mins > 180))) {
    const key = `auto:lineup:${m.id}:predicted`
    if (await env.CACHE.get(key)) return force ? 'predicted XI already posted' : 'done'
    const last = await env.CACHE.get('auto:lineup:last')
    if (!last) return 'no previous XI to predict from (seed with lineup-seed)'
    return post(JSON.parse(last) as LineupXI, true, undefined, key)
  }
  return 'not now'
}
async function queueBarcaFtReel(env: Env, date: string, m: AutoMatch, preview = false): Promise<string> {
  const goals = await matchGoals(env, m)
  const sc = scorersBySide(m, goals)
  const h = Number(m.homeScore), a = Number(m.awayScore)
  const winner: 'home' | 'away' | undefined = h > a ? 'home' : a > h ? 'away' : undefined
  const barcaWon = winner && /barcelona|barça/i.test(winner === 'home' ? m.home : m.away)
  const cover = { text: barcaWon ? 'فوز برشلونة!' : winner ? 'خسارة برشلونة' : 'تعادل برشلونة', tone: barcaWon ? 'barca' : 'ft' }
  const data = { cover, special: barcaWon ? 'barca' : undefined, sfx: false, home: m.home, away: m.away, homeLogo: m.homeLogo, awayLogo: m.awayLogo, homeScore: m.homeScore, awayScore: m.awayScore, league: m.league, scorer: sc.home || (goals.length ? '–' : 'No goals'), assist: sc.away || '', assistLabel: '', minute: 'FT', scoringSide: winner, title: 'نهاية المباراة', titleLang: 'ar', footer: 'Full time · pressing90.live' }
  const jobId = `barcaft-${date}-${Math.random().toString(36).slice(2, 7)}`
  const line = `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`
  const description = `⏱ نهاية المباراة\n\n${line}\n🏆 ${leagueAr(m.league)}${sc.home ? `\n⚽ ${m.home}: ${sc.home}` : ''}${sc.away ? `\n⚽ ${m.away}: ${sc.away}` : ''}\n\nنتيجة منطقية أم مفاجأة؟ 👇\n👉 كل الإحصائيات على pressing90.live (الرابط في التعليقات)\n\n⏱ FULL TIME · ${line}\n\n#برشلونة #Barça #FCBarcelona ${AR_TAGS} #نهاية_المباراة`
  await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify(preview ? { kind: 'preview', label: 'preview-barca-ft', date } : { kind: 'reel', label: 'barca-ft', date, title: `FT: ${line}`.slice(0, 100), description, comment: `⏱ كل النتائج والإحصائيات: ${SITE}/today?lang=ar&ref=fb-reel` }), { expirationTtl: 6 * 3600 })
  await studio(env, '/render/reel', { type: 'goal', data, seconds: 10, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
  await log(env, date, preview ? 'preview-barca-ft' : 'barca-ft', true, `rendering ${line} (job ${jobId})${goals.length ? ` — ${goals.length} goals` : ''}`)
  return jobId
}
// 2. One Barça article a day (08:20): the general feeds rarely pick Barça news by themselves.
export async function runBarcaArticle(env: Env, s: AutomationSettings, date: string, hour: number, minute: number, force = false): Promise<string> {
  if (!s.barcaDaily || !s.articles) return 'off'
  if (!force && !(hour === 8 && minute >= 20 && minute <= 34)) return 'not now'
  const claim = `auto:barca:article:${date}`
  if (!force && (await env.CACHE.get(claim))) return 'done'
  await env.CACHE.put(claim, '1', { expirationTtl: 36 * 3600 })
  if (!force && (await barcaArticles(env, 24)).length) { await log(env, date, 'barca-article', true, 'a Barça article is already out today'); return 'already have' }
  const news = await import('./news')
  const { candidates } = await news.pollTopCandidates(env as unknown as Parameters<typeof news.pollTopCandidates>[0], 8, 'FC Barcelona')
  const fresh = candidates.filter((c) => Date.now() - c.pubDate < 36 * 3600_000 && /barcelona|barça|barca|yamal|flick|camp nou|blaugrana|laporta|raphinha|lewandowski|pedri|cubarsí|de jong/i.test(`${c.title} ${c.description}`))
  const pick = fresh[0]
  if (!pick) { await log(env, date, 'barca-article', false, `no fresh Barça candidate (${candidates.length} polled)`); return 'no candidate' }
  const r = await news.produceFromCandidate(env as unknown as Parameters<typeof news.produceFromCandidate>[0], pick)
  if (!r.ok || !r.draft) { await log(env, date, 'barca-article', false, `draft failed: ${r.error ?? 'unknown'} — ${pick.title}`); return 'draft failed' }
  await log(env, date, 'barca-article', true, `drafted "${r.draft.title}" from ${pick.source} — publishing…`)
  await maybeAutoPublishArticle(env, r.draft.id)
  return `drafted ${r.draft.slug}`
}
type DigestArticle = { title: string; title_ar?: string | null; slug: string; image_url?: string | null; excerpt?: string | null; excerpt_ar?: string | null; published_at?: string }
async function barcaArticles(env: Env, hours: number): Promise<DigestArticle[]> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString()
  const kw = ['barcelona', 'barça', 'barca', 'yamal', 'blaugrana', 'camp nou']
  const or = `or=(${kw.flatMap((k) => [`title.ilike.*${k}*`, `excerpt.ilike.*${k}*`]).join(',')})`
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=title,title_ar,slug,image_url,excerpt,excerpt_ar,published_at&status=eq.published&published_at=gte.${encodeURIComponent(since)}&${or}&order=published_at.desc&limit=6`, { headers: sbHeaders(env) })
  return ((await r.json().catch(() => [])) as DigestArticle[]).filter((a) => a.image_url)
}
/** Arabic headline for an article that has no title_ar (the site translation failed) — small LLM call, cached 30 days. */
async function arabicHeadline(env: Env, title: string): Promise<string> {
  const key = `auto:arhead:${encodeURIComponent(title).slice(0, 120)}`
  const cached = await env.CACHE.get(key)
  if (cached) return cached
  try {
    const j = await gptJson(env, 'Translate this football headline into natural Arabic as written by Arabic sports media: standard spelling, no diacritics (tashkeel), common transliterations of names, numbers as digits, ≤ 12 words. Output ONLY {"title":"..."}', title, 400) as { title?: string }
    const t = String(j.title ?? '').trim()
    if (t && /[؀-ۿ]/.test(t)) { await env.CACHE.put(key, t, { expirationTtl: 30 * 86400 }); return t }
  } catch { /* keep the original */ }
  return title
}
// 3. « برشلونة اليوم » — 09:00 digest reel: 3 Barça headlines (Arabic), Arabic voice, link in the comment.
export async function runBarcaDigest(env: Env, s: AutomationSettings, date: string, hour: number, minute: number, force = false, preview = false): Promise<string> {
  if (!s.barcaDaily || !s.reels || !reelsConfigured(env)) return 'off'
  if (!force && !(hour === 9 && minute <= 9)) return 'not now'
  const claim = `auto:barca:digest:${date}`
  if (!force && (await env.CACHE.get(claim))) return 'done'
  if (!preview) await env.CACHE.put(claim, '1', { expirationTtl: 36 * 3600 })
  let list = await barcaArticles(env, 26)
  if (list.length < 2) { const older = await barcaArticles(env, 24 * 10); list = [...list, ...older.filter((o) => !list.some((x) => x.slug === o.slug))] }
  list = list.slice(0, 3)
  if (!list.length) { await log(env, date, 'barca-digest', false, 'no Barça article on the site — nothing to publish'); return 'no article' }
  const items: Array<{ title: string; slug: string; image_url?: string | null; excerpt: string }> = []
  const FALLBACK_IMG = 'https://ssvvojhxyotlbcdosiog.supabase.co/storage/v1/object/public/media/barca-news-fallback.jpg'
  // Images go through the worker's proxy (a source served WebP to the studio, which node-canvas cannot decode → blank frame,
  // 2026-09-14); an image that does not come back as JPEG/PNG is replaced by the blaugrana fallback visual.
  const usable = async (u: string) => { try { const r = await fetch(u, { headers: { accept: 'image/jpeg,image/png' }, signal: AbortSignal.timeout(8000) }); const ct = r.headers.get('content-type') ?? ''; r.body?.cancel().catch(() => {}); return r.ok && /^image\/(jpeg|png)/.test(ct) } catch { return false } }
  for (const a of list) {
    const proxied = a.image_url ? `${WORKER_PUBLIC}/fb-img?u=${encodeURIComponent(a.image_url)}` : ''
    const image_url = proxied && (await usable(proxied)) ? proxied : FALLBACK_IMG
    items.push({ title: (a.title_ar || '').trim() || await arabicHeadline(env, a.title), slug: a.slug, image_url, excerpt: (a.excerpt_ar || a.excerpt || '').trim() })
  }
  const ord = ['أولاً', 'ثانياً', 'ثالثاً']
  if (items[0]) (items[0] as { cover?: unknown }).cover = { text: 'أخبار برشلونة: ماذا حدث اليوم؟', tone: 'barca' }   // thumbnail line
  const script = `أبرز أخبار برشلونة اليوم، ${labelAr(date)}. ${items.map((a, i) => `${ord[i]}: ${a.title}.`).join(' ')} التفاصيل كاملة على بريسينغ تسعين دوت لايف. الرابط في التعليقات.`
  let voiceUrl: string | undefined
  try { voiceUrl = await arabicVoice(env, script, `voice-barca-${date}-${Math.random().toString(36).slice(2, 6)}.mp3`) } catch (e) { await log(env, date, 'barca-digest', false, `voice failed (${String(e).slice(0, 80)}) — reel without voice`) }
  const jobId = `barca-${date}-${Math.random().toString(36).slice(2, 7)}`
  const question = items.length >= 2 ? 'أي خبر يهمك أكثر: 1 أم 2؟ 👇' : 'ما رأيك؟ 👇'
  const description = `🔵🔴 برشلونة اليوم — ${labelAr(date)}\n\n${items.map((a, i) => `${i + 1}. ${a.title}`).join('\n')}\n\n${question}\n👉 التفاصيل على pressing90.live (الرابط في التعليقات)\n\n#برشلونة #Barça #FCBarcelona ${AR_TAGS} #أخبار`
  await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify(preview ? { kind: 'preview', label: 'preview-barca', date } : { kind: 'reel', label: 'barca-digest', date, title: `برشلونة اليوم — ${labelAr(date)}`, description, comment: `📰 أخبار برشلونة كاملة: ${SITE}/news/${items[0].slug}?lang=ar&ref=fb-reel` }), { expirationTtl: 6 * 3600 })
  await studio(env, '/render/reel', { type: 'articles', data: { articles: items, heading: 'برشلونة اليوم', lang: 'ar' }, seconds: 10 * items.length, voiceUrl, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
  await log(env, date, preview ? 'preview-barca' : 'barca-digest', true, `rendering ${items.length} headlines${voiceUrl ? ' with Arabic voice' : ''} (job ${jobId}): ${items.map((a) => a.title).join(' · ').slice(0, 160)}`)
  return `queued ${items.length} headlines (job ${jobId})`
}

// ─── FULL-TIME RESULTS REEL (Mehdi, 2026-09-08 evening: "le reel des
// résultats n'inclut pas tous les matchs") ───────────────────────────
// One reel per day with EVERY finished big match (up to 10 slides, 3 s
// each, music only — match reels carry no voice). Goes out as soon as the
// last match of the day's pool is over, or at 23:45 Morocco at the latest
// (late South-American kick-offs would otherwise hold it until 1 am).
function toDrawResult(m: AutoMatch) {
  return { ...toDraw(m), live: false, score: `${m.homeScore}–${m.awayScore}`, time: m.homePens != null ? `FT · PENS ${m.homePens}–${m.awayPens}` : m.statusName === 'STATUS_FINAL_AET' ? 'FT · AET' : 'FT' }
}
const resultsHeading = (date: string, matchDate: string) => matchDate === date ? 'نتائج اليوم' : 'نتائج الأمس'
function resultsCaption(list: AutoMatch[], label: string, date: string, matchDate: string): string {
  const lines = [`⏱ ${resultsHeading(date, matchDate)} — ${labelAr(matchDate)}`, '']
  let last = ''
  for (const m of list) {
    if (m.league !== last) { lines.push(`🏆 ${leagueAr(m.league)}`); last = m.league }
    lines.push(`${m.home} ${m.homeScore}–${m.awayScore} ${m.away}${m.homePens != null ? ` (${m.homePens}–${m.awayPens} بركلات الترجيح)` : ''}`)
  }
  // Closed question on the two most spectacular scores (audit 2026-09-13).
  const fmt = (m: AutoMatch) => `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`
  const top = [...list].sort((a, b) => (Number(b.homeScore) + Number(b.awayScore)) - (Number(a.homeScore) + Number(a.awayScore))).slice(0, 2)
  lines.push('', top.length === 2 ? `أكبر مفاجأة: ${fmt(top[0])} أم ${fmt(top[1])}؟ 👇` : 'نتيجة منطقية أم مفاجأة؟ 👇', `👉 الإحصائيات والترتيب على pressing90.live (الرابط في التعليقات)`, '', `⏱ Full-time results — ${label}`, '', `${AR_TAGS} #نتائج #football`)
  return lines.join('\n')
}
async function queueResultsReel(env: Env, date: string, label: string, finished: AutoMatch[], jobLabel = 'results-reel', matchDate = date): Promise<string> {
  const list = finished.slice(0, 10)
  const jobId = `results-${date}-${Math.random().toString(36).slice(2, 7)}`
  const heading = resultsHeading(date, matchDate)
  await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'reel', label: jobLabel, date, title: `${heading} — ${labelAr(matchDate)}`, description: resultsCaption(list, label, date, matchDate), comment: `⏱ كل النتائج والإحصائيات: ${SITE}/today?lang=ar&ref=fb-reel` }), { expirationTtl: 6 * 3600 })
  const cover = { text: matchDate === date ? 'نتائج اليوم: هل فاجأتك؟' : 'نتائج الأمس: هل فاجأتك؟', tone: 'results' }
  await studio(env, '/render/reel', { type: 'matchday', data: { matches: list.map((m, i) => (i === 0 ? { ...toDrawResult(m), cover } : toDrawResult(m))), heading, lang: 'ar' }, seconds: Math.max(9, 3 * list.length), jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
  await log(env, date, jobLabel, true, `rendering ${list.length} results (job ${jobId}): ${list.map((m) => `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`).join(' · ').slice(0, 160)}`)
  return jobId
}
// Since the 2026-09-13 audit the reel goes out the NEXT MORNING at 07:30 as
// "نتائج الأمس" (matchDate = yesterday, log/job on today's date): every reel
// published after 20:00 got 4-22 views, the same formats in the morning 200-800.
export async function runResultsReel(env: Env, s: AutomationSettings, date: string, label: string, hour: number, minute: number, force = false, matchDate = date): Promise<string> {
  if (!s.resultsReel || !reelsConfigured(env)) return 'off'
  const claim = `auto:results:${matchDate}`
  if (!force && (await env.CACHE.get(claim))) return 'done'
  const morningAfter = matchDate !== date
  const pool = await bigMatchesToday(env, morningAfter ? matchDate.replace(/-/g, '') : undefined)
  const finished = pool.filter((m) => m.state === 'post' && m.completed)
  const pending = pool.filter((m) => !(m.state === 'post' && m.completed) && !/POSTPONED|CANCELED|CANCELLED|ABANDONED/i.test(m.statusName))
  const deadline = morningAfter || (hour === 23 && minute >= 45)
  if (!force && finished.length < 2) {
    if (morningAfter) { await env.CACHE.put(claim, 'skipped', { expirationTtl: 36 * 3600 }); await log(env, date, 'results-reel', true, `skipped — only ${finished.length} finished match(es) on ${matchDate}`) }
    return `waiting — ${finished.length} finished`
  }
  if (!force && pending.length > 0 && !deadline) return `waiting — ${pending.length} match(es) still to play`
  await env.CACHE.put(claim, 'running', { expirationTtl: 36 * 3600 })
  const jobId = await queueResultsReel(env, date, label, finished, 'results-reel', matchDate)
  return `queued ${finished.length} results (job ${jobId})`
}
/** Yesterday in Morocco time (date + English label). */
export function yesterdayParts(): { date: string; label: string } { const y = localParts(new Date(Date.now() - 86_400_000)); return { date: y.date, label: y.label } }

// ─── FOOTBALL STORIES ("tales") — Mehdi, 2026-09-10 ───────────────────
// Weekly: one true, strange football story → article on the site (EN + AR)
// + 3 animated reels (AR, then FR +90 min, then EN +180 min), each beat
// voiced separately so captions stay in sync. Reels go through Make like
// every other video; the question + article link land in the comments.
const TALE_VOICE: Record<TaleLang, string> = { en: ELEVEN_VOICE_ID, fr: ELEVEN_VOICE_ID, ar: 'FOyke8LaC5kHLkRFE8oG' }   // ar = "Fahad – Warm Arabic Narrator" (library voice; Adam fallback)
const TALE_GAP_MIN: Record<TaleLang, number> = { ar: 0, fr: 90, en: 180 }
// Free neural voices through the studio's /tts (Microsoft Edge endpoint, no key).
const EDGE_VOICE: Record<TaleLang, string> = { en: 'en-US-AndrewMultilingualNeural', fr: 'fr-FR-HenriNeural', ar: 'ar-MA-JamalNeural' }
export async function edgeVoice(env: Env, text: string, lang: TaleLang, key: string, rate?: number): Promise<string> {
  if (!studioConfigured(env)) throw new Error('studio not configured')
  const r = await fetch(`${env.STUDIO_URL}/tts`, {
    method: 'POST', headers: { 'x-studio-secret': env.STUDIO_SECRET!, 'content-type': 'application/json', 'user-agent': 'p90-worker/1.0' },
    body: JSON.stringify({ text: text.slice(0, 3000), voice: EDGE_VOICE[lang], rate }), signal: AbortSignal.timeout(90000),
  })
  if (!r.ok) throw new Error(`studio tts ${r.status} ${(await r.text()).slice(0, 100)}`)
  return putMedia(env, key, await r.arrayBuffer(), 'audio/mpeg')
}
async function taleVoice(env: Env, text: string, lang: TaleLang, key: string): Promise<string | null> {
  const el = (env as unknown as { ELEVENLABS_API_KEY?: string }).ELEVENLABS_API_KEY
  const free = (await loadAutomationSettings(env)).freeVoices || !el
  if (free) {
    // Free engines: Microsoft neural voices first (all three languages), then Orion (EN) / MeloTTS (FR) / music only (AR).
    try { return await edgeVoice(env, text, lang, key, lang === 'ar' ? 1.12 : 1.06) } catch (e) { console.log('[tale] edge tts failed', lang, String(e).slice(0, 120)) }
    if (lang === 'en') return auraVoice(env, text, key)
    if (lang === 'fr') {
      const ai = env.AI as { run: (model: string, input: Record<string, unknown>) => Promise<{ audio?: string }> } | undefined
      if (!ai) return null
      const out = await ai.run('@cf/myshell-ai/melotts', { prompt: text.slice(0, 1200), lang: 'fr' })
      if (!out?.audio) return null
      return putMedia(env, key, Uint8Array.from(atob(out.audio), (c) => c.charCodeAt(0)), 'audio/mpeg')
    }
    return null
  }
  if (!el) throw new Error('ELEVENLABS_API_KEY missing')
  const tts = async (voiceId: string) => fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': el, 'content-type': 'application/json' },
    // Arabic narration runs long (AR preview 1:59 vs 1:17 EN) → slightly faster delivery to stay near 1:30.
    body: JSON.stringify({ text: text.slice(0, 1200), model_id: 'eleven_flash_v2_5', language_code: lang, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.3, speed: lang === 'ar' ? 1.1 : 1.0 } }),
  })
  let r = await tts(TALE_VOICE[lang])
  if (!r.ok && TALE_VOICE[lang] !== ELEVEN_VOICE_ID) { console.log('[tale] voice', lang, 'failed', r.status, '→ Adam'); r = await tts(ELEVEN_VOICE_ID) }
  if (!r.ok) throw new Error(`elevenlabs ${r.status} ${(await r.text()).slice(0, 120)}`)
  return putMedia(env, key, await r.arrayBuffer(), 'audio/mpeg')
}
// Free-licensed photos from Wikimedia Commons for the "mini-reportage" beats (credit shown on the frame).
const FREE_LICENSE = /^(cc[- ]by|cc0|public domain|pd)/i
const PHOTO_STOP = new Set(['football', 'soccer', 'match', 'goal', 'goals', 'record', 'records', 'team', 'player', 'players', 'coach', 'referee', 'stadium', 'final', 'league', 'champions', 'world', 'history', 'story', 'breaking', 'club', 'fans', 'crowd', 'penalty', 'ball', 'pitch', 'game', 'season', 'night', 'year', 'years', 'first', 'last', 'that', 'this', 'with', 'from', 'their', 'when', 'after', 'before', 'never', 'ever', 'scoreboard', 'protest', 'suspension', 'trophy', 'title', 'manager', 'striker', 'goalkeeper', 'debut', 'minute', 'minutes', 'seconds', 'second', 'national', 'international', 'european', 'premier', 'division', 'teen', 'teenager', 'miracle', 'reset', 'rewrote', 'greatest', 'comeback', 'over', 'against', 'played', 'scored', 'the', 'and', 'who', 'kid', 'boy', 'man', 'youngest', 'oldest', 'fake', 'cousin', 'dog', 'own', 'euro', 'cup', 'win', 'won', 'late', 'call'])
/** Specific words of a story = its title, slug and bank subject only (2026-09-14: words taken from the whole
 *  script let "Granada" bring a bullring and "England" an English house into the Lamine Yamal reel). */
function taleSpecificWords(t: Tale): Set<string> {
  const out = new Set<string>()
  const add = (w: string) => { const x = w.replace(/['’]s$/, '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (x.length >= 4 && !PHOTO_STOP.has(x)) out.add(x) }
  for (const w of t.en.title.split(/\s+/)) add(w)
  for (const w of t.slug.split('-')) add(w)
  for (const w of (t.subject ?? '').split(/[\s,()]+/)) if (/^[A-Z]/.test(w)) add(w)
  return out
}
const photoQueryRelevant = (query: string, specific: Set<string> | null) => !specific || query.toLowerCase().split(/[^a-z0-9]+/).some((w) => specific.has(w))
export async function resolveCommonsImage(env: Env, query: string): Promise<{ url: string; credit: string } | null> {
  const key = `auto:commons:${query.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80)}`
  const cached = await env.CACHE.get(key)
  if (cached) return cached === 'none' ? null : JSON.parse(cached) as { url: string; credit: string }
  const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '10', prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime', iiurlwidth: '1400' })
  let pick: { url: string; credit: string } | null = null
  try {
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'user-agent': 'Pressing90Bot/1.0 (https://pressing90.live; medplay.inc@gmail.com)' }, signal: AbortSignal.timeout(15000) })
    const d = await r.json() as { query?: { pages?: Record<string, { index?: number; title: string; imageinfo?: Array<{ url: string; thumburl?: string; width: number; height: number; mime: string; extmetadata?: Record<string, { value?: string }> }> }> } }
    const pages = Object.values(d.query?.pages ?? {}).sort((x, y) => (x.index ?? 99) - (y.index ?? 99))
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const scored = pages.map((p) => {
      const ii = p.imageinfo?.[0]; if (!ii) return null
      const em = ii.extmetadata ?? {}
      const lic = em.LicenseShortName?.value ?? ''
      if (!FREE_LICENSE.test(lic)) return null
      if (!/jpeg|png/.test(ii.mime) || ii.width < 600 || ii.height < 400) return null
      if (/stamp|logo|map|coat of arms|flag of|diagram/i.test(p.title)) return null
      const t = p.title.toLowerCase()
      const score = words.filter((w) => t.includes(w)).length * 10 + Math.min(5, ii.width / 800) - (p.index ?? 0)
      const artist = strip(em.Artist?.value ?? '').slice(0, 40) || 'Wikimedia Commons'
      return { score, url: ii.thumburl ?? ii.url, credit: `Photo: ${artist} · ${lic} · Wikimedia Commons` }
    }).filter((x): x is { score: number; url: string; credit: string } => !!x).sort((x, y) => y.score - x.score)
    if (scored[0]) pick = { url: scored[0].url, credit: scored[0].credit }
  } catch (e) { console.log('[commons]', query, String(e).slice(0, 80)) }
  await env.CACHE.put(key, pick ? JSON.stringify(pick) : 'none', { expirationTtl: 30 * 86400 })
  return pick
}
// Arabic tashkeel (Mehdi, 2026-09-11): the TTS mispronounces undiacritized words,
// so every Arabic voice line gets full diacritics from the LLM before synthesis.
// One call per story (lines joined), cached in KV by content hash.
let lastTashkeelDebug = ''
async function sha1(s: string): Promise<string> { const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('') }
export async function diacritizeArabic(env: Env, lines: string[]): Promise<string[]> {
  if (lines.length > 3) {
    const out: string[] = []
    for (let i = 0; i < lines.length; i += 3) out.push(...await diacritizeArabic(env, lines.slice(i, i + 3)))
    // second chance, one line at a time, for the lines the batch left plain (model altered a word)
    for (let i = 0; i < lines.length; i++) if (out[i] === lines[i]) { const [again] = await diacritizeArabic(env, [lines[i]]); if (again && again !== lines[i]) out[i] = again }
    return out
  }
  const joined = lines.join('\n')
  const key = `auto:tashkeel2:${await sha1(joined)}`
  const cached = await env.CACHE.get(key)
  if (cached) { const out = cached.split('\n'); if (out.length === lines.length) return out }
  try {
    type GptOut = { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>; response?: string }
    const ai = env.AI as { run: (model: string, input: unknown) => Promise<GptOut> } | undefined
    if (!ai) return lines
    const out = await ai.run('@cf/openai/gpt-oss-120b', {
      instructions: 'You are an expert in Arabic tashkeel for text-to-speech. Add COMPLETE diacritics (fatha, damma, kasra, sukun, shadda, tanwin) to every Arabic word of each line, in Modern Standard Arabic. Keep every word, its order, punctuation, digits and Latin names exactly as they are; do not translate, add, remove or reorder anything. Each input line starts with a number and a pipe ("3| …"): output the same lines with the same number and pipe, one per line, nothing else.',
      input: [{ role: 'user', content: lines.map((l, i) => `${i + 1}| ${l}`).join('\n') }], max_output_tokens: 4000, reasoning: { effort: 'low' },
    })
    let raw = ''
    for (const item of out.output ?? []) { if (item.type !== 'message') continue; for (const c of item.content ?? []) if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') raw += c.text }
    raw = (raw.trim() || (out.response ?? '').trim()).replace(/\r/g, '')
    // Re-associate by line number (the model sometimes merges or splits lines); unnumbered output of the right length is accepted positionally.
    const byNum = new Map<number, string>()
    const plainRows = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const latin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))   // Arabic-Indic digits → Latin
    for (const row of plainRows) { const m = latin(row).match(/^(\d{1,2})\s*[|｜:.\-]\s*(.+)$/); if (m) byNum.set(Number(m[1]), m[2].trim()) }
    const res = lines.map((_, i) => byNum.get(i + 1) ?? (byNum.size === 0 && plainRows.length === lines.length ? plainRows[i] : ''))
    // Strict, line by line: once the diacritics are removed the output must be the SAME words as the input
    // (the model was caught changing "the 20th" into "the 12th" while vocalising). Otherwise keep that line plain.
    const norm = (s: string) => s.replace(/[\u064B-\u0652\u0670\u0640]/g, '').replace(/[\s\u200f\u200e]+/g, ' ').replace(/[،,.!؟?…:;«»"'()]/g, '').trim()
    const vocal = lines.map((src, i) => {
      const cand = res[i]
      const hasMarks = (cand.match(/[\u064B-\u0652\u0670]/g) ?? []).length >= Math.max(3, src.length * 0.12)
      return hasMarks && norm(cand) === norm(src) ? cand : src
    })
    const kept = vocal.filter((l, i) => l !== lines[i]).length
    console.log('[tashkeel] vocalised', kept, '/', lines.length)
    lastTashkeelDebug = `rows=${plainRows.length} byNum=${byNum.size} raw0=${JSON.stringify(plainRows[0] ?? '').slice(0, 160)} res0=${JSON.stringify(res[0] ?? '').slice(0, 160)} norm0=${JSON.stringify(norm(res[0] ?? '')).slice(0, 120)} src0=${JSON.stringify(norm(lines[0])).slice(0, 120)}`
    if (kept === 0) return lines
    await env.CACHE.put(key, vocal.join('\n'), { expirationTtl: 90 * 86400 })
    return vocal
  } catch (e) { console.log('[tashkeel]', String(e).slice(0, 120)); return lines }
}
const taleLink = (t: Tale, lang: TaleLang) => `${SITE}/news/story-${t.slug}?${lang === 'ar' ? 'lang=ar&' : ''}ref=fb-reel`
function taleDescription(tx: TaleText, lang: TaleLang): string {
  // Curiosity first (Mehdi): the caption teases, the pinned comment carries the question + link.
  const L = TALE_LABELS[lang]
  return `${tx.caption || tx.hook}\n\n${L.cta}\n\n${tx.hashtags}`
}
async function taleDone(env: Env): Promise<string[]> { try { return JSON.parse((await env.CACHE.get('auto:tales:done')) ?? '[]') as string[] } catch { return [] } }
/** AI-drafted stories (admin panel "generate") live in KV until Mehdi reviews and publishes them. */
export async function customTales(env: Env): Promise<Tale[]> { try { return JSON.parse((await env.CACHE.get('auto:tales:custom')) ?? '[]') as Tale[] } catch { return [] } }
export async function allTales(env: Env): Promise<Tale[]> { return [...TALES, ...(await customTales(env))] }
export async function listTales(env: Env): Promise<Array<{ slug: string; title: string; done: boolean; custom: boolean; needsReview?: string; hold?: boolean }>> {
  const done = await taleDone(env); const custom = await customTales(env)
  return [...TALES.map((t) => ({ slug: t.slug, title: t.en.title, done: done.includes(t.slug), custom: false })), ...custom.map((t) => ({ slug: t.slug, title: t.en.title, done: done.includes(t.slug), custom: true, needsReview: t.needsReview, hold: t.hold }))]
}
export async function nextTale(env: Env, done: string[], slug?: string): Promise<Tale | null> {
  const all = await allTales(env)
  if (slug) return all.find((t) => t.slug === slug) ?? null
  // Clean drafts first; a flagged one only when nothing else is left (audit 2026-09-13).
  const open = all.filter((t) => !done.includes(t.slug) && !t.hold)   // hold = kept for a later day (Mehdi, 2026-09-14)
  return open.find((t) => !t.needsReview) ?? open[0] ?? null
}
// ─── Story generation with the LLM (gpt-oss-120b), staged over the tick so the admin request returns at once ───
const TALE_SCHEMA = `{"slug":"kebab-case-id","year":"1994","title":"Article title (≤ 70 chars)","hook":"One-line cover hook","caption":"Facebook post text: 2 short lines that provoke curiosity, end with ⬇️","question":"CLOSED question the viewer answers with a choice or yes/no (\"Pickles or Bobby Moore?\", \"Would you have signed him: yes or no?\"), ≤ 10 words, ends with 👇","excerpt":"1-2 sentence summary","hashtags":"#football #footballstories #didyouknow #Pressing90","beats":[{"kicker":"DID YOU KNOW?","caption":"On-screen text, max 3 lines of ≤ 26 chars, mark key words like *this*","voice":"What the narrator says (1-2 short sentences)","visual":{"type":"mark","text":"?","color":"green"},"glow":"gold","min":4,"imageQuery":"Wikimedia Commons search words for a real photo of THE MAIN SUBJECT of the story (the person, club or stadium named in the title, by full name — e.g. \"Lamine Yamal\", \"Camp Nou\") when this beat shows it; leave EMPTY for generic beats (a goal, a record, a suspension, an opponent) — a wrong photo is worse than none"}],"article":["paragraph 1","paragraph 2","paragraph 3","paragraph 4","paragraph 5"]}`
const TALE_RULES = `RULES: exactly 8 beats (the reel must last 45-60 seconds: every voice line ≤ 14 words, whole script ≤ 110 words). CAPTIONS are on-screen subtitles: 1-3 SHORT FULL PHRASES (3-7 words each, ≤ 26 characters per line, separated by \\n), never isolated keywords — good: "Grenada scores.\\nBarbados is OUT." bad: "Grenada OUT". Mark the 1-2 key words of a caption with *asterisks*. Visual "color" is only "gold" or "green"; mark text is a plain number, a year, a score or ONE short word (no "×1M" / "1 Mo" style codes). Write EVERY number as DIGITS in voice lines, captions and article (1996, 23 November, minute 32, 2–0), never in words — the TTS reads digits correctly. No asterisks in title, caption (post text), question or article. Beat 1 = the hook: the voice asks a "Did you know…" question that creates curiosity, the caption states the surprising claim itself in 2-3 short lines (never the words "Did you know"), glow "gold", visual mark "?". Beats 2-7 = one fact per beat in chronological order with a twist in the middle and a punchline (a quote if a documented one exists → visual {"type":"quote"}). Every beat needs a short UPPERCASE kicker (2-4 words: a minute, a date, a theme). No emoji in kickers or on-screen captions (emoji only in the post caption and the question). Beat 8 = kicker "YOUR TURN", caption = the question, voice = the question + "Tell us in the comments, and follow Pressing 90. Full story on pressing ninety dot live.", visual {"type":"cta"}, min 10. Visual types allowed: mark (short text ≤ 7 chars, e.g. a year, a score, "×2", "3 s"), scoreboard ({"type":"scoreboard","home":"NAME","away":"NAME","hCode":"ABC","aCode":"DEF","hColors":["#hex","#hex"],"aColors":["#hex","#hex"],"h":2,"a":1,"hl":"a","tag":"OWN GOAL"}), pitch ({"type":"pitch","mode":"both|one|empty","top":"…","bottom":"…"}), quote, cta. Use at least 3 different visual types. VERIFIED FACTS ONLY (dates, scores, names, attributed quotes); if unsure of a detail, leave it out. No tragedy, no living person ridiculed. Voice text is spoken by a TTS: write numbers and scores in words ("two–one"), no abbreviations. Article: 5 paragraphs, 220-300 words, factual, no headings. The "question" is CLOSED — a binary choice ("X or Y?") or yes/no — never an open "what / which / how" question (open questions get no answers). It must be ABOUT THE STORY ITSELF and its key claim (e.g. "The greatest comeback in Champions League history: yes or no?", "Hero or cheat?"), written in the past/timeless tense — never about current news, standings or the present season. Output ONLY the JSON object.`
function extractJson(raw: string): unknown {
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
  if (s < 0 || e < 0) throw new Error('no JSON in answer')
  return JSON.parse(raw.slice(s, e + 1))
}
export async function gptJson(env: Env, instructions: string, prompt: string, maxTokens = 9000): Promise<unknown> {
  type GptOut = { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>; response?: string }
  const ai = env.AI as { run: (model: string, input: unknown) => Promise<GptOut> } | undefined
  if (!ai) throw new Error('AI binding missing')
  const out = await ai.run('@cf/openai/gpt-oss-120b', { instructions, input: [{ role: 'user', content: prompt }], max_output_tokens: maxTokens, reasoning: { effort: 'medium' } })
  let raw = ''
  for (const item of out.output ?? []) { if (item.type !== 'message') continue; for (const c of item.content ?? []) if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') raw += c.text }
  raw = raw.trim() || (out.response ?? '').trim()
  return extractJson(raw)
}
function validateTaleText(x: unknown, lang: TaleLang): TaleText {
  const t = x as Partial<TaleText> & { beats?: unknown }
  if (!t || typeof t.title !== 'string' || !Array.isArray(t.beats) || t.beats.length < 6 || !Array.isArray(t.article)) throw new Error(`${lang}: invalid story JSON`)
  const noStar = (s: unknown) => String(s ?? '').replace(/\*/g, '')
  const noEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/[ \t]+\n/g, '\n').trim()   // on-screen text: the studio has no emoji font
  const fixVisual = (v: unknown) => {
    if (!v || typeof v !== 'object') return undefined
    const o = { ...(v as Record<string, unknown>) }
    if (o.type === 'mark') { o.color = o.color === 'gold' ? 'gold' : 'green'; o.text = String(o.text ?? '?').slice(0, 8) }
    if (o.type === 'scoreboard') { const h = Number(o.h ?? 0) || 0, a = Number(o.a ?? 0) || 0; o.h = h; o.a = a; o.hl = o.hl === 'h' || o.hl === 'a' ? o.hl : h >= a ? 'h' : 'a' }   // the model once wrote "hl":"المنزل"
    if (o.type === 'pitch') o.mode = ['both', 'one', 'empty'].includes(String(o.mode)) ? o.mode : 'both'
    if (o.type === 'quote' || o.type === 'cta') return { type: o.type } as TaleText['beats'][number]['visual']
    if (!['mark', 'scoreboard', 'pitch'].includes(String(o.type))) return undefined
    return o as TaleText['beats'][number]['visual']
  }
  const beats = (t.beats as Array<Partial<TaleBeatLike>>).slice(0, 12).map((b, i) => {
    const caption = noEmoji(String(b.caption ?? ''))
    let kicker = noEmoji(noStar(b.kicker)).trim()
    if (!kicker) kicker = i === 0 ? (lang === 'ar' ? 'هل تعلم؟' : lang === 'fr' ? 'LE SAVIEZ-VOUS ?' : 'DID YOU KNOW?') : noStar(caption.split('\n')[0]).replace(/[.!?…]+$/, '').slice(0, 26).toUpperCase()
    const iq = typeof (b as { imageQuery?: unknown }).imageQuery === 'string' ? String((b as { imageQuery?: string }).imageQuery).trim() : ''
    return { kicker, caption, voice: noStar(b.voice), visual: fixVisual(b.visual), glow: b.glow === 'gold' ? 'gold' as const : undefined, capSize: typeof b.capSize === 'number' ? b.capSize : undefined, min: typeof b.min === 'number' ? b.min : undefined, image: iq.length > 2 ? { query: iq } : (b as { image?: { query?: string } }).image }
  })
  // The closing beat always speaks the fixed formula (the model paraphrased it, once in the first person).
  const q = noStar(t.question ?? '').replace(/[👇⬇️]/gu, '').trim()
  const last = beats[beats.length - 1]
  if (last && last.visual?.type === 'cta' && q) last.voice = `${q} ${CTA_TAIL[lang]}`
  return { title: noStar(t.title), hook: noStar(t.hook ?? t.title), caption: noStar(t.caption ?? t.hook ?? ''), question: noStar(t.question ?? ''), excerpt: noStar(t.excerpt ?? ''), article: (t.article as unknown[]).map(noStar), hashtags: noStar(t.hashtags ?? '#football #footballstories #Pressing90'), beats }
}
const CTA_TAIL: Record<TaleLang, string> = {
  en: 'Tell us in the comments, and follow Pressing 90. Full story on pressing ninety dot live.',
  fr: "Dites-le-nous en commentaire, et abonnez-vous à Pressing quatre-vingt-dix. L'histoire complète sur pressing quatre-vingt-dix point live.",
  ar: 'أخبرنا في التعليقات، وتابع بريسينغ تسعين. القصة كاملة على موقع بريسينغ تسعين دوت لايف.',
}
/** Latin-letter words left in an Arabic script (everything the viewer sees or hears; hashtags, codes and imageQuery excluded). */
function latinWords(tx: TaleText): string[] {
  const fields = [tx.title, tx.hook, tx.caption, tx.question, ...tx.beats.flatMap((b) => [b.kicker, b.caption, b.voice, b.visual?.type === 'mark' ? String(b.visual.text ?? '') : '', b.visual?.type === 'scoreboard' ? `${b.visual.home} ${b.visual.away} ${b.visual.tag ?? ''}` : '', b.visual?.type === 'pitch' ? `${b.visual.top ?? ''} ${b.visual.bottom ?? ''}` : ''])]
  const found = new Set<string>()
  const ALLOWED = /^(UEFA|FIFA|CAF|VAR|PSG|BBC|ESPN|UNICEF|FC|USA|NBA|NFL|CONCACAF|CONMEBOL|AFC|UAE)$/i   // acronyms that Arabic media keep in Latin letters (2026-09-16)
  for (const f of fields) for (const m of String(f ?? '').matchAll(/[A-Za-z]{3,}/g)) if (!ALLOWED.test(m[0])) found.add(m[0])
  return [...found]
}
type TaleBeatLike = { kicker: string; caption: string; voice: string; visual?: unknown; glow?: string; capSize?: number; min?: number; imageQuery?: string; image?: { query?: string } }
type TaleGen = { subject: string; brief?: string; stage: 'en' | 'check' | 'fr' | 'ar' | 'ar-polish' | 'variants' | 'images'; en?: TaleText; fr?: TaleText; ar?: TaleText; slug?: string; year?: string; startedAt: number; retries?: number; barca?: boolean }
// Numbers spoken in the story beats (the closing CTA beat is skipped: "Pressing 90" is spelled out in FR/AR).
const numbersOf = (tx: TaleText) => new Set([...tx.beats.slice(0, -1).map((b) => `${b.voice} ${b.caption}`).join(' ').replace(/pressing\s?90/gi, '').matchAll(/\d+/g)].map((m) => m[0]))
/** Every number spoken in the English script must appear as digits in the translation. */
function numberMismatch(en: TaleText, tx: TaleText): string[] {
  const want = numbersOf(en), have = numbersOf(tx)
  return [...want].filter((n) => !have.has(n))
}
/** The translation must actually be in the target language (the model sometimes leaves voice lines in English). */
function languageProblem(en: TaleText, tx: TaleText, lang: TaleLang): string | null {
  const voices = tx.beats.map((b) => b.voice)
  if (lang === 'ar') {
    const all = voices.join(' ')
    const ratio = (all.match(/[؀-ۿ]/g) ?? []).length / Math.max(1, all.replace(/\s/g, '').length)
    if (ratio < 0.5) return `voice lines not Arabic (ratio ${ratio.toFixed(2)})`
    const latin = latinWords(tx)   // audit 2026-09-13: "debut" and "FIFA" went out inside the Arabic caption
    return latin.length ? `Latin words in the Arabic: ${latin.slice(0, 6).join(', ')}` : null
  }
  const same = voices.filter((v, i) => v.trim() === (en.beats[i]?.voice ?? '').trim()).length
  return same > 2 ? `${same} voice lines left in English` : null
}
// Cover + caption variants (2026-09-16): 4 thumbnails / captions per language for the same reel.
async function taleVariantsAI(env: Env, tx: TaleText, lang: TaleLang): Promise<{ covers: TaleCover[]; captions: string[] }> {
  const L = lang === 'ar' ? 'Arabic (Modern Standard, as Arabic sports media write it)' : lang === 'fr' ? 'French' : 'English'
  const sys = `You write scroll-stopping thumbnails and captions for a vertical football-story reel. Answer with ONE JSON object: {"covers":[{"l1":"...","l2":"...","l3":"..."} ×4],"captions":["..." ×4]}. Language: ${L}. Each cover = 3 short lines shown as coloured pills on the thumbnail: l1 = the shock (2-4 words: a number, a paradox, a name), l2 = the claim (4-7 words), l3 = context (year, place or the name). The 4 covers take 4 DIFFERENT angles (the number, the person, the question, the twist). Never write numbers in words. No emoji, no hashtags, no quotes. Each caption = 2 short lines for the Facebook post that create curiosity without revealing the ending, ending with ⬇️ — 4 different angles too.`
  const j = await gptJson(env, sys, `Title: ${tx.title}\nHook: ${tx.hook}\nScript:\n${tx.beats.map((b) => `- ${b.voice}`).join('\n')}`) as { covers?: Array<Partial<TaleCover>>; captions?: unknown }
  const clean = (v: unknown) => String(v ?? '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D#*"]/gu, '').replace(/\s+/g, ' ').trim()
  const covers = (Array.isArray(j.covers) ? j.covers : []).map((c) => ({ l1: clean(c.l1).slice(0, 40), l2: clean(c.l2).slice(0, 60), l3: clean(c.l3).slice(0, 40) })).filter((c) => c.l1 || c.l2).slice(0, 4)
  const captions = (Array.isArray(j.captions) ? j.captions : []).map((c) => String(c ?? '').replace(/#\S+/g, '').trim()).filter(Boolean).slice(0, 4)
  if (covers.length < 2) throw new Error('fewer than 2 covers')
  return { covers, captions }
}
// Illustrations (2026-09-16): one Gemini image per beat in the house comic style, uploaded to Supabase.
const COMIC_STYLE = 'Flat vector cartoon illustration, editorial storybook style, bold clean outlines, limited palette of deep navy, garnet red, cream paper and warm gold, subtle paper grain, square composition, no text, no letters, no logos, no real person likeness, stylized faces.'
/** Gemini keys in order: GEMINI_API_KEY, then GEMINI_API_KEY_2 (2026-09-16: two free-tier accounts → a 429 on the first falls back to the second). */
function geminiKeys(env: Env): string[] { const e = env as unknown as { GEMINI_API_KEY?: string; GEMINI_API_KEY_2?: string }; return [e.GEMINI_API_KEY, e.GEMINI_API_KEY_2].filter((k): k is string => !!k) }
async function geminiImageWith(key: string, prompt: string): Promise<{ buf?: ArrayBuffer; status: number; error?: string }> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }), signal: AbortSignal.timeout(90000),
  })
  const txt = await r.text()
  if (!r.ok) return { status: r.status, error: txt.slice(0, 300) }
  const j = JSON.parse(txt) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> } }> }
  const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!part?.inlineData) return { status: 200, error: 'no image in the response' }
  return { status: 200, buf: Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0)).buffer }
}
/** Workers AI fallback (2026-09-16, « on fait avec ce qu'on a »): Flux Schnell on Cloudflare, included in the Workers plan. */
export async function fluxImage(env: Env, prompt: string): Promise<ArrayBuffer | null> {
  const ai = (env as unknown as { AI?: { run: (m: string, i: unknown) => Promise<unknown> } }).AI
  if (!ai) return null
  const out = await ai.run('@cf/black-forest-labs/flux-1-schnell', { prompt: prompt.slice(0, 2000), steps: 4 }) as { image?: string }
  if (!out?.image) return null
  return Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0)).buffer
}
export async function comicImage(env: Env, prompt: string, only?: number): Promise<ArrayBuffer | null> {
  const keys = geminiKeys(env); if (!keys.length) return null
  const list = only ? [keys[only - 1]].filter(Boolean) : keys
  let last = ''
  for (const key of list) {
    const r = await geminiImageWith(key, prompt)
    if (r.buf) return r.buf
    last = `${r.status} ${r.error ?? ''}`
    if (r.status !== 429) break   // only a quota error is worth trying the next key
  }
  throw new Error(`gemini ${last}`.slice(0, 200))
}
/** Purely visual scene descriptions for the illustrator (2026-09-16): Flux paints any date, name or sentence it is given as garbled text. */
async function scenePrompts(env: Env, t: Tale): Promise<string[]> {
  const j = await gptJson(env, 'You turn a football story script into purely VISUAL scene descriptions for an illustrator. Answer with ONE JSON object: {"scenes":["..."]} with exactly one entry per numbered line, in order. Each scene: 15-35 words, concrete and visual — who is there, where, the action, the mood, era clothing and stadium — written as a picture, never as a sentence to print. STRICT: no dates, no numbers, no proper names, no written words, no signs, no banners, no scoreboards, no quotes. If the line is the closing call to action, describe a cheerful crowd of fans of all ages waving and pointing at the viewer with confetti.', t.en.beats.map((b, i) => `${i + 1}. ${b.voice}`).join('\n')) as { scenes?: unknown }
  const scenes = Array.isArray(j.scenes) ? j.scenes.map((x) => String(x ?? '').replace(/[0-9"“”«»*]/g, '').trim()) : []
  if (scenes.length < t.en.beats.length - 1) throw new Error(`scene prompts: ${scenes.length}/${t.en.beats.length}`)
  return scenes
}
async function illustrateTale(env: Env, t: Tale, force = false): Promise<number> {
  let n = 0
  const scenes = await scenePrompts(env, t).catch(() => [] as string[])
  for (let i = 0; i < t.en.beats.length; i++) {
    const b = t.en.beats[i]
    if (!force && b.image?.url && /toon-|tale-img-/.test(b.image.url)) { n++; continue }
    if (b.image?.kind === 'photo') { n++; continue }   // a real photo chosen by hand stays
    // No title and no quoted words in the prompt: Flux paints any text it is given (garbled captions seen on 2026-09-16).
    const clean = (x: string) => x.replace(/[*"“”«»]/g, '').replace(/\n/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, '').trim()
    const scene = b.visual?.type === 'cta' ? `A cheerful crowd of football fans of all ages waving and pointing at the viewer, inviting them to follow, confetti.` : `${scenes[i] || clean(b.voice).replace(/[0-9]/g, '')} Illustration only, no words, no lettering, no signage.`
    try {
      let buf: ArrayBuffer | null = null
      try { buf = await comicImage(env, `${COMIC_STYLE} ${scene}`, geminiKeys(env).length > 1 ? 2 : undefined) } catch { buf = null }   // key 2 = story reels only
      if (!buf) buf = await fluxImage(env, `${COMIC_STYLE} ${scene}`)   // Gemini refused (free tier) → Flux Schnell on Workers AI
      if (!buf) continue
      const url = await putMedia(env, `tale-img-${t.slug}-${i}-${Math.random().toString(36).slice(2, 6)}.png`, buf, 'image/png')
      for (const lang of ['en', 'fr', 'ar'] as TaleLang[]) { const bb = t[lang].beats[i]; if (bb) bb.image = { ...(bb.image ?? {}), url, credit: 'Illustration IA · Pressing 90' } }
      n++
    } catch (e) { console.log('[illustrate]', i, String(e).slice(0, 120)) }
  }
  return n
}
export async function processTaleGeneration(env: Env, date: string): Promise<void> {
  const raw = await env.CACHE.get('auto:tale:gen')
  if (!raw) return
  // LLM calls take 1-3 min: the next minute's tick must not re-run the same stage (duplicates seen on 2026-09-11).
  if (await env.CACHE.get('auto:tale:gen:lock')) return
  await env.CACHE.put('auto:tale:gen:lock', '1', { expirationTtl: 240 })
  const g = JSON.parse(raw) as TaleGen
  try {
    if (g.stage === 'variants' || g.stage === 'images') {
      const custom = await customTales(env); const t = custom.find((x) => x.slug === g.slug)
      if (!t) { await env.CACHE.delete('auto:tale:gen'); return }
      if (g.stage === 'variants') {
        for (const lang of ['ar', 'en', 'fr'] as TaleLang[]) {
          if (t[lang].covers && t[lang].covers!.length) continue
          try { const v = await taleVariantsAI(env, t[lang], lang); t[lang].covers = v.covers; t[lang].captions = v.captions } catch (e) { await log(env, date, 'tale-generate', false, `${lang} variants failed: ${String(e).slice(0, 120)}`) }
        }
        await env.CACHE.put('auto:tales:custom', JSON.stringify(custom))
        g.stage = 'images'; await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 })
        await log(env, date, 'tale-generate', true, `cover variants ready — ${(env as unknown as { GEMINI_API_KEY?: string }).GEMINI_API_KEY ? 'drawing the illustrations…' : 'no GEMINI_API_KEY: photo layout (add the key for the comic layout)'}`)
        return
      }
      const artMode = (await loadAutomationSettings(env)).taleArt
      const n = artMode === 'comic' ? await illustrateTale(env, t) : 0
      if (n > 0) { t.comic = true; await env.CACHE.put('auto:tales:custom', JSON.stringify(custom)) }
      await env.CACHE.delete('auto:tale:gen')
      await log(env, date, 'tale-generate', true, `"${t.en.title}" complete${n ? ` — ${n} illustrations (comic layout)` : ' — free-licence photos only'} — preview it, then publish from the panel`)
      return
    }
    if (g.stage === 'en') {
      const src = g.brief ? `\nFACT SHEET (the ONLY source of facts — do not add dates, numbers, names or quotes that are not in it; widely known context is fine):\n${g.brief}` : '\nUse only facts you are certain of; leave out any detail you are not sure about.'
      const j = await gptJson(env, `You write "Football Stories": 60-90 s vertical reels telling a TRUE, strange or memorable football story. Answer with ONE JSON object exactly shaped like: ${TALE_SCHEMA}\n${TALE_RULES}`, `Subject: ${g.subject}${src}\nLanguage: English.`)
      const en = validateTaleText(j, 'en')
      if (g.brief) {
        // the EN script must carry the fact sheet's numbers as digits (the checks on FR/AR compare against them)
        const briefNums = [...new Set([...g.brief.matchAll(/\b\d{1,4}\b/g)].map((m) => m[0]))]
        const enNums = numbersOf(en)
        const covered = briefNums.filter((n) => enNums.has(n)).length
        if (briefNums.length >= 3 && covered / briefNums.length < 0.5) {
          if ((g.retries ?? 0) < 1) { g.retries = (g.retries ?? 0) + 1; await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 }); await log(env, date, 'tale-generate', true, `EN wrote numbers in words (${covered}/${briefNums.length} digits) — retrying`); return }
        }
        g.retries = 0
      }
      const jj = j as { slug?: string; year?: string }
      g.slug = (jj.slug || en.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) + '-ai'
      g.year = String(jj.year ?? '')
      g.en = en; g.stage = 'check'
      await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 })
      await log(env, date, 'tale-generate', true, `EN draft ready: "${en.title}" — fact-check pass…`)
      return
    }
    if (g.stage === 'check') {
      // Second pass: strike anything not supported by the fact sheet, fix numbers/dates, keep the structure.
      const j = await gptJson(env, `You are a strict football fact-checker. You receive a reel script as JSON and a FACT SHEET. Remove or rewrite every claim (date, score, number, name, quote, minute) that the fact sheet does not support; delete embellishments the fact sheet does not contain (motives, feelings, "in secret", crowd reactions, invented details); never add new facts; keep every number as digits; keep the article at 5 paragraphs and 220-300 words by keeping every supported detail and neutral context (do not shrink it to a summary); keep exactly the same JSON structure and keys, same number of beats, same visual objects (fix their numbers if wrong, home team first in scoreboards). Output ONLY the corrected JSON object.`, `FACT SHEET:\n${g.brief ?? '(none — keep only widely documented facts)'}\n\nSCRIPT JSON:\n${JSON.stringify(g.en)}`)
      g.en = validateTaleText(j, 'en'); g.stage = 'fr'
      await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 })
      await log(env, date, 'tale-generate', true, `fact-check done — translating to FR…`)
      return
    }
    if (g.stage === 'ar-polish') {
      // Arabic from the model is understandable but clumsy: a rewrite pass in fluent sports-journalist MSA.
      // Audit 2026-09-13 ("debut" left in English, "جورج يا" for Weah, "hl":"المنزل"): the offending words are
      // listed to the editor, up to 2 retries, and a draft that still fails is flagged for review + mailed.
      const before = latinWords(g.ar!)
      const j = await gptJson(env, `You are a senior Arabic sports editor. Rewrite the Arabic texts of this JSON in fluent, natural Modern Standard Arabic as used by Arabic sports media: correct spelling, grammar and gender agreement, natural word order, FULL common transliterations of names (جورج ويا, غرايم سونيس, مات لو تيسييه — never a truncated name), football vocabulary (ابن عم = cousin, الظهور الأول = debut, هدف عكسي = own goal), NO Latin letters anywhere except the club abbreviations in "hCode"/"aCode" and "imageQuery" (which stays in English).${before.length ? ` These words are still in Latin letters and MUST become Arabic: ${before.join(', ')}.` : ''} The post "caption" = 2 complete short Arabic sentences that create curiosity; the "question" stays a closed question (a choice or yes/no) ABOUT THE STORY ITSELF (its key claim), never about current news or standings; scores and numbers stay digits (3–0, never ثلاثة‑صفر); football vocabulary: هدف عكسي (own goal, never غول ذاتي), ركلة جزاء, ريمونتادا. Keep the JSON structure and keys exactly, keep "hl" as "h" or "a", keep every number as digits, keep captions short (≤ 26 characters per line) with *key words* marked, keep the last voice line ending exactly with "أخبرنا في التعليقات، وتابع بريسينغ تسعين. القصة كاملة على موقع بريسينغ تسعين دوت لايف." Output ONLY the JSON object.`, JSON.stringify(g.ar))
      const tx = validateTaleText(j, 'ar')
      const missing = numberMismatch(g.en!, tx); const langIssue = languageProblem(g.en!, tx, 'ar')
      if ((missing.length || langIssue) && (g.retries ?? 0) < 2) {
        g.retries = (g.retries ?? 0) + 1
        if (!missing.length) g.ar = tx   // numbers intact: the next attempt builds on this version
        await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 })
        await log(env, date, 'tale-generate', true, `Arabic polish rejected (${[missing.length ? `numbers missing: ${missing.join(', ')}` : '', langIssue ?? ''].filter(Boolean).join(' · ')}) — retry ${g.retries}/2`)
        return
      }
      const ar = missing.length ? g.ar! : tx   // a polish that lost numbers is discarded
      const review = missing.length ? languageProblem(g.en!, ar, 'ar') : langIssue
      const tale: Tale = { slug: g.slug!, year: g.year || '', en: g.en!, fr: g.fr!, ar, subject: g.subject, ...(g.barca ? { barca: true } : {}), ...(review ? { needsReview: review } : {}) }
      const custom = (await customTales(env)).filter((t) => t.slug !== tale.slug)
      custom.push(tale)
      await env.CACHE.put('auto:tales:custom', JSON.stringify(custom.slice(-30)))
      // 2026-09-16: cover / caption variants, then illustrations (Gemini) — the draft is usable before those land.
      g.stage = 'variants'; g.retries = 0
      await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 })
      await log(env, date, 'tale-generate', !review, `DRAFT READY: "${tale.en.title}" (${tale.slug})${review ? ` — ⚠ Arabic needs a manual check (${review})` : ''} — writing cover variants…`)
      if (review) await sendMail(env, `Pressing 90 · brouillon arabe à relire : ${tale.en.title}`, `<p>Le brouillon <b>${tale.slug}</b> est prêt mais l'arabe n'est pas propre : ${review}.</p><p>Panel admin → Football Stories → sélectionnez-le, « Show text », puis relancez « Re-polish Arabic » ou supprimez le brouillon. Les brouillons propres passent avant lui dans la file quotidienne.</p>`).catch(() => {})
      return
    }
    const target = g.stage
    const rules = target === 'fr'
      ? 'Translate into natural French. Translate the kickers too (short, UPPERCASE). Voice lines are read by a French TTS: keep EVERY number exactly as DIGITS as in the source (1996, 23 novembre, minute 32, 2–0), never convert to words; no English words except proper names; translate mark words in visuals (e.g. HOAX → CANULAR) but keep numbers; the LAST voice line = the question in French, then exactly "Dites-le-nous en commentaire, et abonnez-vous à Pressing quatre-vingt-dix pour d\'autres histoires incroyables du foot. L\'histoire complète sur pressing quatre-vingt-dix point live." Captions stay short full phrases (1-3 lines, ≤ 26 characters per line) with *key words* marked; no asterisks in title, caption (post text) or question.'
      : 'Translate into clear Modern Standard Arabic (simple, spoken-friendly). Translate the kickers too (short Arabic). Voice lines are read by an Arabic TTS: keep EVERY number exactly as DIGITS as in the source (1996, 23 نوفمبر, الدقيقة 32, 2–0), never convert to words; transliterate names the way Arabic sports media do (جورج ويا, غرايم سونيس, مات لو تيسييه, ساوثهامبتون, ليدز يونايتد, باريس سان جيرمان); EVERY field must be in Arabic — voice lines included (an English voice line is a failure); translate mark words in visuals but keep numbers; the LAST voice line = the question in Arabic, then exactly "أخبرنا في التعليقات، وتابع بريسينغ تسعين. القصة كاملة على موقع بريسينغ تسعين دوت لايف." Captions stay short full phrases (1-3 lines, ≤ 26 characters per line) with *key words* marked; no asterisks in title, caption (post text) or question.'
    const j = await gptJson(env, `You translate a "Football Stories" reel script. Keep the JSON structure and keys EXACTLY, keep every "visual" object as is except translate its text labels (home, away, top, bottom, tag), keep "imageQuery" in English unchanged. Keep kickers short and uppercase (Latin) or short (Arabic). Mark key words in captions with *asterisks*. Output ONLY the JSON object.`, `${rules}\n\nSOURCE (English JSON):\n${JSON.stringify(g.en)}`)
    const tx = validateTaleText(j, target)
    const missing = numberMismatch(g.en!, tx)
    const langIssue = languageProblem(g.en!, tx, target)
    if (missing.length || langIssue) {
      const why = [missing.length ? `numbers missing: ${missing.join(', ')}` : '', langIssue ?? ''].filter(Boolean).join(' · ')
      if ((g.retries ?? 0) < 2) { g.retries = (g.retries ?? 0) + 1; await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 }); await log(env, date, 'tale-generate', true, `${target.toUpperCase()} rejected (${why}) — retry ${g.retries}/2`); return }
      if (target === 'ar' && !missing.length) {
        // 2026-09-16: never lose a draft over stray Latin words (a Catalan chant, a decree name…) — keep it, flag it for review, Mehdi fixes the Arabic by hand.
        g.retries = 0; g.ar = tx; g.stage = 'ar-polish'
        await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 })
        await log(env, date, 'tale-generate', true, `AR kept with a review flag (${why}) — polishing the Arabic…`)
        return
      }
      throw new Error(`${target.toUpperCase()} translation rejected twice (${why})`)
    }
    g.retries = 0
    if (target === 'fr') { g.fr = tx; g.stage = 'ar'; await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 }); await log(env, date, 'tale-generate', true, `FR ready (numbers verified) — translating to AR…`); return }
    g.ar = tx; g.stage = 'ar-polish'
    await env.CACHE.put('auto:tale:gen', JSON.stringify(g), { expirationTtl: 3600 })
    await log(env, date, 'tale-generate', true, `AR ready (numbers + language verified) — polishing the Arabic…`)
  } catch (e) {
    await env.CACHE.delete('auto:tale:gen')
    await log(env, date, 'tale-generate', false, `failed at stage ${g.stage}: ${String(e).slice(0, 200)}`)
  } finally {
    await env.CACHE.delete('auto:tale:gen:lock').catch(() => {})
  }
}
/** Article for the story (EN body + AR columns), cover rendered by the studio. Idempotent on slug. */
async function publishTaleArticle(env: Env, date: string, t: Tale): Promise<string> {
  const slug = `story-${t.slug}`
  let image: string | null = null
  try { image = await renderImage(env, 'tale-cover', { lang: 'en', kicker: `FOOTBALL STORIES · ${t.year}`, hook: t.en.hook, year: t.year }) } catch (e) { await log(env, date, 'tale-article', false, `cover failed: ${String(e).slice(0, 120)}`) }
  const nowIso = new Date().toISOString()
  const row = {
    slug, title: t.en.title.slice(0, 200), excerpt: t.en.excerpt.slice(0, 300), body: t.en.article.join('\n\n'), image_url: image,
    source_url: `${SITE}/news/${slug}`, source_name: "Pressing 90' · Football Stories", score: 100, status: 'published', published_at: nowIso, archived_at: null,
    title_ar: t.ar.title.slice(0, 160), excerpt_ar: t.ar.excerpt.slice(0, 300), body_ar: t.ar.article.join('\n\n'),
  }
  const ex = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`, { headers: sbHeaders(env) })
  const exists = ((await ex.json().catch(() => [])) as Array<{ id: string }>).length > 0
  const r = exists
    ? await fetch(`${env.SUPABASE_URL}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}`, { method: 'PATCH', headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'return=minimal' }), body: JSON.stringify(row) })
    : await fetch(`${env.SUPABASE_URL}/rest/v1/articles`, { method: 'POST', headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'return=minimal' }), body: JSON.stringify(row) })
  if (!r.ok) throw new Error(`article ${exists ? 'update' : 'insert'} failed ${r.status} ${(await r.text()).slice(0, 160)}`)
  await log(env, date, 'tale-article', true, `${exists ? 'updated' : 'published'} ${slug} (EN+AR)${image ? '' : ' — no cover'}`)
  return `${SITE}/news/${slug}`
}
/** Voice every beat, then hand the reel to the studio (async, Make on callback). */
export async function queueTaleReel(env: Env, date: string, t: Tale, lang: TaleLang, opts: { preview?: boolean; voice?: boolean } = {}): Promise<string> {
  // AI drafts only: a Commons photo is used only when its query names something specific to the story
  // (2026-09-13: "football scoreboard" brought a Czech village stadium into the Madagascar 149–0 reel).
  const specific: Set<string> | null = TALES.some((x) => x.slug === t.slug) ? null : taleSpecificWords(t)
  const tx = t[lang]
  const beats: Array<Record<string, unknown>> = []
  // Arabic: fully vocalised voice lines for the TTS (captions stay plain).
  const spoken = lang === 'ar' && opts.voice !== false ? await diacritizeArabic(env, tx.beats.map((b) => b.voice)) : tx.beats.map((b) => b.voice)
  for (let i = 0; i < tx.beats.length; i++) {
    const b = tx.beats[i]
    let voiceUrl: string | undefined
    if (opts.voice !== false) {
      try { voiceUrl = (await taleVoice(env, spoken[i] ?? b.voice, lang, `tale-${t.slug}-${lang}-${i}-${Math.random().toString(36).slice(2, 6)}.mp3`)) ?? undefined }
      catch (e) { await log(env, date, 'tale-reel', false, `voice beat ${i} (${lang}) failed: ${String(e).slice(0, 120)}`) }
    }
    // No voice (free Arabic, failure, silent preview): hold the beat long enough to read it.
    const words = b.voice.split(/\s+/).length
    // shorter reels (Mehdi, 2026-09-11: 45-60 s): the CTA beat holds 7 s at most, the hook 3 s
    const cap = (v: number | undefined) => v == null ? v : Math.min(v, b.visual?.type === 'cta' ? 7 : 3)
    const min = voiceUrl ? cap(b.min) : Math.max(cap(b.min) ?? 3, Math.min(8, 1.4 + words * 0.38))
    // Photo (mini-reportage): direct url, or a Wikimedia Commons search (free licence, credit on the frame).
    const aiImage = b.image?.kind === 'comic' || /Illustration IA/i.test(b.image?.credit ?? '')
    let imageUrl = aiImage && (await loadAutomationSettings(env)).taleArt !== 'comic' ? undefined : b.image?.url, credit = b.image?.credit   // photos-only mode ignores generated panels (2026-09-16)
    if (!imageUrl && b.image?.query && photoQueryRelevant(b.image.query, specific)) { const im = await resolveCommonsImage(env, b.image.query); if (im) { imageUrl = im.url; credit = im.credit } }
    beats.push({ kicker: b.kicker, caption: b.caption, capSize: b.capSize, glow: b.glow, visual: b.visual, min, voiceUrl, imageUrl, credit })
  }
  const L = TALE_LABELS[lang]
  const jobId = `tale-${lang}-${date}-${Math.random().toString(36).slice(2, 7)}`
  // Comic stories (2026-09-16): illustrated beats + N cover variants (same body, different thumbnail + caption)
  const sset = await loadAutomationSettings(env)
  const comic = !!t.comic && sset.taleArt === 'comic'
  if (comic) beats.forEach((b, i) => { if (b.imageUrl && tx.beats[i]?.image?.kind !== 'photo') b.comic = true })   // mix (2026-09-16): a beat whose image is a real photo keeps the reportage layout
  const illustrated = beats.map((b) => b.imageUrl as string | undefined).filter((u): u is string => !!u)
  const nVar = Math.max(1, Math.min(6, sset.taleVariants || 1))
  const isB = !!(t.barca || /barca|barcelona/i.test(`${t.slug} ${t.en.title} ${t.subject ?? ''}`))
  const tag = lang === 'ar' ? (isB ? 'قصة برشلونة' : 'قصة لا تُصدق') : lang === 'fr' ? (isB ? 'HISTOIRE DU BARÇA' : 'HISTOIRE INCROYABLE') : (isB ? 'BARÇA STORY' : 'INCREDIBLE STORY')
  const cvSrc: TaleCover[] = (tx.covers && tx.covers.length ? tx.covers : (comic ? [{ l2: tx.hook }] : [])).slice(0, nVar)
  const covers = cvSrc.map((cv, i) => ({ ...cv, tag, img: illustrated.length ? illustrated[(i * 2) % illustrated.length] : undefined }))
  const variant = (i: number) => ({ title: `${tx.title} (${lang.toUpperCase()})`.slice(0, 100), description: `${tx.captions?.[i] || tx.caption || tx.hook}\n\n${L.cta}\n\n${tx.hashtags}`, comment: `${tx.question}\n\n${L.more}: ${taleLink(t, lang)}` })
  const job = opts.preview
    ? { kind: 'preview', label: `preview-tale-${lang}`, date }
    : covers.length
      ? { kind: 'reel-variants', label: 'tale-reel', date, gapMin: sset.taleVariantGapMin || 15, variants: covers.map((_, i) => variant(i)), ...variant(0) }
      : { kind: 'reel', label: 'tale-reel', date, title: `${tx.title} (${lang.toUpperCase()})`.slice(0, 100), description: taleDescription(tx, lang), comment: `${tx.question}\n\n${L.more}: ${taleLink(t, lang)}` }
  await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify(job), { expirationTtl: 6 * 3600 })
  const special = (t.barca || /barca|barcelona/i.test(`${t.slug} ${t.en.title} ${t.subject ?? ''}`) || TALE_SUBJECTS.some((x) => x.tag === 'barca' && x.subject === t.subject)) ? 'barca' : undefined   // Barça stories: bokeh loop + Barça band (2026-09-14)
  // Thumbnail line on the hook beat (all reel types carry one, 2026-09-14)
  if (beats[0] && !covers.length) beats[0].cover = special ? { text: lang === 'ar' ? 'قصة برشلونة: هل تعرفها؟' : lang === 'fr' ? 'Une histoire du Barça : vous la connaissez ?' : 'A Barça story: do you know it?', tone: 'barca' } : { text: lang === 'ar' ? 'هل تعرف هذه القصة؟' : lang === 'fr' ? 'Vous connaissez cette histoire ?' : 'Do you know this story?', tone: 'story' }
  await studio(env, '/render/reel', { type: 'tale', data: { special, lang, beats, covers, labels: { like: L.like, comment: L.comment, follow: L.follow, full: L.full, weekly: L.weekly } }, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
  await log(env, date, opts.preview ? 'tale-preview' : 'tale-reel', true, `rendering ${t.slug} [${lang}]${comic ? ' comic' : ''}${covers.length ? ` ×${covers.length} covers` : ''} ${opts.voice === false ? 'without voice' : `${beats.filter((b) => b.voiceUrl).length}/${beats.length} beats voiced`} (job ${jobId})`)
  return jobId
}
type TaleQueueItem = { slug: string; lang: TaleLang; at: number }
async function pushTaleQueue(env: Env, items: TaleQueueItem[]): Promise<void> {
  const raw = await env.CACHE.get('auto:tale:queue')
  const q = (raw ? JSON.parse(raw) : []) as TaleQueueItem[]
  q.push(...items)
  await env.CACHE.put('auto:tale:queue', JSON.stringify(q), { expirationTtl: 2 * 86400 })
}
export async function processTaleQueue(env: Env, date: string): Promise<void> {
  const raw = await env.CACHE.get('auto:tale:queue')
  if (!raw) return
  const q = JSON.parse(raw) as TaleQueueItem[]
  const idx = q.findIndex((x) => x.at <= Date.now())
  if (idx < 0) return
  const [item] = q.splice(idx, 1)
  await env.CACHE.put('auto:tale:queue', JSON.stringify(q), { expirationTtl: 2 * 86400 })
  const t = (await allTales(env)).find((x) => x.slug === item.slug)
  if (!t) { await log(env, date, 'tale-reel', false, `unknown tale ${item.slug}`); return }
  try { await queueTaleReel(env, date, t, item.lang) } catch (e) { await log(env, date, 'tale-reel', false, `${item.slug} [${item.lang}]: ${String(e).slice(0, 160)}`) }
}
/** Publish a story now: article + the 3 reels spread over 3 hours (AR, FR, EN). */
export async function publishTale(env: Env, date: string, slug?: string, gapMin?: number): Promise<string> {
  const s = await loadAutomationSettings(env)
  const done = await taleDone(env)
  const t = await nextTale(env, done, slug)
  if (!t) return 'no story left in the bank — add one to worker/src/tales.ts or generate one from the panel'
  if (!reelsConfigured(env)) return 'reels not configured'
  const langs = (s.taleOrder.split(',') as TaleLang[]).filter((l) => s.taleLangs[l])
  if (langs.length === 0) return 'every language is disabled in the admin panel'
  const url = await publishTaleArticle(env, date, t)
  const now = Date.now(), gap = Math.max(gapMin ?? s.taleGapMin, (s.taleVariants || 1) * (s.taleVariantGapMin || 15)) * 60_000   // the next language starts after the last variant of the previous one
  await pushTaleQueue(env, langs.map((lang, i) => ({ slug: t.slug, lang, at: now + i * gap })))
  if (!done.includes(t.slug)) await env.CACHE.put('auto:tales:done', JSON.stringify([...done, t.slug]))
  await env.CACHE.put('auto:tale:last', String(now))
  await env.CACHE.put('auto:tale:lastday', date, { expirationTtl: 3 * 86400 })
  const plan = langs.map((l, i) => `${l.toUpperCase()} ${i === 0 ? 'now' : `+${(i * gap / 60_000).toFixed(0)} min`}`).join(', ')
  await log(env, date, 'tale', true, `${t.slug}: article ${url} · reels queued ${plan}`)
  return `${t.slug}: article ${url} · reels queued (${plan})`
}
/** DAILY story (Mehdi, 2026-09-11: « chaque jour il faut publier une nouvelle histoire ») at taleHour. */
export async function runTales(env: Env, s: AutomationSettings, date: string, hour: number, minute: number): Promise<void> {
  if (!s.tales) return
  // Slots (Mehdi, 2026-09-16): explicit local times, first N = talesPerDay. Each story = AR variants then EN variants every taleVariantGapMin.
  const n = Math.max(1, Math.min(6, s.talesPerDay || 1))
  const slots = String(s.taleSlots || '').split(',').map((x) => x.trim()).filter((x) => /^\d{1,2}:\d{2}$/.test(x)).slice(0, n)
  const list = slots.length ? slots : [`${s.taleHour}:00`]
  const slot = list.findIndex((x) => { const [h, m] = x.split(':').map(Number); return h === hour && minute >= m && minute <= m + 4 })
  if (slot < 0) return
  const claim = `auto:tale:${date}:${slot}`
  if (await env.CACHE.get(claim)) return
  await env.CACHE.put(claim, '1', { expirationTtl: 36 * 3600 })
  const pinned = slot === 0 ? (await env.CACHE.get('auto:tale:pin')) || undefined : undefined   // tale-pin {slug}: the story of the day, chosen by hand (2026-09-14)
  if (pinned) await env.CACHE.delete('auto:tale:pin')
  try { await publishTale(env, date, pinned) } catch (e) { await log(env, date, 'tale', false, String(e).slice(0, 200)) }
}
/** Supply: every morning (09:00) keep at least 2 unpublished stories by drafting the next subject of the bank. */
export async function runTaleSupply(env: Env, s: AutomationSettings, date: string, hour: number, minute: number, force = false): Promise<string> {
  if (!s.tales || !s.taleAutoGen) return 'off'
  if (!force && (hour % 3 !== 0 || minute > 4)) return 'not now'   // every 3 h (3 stories a day need 3 drafts a day)
  const claim = `auto:tale:supply:${date}:${hour}`
  if (!force && (await env.CACHE.get(claim))) return 'done today'
  await env.CACHE.put(claim, '1', { expirationTtl: 36 * 3600 })
  if (await env.CACHE.get('auto:tale:gen')) return 'a story is already being generated'
  const done = await taleDone(env)
  const reserve = (await allTales(env)).filter((t) => !done.includes(t.slug)).length
  if (!force && reserve >= (s.talesPerDay || 1) + 1) return `reserve ok (${reserve} unpublished)`
  const used = JSON.parse((await env.CACHE.get('auto:tales:subjects_done')) ?? '[]') as string[]
  const unused = TALE_SUBJECTS.filter((x) => !used.includes(x.id))
  // One Barça story a week (Mehdi, 2026-09-13), the rest of the week from the general bank.
  const lastBarca = await env.CACHE.get('auto:tales:barca:last')
  const barcaDue = s.barcaDaily && (!lastBarca || Date.parse(date) - Date.parse(lastBarca) >= 6 * 86400_000)
  const next = (barcaDue ? unused.find((x) => x.tag === 'barca') : unused.find((x) => x.tag !== 'barca')) ?? unused[0]
  if (!next) { await log(env, date, 'tale-generate', false, 'subject bank exhausted — add subjects to worker/src/tales.ts'); return 'subject bank exhausted' }
  if (next.tag === 'barca') await env.CACHE.put('auto:tales:barca:last', date)
  await env.CACHE.put('auto:tales:subjects_done', JSON.stringify([...used, next.id]))
  await env.CACHE.put('auto:tale:gen', JSON.stringify({ subject: next.subject, brief: next.brief, stage: 'en', startedAt: Date.now(), barca: next.tag === 'barca' } as TaleGen), { expirationTtl: 3600 })
  await log(env, date, 'tale-generate', true, `supply: drafting "${next.subject}" (reserve ${reserve})`)
  return `drafting "${next.subject}"`
}

/** Per-minute entry point (from scheduled()). Cheap when idle. */
export async function runAutomationTick(env: Env): Promise<void> {
  const { date, hour, minute, label } = localParts()
  // Keep the free Render instance awake (it spins down after 15 min idle)
  // — a ping every 5 min from the cron replaces UptimeRobot. Fire-and-
  // forget, and independent of the master switch so the studio is warm
  // the moment Mehdi flips it on.
  if (env.STUDIO_URL && minute % 5 === 0) {
    fetch(`${env.STUDIO_URL}/health`, { headers: { 'user-agent': 'p90-worker/1.0' }, signal: AbortSignal.timeout(20000) }).catch(() => {})
  }
  const s = await loadAutomationSettings(env)
  if (!s.enabled) return
  try { await processPendingComments(env, date) } catch (e) { await log(env, date, 'link-comment', false, String(e)) }
  if (minute % 3 === 0) { try { await processRepublishQueue(env, date, label) } catch (e) { await log(env, date, 'republish', false, String(e)) } }
  if (s.matchday && hour >= s.morningHour && hour < s.morningHour + 8) {
    const claim = `auto:matchday:${date}`
    if (!(await env.CACHE.get(claim))) {
      await env.CACHE.put(claim, 'running', { expirationTtl: 36 * 3600 })
      try { await runMatchday(env, s, date, label) } catch (e) { await log(env, date, 'matchday', false, String(e)) }
    }
  }
  if (s.ftPosts) {
    try { await runFtPosts(env, s, date) } catch (e) { await log(env, date, 'ft-post', false, String(e)) }
  }
  try { await runGoalAlerts(env, s, date) } catch (e) { await log(env, date, 'goal-reel', false, String(e)) }
  try { await runBarcaLineups(env, s, date) } catch (e) { await log(env, date, 'barca-lineup', false, String(e)) }
  if (hour === 8 && minute >= 20 && minute <= 34) { try { await runBarcaArticle(env, s, date, hour, minute) } catch (e) { await log(env, date, 'barca-article', false, String(e)) } }
  if (hour === 9 && minute <= 9) { try { await runBarcaDigest(env, s, date, hour, minute) } catch (e) { await log(env, date, 'barca-digest', false, String(e)) } }
  if (hour === 7 && minute >= 30 && minute <= 44) {
    const y = yesterdayParts()
    try { await runResultsReel(env, s, date, y.label, hour, minute, false, y.date) } catch (e) { await log(env, date, 'results-reel', false, String(e)) }
  }
  if (minute === 7) { try { await checkTokenAndAlert(env, date, 'au contrôle horaire') } catch (e) { await log(env, date, 'token-alert', false, String(e)) } }
  try { await processTaleQueue(env, date) } catch (e) { await log(env, date, 'tale-reel', false, String(e)) }
  try { await processReelQueue(env, date) } catch (e) { await log(env, date, 'tale-reel', false, String(e)) }
  if (s.goalAnim) { try { await processGoalAnim(env, s, date) } catch (e) { await log(env, date, 'goal-anim', false, String(e)) } }
  try { await processTaleGeneration(env, date) } catch (e) { await log(env, date, 'tale-generate', false, String(e)) }
  try { await runTales(env, s, date, hour, minute) } catch (e) { await log(env, date, 'tale', false, String(e)) }
  try { await runTaleSupply(env, s, date, hour, minute) } catch (e) { await log(env, date, 'tale-generate', false, String(e)) }
  if (hour === 4) {
    const claim = `auto:cleanup:${date}`
    if (!(await env.CACHE.get(claim))) {
      await env.CACHE.put(claim, '1', { expirationTtl: 36 * 3600 })
      try { const n = await cleanupMedia(env, 7); await log(env, date, 'cleanup', true, `${n} old media files deleted`) } catch (e) { await log(env, date, 'cleanup', false, String(e)) }
      try {
        const r = await refreshUserToken(env)
        await log(env, date, 'fb-token', true, r)
        if (r.startsWith('renewed')) await sendMail(env, '✅ Token Facebook renouvelé automatiquement', tokenMailHtml('Token renouvelé', [`Le worker a renouvelé le token : ${r}.`, 'Rien à faire.'], await fbTokenStatus(env).catch(() => null)))
      } catch (e) { await log(env, date, 'fb-token', false, String(e)) }
      try { await log(env, date, 'token-alert', true, await checkTokenAndAlert(env, date, 'au contrôle de nuit')) } catch (e) { await log(env, date, 'token-alert', false, String(e)) }
    }
  }
}

/** Admin "run now" — bypasses the daily claims so a job can be re-tested. */
export async function runJobNow(env: Env, job: string, extra: Record<string, unknown> = {}): Promise<{ ok: boolean; note: string }> {
  const s = await loadAutomationSettings(env)
  const { date, label } = localParts()
  try {
    if (job === 'matchday') { await env.CACHE.put(`auto:matchday:${date}`, 'running', { expirationTtl: 36 * 3600 }); await runMatchday(env, s, date, label); return { ok: true, note: 'matchday run — see log' } }
    if (job === 'ft') { await env.CACHE.delete('auto:lastpost'); await runFtPosts(env, s, date, true); return { ok: true, note: 'ft pass run — see log' } }
    if (job === 'ft-flush') { await env.CACHE.delete('auto:lastpost'); await runFtPosts(env, s, date, true, true); return { ok: true, note: `grouped FT post forced — see log (pending: ${(await ftPending(env, date)).length})` } }
    if (job === 'ft-pending') { return { ok: true, note: JSON.stringify(await ftPending(env, date)).slice(0, 3000) } }
    if (job === 'cleanup') { const n = await cleanupMedia(env, 7); return { ok: true, note: `${n} files deleted` } }
    if (job === 'test-image') {
      const pool = await bigMatchesToday(env)
      const m = pool[0]
      const url = m
        ? await renderImage(env, 'score', { home: m.home, away: m.away, homeLogo: m.homeLogo, awayLogo: m.awayLogo, homeScore: m.homeScore, awayScore: m.awayScore, league: m.league, venue: m.venue, status: 'FT' })
        : await renderImage(env, 'score', { home: 'Morocco', away: 'France', homeLogo: null, awayLogo: null, homeScore: 2, awayScore: 1, league: 'International friendly', status: 'FT' })
      await log(env, date, 'test-image', true, url)
      return { ok: true, note: url }
    }
    if (job === 'news') {
      // Run the article pipeline once (same as the 2-hourly cron).
      const { runNewsPipeline } = await import('./news')
      const report = await runNewsPipeline(env, { skipEmail: s.enabled && s.articles })
      if (s.enabled && s.articles && report.inserted?.id) await maybeAutoPublishArticle(env, report.inserted.id)
      return { ok: report.ok, note: `${report.ok ? 'produced' : 'no article'} · winner: ${report.winner ? report.winner.source + ' — ' + report.winner.title.slice(0, 60) : 'none'} · sources: ${JSON.stringify(report.rssBySource)} · ${report.notes.join(' | ').slice(0, 700)}${report.error ? ' · ERROR ' + report.error : ''}` }
    }
    if (job === 'archive') {
      // Unpublish an article by slug (site side).
      const slug = String((extra as { slug?: string }).slug ?? '')
      if (!slug) return { ok: false, note: 'slug required' }
      const u = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}`, {
        method: 'PATCH', headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'return=representation' }),
        body: JSON.stringify({ status: 'archived', archived_at: new Date().toISOString() }),
      })
      const rows = await u.json().catch(() => []) as unknown[]
      return { ok: u.ok && rows.length > 0, note: u.ok ? `${rows.length} article(s) archived` : `supabase ${u.status}` }
    }
    if (job === 'fb-get') {
      // Raw Graph READ with the page token (diagnostics only): { path, fields, limit }
      const { token } = await pageAuth(env)
      const path = String(extra.path ?? '')
      if (!/^\/[A-Za-z0-9_\/.-]+$/.test(path)) return { ok: false, note: 'bad path' }
      const q: Record<string, string> = {}
      if (extra.fields) q.fields = String(extra.fields)
      if (extra.limit) q.limit = String(extra.limit)
      for (const [k, v] of Object.entries((extra.params as Record<string, unknown> | undefined) ?? {})) q[k] = String(v)
      const j = await graph(env, token, 'GET', path, q).catch((e) => ({ error: String(e) }))
      return { ok: !('error' in j), note: JSON.stringify(j).slice(0, 12000) }
    }
    if (job === 'articles-recent') {
      // Diagnostics: last published articles (optionally matching q in the title): { q?, limit? }
      const q = String((extra as { q?: string }).q ?? '').trim(); const limit = Math.min(20, Number((extra as { limit?: number }).limit ?? 8))
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=slug,title,title_ar,image_url,published_at,source_name&status=eq.published${q ? `&or=(title.ilike.*${encodeURIComponent(q)}*,title_ar.ilike.*${encodeURIComponent(q)}*)` : ''}&order=published_at.desc&limit=${limit}`, { headers: sbHeaders(env) })
      return { ok: true, note: JSON.stringify(await r.json().catch(() => [])).slice(0, 6000) }
    }
    if (job === 'fb-page-update') {
      // Page profile changes — needs pages_manage_metadata (granted 2026-09-13): { about?, website?, picture_url?, cover_url? }
      const { id: pid, token } = await pageAuth(env)
      const x = extra as { about?: string; website?: string; picture_url?: string; cover_url?: string; cover_caption?: string }
      const out: string[] = []
      const call = (method: 'POST', path: string, params: Record<string, string>) => graph(env, token, method, path, params).then((j) => j as Record<string, unknown>).catch((e) => ({ error: String(e) } as Record<string, unknown>))
      if (x.about || x.website) {
        const params: Record<string, string> = {}
        if (x.about) params.about = String(x.about).slice(0, 255)
        if (x.website) params.website = String(x.website)
        const j = await call('POST', `/${pid}`, params); out.push(`about/website: ${j.error ? String(j.error) : 'ok'}`)
      }
      if (x.picture_url) {
        // Facebook could not fetch the picture by URL (2026-09-13, "(#1) Could not fetch picture") → multipart upload of the bytes.
        try {
          const r = await fetch(String(x.picture_url), { headers: { 'user-agent': 'p90-worker/1.0' } })
          if (!r.ok) throw new Error(`image fetch ${r.status}`)
          const fd = new FormData()
          fd.append('source', new Blob([await r.arrayBuffer()], { type: r.headers.get('content-type') ?? 'image/png' }), 'profile.png')
          fd.append('access_token', token)
          const g = await fetch(`${GRAPH}/${pid}/picture`, { method: 'POST', body: fd })
          const j = await g.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
          out.push(`picture: ${g.ok && !j.error ? 'ok' : `error ${g.status} ${j.error?.message ?? ''}`.trim()}`)
        } catch (e) { out.push(`picture: error ${String(e).slice(0, 120)}`) }
      }
      if (x.cover_url) {
        const ph = await call('POST', `/${pid}/photos`, { url: String(x.cover_url), published: 'false', ...(x.cover_caption ? { caption: String(x.cover_caption).slice(0, 2000) } : {}) })   // caption = photo credits / legal (2026-09-14)
        if (ph.error || !ph.id) out.push(`cover upload: ${String(ph.error ?? 'no id')}`)
        else { const j = await call('POST', `/${pid}`, { cover: String(ph.id), offset_y: '0', no_feed_story: 'true' }); out.push(`cover: ${j.error ? String(j.error) : 'ok'}`) }
      }
      await log(env, date, 'fb-page-update', !out.some((s) => /error|\(#/i.test(s)), out.join(' · ').slice(0, 280))
      return { ok: !out.some((s) => /error|\(#/i.test(s)), note: out.join(' · ') }
    }
    if (job === 'fb-reels') {
      // Diagnostic: what Facebook says about the page's reels (processing
      // status, publishing phase, permalink, views) + specific ids.
      const { id: pid, token } = await pageAuth(env)
      const fields = 'id,updated_time,description,status,permalink_url,views,post_id,published,length'
      const list = await graph(env, token, 'GET', `/${pid}/video_reels`, { fields, limit: String(extra.limit ?? 12) }).catch((e) => ({ error: String(e) }))
      const ids = String(extra.ids ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      const details: Record<string, unknown> = {}
      for (const id of ids.slice(0, 8)) details[id] = await graph(env, token, 'GET', `/${id}`, { fields }).catch((e) => ({ error: String(e) }))
      return { ok: true, note: JSON.stringify({ list, details }).slice(0, 6000) }
    }
    if (job === 'fb-posts') {
      const { id: pid, token } = await pageAuth(env)
      const j = await graph(env, token, 'GET', `/${pid}/posts`, { fields: 'id,message,created_time', limit: '15' })
      const rows = (j.data as Array<{ id: string; message?: string; created_time: string }> | undefined) ?? []
      return { ok: true, note: rows.map((p) => `${p.created_time.slice(11, 16)} ${p.id} — ${(p.message ?? '').replace(/\s+/g, ' ').slice(0, 60)}`).join(' || ') }
    }
    if (job === 'fb-delete-videos') {
      // Delete page VIDEOS/reels by id (DELETE /{video_id}), max 15 — Mehdi's explicit request only.
      const ids = String((extra as { ids?: string }).ids ?? '').split(',').map((x) => x.trim()).filter((x) => /^\d{6,}$/.test(x)).slice(0, 15)
      if (!ids.length) return { ok: false, note: 'ids required' }
      const { token } = await pageAuth(env)
      const out: string[] = []
      for (const id of ids) {
        const d = await fetch(`${GRAPH}/${id}?access_token=${encodeURIComponent(token)}`, { method: 'DELETE' })
        const dj = await d.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
        out.push(`${id}: ${dj.success ? 'deleted' : 'FAILED ' + (dj.error?.message ?? d.status)}`)
      }
      const { date } = localParts()
      await log(env, date, 'fb-delete-videos', out.every((x) => x.includes('deleted')), out.join(' · '))
      return { ok: out.every((x) => x.includes('deleted')), note: out.join(' · ') }
    }
    if (job === 'fb-delete') {
      // Delete ONE page post whose message contains `contains` (exact ops use only).
      const contains = String((extra as { contains?: string }).contains ?? '').trim()
      const wantId = String((extra as { id?: string }).id ?? '').trim()
      if (contains.length < 6 && !wantId) return { ok: false, note: 'contains (≥6 chars) or id required' }
      const { id: pid, token } = await pageAuth(env)
      const j = await graph(env, token, 'GET', `/${pid}/posts`, { fields: 'id,message,created_time', limit: '25' })
      const rows = (j.data as Array<{ id: string; message?: string }> | undefined) ?? []
      const hit = wantId ? rows.find((p) => p.id === wantId) : rows.find((p) => (p.message ?? '').toLowerCase().includes(contains.toLowerCase()))
      if (!hit) return { ok: false, note: `no recent post contains "${contains}"` }
      const d = await fetch(`${GRAPH}/${hit.id}?access_token=${encodeURIComponent(token)}`, { method: 'DELETE' })
      const dj = await d.json().catch(() => ({})) as { success?: boolean; error?: { message?: string } }
      return { ok: !!dj.success, note: dj.success ? `deleted post ${hit.id} ("${(hit.message ?? '').slice(0, 50)}")` : `delete failed: ${dj.error?.message ?? d.status}` }
    }
    if (job === 'articles') {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=slug,image_url,source_name,source_url,status,created_at&order=created_at.desc&limit=${Number((extra as { limit?: number }).limit ?? 10)}`, { headers: sbHeaders(env) })
      return { ok: r.ok, note: JSON.stringify(await r.json().catch(() => [])) }
    }
    if (job === 'refresh-images') {
      const { refreshArticleImages } = await import('./news')
      const since = String((extra as { since?: string }).since ?? new Date(Date.now() - 36 * 3600_000).toISOString())
      return { ok: true, note: await refreshArticleImages(env, since, Number((extra as { limit?: number }).limit ?? 5)) }
    }
    if (job === 'reel') {
      // Match-day reel only (no post/stories) — e.g. to re-publish after a fix.
      const pool = await bigMatchesToday(env)
      if (pool.length === 0) return { ok: false, note: 'no big matches today' }
      await queueMatchdayReel(env, date, label, pool)
      return { ok: true, note: 'reel queued — result in the log in a few minutes' }
    }
    if (job === 'article-reel') {
      // Reel of the two latest published articles (test / manual trigger).
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=title,slug,image_url,excerpt&status=eq.published&order=published_at.desc&limit=${ARTICLES_PER_REEL}`, { headers: sbHeaders(env) })
      const list = await r.json().catch(() => []) as QueuedArticle[]
      if (list.length < 1) return { ok: false, note: 'no published articles' }
      await queueArticlesReel(env, date, list)
      return { ok: true, note: `article reel queued: ${list.map((x) => x.title.slice(0, 40)).join(' + ')}` }
    }
    if (job === 'fb-comment') {
      const id = String((extra as { id?: string }).id ?? ''); const message = String((extra as { message?: string }).message ?? '')
      if (!id || !message) return { ok: false, note: 'id + message required' }
      const c = await fbComment(env, id, message)
      return { ok: c.ok, note: c.note ?? '' }
    }
    if (job === 'fb-comment-edit') {
      const id = String((extra as { id?: string }).id ?? ''); const message = String((extra as { message?: string }).message ?? '')
      if (!id || !message) return { ok: false, note: 'id + message required' }
      try { const { token } = await pageAuth(env); const j = await graph(env, token, 'POST', `/${id}`, { message }); return { ok: true, note: `edited ${JSON.stringify(j).slice(0, 80)}` } }
      catch (e) { return { ok: false, note: String(e) } }
    }
    if (job === 'story-kit') {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=title,slug,image_url&status=eq.published&order=published_at.desc&limit=1`, { headers: sbHeaders(env) })
      const art = ((await r.json().catch(() => [])) as Array<{ title: string; slug: string; image_url: string | null }>)[0]
      if (!art) return { ok: false, note: 'no published article' }
      await queueStoryKit(env, date, art)
      return { ok: true, note: `kit queued for "${art.title.slice(0, 50)}" — e-mail in ~1 min` }
    }
    if (job === 'slot') {
      const slot = await articleSlotOpen(env, s)
      return { ok: true, note: `article slot: ${slot.open ? 'OPEN' : 'closed — ' + slot.why}` }
    }
    if (job === 'backfill-comments') {
      // Every recent Page post/reel gets a link comment if it has none:
      // article posts → article link, match-day / full-time posts → /today.
      const { id: pid, token } = await pageAuth(env)
      const lim = String(Math.min(12, Number((extra as { limit?: number }).limit ?? 8)))
      const after = String((extra as { after?: string }).after ?? '')
      const page = await graph(env, token, 'GET', `/${pid}/posts`, { fields: 'id,message,created_time', limit: lim, ...(after ? { after } : {}) })
      const posts = (page.data ?? []) as Array<{ id: string; message?: string; created_time: string }>
      const nextCursor = (page.paging as { cursors?: { after?: string } } | undefined)?.cursors?.after ?? ''
      const ar = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=title,slug&status=eq.published&order=published_at.desc&limit=60`, { headers: sbHeaders(env) })
      const articles = await ar.json().catch(() => []) as Array<{ title: string; slug: string }>
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      const out: string[] = []
      for (const p of posts) {
        const msg = p.message ?? ''
        const first = msg.split('\n')[0].trim()
        let comment: string | null = null
        const m = msg.match(/https:\/\/pressing90\.live\/news\/[a-z0-9-]+/i)
        if (m) comment = `📰 Read the full article: ${m[0]}?ref=fb`
        else if (/TODAY'S MATCHES|Today's matches|FULL TIME|مباريات اليوم|نهاية المباراة|نتائج اليوم/i.test(first)) comment = /FULL TIME|نهاية المباراة|نتائج اليوم/i.test(first) ? `👉 كل نتائج اليوم: ${SITE}/today?lang=ar&ref=fb` : `⚽ النتائج المباشرة والتشكيلات: ${SITE}/today?lang=ar&ref=fb`
        else {
          const hit = articles.find((x) => norm(x.title) === norm(first) || (norm(first).length > 20 && norm(x.title).startsWith(norm(first).slice(0, 40))))
          if (hit) comment = `📰 Read the full article: ${SITE}/news/${hit.slug}?ref=fb`
          else { const t = first.replace(/^📰\s*/, ''); const hit2 = articles.find((x) => norm(x.title) === norm(t)); if (hit2) comment = `📰 Read the full article: ${SITE}/news/${hit2.slug}?ref=fb` }
        }
        if (!comment) { out.push(`skip (no link type): ${first.slice(0, 40)}`); continue }
        const existing = ((await graph(env, token, 'GET', `/${p.id}/comments`, { fields: 'message', limit: '25' })).data ?? []) as Array<{ message?: string }>
        if (existing.some((c) => /pressing90\.live/i.test(c.message ?? ''))) { out.push(`has link: ${first.slice(0, 40)}`); continue }
        const c = await fbComment(env, p.id, comment)
        out.push(`${c.ok ? 'COMMENTED' : 'FAILED ' + (c.note ?? '')}: ${first.slice(0, 40)}`)
      }
      return { ok: true, note: out.join(' | ') + (posts.length && nextCursor ? ` || next: after=${nextCursor}` : ' || done') }
    }
    if (job === 'fb-feed') {
      // Visibility check: are today's posts really published & public?
      const { id: pid, token } = await pageAuth(env)
      const j = await graph(env, token, 'GET', `/${pid}/feed`, { fields: 'id,message,created_time,is_published,privacy,status_type,permalink_url', limit: String(Number((extra as { limit?: number }).limit ?? 8)) })
      const rows = (j.data ?? []) as Array<{ id: string; message?: string; created_time: string; is_published?: boolean; privacy?: { value?: string }; status_type?: string; permalink_url?: string }>
      return { ok: true, note: rows.map((p) => `${p.created_time.slice(5, 16)} ${p.is_published ? 'PUB' : 'unpub'} ${p.privacy?.value ?? '?'} ${p.status_type ?? ''} — ${(p.message ?? '').split('\n')[0].slice(0, 45)} — ${p.permalink_url ?? ''}`).join(' || ') }
    }
    if (job === 'republish') {
      // Queue Graph-made posts for re-publication through Make: {ids:[...]}
      const ids = ((extra as { ids?: string[] }).ids ?? []).map(String)
      const { token } = await pageAuth(env)
      const ar = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=title,slug&status=eq.published&order=published_at.desc&limit=60`, { headers: sbHeaders(env) })
      const articles = await ar.json().catch(() => []) as Array<{ title: string; slug: string }>
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      const items: RepublishItem[] = []; const notes: string[] = []
      for (const id of ids) {
        const j = await graph(env, token, 'GET', `/${id}`, { fields: 'message' })
        const first = String(j.message ?? '').split('\n')[0].trim()
        if (/TODAY'S MATCHES/i.test(first)) { items.push({ oldId: id, kind: 'matchday' }); notes.push(`matchday ← ${id}`); continue }
        const hit = articles.find((x) => norm(x.title) === norm(first))
        if (hit) { items.push({ oldId: id, kind: 'article', slug: hit.slug }); notes.push(`${hit.slug} ← ${id}`) } else notes.push(`no match for "${first.slice(0, 40)}"`)
      }
      await enqueueRepublish(env, items)
      return { ok: true, note: `${items.length} queued (1 every 3 min): ${notes.join(' | ')}` }
    }
    if (job === 'fb-post') {
      const id = String((extra as { id?: string }).id ?? '')
      const { token } = await pageAuth(env)
      const j = await graph(env, token, 'GET', `/${id}`, { fields: 'id,created_time,status_type,is_published,permalink_url,attachments{type,media_type,title,subattachments}' })
      return { ok: true, note: JSON.stringify(j).slice(0, 900) }
    }
    if (job === 'fb-comments') {
      const id = String((extra as { id?: string }).id ?? '')
      const { token } = await pageAuth(env)
      const j = await graph(env, token, 'GET', `/${id}/comments`, { fields: 'id,message,from,created_time', limit: '25' })
      return { ok: true, note: JSON.stringify(j.data ?? []).slice(0, 1500) }
    }
    if (job === 'results') {
      // Publish the results reel NOW (posts to FB!) — yesterday's matches by default, { day: 'today' } for today's finished so far.
      const { hour, minute } = localParts()
      const today = String((extra as { day?: string }).day ?? 'yesterday') === 'today'
      const y = yesterdayParts()
      return { ok: true, note: await runResultsReel(env, s, date, today ? label : y.label, hour, minute, true, today ? date : y.date) }
    }
    if (job === 'barca-article') { const { hour, minute } = localParts(); return { ok: true, note: await runBarcaArticle(env, s, date, hour, minute, true) } }
    if (job === 'barca-digest') { const { hour, minute } = localParts(); return { ok: true, note: await runBarcaDigest(env, s, date, hour, minute, true, false) } }
    if (job === 'preview' && String((extra as { type?: string }).type) === 'barca') { const { hour, minute } = localParts(); return { ok: true, note: `${await runBarcaDigest(env, s, date, hour, minute, true, true)} — URL in the log as "preview-barca · PREVIEW ready"` } }
    if (job === 'barca-lineup') { const w = String((extra as { which?: string }).which ?? ''); return { ok: true, note: await runBarcaLineups(env, s, date, true, w === 'predicted' || w === 'confirmed' ? w : undefined) } }
    if (job === 'lineup-seed') {
      // { event, league? } → store that match's Barça XI as the base for the next predicted lineup
      const ev = String((extra as { event?: string }).event ?? ''), slug = String((extra as { league?: string }).league ?? 'esp.1')
      if (!ev) return { ok: false, note: 'event id required' }
      const sum = await matchSummary(env, { id: ev, slug })
      const r = sum.rosters.find((x) => /barcelona|barça/i.test(x.team))
      if (!r || r.players.length < 11) return { ok: false, note: `no Barça XI in event ${ev}` }
      await env.CACHE.put('auto:lineup:last', JSON.stringify({ formation: r.formation, players: r.players, opponent: sum.teams.find((t) => t.side !== r.side)?.name ?? '', date }), { expirationTtl: 30 * 86400 })
      return { ok: true, note: `seeded ${r.formation}: ${r.players.map((p) => p.name).join(', ')}` }
    }
    if (job === 'preview-image' && ['lineup-post', 'fulltime-post'].includes(String((extra as { type?: string }).type))) {
      // Editorial previews from a real ESPN event: { type, event?, league?, predicted? } — default: the last Barça match (yesterday / today)
      const type = String((extra as { type?: string }).type), slug = String((extra as { league?: string }).league ?? 'esp.1')
      let ev = String((extra as { event?: string }).event ?? '')
      let m: AutoMatch | undefined
      if (!ev) {
        const y = yesterdayParts()
        m = (await bigMatchesToday(env, y.date.replace(/-/g, ''))).find((x) => isBarca(x)) ?? (await bigMatchesToday(env)).find((x) => isBarca(x))
        if (!m) return { ok: false, note: 'no Barça match yesterday / today — pass { event }' }
        ev = m.id
      }
      const sum = await matchSummary(env, { id: ev, slug: m?.slug ?? slug })
      if (!m) {
        const th = sum.teams.find((t) => t.side === 'home'), ta = sum.teams.find((t) => t.side === 'away')
        if (!th || !ta) return { ok: false, note: `event ${ev}: no summary` }
        m = { id: ev, rank: 1, league: AUTO_LEAGUES[slug]?.label ?? slug, slug, kickoff: sum.date, state: sum.state === 'post' ? 'post' : 'pre', completed: sum.state === 'post', statusName: '', home: th.name, away: ta.name, homeLogo: th.logo ?? null, awayLogo: ta.logo ?? null, homeScore: th.score ?? '', awayScore: ta.score ?? '', venue: sum.venue }
      }
      if (type === 'fulltime-post') return { ok: true, note: await renderImage(env, 'fulltime-post', ftPosterData(m, sum, 'ar')) }
      const side: 'home' | 'away' = /barcelona|barça/i.test(m.home) ? 'home' : 'away'
      const r = sum.rosters.find((x) => x.side === side)
      if (!r || r.players.length < 11) return { ok: false, note: `event ${ev}: no XI for ${side}` }
      const predicted = String((extra as { predicted?: unknown }).predicted ?? '') === 'true'
      return { ok: true, note: await renderImage(env, 'lineup-post', lineupData(m, side, { formation: r.formation, players: r.players }, predicted, sum.venue)) }
    }
    if (job === 'preview-image') {
      // Synchronous image previews of a Barça day: { type: 'matchday-post' | 'matchday-story' }
      const type = String((extra as { type?: string }).type ?? 'matchday-post')
      let pool = prioritizeBarca(await bigMatchesToday(env), true).slice(0, 6)
      if (!(pool[0] && isBarca(pool[0]))) pool = [fakeBarcaMatch(date), ...pool].slice(0, 6)
      const matches = pool.map((m, i) => (i === 0 ? { ...toDraw(m), feature: true } : toDraw(m)))
      const url = await renderImage(env, type === 'matchday-story' ? 'matchday-story' : 'matchday-post', { matches, dateLabel: label, page: 1, pages: 1, featured: true })
      return { ok: true, note: url }
    }
    if (job === 'preview' && String((extra as { type?: string }).type) === 'barca-goal') {
      // { side: 'home' } = Barça scores (special), { side: 'away' } = the opponent scores (normal card)
      const side = String((extra as { side?: string }).side ?? 'home') === 'away' ? 'away' : 'home'
      const m: AutoMatch = { id: '0', rank: 1, league: 'LaLiga', slug: 'esp.1', kickoff: '', state: 'in', completed: false, statusName: '', home: 'Barcelona', away: 'Real Madrid', homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', awayLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png', homeScore: side === 'home' ? '2' : '1', awayScore: '1' } as unknown as AutoMatch
      const jobId = `preview-barca-goal-${Date.now()}`
      await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'preview', label: 'preview-barca-goal', date }), { expirationTtl: 3600 })
      const g: GoalInfo = side === 'home' ? { scorer: 'Lamine Yamal', minute: "27'", side: 'home', assist: 'Pedri' } : { scorer: 'Kylian Mbappé', minute: "61'", side: 'away', assist: 'Vinícius Júnior' }
      await studio(env, '/render/reel', { type: 'goal', data: { ...goalReelData(m, g), special: side === 'home' ? 'barca' : undefined, cover: side === 'home' ? { text: 'هدف التقدم!', tone: 'barca' } : { text: 'هدف التعادل!', tone: 'goal' } }, seconds: 9, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
      return { ok: true, note: `Barça goal preview queued (job ${jobId}, ${side === 'home' ? 'Barça scores' : 'opponent scores'}) — URL in the log as "preview-barca-goal · PREVIEW ready"` }
    }
    if (job === 'preview' && String((extra as { type?: string }).type) === 'barca-ft') {
      // { result: 'win' | 'draw' | 'loss' } — confetti only on a win
      const res = String((extra as { result?: string }).result ?? 'win')
      const [hs, as] = res === 'loss' ? ['1', '2'] : res === 'draw' ? ['1', '1'] : ['3', '1']
      const m: AutoMatch = { id: '0', rank: 1, league: 'LaLiga', slug: 'esp.1', kickoff: '', state: 'post', completed: true, statusName: 'STATUS_FULL_TIME', home: 'Barcelona', away: 'Real Madrid', homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/83.png', awayLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/86.png', homeScore: hs, awayScore: as } as unknown as AutoMatch
      const jobId = await queueBarcaFtReel(env, date, m, true)
      return { ok: true, note: `Barça FT preview queued (job ${jobId}) — URL in the log as "preview-barca-ft · PREVIEW ready"` }
    }
    if (job === 'results-preview' || job === 'preview') {
      // Render-only previews (never published) — async, URL lands in the log
      // as "<label> · PREVIEW ready". type: matchday | results | articles | goal.
      const type = job === 'results-preview' ? 'results' : String((extra as { type?: string }).type ?? 'matchday')
      const jobId = `preview-${type}-${Date.now()}`
      let payload: Record<string, unknown>
      if (type === 'results') {
        // Mirrors production (2026-09-13): yesterday's finished matches, Arabic heading « نتائج الأمس ».
        const y = yesterdayParts()
        const ypool = (await bigMatchesToday(env, y.date.replace(/-/g, ''))).filter((m) => m.state === 'post' && m.completed)
        const pool = ypool.length ? ypool : await bigMatchesToday(env)
        const finished = pool.filter((m) => m.state === 'post' && m.completed)
        const list = (finished.length ? finished : pool).slice(0, 10)
        if (list.length === 0) return { ok: false, note: 'no match' }
        payload = { type: 'matchday', data: { matches: list.map((m, i) => (i === 0 ? { ...toDrawResult(m), cover: { text: ypool.length ? 'نتائج الأمس: هل فاجأتك؟' : 'نتائج اليوم: هل فاجأتك؟', tone: 'results' } } : toDrawResult(m))), heading: ypool.length ? 'نتائج الأمس' : 'نتائج اليوم', lang: 'ar' }, seconds: Math.max(9, 3 * list.length) }
      } else if (type === 'matchday') {
        let pool = prioritizeBarca(await bigMatchesToday(env), s.barcaDaily).slice(0, 8)
        const wantBarca = (extra as { barca?: boolean }).barca === true
        if (wantBarca && !(pool[0] && isBarca(pool[0]))) pool = [fakeBarcaMatch(date), ...pool].slice(0, 8)   // preview of a Barça day
        const barcaDay = !!s.barcaDaily && pool.length > 0 && isBarca(pool[0])
        if (pool.length === 0) return { ok: false, note: 'no match today' }
        const ar = s.mainLang !== 'en'
        const voiceUrl = (extra as { voice?: boolean }).voice === true ? (ar ? await arabicVoice(env, matchdayScriptAr(pool), `voice-preview-${Date.now()}.mp3`) : await englishVoice(env, matchdayScript(pool, label), `voice-preview-${Date.now()}.mp3`)) : undefined
        const cover = barcaDay ? { text: 'يوم برشلونة: هل يفوز الليلة؟', tone: 'barca' } : { text: 'مباريات اليوم: من يفوز؟', tone: 'matchday' }
        payload = { type: 'matchday', data: { matches: pool.map((m, i) => (i === 0 ? { ...toDraw(m), feature: barcaDay, cover } : toDraw(m))), heading: ar ? 'مباريات اليوم' : undefined, lang: ar ? 'ar' : 'en', special: barcaDay ? 'barca' : undefined }, seconds: 4 * pool.length, voiceUrl }
      } else if (type === 'articles') {
        const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?select=title,slug,image_url,excerpt&status=eq.published&order=published_at.desc&limit=${ARTICLES_PER_REEL}`, { headers: sbHeaders(env) })
        const list = await r.json().catch(() => []) as QueuedArticle[]
        if (list.length < 1) return { ok: false, note: 'no published articles' }
        payload = { type: 'articles', data: { articles: list }, seconds: 10 * list.length }
      } else if (type === 'goal') {
        const m: AutoMatch = { id: '401882891', rank: 7, league: 'LaLiga', slug: 'esp.1', kickoff: '', state: 'in', completed: false, statusName: '', home: 'Celta Vigo', away: 'Getafe', homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/85.png', awayLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/2922.png', homeScore: '0', awayScore: '1', clock: "21'" }
        payload = { type: 'goal', data: { ...goalReelData(m, { scorer: 'Martín Satriano', minute: "21'", side: 'away', assist: 'Borja Mayoral' }), cover: { text: 'هدف التقدم!', tone: 'goal' } }, seconds: 9 }
      } else return { ok: false, note: 'type must be matchday | results | articles | goal' }
      await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'preview', label: `preview-${type}`, date }), { expirationTtl: 3600 })
      await studio(env, '/render/reel', { ...payload, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
      return { ok: true, note: `animated ${type} preview queued (job ${jobId}) — URL in the log as "preview-${type} · PREVIEW ready" in 1-3 min` }
    }
    if (job === 'tales') {
      const list = await listTales(env)
      const q = JSON.parse((await env.CACHE.get('auto:tale:queue')) ?? '[]') as TaleQueueItem[]
      const gen = await env.CACHE.get('auto:tale:gen')
      return { ok: true, note: `bank: ${list.map((t) => `${t.slug}${t.custom ? ' (AI draft)' : ''}${t.needsReview ? ' ⚠ à relire' : ''}${t.hold ? ' ⏸ en attente' : ''}${t.done ? ' ✓' : ''}`).join(' · ')} · queue: ${q.map((x) => `${x.slug}[${x.lang}] at ${new Date(x.at).toISOString().slice(11, 16)}Z`).join(', ') || 'empty'}${gen ? ` · generating: stage ${(JSON.parse(gen) as TaleGen).stage}` : ''} · daily at ${String(s.taleHour).padStart(2, '0')}:00 Morocco · subjects used: ${(JSON.parse((await env.CACHE.get('auto:tales:subjects_done')) ?? '[]') as string[]).length}/${TALE_SUBJECTS.length}` }
    }
    if (job === 'tale-generate') {
      // { subject } free text, or { id } = an entry of the verified subject bank (subject + fact sheet, marked as used)
      const bankId = String((extra as { id?: string }).id ?? '').trim()
      const bank = bankId ? TALE_SUBJECTS.find((x) => x.id === bankId) : undefined
      if (bankId && !bank) return { ok: false, note: `unknown bank id — known: ${TALE_SUBJECTS.map((x) => x.id).join(', ')}` }
      const subject = bank ? bank.subject : String((extra as { subject?: string }).subject ?? '').trim()
      if (subject.length < 6) return { ok: false, note: 'subject required (e.g. "Ali Dia, the fake cousin of George Weah, Southampton 1996")' }
      if (await env.CACHE.get('auto:tale:gen')) return { ok: false, note: 'a story is already being generated — wait for "DRAFT READY" in the log' }
      if (bank) {
        const used = JSON.parse((await env.CACHE.get('auto:tales:subjects_done')) ?? '[]') as string[]
        if (!used.includes(bank.id)) await env.CACHE.put('auto:tales:subjects_done', JSON.stringify([...used, bank.id]))
        if (bank.tag === 'barca') await env.CACHE.put('auto:tales:barca:last', date)
      }
      await env.CACHE.put('auto:tale:gen', JSON.stringify({ subject, brief: bank?.brief, stage: 'en', startedAt: Date.now(), barca: bank?.tag === 'barca' || /barca|barcelona/i.test(subject) } as TaleGen), { expirationTtl: 3600 })
      return { ok: true, note: `generating "${subject}" — EN, then FR, then AR (about 3 minutes); the log says "DRAFT READY" when it is in the list. Check the facts before publishing.` }
    }
    if (job === 'tale-supply') {
      const { hour, minute } = localParts()
      return { ok: true, note: await runTaleSupply(env, s, date, hour, minute, true) }
    }
    if (job === 'tale-queue-fix') {
      // Dedupe the language queue: keep the earliest item per language, drop languages listed in `drop` (comma-separated).
      const drop = String((extra as { drop?: string }).drop ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      const q = JSON.parse((await env.CACHE.get('auto:tale:queue')) ?? '[]') as TaleQueueItem[]
      const seen = new Set<string>(); const next: TaleQueueItem[] = []
      for (const it of [...q].sort((x, y) => x.at - y.at)) { const k = `${it.slug}:${it.lang}`; if (drop.includes(it.lang) || seen.has(k)) continue; seen.add(k); next.push(it) }
      await env.CACHE.put('auto:tale:queue', JSON.stringify(next), { expirationTtl: 2 * 86400 })
      return { ok: true, note: `queue: ${q.length} → ${next.length}: ${next.map((x) => `${x.slug}[${x.lang}] ${new Date(x.at).toISOString().slice(11, 16)}Z`).join(', ') || 'empty'}` }
    }
    if (job === 'tale-subjects-reset') {
      // Put a subject back in the bank (e.g. after deleting a weak draft): { id } or { all: true }
      const id = String((extra as { id?: string }).id ?? '')
      const used = JSON.parse((await env.CACHE.get('auto:tales:subjects_done')) ?? '[]') as string[]
      const next = (extra as { all?: boolean }).all ? [] : used.filter((x) => x !== id)
      await env.CACHE.put('auto:tales:subjects_done', JSON.stringify(next))
      return { ok: true, note: `subjects used: ${next.length}/${TALE_SUBJECTS.length}` }
    }
    if (job === 'tashkeel') {
      // Test: { text } (lines separated by \n) → fully vocalised Arabic
      const lines = String((extra as { text?: string }).text ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
      if (!lines.length) return { ok: false, note: 'text required' }
      const out = await diacritizeArabic(env, lines)
      const kept = out.filter((l, i) => l !== lines[i]).length
      return { ok: kept > 0, note: `vocalised ${kept}/${lines.length} lines (others kept plain because the model altered words)\nDEBUG ${lastTashkeelDebug}\n` + out.join('\n') }
    }
    if (job === 'tale-images') {
      // Attach illustrations / covers / captions to a custom tale: { slug, urls: [...] | "a,b,c", covers?: {ar:[{l1,l2,l3}], en:[...]}, captions?: {ar:[...], en:[...]}, comic?: true }
      const slug = String((extra as { slug?: string }).slug ?? '')
      const raw = (extra as { urls?: unknown }).urls
      const urls = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      const custom = await customTales(env); const t = custom.find((x) => x.slug === slug)
      if (!t) return { ok: false, note: `unknown custom tale ${slug} — known: ${custom.map((x) => x.slug).join(', ')}` }
      const covers = (extra as { covers?: Record<string, TaleCover[]> }).covers, captions = (extra as { captions?: Record<string, string[]> }).captions
      for (const lang of ['en', 'fr', 'ar'] as TaleLang[]) {
        const kinds = ((extra as { kinds?: Record<string, string> }).kinds ?? {}), credits = ((extra as { credits?: Record<string, string> }).credits ?? {})
        t[lang].beats.forEach((b, i) => { if (urls[i]) b.image = { ...(b.image ?? {}), url: urls[i], kind: kinds[String(i)] === 'photo' ? 'photo' : 'comic', credit: credits[String(i)] ?? (kinds[String(i)] === 'photo' ? '' : 'Illustration IA · Pressing 90') } })
        if (covers?.[lang]) t[lang].covers = covers[lang]
        if (captions?.[lang]) t[lang].captions = captions[lang]
      }
      if ((extra as { comic?: boolean }).comic !== false) t.comic = true
      await env.CACHE.put('auto:tales:custom', JSON.stringify(custom))
      return { ok: true, note: `${slug}: ${urls.length} images · covers ${Object.keys(covers ?? {}).join('/') || 'unchanged'} · captions ${Object.keys(captions ?? {}).join('/') || 'unchanged'} · comic ${t.comic}` }
    }
    if (job === 'tale-variants') {
      // Re-run the cover / caption variants (+ illustrations when GEMINI_API_KEY is set) on a custom tale: { slug, images?: false }
      const slug = String((extra as { slug?: string }).slug ?? '')
      const custom = await customTales(env); const t = custom.find((x) => x.slug === slug)
      if (!t) return { ok: false, note: `unknown custom tale ${slug}` }
      const notes: string[] = []
      for (const lang of ['ar', 'en'] as TaleLang[]) { try { const v = await taleVariantsAI(env, t[lang], lang); t[lang].covers = v.covers; t[lang].captions = v.captions; notes.push(`${lang}: ${v.covers.length} covers / ${v.captions.length} captions`) } catch (e) { notes.push(`${lang}: ${String(e).slice(0, 80)}`) } }
      await env.CACHE.put('auto:tales:custom', JSON.stringify(custom))
      if ((extra as { images?: boolean }).images !== false) { const n = await illustrateTale(env, t, (extra as { force?: boolean }).force === true); if (n > 0) { t.comic = true; await env.CACHE.put('auto:tales:custom', JSON.stringify(custom)) } notes.push(`illustrations: ${n}`) }
      return { ok: true, note: notes.join(' · ') }
    }
    if (job === 'gemini-test') {
      // Diagnostic: { key?: 1|2, n?: 1..40 } → n images in a row with that key (measures the free-tier ceiling); returns the last URL or the error
      const only = Number((extra as { key?: number }).key ?? 0) || undefined, n = Math.max(1, Math.min(40, Number((extra as { n?: number }).n ?? 1)))
      if (!geminiKeys(env).length) return { ok: false, note: 'no GEMINI_API_KEY in the worker' }
      let url = '', done = 0
      try {
        for (let i = 0; i < n; i++) {
          const buf = await comicImage(env, `${COMIC_STYLE} Scene: ${String((extra as { prompt?: string }).prompt ?? 'a goalkeeper diving to save a penalty in a vintage stadium')} (variation ${i + 1})`, only)
          if (!buf) break
          url = await putMedia(env, `gemini-test-${Date.now()}.png`, buf, 'image/png'); done++
        }
        return { ok: true, note: `${done}/${n} image(s) ok · last: ${url}` }
      } catch (e) { return { ok: done > 0, note: `${done}/${n} image(s) ok, then: ${String(e).slice(0, 220)}${url ? ` · last: ${url}` : ''}` } }
    }
    if (job === 'flux-test') {
      const buf = await fluxImage(env, `${COMIC_STYLE} Scene: ${String((extra as { prompt?: string }).prompt ?? 'a goalkeeper diving to save a penalty in a vintage stadium at night')}`)
      if (!buf) return { ok: false, note: 'Workers AI returned no image (AI binding?)' }
      return { ok: true, note: await putMedia(env, `flux-test-${Date.now()}.png`, buf, 'image/png') }
    }
    if (job === 'reel-publish') {
      // Publish an already rendered video as a Facebook reel: { url, description?, title? } — goal analyses rendered off-line (Mehdi, 2026-09-18)
      const x = extra as { url?: string; description?: string; title?: string }
      if (!x.url || !/^https:\/\//.test(String(x.url))) return { ok: false, note: 'https url required' }
      const r = await fbReel(env, { video_url: String(x.url), description: String(x.description ?? ''), title: String(x.title ?? '') })
      const note = `${r.ok ? 'published' : 'failed'} ${r.id ?? ''} ${r.note ?? ''}`.trim()
      await log(env, date, 'reel-publish', r.ok, note)
      return { ok: r.ok, note }
    }
    if (job === 'goal-anim') {
      // Queue a goal recreation for one match: { event, slug, preview?: boolean, fps?: number, goal?: playId, force?: boolean }. Names/logos come from the ESPN summary when the match is not in today's pool.
      const x = extra as { event?: string; slug?: string; preview?: boolean; fps?: number; goal?: string; force?: boolean }
      const id = String(x.event ?? '').replace(/[^0-9]/g, ''); if (!id) return { ok: false, note: 'event id required' }
      const pool = await bigMatchesToday(env)
      const pm = pool.find((mm) => mm.id === id)
      const slug = String(x.slug ?? pm?.slug ?? ''); if (!slug) return { ok: false, note: 'slug required (e.g. esp.1) when the match is not in today\'s pool' }
      const sum = await matchSummary(env, { id, slug }, true)
      const home = sum.teams.find((t) => t.side === 'home'), away = sum.teams.find((t) => t.side === 'away')
      if (!pm && (!home || !away)) return { ok: false, note: `no summary for ${slug} ${id}` }
      const item: GoalAnimItem = { id, slug, league: pm?.league ?? slug, home: pm?.home ?? home!.name, away: pm?.away ?? away!.name, homeLogo: pm?.homeLogo ?? (home?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${home.id}.png` : null), awayLogo: pm?.awayLogo ?? (away?.id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${away.id}.png` : null), homeScore: pm?.homeScore ?? String(home?.score ?? ''), awayScore: pm?.awayScore ?? String(away?.score ?? ''), venue: pm?.venue ?? sum.venue, addedAt: Date.now(), preview: x.preview !== false, fps: x.fps, goalId: x.goal, force: x.force !== false }
      const best = pickBestGoal(sum, item, x.goal)
      const queued = await enqueueGoalAnim(env, date, item)
      return { ok: true, note: `${queued ? 'queued' : 'already queued/done'}: ${item.home} v ${item.away} — best goal ${best ? `${best.scorer} ${best.minute} (${best.text?.slice(0, 80)})` : 'none with coordinates'} — ${item.preview ? 'PREVIEW (not published)' : 'will be published'}; next tick starts it` }
    }
    if (job === 'goal-anim-tick') { return { ok: true, note: await processGoalAnim(env, s, date, true) } }
    if (job === 'goal-anim-status') { const j = await goalAnimJob(env); const q = await goalAnimQueue(env, date); return { ok: true, note: `job: ${j ? `${j.stage} ${j.item.home} v ${j.item.away} (${Math.round((Date.now() - j.startedAt) / 60000)} min)` : 'none'} · queue: ${q.map((i) => `${i.home} v ${i.away}${i.preview ? ' (preview)' : ''}`).join(', ') || 'empty'} · today ${await getCount(env, date, 'goalanim')} published` } }
    if (job === 'goal-anim-reset') { await resetGoalAnim(env); return { ok: true, note: 'goal-anim job cleared' } }
    if (job === 'goal-anim-scene') {
      // Debug: the scene spec + storyboard the choreographer would build (no render): { event, slug, goal? }
      const x = extra as { event?: string; slug?: string; goal?: string }
      const id = String(x.event ?? '').replace(/[^0-9]/g, ''), slug = String(x.slug ?? '')
      const sum = await matchSummary(env, { id, slug }, true)
      const home = sum.teams.find((t) => t.side === 'home'), away = sum.teams.find((t) => t.side === 'away')
      const item: GoalAnimItem = { id, slug, league: slug, home: home?.name ?? 'Home', away: away?.name ?? 'Away', homeLogo: null, awayLogo: null, homeScore: String(home?.score ?? ''), awayScore: String(away?.score ?? ''), addedAt: Date.now() }
      const best = pickBestGoal(sum, item, x.goal); if (!best) return { ok: false, note: 'no goal with coordinates' }
      const sc = buildScene(item, sum, best)
      return { ok: true, note: JSON.stringify({ meta: sc.meta, storyboard: sc.storyboard, actors: Object.fromEntries(Object.entries(sc.spec.actors as Record<string, { number: string; name: string; keys: unknown[] }>).map(([k, a]) => [k, `${a.number} ${a.name} (${a.keys.length} keys)`])), anchors: sc.spec.anchors }).slice(0, 3000) }
    }
    if (job === 'tale-put') {
      // Create / replace a hand-written custom tale: { tale: Tale } (en + ar required; fr defaults to en)
      const t = (extra as { tale?: Partial<Tale> }).tale
      if (!t || !t.slug || !t.en || !t.ar) return { ok: false, note: 'tale {slug, year, en, ar} required' }
      const tale: Tale = { slug: String(t.slug), year: String(t.year ?? ''), en: validateTaleText(t.en, 'en'), ar: validateTaleText(t.ar, 'ar'), fr: validateTaleText(t.fr ?? t.en, 'fr'), subject: t.subject, ...(t.barca ? { barca: true } : {}), ...(t.comic ? { comic: true } : {}) }
      const custom = (await customTales(env)).filter((x) => x.slug !== tale.slug); custom.push(tale)
      await env.CACHE.put('auto:tales:custom', JSON.stringify(custom.slice(-30)))
      return { ok: true, note: `${tale.slug} saved (${tale.en.beats.length} beats)` }
    }
    if (job === 'tale-set') {
      // Manual edit of a custom tale: { slug, lang, patch: { title?, hook?, caption?, question?, beats?: [{ kicker?, caption?, voice? } per index] } }
      const slug = String((extra as { slug?: string }).slug ?? ''); const lang = String((extra as { lang?: string }).lang ?? 'ar') as TaleLang
      const patch = ((extra as { patch?: Record<string, unknown> }).patch ?? {}) as Partial<TaleText> & { beats?: Array<Partial<{ kicker: string; caption: string; voice: string }> | null> }
      const custom = await customTales(env); const t = custom.find((x) => x.slug === slug)
      if (!t) return { ok: false, note: `unknown custom tale ${slug}` }
      const tx = t[lang]
      for (const k of ['title', 'hook', 'caption', 'question', 'excerpt'] as const) if (typeof patch[k] === 'string') (tx as unknown as Record<string, string>)[k] = patch[k] as string
      if (Array.isArray(patch.beats)) patch.beats.forEach((b, i) => { if (b && tx.beats[i]) { if (typeof b.kicker === 'string') tx.beats[i].kicker = b.kicker; if (typeof b.caption === 'string') tx.beats[i].caption = b.caption; if (typeof b.voice === 'string') tx.beats[i].voice = b.voice } })
      delete t.needsReview
      await env.CACHE.put('auto:tales:custom', JSON.stringify(custom))
      return { ok: true, note: `${slug} [${lang}] updated: ${Object.keys(patch).join(', ')}` }
    }
    if (job === 'tale-get') {
      const slug = String((extra as { slug?: string }).slug ?? ''); const lang = String((extra as { lang?: string }).lang ?? 'ar') as TaleLang
      const t = (await allTales(env)).find((x) => x.slug === slug)
      if (!t) return { ok: false, note: `unknown tale ${slug}` }
      const tx = t[lang]
      return { ok: true, note: JSON.stringify({ slug: t.slug, comic: !!t.comic, needsReview: t.needsReview, title: tx.title, hook: tx.hook, caption: tx.caption, question: tx.question, covers: tx.covers, captions: tx.captions, beats: tx.beats.map((b) => ({ kicker: b.kicker, caption: b.caption, voice: b.voice, visual: b.visual?.type, image: b.image?.url })) }).slice(0, 12000) }
    }
    if (job === 'tale-hold') {
      // Keep an AI draft for a later day (or release it): { slug, hold: true|false }
      const slug = String((extra as { slug?: string }).slug ?? ''); const hold = (extra as { hold?: boolean }).hold !== false
      const custom = await customTales(env); const t = custom.find((x) => x.slug === slug)
      if (!t) return { ok: false, note: 'unknown AI draft slug' }
      t.hold = hold; await env.CACHE.put('auto:tales:custom', JSON.stringify(custom.slice(-20)))
      return { ok: true, note: `${slug} ${hold ? 'held for a later day ⏸' : 'released ▶'}` }
    }
    if (job === 'tale-pin') {
      // The story of the day for the next 11:00 run: { slug } (empty = clear)
      const slug = String((extra as { slug?: string }).slug ?? '')
      if (!slug) { await env.CACHE.delete('auto:tale:pin'); return { ok: true, note: 'pin cleared' } }
      if (!(await nextTale(env, [], slug))) return { ok: false, note: 'unknown slug' }
      await env.CACHE.put('auto:tale:pin', slug, { expirationTtl: 3 * 86400 })
      return { ok: true, note: `${slug} pinned as the next story of the day` }
    }
    if (job === 'tale-polish') {
      // Re-run the Arabic editor pass on an AI draft (audit 2026-09-13): { slug } — result in the log as "DRAFT READY".
      const slug = String((extra as { slug?: string }).slug ?? '')
      const t = (await customTales(env)).find((x) => x.slug === slug)
      if (!t) return { ok: false, note: 'unknown AI draft slug (only 🤖 drafts can be re-polished)' }
      if (await env.CACHE.get('auto:tale:gen')) return { ok: false, note: 'a generation is already running — wait for it to finish' }
      await env.CACHE.put('auto:tale:gen', JSON.stringify({ subject: t.en.title, stage: 'ar-polish', en: t.en, fr: t.fr, ar: t.ar, slug: t.slug, year: t.year, startedAt: Date.now(), retries: 0 } as TaleGen), { expirationTtl: 3600 })
      return { ok: true, note: `Arabic polish queued for ${slug} — "DRAFT READY" in the log in 1-4 min (up to 3 editor passes)` }
    }
    if (job === 'tale-show') {
      // Read a story's text (for review): { slug, lang = 'en' }
      const t = await nextTale(env, [], String((extra as { slug?: string }).slug ?? ''))
      if (!t) return { ok: false, note: 'unknown slug' }
      const lang = (String((extra as { lang?: string }).lang ?? 'en') as TaleLang)
      const tx = t[lang]
      const lines = [`TITLE: ${tx.title}`, `CAPTION: ${tx.caption}`, `QUESTION: ${tx.question}`, ...tx.beats.map((b, i) => `${i + 1}. [${b.kicker}] ${b.caption.replace(/\n/g, ' / ')} — VOICE: ${b.voice} — VISUAL: ${b.visual ? JSON.stringify(b.visual) : '-'}`), 'ARTICLE:', ...tx.article]
      return { ok: true, note: lines.join('\n').slice(0, 9000) }
    }
    if (job === 'tale-delete') {
      const slug = String((extra as { slug?: string }).slug ?? '')
      const custom = await customTales(env)
      if (!custom.some((t) => t.slug === slug)) return { ok: false, note: 'only AI drafts can be deleted' }
      await env.CACHE.put('auto:tales:custom', JSON.stringify(custom.filter((t) => t.slug !== slug)))
      return { ok: true, note: `deleted draft ${slug}` }
    }
    if (job === 'tale-next') {
      // Publish the next story NOW (article + AR reel now, FR +90 min, EN +180 min) — posts to FB!
      const gap = (extra as { gap?: number }).gap
      return { ok: true, note: await publishTale(env, date, (extra as { slug?: string }).slug, gap != null ? Number(gap) : undefined) }
    }
    if (job === 'tale-preview') {
      // Render only (never published): { slug?, lang = 'en', voice = false }. voice:true spends ElevenLabs credits.
      const t = (await nextTale(env, [], (extra as { slug?: string }).slug)) ?? TALES[0]
      const lang = (String((extra as { lang?: string }).lang ?? 'en') as TaleLang)
      if (!['en', 'fr', 'ar'].includes(lang)) return { ok: false, note: 'lang must be en | fr | ar' }
      const jobId = await queueTaleReel(env, date, t, lang, { preview: true, voice: (extra as { voice?: boolean }).voice === true })
      return { ok: true, note: `preview ${t.slug} [${lang}] queued (job ${jobId}) — URL in the log as "preview-tale-${lang} · PREVIEW ready" in 3-8 min` }
    }
    if (job === 'eleven-add-voice') {
      // Add a shared library voice to the account (needed once for the Arabic narrator).
      const el = (env as unknown as { ELEVENLABS_API_KEY?: string }).ELEVENLABS_API_KEY
      const voiceId = String((extra as { voiceId?: string }).voiceId ?? TALE_VOICE.ar)
      if (!el) return { ok: false, note: 'ELEVENLABS_API_KEY missing' }
      const sr = await fetch(`https://api.elevenlabs.io/v1/shared-voices?page_size=50&search=${encodeURIComponent(String((extra as { search?: string }).search ?? 'Fahad'))}`, { headers: { 'xi-api-key': el } })
      const sj = await sr.json().catch(() => ({})) as { voices?: Array<{ voice_id: string; public_owner_id: string; name: string }> }
      const v = (sj.voices ?? []).find((x) => x.voice_id === voiceId)
      if (!v) return { ok: false, note: `voice ${voiceId} not found in shared library (${(sj.voices ?? []).length} results)` }
      const ar = await fetch(`https://api.elevenlabs.io/v1/voices/add/${v.public_owner_id}/${v.voice_id}`, { method: 'POST', headers: { 'xi-api-key': el, 'content-type': 'application/json' }, body: JSON.stringify({ new_name: v.name }) })
      const aj = await ar.json().catch(() => ({})) as { voice_id?: string; detail?: unknown }
      return { ok: ar.ok, note: ar.ok ? `added "${v.name}" as ${aj.voice_id}` : `add failed ${ar.status}: ${JSON.stringify(aj.detail ?? aj).slice(0, 200)}` }
    }
    if (job === 'test-goal') {
      // Preview only (no publication): a real goal from yesterday's LaLiga, rendered synchronously.
      const m: AutoMatch = { id: '401882891', rank: 7, league: 'LaLiga', slug: 'esp.1', kickoff: '', state: 'in', completed: false, statusName: '', home: 'Celta Vigo', away: 'Getafe', homeLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/85.png', awayLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/2922.png', homeScore: '0', awayScore: '1', clock: "21'" }
      const g: GoalInfo = { scorer: 'Martín Satriano', minute: "21'", side: 'away', assist: 'Borja Mayoral' }
      const voiceUrl = GOAL_VOICE ? await englishVoice(env, goalScript(m, g), `voice-goal-test-${Date.now()}.mp3`, 'aura') : undefined
      // Animated render takes > 100 s on Render's 0.1 CPU → async, result in the log (kind 'preview', never published).
      const jobId = `preview-goal-${Date.now()}`
      await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'preview', label: 'test-goal', date }), { expirationTtl: 3600 })
      await studio(env, '/render/reel', { type: 'goal', data: goalReelData(m, g), voiceUrl, seconds: 9, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
      return { ok: true, note: `animated goal preview queued (job ${jobId}) — URL appears in the log as "test-goal · PREVIEW ready"` }
    }
    if (job === 'token-check') {
      return { ok: true, note: await checkTokenAndAlert(env, date, 'à la demande (panel admin)') }
    }
    if (job === 'token-mail-test') {
      // Sends the warning mail as it would look (status appended), regardless of expiry.
      const st = await fbTokenStatus(env).catch(() => null)
      const m = await sendMail(env, '🧪 Test — alerte token Facebook (Pressing 90\')', tokenMailHtml('Ceci est un test des alertes token', [
        'Tu recevras ce type de mail : ⚠️ à J-14, J-10, J-7, J-5, J-3, J-2, J-1 et le jour J ; 🚨 immédiatement si Facebook rejette le token (contrôle chaque heure + à la première erreur) ; ✅ quand le worker renouvelle tout seul.',
        st ? `État actuel : ${st.valid ? 'valide' : 'invalide'}, ${st.daysLeft === null ? 'sans expiration connue' : st.daysLeft + ' jours restants'}.` : 'État actuel : indisponible.',
      ], st))
      return { ok: m.ok, note: m.ok ? `test mail sent to ${KIT_EMAIL_TO} (${m.note})` : `mail failed: ${m.note}` }
    }
    if (job === 'fb-refresh') {
      pageAuthCache = null; await env.CACHE.delete('auto:fb:pageauth')
      return { ok: true, note: await refreshUserToken(env) }
    }
    if (job === 'fb-auth') {
      // Diagnostic: which pages + permissions the token actually carries.
      pageAuthCache = null; await env.CACHE.delete('auto:fb:pageauth')
      const tok = await currentUserToken(env).then((t) => t.token).catch(() => env.FB_PAGE_TOKEN ?? '')
      const perms = await fetch(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(tok)}`).then((r) => r.json()).catch(() => ({})) as { data?: Array<{ permission: string; status: string }> }
      const pages = await fetch(`${GRAPH}/me/accounts?fields=id,name&limit=50&access_token=${encodeURIComponent(tok)}`).then((r) => r.json()).catch(() => ({})) as { data?: Array<{ id: string; name: string }>; error?: { message?: string } }
      const a = await pageAuth(env).catch((e) => ({ id: '?', name: String(e), token: '', source: 'page' as const, userExpiresAt: undefined as number | undefined }))
      const exp = a.userExpiresAt ? new Date(a.userExpiresAt).toISOString().slice(0, 10) : (a.source === 'user' ? 'unknown' : 'n/a')
      const rawStored = await env.CACHE.get('auto:fb:usertoken')
      return { ok: a.id !== '?', note: `using page "${a.name}" (${a.id}) via ${a.source} token · long-lived user token: ${rawStored ? 'stored, expires ' + exp : (env.FB_APP_SECRET ? 'not yet exchanged' : 'FB_APP_SECRET missing → cannot extend')} · pages: ${(pages.data ?? []).map((p) => p.name).join(', ') || pages.error?.message || 'none'} · granted: ${(perms.data ?? []).filter((x) => x.status === 'granted').map((x) => x.permission).join(', ') || 'none'}` }
    }
    if (job === 'test-story') {
      const pool = await bigMatchesToday(env)
      const data = { matches: pool.slice(0, 6).map(toDraw), dateLabel: label, page: 1, pages: 1 }
      await queueVideoStory(env, date, 'test-story', 'story-match', data, () => renderImage(env, 'matchday-story', data))
      return { ok: true, note: 'story video queued — result appears in the log in ~1 min' }
    }
    if (job === 'test-video') {
      // Real content, short: today's top-3 matches, 12 s, no voice,
      // signature music. Rendered ASYNC (Render's proxy cuts requests
      // at ~100 s; ffmpeg on 0.1 CPU is slower than that) — the studio
      // calls /studio/callback, which posts through the Make video
      // scenario (or the Reels API when a token exists). Watch the log.
      const pool = await bigMatchesToday(env)
      if (pool.length === 0) return { ok: false, note: 'no big matches today' }
      const top = pool.slice(0, 3)
      const jobId = `testvideo-${date}-${Math.random().toString(36).slice(2, 7)}`
      await env.CACHE.put(`auto:job:${jobId}`, JSON.stringify({ kind: 'reel', date, description: reelCaption(top, label), title: `Today's matches — ${label}` }), { expirationTtl: 6 * 3600 })
      await studio(env, '/render/reel', { type: 'matchday', data: { matches: top.map(toDraw) }, seconds: 12, jobId, callbackUrl: `${WORKER_PUBLIC}/studio/callback` })
      await log(env, date, 'test-video', true, `rendering 3 slides (job ${jobId}) — result appears here when the studio calls back`)
      return { ok: true, note: `queued (job ${jobId}) — check the log in a few minutes` }
    }
    if (job === 'test-voice') {
      const engine = (String((extra as { engine?: string }).engine ?? 'eleven') as VoiceEngine)
      const url = await englishVoice(env, 'Good morning football fans, and welcome to Pressing Ninety! Arsenal edge past Chelsea in a vintage derby win, while Paris FC striker Sinayoko breaks a twenty year old record against Marseille. Read the full stories on pressing ninety dot live.', `voice-test-${engine}-${Date.now()}.mp3`, engine)
      return { ok: true, note: `${engine}: ${url}` }
    }
    return { ok: false, note: 'unknown job' }
  } catch (e) { return { ok: false, note: String(e) } }
}
