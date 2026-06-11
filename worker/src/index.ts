/**
 * WC26 API — Cloudflare Worker
 *
 * Proxies the ESPN public Soccer API for the FIFA World Cup 2026,
 * caches responses in KV with smart TTLs (live=30s, upcoming=1h, finished=∞),
 * and exposes a CORS-friendly JSON surface to the WC26 Hub frontend.
 *
 * A scheduled trigger runs every 5 minutes to pull finished matches and
 * upsert them into Supabase's `match_results` table, which fires the SQL
 * scoring triggers and updates the leaderboard.
 */

import {
  rateLimit,
  readBoundedJson,
  safeBase64Url,
  safeEventId,
  safePushEndpoint,
  safeString,
  safeTeamCode,
  safeYmd,
  withSecurityHeaders,
} from './security'
import { handleAdmin } from './admin'

export interface Env {
  CACHE: KVNamespace
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
  // VAPID for Web Push (base64url-encoded). Public is also baked into
  // the client bundle as VITE_VAPID_PUBLIC; private + subject stay
  // server-only.
  VAPID_PUBLIC: string
  VAPID_PRIVATE: string
  VAPID_SUBJECT: string  // 'mailto:info@pressing90.live'
  // Admin panel (set via wrangler secret put). See admin.ts.
  ADMIN_PASSWORD_HASH?: string   // sha256(salt + ':' + password) hex
  ADMIN_PASSWORD_SALT?: string
  ADMIN_SESSION_SECRET?: string  // HMAC key for session tokens; falls back to PASSWORD_HASH
  ADMIN_TOKEN?: string           // legacy x-admin-token guard for /push/broadcast
  // Optional integrations (admin endpoints gracefully degrade to mock).
  CF_API_TOKEN?: string
  CF_ACCOUNT_ID?: string
  CF_ZONE_ID?: string
  GSC_SERVICE_ACCOUNT?: string
  GSC_SITE_URL?: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
  // Durable Object scheduler — fires kickoff pushes at the exact
  // second they're due (instead of waiting for the next 5-min cron).
  // See KickoffScheduler class at the bottom of this file.
  SCHEDULER: DurableObjectNamespace
}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
const ESPN_SOCCER = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const ALLOW_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://pressing90.live',
  'https://www.pressing90.live',
  // Legacy origin — kept during migration window so existing PWA
  // installs on the wc26.mehdijabry.dev subdomain keep working until
  // the user re-opens them and lands on the 301-redirected page.
  'https://wc26.mehdijabry.dev',
]

// Curated competitions for the daily aggregator. Order matters — it's the
// display order in the UI (top-tier leagues first, then friendlies/other).
const DAILY_LEAGUES: Array<{ slug: string; label: string; tier: number }> = [
  // ----- World stage -----
  { slug: 'fifa.world',                 label: 'FIFA World Cup 26',         tier: 0 },
  { slug: 'fifa.friendly',              label: 'International Friendlies',  tier: 0 },
  { slug: 'fifa.friendly.w',            label: "International Friendlies (W)", tier: 0 },
  { slug: 'uefa.nations',               label: 'UEFA Nations League',       tier: 0 },
  { slug: 'concacaf.nations.league',    label: 'CONCACAF Nations League',   tier: 0 },
  { slug: 'fifa.wwc',                   label: 'FIFA Women World Cup',      tier: 0 },

  // ----- European cups -----
  { slug: 'uefa.champions',             label: 'UEFA Champions League',     tier: 1 },
  { slug: 'uefa.europa',                label: 'UEFA Europa League',        tier: 1 },
  { slug: 'uefa.europa.conf',           label: 'UEFA Conference League',    tier: 1 },
  { slug: 'uefa.super_cup',             label: 'UEFA Super Cup',            tier: 1 },
  { slug: 'club.world.cup',             label: 'FIFA Club World Cup',       tier: 1 },

  // ----- Continental club cups -----
  { slug: 'conmebol.libertadores',      label: 'Copa Libertadores',         tier: 1 },
  { slug: 'conmebol.sudamericana',      label: 'Copa Sudamericana',         tier: 1 },
  { slug: 'concacaf.champions_league',  label: 'CONCACAF Champions Cup',    tier: 1 },
  { slug: 'afc.champions',              label: 'AFC Champions Elite',       tier: 1 },
  { slug: 'caf.champions_league',       label: 'CAF Champions League',      tier: 1 },

  // ----- Top 5 leagues -----
  { slug: 'eng.1',                      label: 'Premier League',            tier: 2 },
  { slug: 'esp.1',                      label: 'LaLiga',                    tier: 2 },
  { slug: 'ita.1',                      label: 'Serie A',                   tier: 2 },
  { slug: 'ger.1',                      label: 'Bundesliga',                tier: 2 },
  { slug: 'fra.1',                      label: 'Ligue 1',                   tier: 2 },

  // ----- Other major leagues -----
  { slug: 'por.1',                      label: 'Liga Portugal',             tier: 3 },
  { slug: 'ned.1',                      label: 'Eredivisie',                tier: 3 },
  { slug: 'bel.1',                      label: 'Belgian Pro League',        tier: 3 },
  { slug: 'tur.1',                      label: 'Süper Lig',                 tier: 3 },
  { slug: 'sco.1',                      label: 'Scottish Premiership',      tier: 3 },
  { slug: 'gre.1',                      label: 'Super League Greece',       tier: 3 },
  { slug: 'sui.1',                      label: 'Swiss Super League',        tier: 3 },
  { slug: 'aut.1',                      label: 'Austrian Bundesliga',       tier: 3 },
  { slug: 'rus.1',                      label: 'Russian Premier League',    tier: 3 },
  { slug: 'mex.1',                      label: 'Liga MX',                   tier: 3 },
  { slug: 'usa.1',                      label: 'MLS',                       tier: 3 },
  { slug: 'sau.1',                      label: 'Saudi Pro League',          tier: 3 },
  { slug: 'arg.1',                      label: 'Liga Profesional',          tier: 3 },
  { slug: 'bra.1',                      label: 'Brasileirão',               tier: 3 },
  { slug: 'jpn.1',                      label: 'J1 League',                 tier: 3 },
  { slug: 'kor.1',                      label: 'K League 1',                tier: 3 },
  { slug: 'aus.1',                      label: 'A-League',                  tier: 3 },

  // ----- Domestic cups -----
  { slug: 'eng.fa',                     label: 'FA Cup',                    tier: 4 },
  { slug: 'eng.league_cup',             label: 'Carabao Cup',               tier: 4 },
  { slug: 'esp.copa_del_rey',           label: 'Copa del Rey',              tier: 4 },
  { slug: 'ita.coppa_italia',           label: 'Coppa Italia',              tier: 4 },
  { slug: 'fra.coupe_de_france',        label: 'Coupe de France',           tier: 4 },
  { slug: 'ger.dfb_pokal',              label: 'DFB-Pokal',                 tier: 4 },
  { slug: 'usa.open',                   label: 'US Open Cup',               tier: 4 },
]

// ----- HTTP entry point --------------------------------------------------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    // CORS preflight
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), req)

    try {
      // Health
      if (url.pathname === '/' || url.pathname === '/health') {
        return cors(json({ ok: true, service: 'wc26-api', t: new Date().toISOString() }), req)
      }

      // Live scoreboard (all matches happening / upcoming today)
      if (url.pathname === '/scoreboard') {
        return cors(await cachedFetch(env, 'scoreboard', `${ESPN_BASE}/scoreboard`, 30), req)
      }

      // Full fixtures list (single-day window — ESPN returns ~limit events around now)
      if (url.pathname === '/fixtures') {
        return cors(await cachedFetch(env, 'fixtures', `${ESPN_BASE}/scoreboard?limit=200`, 3600), req)
      }

      // FULL tournament fan-out — every WC26 fixture from June 11 → July 19, 2026.
      // ESPN /scoreboard only returns a date-bounded slice, so we fan out per-day
      // and merge. Cached aggressively since the draw rarely changes mid-tournament.
      if (url.pathname === '/tournament') {
        return cors(await fetchTournament(env), req)
      }

      // Standings (group stage tables)
      if (url.pathname === '/standings') {
        return cors(await cachedFetch(env, 'standings', `${ESPN_BASE}/standings`, 3600), req)
      }

      // Individual match summary — id MUST be numeric. Anything else
      // (path traversal attempts, URL-encoded surprises) is rejected
      // before the upstream fetch.
      const matchMatch = url.pathname.match(/^\/match\/([^/]+)$/)
      if (matchMatch) {
        const id = safeEventId(matchMatch[1])
        if (!id) return cors(json({ error: 'invalid event id' }, 400), req)
        return cors(
          await cachedFetch(env, `match:${id}`, `${ESPN_BASE}/summary?event=${id}`, 30),
          req
        )
      }

      // Team roster + meta — code MUST match the ESPN abbreviation
      // alphabet (2-4 uppercase letters). Anything else can't be a
      // real team code, so we reject before the upstream fetch.
      const teamMatch = url.pathname.match(/^\/teams\/([^/]+)$/)
      if (teamMatch) {
        const code = safeTeamCode(teamMatch[1])
        if (!code) return cors(json({ error: 'invalid team code' }, 400), req)
        return cors(
          await cachedFetch(env, `team:${code}`, `${ESPN_BASE}/teams/${code}`, 86400),
          req
        )
      }

      // National team roster — falls back through several ESPN endpoints
      // because the public site API rarely exposes international rosters
      // until very close to kickoff. We try the WC league path first, then
      // fan out through known confederation leagues.
      const rosterMatch = url.pathname.match(/^\/roster\/([^/]+)$/)
      if (rosterMatch) {
        const code = safeTeamCode(rosterMatch[1])
        if (!code) return cors(json({ error: 'invalid team code' }, 400), req)
        return cors(await fetchRoster(env, code), req)
      }

      // Full team history — past WCs (2022, 2018, 2014, 2010, 2006) + recent
      // friendlies. Aggregates across multiple ESPN league/season paths.
      const historyMatch = url.pathname.match(/^\/team-history\/([^/]+)$/)
      if (historyMatch) {
        const code = safeTeamCode(historyMatch[1])
        if (!code) return cors(json({ error: 'invalid team code' }, 400), req)
        return cors(await fetchTeamHistory(env, code), req)
      }

      // Daily aggregator — all competitions for a given day
      // /today?date=YYYYMMDD  (default = today UTC). Reject any malformed
      // date so it can't be smuggled into the ESPN URL.
      if (url.pathname === '/today') {
        const rawDate = url.searchParams.get('date')
        const dateParam = rawDate ? safeYmd(rawDate) : ymdUtc(new Date())
        if (!dateParam) return cors(json({ error: 'invalid date' }, 400), req)
        return cors(await fetchDaily(env, dateParam), req)
      }

      // Web Push — opt-in flow + send.
      // /push/subscribe (POST)    upsert a subscription row in Supabase
      // /push/unsubscribe (POST)  delete it
      // /push/test (POST)         fire a test push to the calling endpoint
      // /push/broadcast (POST)    fan-out to every saved subscription
      //                            (auth: x-admin-token header)
      // ─── Push endpoints — rate-limited per IP ──────────────────────
      // 'Cheap' actions (subscribe/unsubscribe) get a generous limit;
      // /push/test is throttled hard because a misuse hits external
      // push services and can get the VAPID key flagged for abuse.
      if (url.pathname === '/push/subscribe' && req.method === 'POST') {
        const rl = await rateLimit(env, req, { route: 'push:subscribe', limit: 20 })
        if (rl.blocked) return cors(rateLimitedResponse(rl.retryAfter), req)
        return cors(await handlePushSubscribe(req, env), req)
      }
      if (url.pathname === '/push/unsubscribe' && req.method === 'POST') {
        const rl = await rateLimit(env, req, { route: 'push:unsubscribe', limit: 20 })
        if (rl.blocked) return cors(rateLimitedResponse(rl.retryAfter), req)
        return cors(await handlePushUnsubscribe(req, env), req)
      }
      if (url.pathname === '/push/test' && req.method === 'POST') {
        const rl = await rateLimit(env, req, { route: 'push:test', limit: 5 })
        if (rl.blocked) return cors(rateLimitedResponse(rl.retryAfter), req)
        return cors(await handlePushTest(req, env), req)
      }
      if (url.pathname === '/push/broadcast' && req.method === 'POST') {
        // Admin-token-gated already; rate limit catches credential-stuffing
        // attempts on the token (5/min/IP).
        const rl = await rateLimit(env, req, { route: 'push:broadcast', limit: 5 })
        if (rl.blocked) return cors(rateLimitedResponse(rl.retryAfter), req)
        return cors(await handlePushBroadcast(req, env), req)
      }

      // Admin panel backend — auth + analytics + push + email + DB stats.
      // Routed through the dispatcher in admin.ts so the worker entry
      // stays clean.
      const adminResp = await handleAdmin(req, env, url.pathname)
      if (adminResp) return cors(adminResp, req)

      return cors(json({ error: 'Not found' }, 404), req)
    } catch (e: unknown) {
      // Never leak stack traces / internal messages to clients —
      // ship a generic 500 and log the real error for wrangler tail.
      console.log('[wc26-api] unhandled error:', e)
      return cors(json({ error: 'internal error' }, 500), req)
    }
  },

  // ----- Cron: every 5 min --------------------------------------------
  //   1. Sync finished matches → Supabase (predictions scoring)
  //   2. Fire kickoff / goal / FT push notifications to subscribers
  // The two passes share one ESPN fetch to keep subrequests low.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Dispatch by cron pattern — see wrangler.toml [triggers].
    //   '0 */3 * * *' = news pipeline (8 × / day)
    //   anything else (default '*/5 * * * *') = match alerts pass below.
    if (event.cron === '0 */3 * * *') {
      const { runNewsPipeline } = await import('./news')
      ctx.waitUntil(runNewsPipeline(env))
      return
    }
    try {
      const sb = await fetch(`${ESPN_BASE}/scoreboard?limit=200`)
      if (!sb.ok) return
      const data = await sb.json<EspnScoreboard>()
      const events = data.events ?? []

      // --- Pass 1: kickoff + live score + FT alerts --------------------
      // Guarded so a push pipeline failure (eg. broken VAPID) doesn't
      // stop the predictions scoring pass below from running.
      try {
        await fireMatchAlerts(env, events)
      } catch (e) {
        console.log('[push] alerts pass failed:', e)
      }

      // --- Pass 2: sync finished matches → Supabase --------------------
      const finished = events.filter((e) => e.status?.type?.state === 'post')
      for (const ev of finished) {
        try {
          const comp = ev.competitions?.[0]
          if (!comp) continue
          const home = comp.competitors?.find((c) => c.homeAway === 'home')
          const away = comp.competitors?.find((c) => c.homeAway === 'away')
          if (!home || !away) continue

          const matchId = mapEspnIdToInternal(ev.id)
          if (!matchId) continue

          await upsertMatchResult(env, {
            match_id: matchId,
            home_score: parseInt(home.score ?? '0', 10),
            away_score: parseInt(away.score ?? '0', 10),
            scorer_ids: [],
            card_player_ids: [],
            finished_at: ev.date ?? new Date().toISOString(),
          })
        } catch {
          // continue with next event on individual failure
        }
      }
    } catch {
      // swallow — cron will retry in 5 min
    }
  },
}

// ─── Auto-alert pipeline (called from scheduled()) ────────────────────
//
// One pass over the scoreboard does three things:
//   - kickoff:  fire 15 min before any WC match goes live
//   - goal:     fire whenever a live match score increments
//   - FT:       fire when state flips pre|in → post (final whistle)
//
// Dedupe via Cloudflare KV so the same alert isn't fired twice across
// overlapping cron runs / retries. Each key has a 36h TTL so a kickoff
// alert from match-day morning can't accidentally re-fire 35 hours
// later when the match shows up again in some other endpoint's list.

const KV_TTL_SECONDS = 36 * 3600

// ─── Push settings — operator-configurable via /admin/push/settings ──

export interface PushSettings {
  enabled: boolean                                    // master kill switch
  kickoff: { enabled: boolean; leadMinutes: number }  // T-15 by default
  goal: { enabled: boolean }
  fullTime: { enabled: boolean }
  redCard: { enabled: boolean }
  yellowCard: { enabled: boolean }
  penalty: { enabled: boolean }
  halfTime: { enabled: boolean }
  // Manual: fires when an article is APPROVED in the admin panel (i.e.
  // transitions from 'draft' to 'published'). Not driven by the cron;
  // gated separately so an editor can suppress the push for a routine
  // briefing without disabling the publish itself.
  articlePublished: { enabled: boolean }
}

export const DEFAULT_PUSH_SETTINGS: PushSettings = {
  enabled: true,
  kickoff: { enabled: true, leadMinutes: 15 },
  goal: { enabled: true },
  fullTime: { enabled: true },
  redCard: { enabled: true },
  yellowCard: { enabled: false },  // off by default — high volume
  penalty: { enabled: true },
  halfTime: { enabled: true },
  articlePublished: { enabled: true },
}

const PUSH_SETTINGS_KEY = 'push:settings'

export async function loadPushSettings(env: Env): Promise<PushSettings> {
  const raw = await env.CACHE.get(PUSH_SETTINGS_KEY)
  if (!raw) return DEFAULT_PUSH_SETTINGS
  try {
    const parsed = JSON.parse(raw) as Partial<PushSettings>
    // Merge KV against defaults so a stored payload missing newly-added
    // fields (e.g. yellowCard added after KV was first written) still
    // returns a fully-populated object — otherwise the admin panel would
    // crash on first render trying to read settings.yellowCard.enabled.
    return {
      enabled: parsed.enabled ?? DEFAULT_PUSH_SETTINGS.enabled,
      kickoff:          { ...DEFAULT_PUSH_SETTINGS.kickoff,          ...(parsed.kickoff ?? {}) },
      goal:             { ...DEFAULT_PUSH_SETTINGS.goal,             ...(parsed.goal ?? {}) },
      fullTime:         { ...DEFAULT_PUSH_SETTINGS.fullTime,         ...(parsed.fullTime ?? {}) },
      redCard:          { ...DEFAULT_PUSH_SETTINGS.redCard,          ...(parsed.redCard ?? {}) },
      yellowCard:       { ...DEFAULT_PUSH_SETTINGS.yellowCard,       ...(parsed.yellowCard ?? {}) },
      penalty:          { ...DEFAULT_PUSH_SETTINGS.penalty,          ...(parsed.penalty ?? {}) },
      halfTime:         { ...DEFAULT_PUSH_SETTINGS.halfTime,         ...(parsed.halfTime ?? {}) },
      articlePublished: { ...DEFAULT_PUSH_SETTINGS.articlePublished, ...(parsed.articlePublished ?? {}) },
    }
  } catch {
    return DEFAULT_PUSH_SETTINGS
  }
}

export async function savePushSettings(env: Env, s: PushSettings): Promise<void> {
  // Clamp lead minutes to a sane window (1–60). Anything outside that
  // makes the cron lookahead math break (lookahead is 30min by default).
  const lead = Math.max(1, Math.min(60, Math.round(s.kickoff.leadMinutes)))
  const sanitized: PushSettings = {
    enabled: !!s.enabled,
    kickoff: { enabled: !!s.kickoff.enabled, leadMinutes: lead },
    goal: { enabled: !!s.goal.enabled },
    fullTime: { enabled: !!s.fullTime.enabled },
    redCard: { enabled: !!s.redCard.enabled },
    yellowCard: { enabled: !!s.yellowCard.enabled },
    penalty: { enabled: !!s.penalty.enabled },
    halfTime: { enabled: !!s.halfTime.enabled },
    articlePublished: { enabled: !!s.articlePublished?.enabled },
  }
  await env.CACHE.put(PUSH_SETTINGS_KEY, JSON.stringify(sanitized))
}

// Diagnostic record — surfaces 'why didn't a push arrive' to the panel.
// One KV write per cron tick; cheap.
const PUSH_DIAG_KEY = 'push:diag'
export interface PushDiag {
  lastCronAt: string                  // ISO
  lastCronEventsCount: number         // ESPN events seen
  lastKickoffScheduledIds: string[]   // ids put into the DO this tick
  lastGoalAlertIds: string[]
  lastFtAlertIds: string[]
  lastCardAlertIds: string[]
  lastPenaltyAlertIds: string[]
  lastHalfTimeAlertIds: string[]
  lastSubsCount: number
  settings: PushSettings
}
async function writePushDiag(env: Env, d: PushDiag): Promise<void> {
  await env.CACHE.put(PUSH_DIAG_KEY, JSON.stringify(d), { expirationTtl: 7 * 24 * 3600 })
}
export async function readPushDiag(env: Env): Promise<PushDiag | null> {
  const raw = await env.CACHE.get(PUSH_DIAG_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as PushDiag } catch { return null }
}

/** Item shape exchanged between the cron and the KickoffScheduler DO. */
type ScheduledPush = {
  id: string       // ESPN event id (also the dedupe key in the DO)
  fireAt: number   // epoch ms, when alarm() should fire the push
  notif: { title: string; body: string; url: string; tag: string }
}

// Lookahead window for kickoff scheduling. Cron interval is 5 min and
// the kickoff alert fires 15 min before each match, so the worst case
// gap between successful crons (one missed = 10 min) plus the 15-min
// lead means we need to surface matches at least 25 min in advance.
// 30 min gives 5 min of safety margin on top.
const KICKOFF_LOOKAHEAD_MS = 30 * 60_000
const KICKOFF_LEAD_MS = 15 * 60_000

async function fireMatchAlerts(env: Env, events: EspnScoreboard['events']): Promise<void> {
  const settings = await loadPushSettings(env)
  const diag: PushDiag = {
    lastCronAt: new Date().toISOString(),
    lastCronEventsCount: events?.length ?? 0,
    lastKickoffScheduledIds: [],
    lastGoalAlertIds: [],
    lastFtAlertIds: [],
    lastCardAlertIds: [],
    lastPenaltyAlertIds: [],
    lastHalfTimeAlertIds: [],
    lastSubsCount: 0,
    settings,
  }
  if (!settings.enabled) { await writePushDiag(env, diag); return }

  // No subscribers? Skip the whole thing — no point computing alerts
  // we won't send.
  const subsCheck = await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  const subsList = (await subsCheck.json()) as Array<{ endpoint: string }>
  diag.lastSubsCount = subsList.length
  if (subsList.length === 0) { await writePushDiag(env, diag); return }

  // ---- Pass A: schedule upcoming kickoffs via the Durable Object -----
  // Precise to the second — DO Alarms fire at the exact requested time,
  // not at the next cron tick. This pass is purely scheduling; the
  // actual push goes out from the DO's alarm() handler.
  const pendingSchedule: ScheduledPush[] = []
  if (settings.kickoff.enabled) {
    const leadMs = settings.kickoff.leadMinutes * 60_000
    for (const ev of events ?? []) {
      try {
        const sched = scheduledKickoffFor(ev, leadMs)
        if (!sched) continue
        // KV sentinel prevents the same kickoff from being re-scheduled
        // on every 5-min cron run. The DO is the authoritative dedupe
        // (it indexes by event id) but the KV check skips even building
        // the request payload, which is the hot path on the cron.
        const seenKey = `alert:kickoff:${sched.id}`
        if (await env.CACHE.get(seenKey)) continue
        pendingSchedule.push(sched)
        await env.CACHE.put(seenKey, 'scheduled', { expirationTtl: KV_TTL_SECONDS })
      } catch (e) {
        console.log('[push] scheduling failed', ev.id, e)
      }
    }
    if (pendingSchedule.length > 0) {
      try {
        const stub = env.SCHEDULER.get(env.SCHEDULER.idFromName('singleton'))
        await stub.fetch('https://do/schedule', {
          method: 'POST',
          body: JSON.stringify(pendingSchedule),
        })
        diag.lastKickoffScheduledIds = pendingSchedule.map((p) => p.id)
      } catch (e) {
        console.log('[push] DO schedule call failed', e)
        // If the DO call failed, roll back the KV sentinels so the next
        // cron retries. Otherwise the matches would be silently lost.
        for (const item of pendingSchedule) {
          await env.CACHE.delete(`alert:kickoff:${item.id}`)
        }
      }
    }
  }

  // ---- Pass B: inline goal + FT alerts (state-change detection) ------
  // Goals and FTs aren't predictable like kickoffs — the cron itself
  // detects them by comparing the live ESPN payload with the last
  // known state in KV. Latency is bounded by the cron interval (5 min).
  for (const ev of events ?? []) {
    try {
      await maybeFireGoalOrFt(env, ev, settings, diag)
      await maybeFireMatchEvents(env, ev, settings, diag)
    } catch (e) {
      console.log('[push] event alert failed', ev.id, e)
    }
  }

  await writePushDiag(env, diag)
}

/**
 * Inspect competitions[0].details for card / penalty / halftime events
 * and broadcast each new one once. Inspired by FootMercato's push UX —
 * notify on the moments that change a match's narrative (a red card, a
 * penalty awarded, halftime whistle). KV-deduped so the same event
 * isn't re-broadcast on every cron tick.
 *
 * ESPN type ids (verified from /all/scoreboard finished matches):
 *   - 70  Goal             — already handled via score increment
 *   - 91  Substitution     — skipped (too noisy for push)
 *   - 93  Red Card
 *   - 94  Yellow Card
 *   - 95  Penalty awarded
 *   - 156 VAR              — skipped (most are no-ops)
 *
 * The detail clock.displayValue + the player's displayName + the type
 * text combine into a stable dedupe key so even if a detail's array
 * position shifts, we don't re-fire.
 */
async function maybeFireMatchEvents(
  env: Env,
  ev: NonNullable<EspnScoreboard['events']>[number],
  settings: PushSettings,
  diag: PushDiag,
): Promise<void> {
  const id = String(ev.id ?? '')
  if (!id) return
  const comp = ev.competitions?.[0]
  if (!comp) return
  const home = comp.competitors?.find((c) => c.homeAway === 'home')
  const away = comp.competitors?.find((c) => c.homeAway === 'away')
  if (!home || !away) return
  const homeName = home.team?.shortDisplayName ?? home.team?.displayName ?? '?'
  const awayName = away.team?.shortDisplayName ?? away.team?.displayName ?? '?'
  const matchLabel = `${homeName} v ${awayName}`

  const details = (comp as { details?: Array<{
    type?: { id?: string; text?: string }
    clock?: { displayValue?: string }
    athletesInvolved?: Array<{ displayName?: string }>
    team?: { id?: string }
  }> }).details ?? []

  // Halftime fires on state transitions reported by ESPN — track via
  // the period number flipping to 2.
  const period = ev.status?.period
  const state = ev.status?.type?.state
  if (settings.halfTime.enabled && state === 'in' && period === 2) {
    const htKey = `alert:ht:${id}`
    if (!(await env.CACHE.get(htKey))) {
      const hs = parseInt(home.score ?? '0', 10) || 0
      const as = parseInt(away.score ?? '0', 10) || 0
      await broadcastCore(env, {
        title: `⏱ HT — ${homeName} ${hs}-${as} ${awayName}`,
        body: `Half-time. Second half coming up.`,
        url: '/today',
        tag: `ht-${id}`,
      })
      diag.lastHalfTimeAlertIds.push(id)
      await env.CACHE.put(htKey, '1', { expirationTtl: KV_TTL_SECONDS })
    }
  }

  for (const det of details) {
    const typeId = det.type?.id
    const typeText = det.type?.text ?? ''
    const minute = det.clock?.displayValue ?? ''
    const player = det.athletesInvolved?.[0]?.displayName ?? ''

    let notif: { title: string; body: string; url: string; tag: string } | null = null
    let dedupeKind = ''

    if (typeId === '93' && settings.redCard.enabled) {
      dedupeKind = 'rc'
      notif = {
        title: `🟥 ${matchLabel} · Red card`,
        body: player ? `${player} sent off${minute ? ' at ' + minute : ''}.` : `Red card${minute ? ' at ' + minute : ''}.`,
        url: '/today',
        tag: `event-${id}-rc`,
      }
    } else if (typeId === '94' && settings.yellowCard.enabled) {
      dedupeKind = 'yc'
      notif = {
        title: `🟨 ${matchLabel} · Yellow card`,
        body: player ? `${player} booked${minute ? ' at ' + minute : ''}.` : `Yellow card${minute ? ' at ' + minute : ''}.`,
        url: '/today',
        tag: `event-${id}-yc`,
      }
    } else if (typeId === '95' && settings.penalty.enabled) {
      dedupeKind = 'pen'
      notif = {
        title: `🎯 ${matchLabel} · Penalty`,
        body: player ? `${player} — penalty${minute ? ' at ' + minute : ''}.` : `Penalty awarded${minute ? ' at ' + minute : ''}.`,
        url: '/today',
        tag: `event-${id}-pen`,
      }
    } else if (typeId && typeText.toLowerCase().includes('var') === false &&
               /(disallowed|chance|offside)/i.test(typeText) === false &&
               settings.penalty.enabled && /penalty/i.test(typeText)) {
      // Catch text-only 'penalty' events ESPN emits without a clean
      // type id (rare but happens around VAR overturns).
      dedupeKind = 'pen-text'
      notif = {
        title: `🎯 ${matchLabel} · ${typeText}`,
        body: player ? `${player}${minute ? ' at ' + minute : ''}.` : `Penalty event${minute ? ' at ' + minute : ''}.`,
        url: '/today',
        tag: `event-${id}-pen`,
      }
    }

    if (!notif || !dedupeKind) continue
    // Dedupe key per event detail — stable across cron ticks even if
    // the details array order changes between polls.
    const dedupeKey = `alert:event:${id}:${dedupeKind}:${minute}:${player}`
    if (await env.CACHE.get(dedupeKey)) continue
    await broadcastCore(env, notif)
    await env.CACHE.put(dedupeKey, '1', { expirationTtl: KV_TTL_SECONDS })
    if (dedupeKind === 'pen' || dedupeKind === 'pen-text') {
      diag.lastPenaltyAlertIds.push(id)
    } else {
      diag.lastCardAlertIds.push(id)
    }
  }
}

/**
 * Pure function: inspect an event and return the scheduled-push payload
 * if it's a WC match with a kickoff within our lookahead window, else
 * null. Doesn't side-effect.
 */
function scheduledKickoffFor(
  ev: NonNullable<EspnScoreboard['events']>[number],
  leadMs: number = KICKOFF_LEAD_MS
): ScheduledPush | null {
  if (ev.status?.type?.state !== 'pre') return null
  if (!ev.date) return null
  const kickoff = Date.parse(ev.date)
  if (!Number.isFinite(kickoff)) return null
  const fireAt = kickoff - leadMs
  const now = Date.now()
  // Not in the lookahead window? Skip.
  if (fireAt < now - 60_000) return null  // already missed (with a 1-min slack)
  if (fireAt > now + KICKOFF_LOOKAHEAD_MS) return null

  const id = String(ev.id ?? '')
  if (!id) return null
  const comp = ev.competitions?.[0]
  if (!comp) return null
  const home = comp.competitors?.find((c) => c.homeAway === 'home')
  const away = comp.competitors?.find((c) => c.homeAway === 'away')
  if (!home || !away) return null
  const homeName = home.team?.shortDisplayName ?? home.team?.displayName ?? '?'
  const awayName = away.team?.shortDisplayName ?? away.team?.displayName ?? '?'

  return {
    id,
    fireAt,
    notif: {
      title: `⚽ ${homeName} v ${awayName}`,
      body: `Kickoff in ${Math.round(leadMs / 60_000)} min — tap to follow live.`,
      url: '/today',
      tag: `kickoff-${id}`,
    },
  }
}

async function maybeFireGoalOrFt(
  env: Env,
  ev: NonNullable<EspnScoreboard['events']>[number],
  settings: PushSettings,
  diag: PushDiag
): Promise<void> {
  const id = String(ev.id ?? '')
  if (!id) return
  const comp = ev.competitions?.[0]
  if (!comp) return
  const home = comp.competitors?.find((c) => c.homeAway === 'home')
  const away = comp.competitors?.find((c) => c.homeAway === 'away')
  if (!home || !away) return
  const homeName = home.team?.shortDisplayName ?? home.team?.displayName ?? '?'
  const awayName = away.team?.shortDisplayName ?? away.team?.displayName ?? '?'
  const state = ev.status?.type?.state

  // ---- GOAL: score increments while state === 'in' --------------------
  if (state === 'in' && settings.goal.enabled) {
    const hs = parseInt(home.score ?? '0', 10) || 0
    const as = parseInt(away.score ?? '0', 10) || 0
    const scoreKey = `alert:score:${id}`
    const prev = await env.CACHE.get(scoreKey)
    const cur = `${hs}-${as}`
    if (prev !== cur) {
      // Only broadcast on a real change (not the 0-0 baseline) and not
      // on the very first poll for this match (would fire a 0-0 alert).
      if (prev !== null && cur !== '0-0') {
        const minute = ev.status?.displayClock ?? ''
        await broadcastCore(env, {
          title: `⚽ ${homeName} ${hs}-${as} ${awayName}`,
          body: minute ? `Goal at ${minute}'` : 'Goal!',
          url: '/today',
          tag: `live-${id}`,
        })
        diag.lastGoalAlertIds.push(id)
      }
      await env.CACHE.put(scoreKey, cur, { expirationTtl: KV_TTL_SECONDS })
    }
  }

  // ---- FT: state flipped to 'post' since last poll --------------------
  if (state === 'post' && settings.fullTime.enabled) {
    const ftKey = `alert:ft:${id}`
    if (await env.CACHE.get(ftKey)) return
    const hs = parseInt(home.score ?? '0', 10) || 0
    const as = parseInt(away.score ?? '0', 10) || 0
    await broadcastCore(env, {
      title: `🏁 FT — ${homeName} ${hs}-${as} ${awayName}`,
      body: 'Full time. Tap for stats + lineups.',
      url: '/today',
      tag: `ft-${id}`,
    })
    diag.lastFtAlertIds.push(id)
    await env.CACHE.put(ftKey, '1', { expirationTtl: KV_TTL_SECONDS })
  }
}

// ----- Helpers -----------------------------------------------------------

interface EspnScoreboard {
  events?: Array<{
    id: string
    date?: string
    status?: {
      type?: { state?: 'pre' | 'in' | 'post' }
      period?: number               // 1 = first half, 2 = second half
      displayClock?: string         // "45'", "67:23", etc.
    }
    competitions?: Array<{
      competitors?: Array<{
        homeAway: 'home' | 'away'
        score?: string
        team?: { abbreviation?: string }
      }>
      details?: Array<{
        type?: { id?: string; text?: string }
        clock?: { displayValue?: string }
        athletesInvolved?: Array<{ displayName?: string }>
        team?: { id?: string }
      }>
    }>
  }>
}

async function cachedFetch(env: Env, key: string, upstream: string, ttl: number): Promise<Response> {
  const cached = await env.CACHE.get(key)
  if (cached) {
    return new Response(cached, {
      headers: { 'content-type': 'application/json', 'x-cache': 'HIT', 'cache-control': `public, max-age=${ttl}` },
    })
  }
  const upstreamResp = await fetch(upstream, { cf: { cacheTtl: ttl, cacheEverything: true } })
  if (!upstreamResp.ok) {
    return json({ error: 'upstream', status: upstreamResp.status }, 502)
  }
  const body = await upstreamResp.text()
  // Don't await the put — fire and forget so we don't block the response
  env.CACHE.put(key, body, { expirationTtl: ttl }).catch(() => {})
  return new Response(body, {
    headers: { 'content-type': 'application/json', 'x-cache': 'MISS', 'cache-control': `public, max-age=${ttl}` },
  })
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function cors(resp: Response, req: Request): Response {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOW_ORIGINS.includes(origin) ? origin : ALLOW_ORIGINS[0]
  const h = new Headers(resp.headers)
  h.set('access-control-allow-origin', allowed)
  // Push endpoints are POST — must allow it in CORS.
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  // x-admin-token is the auth header for /push/broadcast.
  h.set('access-control-allow-headers', 'content-type, x-admin-token, authorization')
  h.set('vary', 'origin')
  const corsResp = new Response(resp.body, { status: resp.status, headers: h })
  // Layer security headers (CSP / nosniff / referrer-policy / etc.)
  // on top of the CORS response so they're applied uniformly.
  return withSecurityHeaders(corsResp)
}

/** Standard 429 with Retry-After header. */
function rateLimitedResponse(retryAfterSeconds: number): Response {
  const resp = json({ error: 'rate limited', retry_after: retryAfterSeconds }, 429)
  const h = new Headers(resp.headers)
  h.set('retry-after', String(retryAfterSeconds))
  return new Response(resp.body, { status: 429, headers: h })
}

// Map ESPN event ID → our internal match id (M01..M104 + KO labels).
// For v1 we leave this as a stub returning null; it will be filled with the
// real mapping once ESPN publishes WC26 event IDs (post-draw).
function mapEspnIdToInternal(_espnId: string): string | null {
  // TODO: build a table of ESPN event IDs → internal M01..M104 ids.
  // Until then, scheduled scoring is a no-op and the frontend serves
  // mock data through /scoreboard etc.
  return null
}

function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

// All days of WC26 2026 (June 11 → July 19 inclusive)
function wc26Days(): string[] {
  const start = new Date(Date.UTC(2026, 5, 11)) // month 5 = June (0-indexed)
  const end = new Date(Date.UTC(2026, 6, 19))   // July 19
  const days: string[] = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(ymdUtc(d))
  }
  return days
}

async function fetchTournament(env: Env): Promise<Response> {
  const cached = await env.CACHE.get('tournament')
  if (cached) {
    return new Response(cached, {
      headers: {
        'content-type': 'application/json',
        'x-cache': 'HIT',
        'cache-control': 'public, max-age=300',
      },
    })
  }

  // Fan out across every WC26 day. ESPN tolerates this — and we cache aggressively.
  const days = wc26Days()
  const dayResults = await Promise.all(
    days.map(async (d) => {
      try {
        const r = await fetch(`${ESPN_BASE}/scoreboard?dates=${d}`, {
          cf: { cacheTtl: 1800, cacheEverything: true },
        })
        if (!r.ok) return []
        const data = await r.json<EspnScoreboard>()
        return data.events ?? []
      } catch {
        return []
      }
    })
  )

  // Dedupe by event id (some days overlap on overnight matches)
  const allEvents = dayResults.flat()
  const seen = new Set<string>()
  const events = allEvents.filter((e) => {
    if (!e.id || seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })

  // Sort by kickoff
  events.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const hasLive = events.some((e) => e.status?.type?.state === 'in')

  const body = JSON.stringify({
    total: events.length,
    hasLive,
    events,
    fetchedAt: new Date().toISOString(),
  })

  // 30s if any live match, else 5min
  const ttl = hasLive ? 30 : 300
  env.CACHE.put('tournament', body, { expirationTtl: ttl }).catch(() => {})

  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'x-cache': 'MISS',
      'cache-control': `public, max-age=${ttl}`,
    },
  })
}

type DailyComp = {
  slug: string
  label: string
  tier: number
  events: EspnScoreboard['events']
}

async function fetchDaily(env: Env, date: string): Promise<Response> {
  const cacheKey = `daily:${date}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return new Response(cached, {
      headers: {
        'content-type': 'application/json',
        'x-cache': 'HIT',
        'cache-control': 'public, max-age=30',
      },
    })
  }

  // Fan out across leagues in parallel (with per-league fallback to []).
  const results = await Promise.all(
    DAILY_LEAGUES.map(async (l) => {
      try {
        const r = await fetch(`${ESPN_SOCCER}/${l.slug}/scoreboard?dates=${date}`, {
          cf: { cacheTtl: 30, cacheEverything: true },
        })
        if (!r.ok) return { ...l, events: [] }
        const data = await r.json<EspnScoreboard>()
        return { ...l, events: data.events ?? [] }
      } catch {
        return { ...l, events: [] }
      }
    })
  )

  const filtered: DailyComp[] = results.filter((r) => (r.events?.length ?? 0) > 0)
  const total = filtered.reduce((acc, c) => acc + (c.events?.length ?? 0), 0)
  const hasLive = filtered.some((c) =>
    c.events?.some((e) => e.status?.type?.state === 'in')
  )

  const body = JSON.stringify({
    date,
    total,
    hasLive,
    competitions: filtered,
    fetchedAt: new Date().toISOString(),
  })

  // Live data is short-cached, finished/upcoming a bit longer.
  const ttl = hasLive ? 30 : 300
  env.CACHE.put(cacheKey, body, { expirationTtl: ttl }).catch(() => {})

  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'x-cache': 'MISS',
      'cache-control': `public, max-age=${ttl}`,
    },
  })
}

// National team roster — tries multiple ESPN endpoints since the free site
// API exposes rosters inconsistently for international teams. Returns the
// first non-empty result. Cached 6h.
async function fetchRoster(env: Env, code: string): Promise<Response> {
  const cacheKey = `roster:${code.toLowerCase()}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return new Response(cached, {
      headers: {
        'content-type': 'application/json',
        'x-cache': 'HIT',
        'cache-control': 'public, max-age=21600',
      },
    })
  }

  // Candidate endpoints (ordered: most-likely first).
  // The `?enable=roster,stats` query is the one that actually returns a
  // populated athletes list for national teams on ESPN's free site API —
  // the bare `/roster` path returns 400 for international squads.
  const candidates = [
    `${ESPN_BASE}/teams/${code}?enable=roster,stats`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/teams/${code}?enable=roster,stats`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/concacaf.nations.league/teams/${code}?enable=roster,stats`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/teams/${code}?enable=roster,stats`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.wwc/teams/${code}?enable=roster,stats`,
  ]

  let athletes: unknown[] = []
  let teamMeta: Record<string, unknown> | null = null
  let sourceUsed = ''

  for (const upstream of candidates) {
    try {
      const r = await fetch(upstream, { cf: { cacheTtl: 21600, cacheEverything: true } })
      if (!r.ok) continue
      const data = (await r.json()) as {
        team?: Record<string, unknown> & {
          athletes?: Array<{ items?: unknown[] }> | unknown[]
        }
        athletes?: Array<{ items?: unknown[] }> | unknown[]
      }
      const teamObj = data.team ?? null

      // Roster may live at `team.athletes` (flat array) or `data.athletes`
      // (sometimes nested as position groups with `items`).
      const rosterRaw =
        (teamObj?.athletes as unknown[] | Array<{ items?: unknown[] }> | undefined) ??
        (data.athletes as unknown[] | Array<{ items?: unknown[] }> | undefined)

      let flat: unknown[] = []
      if (Array.isArray(rosterRaw) && rosterRaw.length) {
        const first = rosterRaw[0] as { items?: unknown[] } | unknown
        if (typeof first === 'object' && first !== null && 'items' in (first as object)) {
          flat = (rosterRaw as Array<{ items?: unknown[] }>).flatMap((g) => g.items ?? [])
        } else {
          flat = rosterRaw as unknown[]
        }
      }
      if (flat.length) {
        athletes = flat
        teamMeta = teamObj
        sourceUsed = upstream
        break
      }
      if (teamObj && !teamMeta) teamMeta = teamObj
    } catch {
      continue
    }
  }

  const body = JSON.stringify({
    team: teamMeta,
    athletes,
    source: sourceUsed || null,
    fetchedAt: new Date().toISOString(),
  })

  // 6h cache (rosters change slowly; we want to limit ESPN calls)
  env.CACHE.put(cacheKey, body, { expirationTtl: 21600 }).catch(() => {})

  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'x-cache': 'MISS',
      'cache-control': 'public, max-age=21600',
    },
  })
}

// Team history — fans out across past WC seasons + recent friendly &
// continental fixtures. Cached 12h. Returns chronological list (newest first).
async function fetchTeamHistory(env: Env, code: string): Promise<Response> {
  const cacheKey = `history:${code.toLowerCase()}`
  const cached = await env.CACHE.get(cacheKey)
  if (cached) {
    return new Response(cached, {
      headers: {
        'content-type': 'application/json',
        'x-cache': 'HIT',
        'cache-control': 'public, max-age=900',
      },
    })
  }

  // ESPN's WC league uses `seasontype` to split phases:
  //   1=Group, 2=R16, 3=QF, 4=SF, 5=3rd/Final.
  // So a single fetch only returns 3-4 group games for nations that went
  // deep. We fan out per (season × seasontype) so semi-finalists like
  // Morocco 2022 actually expose their full bracket run.
  const wcSeasons = [2022, 2018, 2014, 2010, 2006, 2002, 1998, 1994]
  const wcSeasonTypes = [1, 2, 3, 4, 5]
  const friendlySeasons = [2026, 2025, 2024, 2023]

  // Additional competitions worth showing — qualifiers + confederation cups.
  // These slugs are tried best-effort; empty responses are silently skipped.
  const otherCompetitions: Array<{ slug: string; tag: (y: number) => string; seasons: number[] }> = [
    { slug: 'fifa.worldq.caf',     tag: (y) => `WC qual. ${y}`, seasons: [2025, 2024, 2023, 2021, 2017, 2013] },
    { slug: 'fifa.worldq.uefa',    tag: (y) => `WC qual. ${y}`, seasons: [2025, 2024, 2021, 2017, 2013] },
    { slug: 'fifa.worldq.conmebol', tag: (y) => `WC qual. ${y}`, seasons: [2025, 2024, 2023, 2022, 2017, 2013] },
    { slug: 'fifa.worldq.afc',     tag: (y) => `WC qual. ${y}`, seasons: [2025, 2024, 2021] },
    { slug: 'fifa.worldq.concacaf', tag: (y) => `WC qual. ${y}`, seasons: [2025, 2024, 2021] },
    { slug: 'fifa.cwc',            tag: (y) => `Confed. Cup ${y}`, seasons: [2017, 2013, 2009] },
    { slug: 'uefa.euro',           tag: (y) => `Euro ${y}`, seasons: [2024, 2020, 2016, 2012] },
    { slug: 'conmebol.america',    tag: (y) => `Copa América ${y}`, seasons: [2024, 2021, 2019, 2016] },
    { slug: 'concacaf.gold',       tag: (y) => `Gold Cup ${y}`, seasons: [2023, 2021, 2019, 2017] },
    { slug: 'caf.nations_cup',     tag: (y) => `AFCON ${y}`, seasons: [2024, 2022, 2019, 2017, 2015] },
    { slug: 'afc.asian_cup',       tag: (y) => `Asian Cup ${y}`, seasons: [2024, 2019, 2015] },
    { slug: 'ofc.nations_cup',     tag: (y) => `OFC Nations ${y}`, seasons: [2024, 2016, 2012] },
  ]

  type Target = { upstream: string; tag: string }
  const targets: Target[] = []
  // WC: season × seasontype
  for (const y of wcSeasons) {
    for (const st of wcSeasonTypes) {
      targets.push({
        upstream: `${ESPN_BASE}/teams/${code}/schedule?season=${y}&seasontype=${st}`,
        tag: `WC ${y}`,
      })
    }
  }
  // Friendlies
  for (const y of friendlySeasons) {
    targets.push({
      upstream: `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/teams/${code}/schedule?season=${y}`,
      tag: `Friendlies ${y}`,
    })
  }
  // Other competitions
  for (const c of otherCompetitions) {
    for (const y of c.seasons) {
      targets.push({
        upstream: `https://site.api.espn.com/apis/site/v2/sports/soccer/${c.slug}/teams/${code}/schedule?season=${y}`,
        tag: c.tag(y),
      })
    }
  }

  type RawEvent = {
    id?: string
    date?: string
    name?: string
    shortName?: string
    status?: { type?: { state?: string; description?: string; completed?: boolean } }
    competitions?: Array<{
      competitors?: Array<{
        homeAway?: 'home' | 'away'
        score?: string | { displayValue?: string; value?: number }
        winner?: boolean
        team?: { abbreviation?: string; displayName?: string; shortDisplayName?: string; logo?: string }
      }>
      venue?: { fullName?: string; address?: { city?: string; country?: string } }
    }>
  }
  type Bucket = { tag: string; events: RawEvent[] }

  const results = await Promise.all(
    targets.map(async (t): Promise<Bucket> => {
      try {
        const r = await fetch(t.upstream, { cf: { cacheTtl: 43200, cacheEverything: true } })
        if (!r.ok) return { tag: t.tag, events: [] }
        const data = (await r.json()) as { events?: RawEvent[] }
        return { tag: t.tag, events: data.events ?? [] }
      } catch {
        return { tag: t.tag, events: [] }
      }
    })
  )

  // Flatten, tag each event with the source bucket so the UI can group / sort
  const seen = new Set<string>()
  type Tagged = RawEvent & { tag: string }
  const all: Tagged[] = []
  for (const b of results) {
    for (const ev of b.events) {
      if (!ev.id || seen.has(ev.id)) continue
      seen.add(ev.id)
      all.push({ ...ev, tag: b.tag })
    }
  }
  all.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')) // newest first

  // Lightweight win/draw/loss tally. The /schedule endpoint omits
  // status.state, so we treat date-in-the-past as finished AND require a
  // score object to count (so live-but-unfinished matches don't pollute).
  let won = 0, drawn = 0, lost = 0, goalsFor = 0, goalsAgainst = 0
  const A = code.toUpperCase()
  const now = Date.now()
  for (const ev of all) {
    if (!ev.date || new Date(ev.date).getTime() > now) continue
    const cs = ev.competitions?.[0]?.competitors ?? []
    const mine = cs.find((c) => c.team?.abbreviation?.toUpperCase() === A)
    const other = cs.find((c) => c.team?.abbreviation?.toUpperCase() !== A)
    if (!mine || !other) continue
    const extract = (s: unknown): number | null => {
      if (s == null) return null
      if (typeof s === 'object' && s !== null && 'value' in s) {
        const v = (s as { value?: number }).value
        return typeof v === 'number' ? v : null
      }
      const n = parseInt(String(s), 10)
      return Number.isFinite(n) ? n : null
    }
    const myScore = extract(mine.score)
    const opScore = extract(other.score)
    if (myScore === null || opScore === null) continue // not actually finished
    goalsFor += myScore
    goalsAgainst += opScore
    if (myScore > opScore) won++
    else if (myScore === opScore) drawn++
    else lost++
  }

  const body = JSON.stringify({
    abbr: A,
    total: all.length,
    summary: { won, drawn, lost, goalsFor, goalsAgainst, played: won + drawn + lost },
    events: all,
    fetchedAt: new Date().toISOString(),
  })

  env.CACHE.put(cacheKey, body, { expirationTtl: 43200 }).catch(() => {})

  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'x-cache': 'MISS',
      'cache-control': 'public, max-age=900',
    },
  })
}

async function upsertMatchResult(
  env: Env,
  row: {
    match_id: string
    home_score: number
    away_score: number
    scorer_ids: string[]
    card_player_ids: string[]
    finished_at: string
  }
): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/match_results?on_conflict=match_id`
  await fetch(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(row),
  })
}

// ============================================================================
// Web Push — opt-in flow + send pipeline
// ============================================================================
//
// We implement the bare minimum of the Voluntary Application Server
// Identification (VAPID, RFC 8292) protocol so the worker can sign push
// requests directly against the push services (FCM, autopush, Apple Push).
// No node libraries — only Web Crypto API + fetch, which run natively on
// Cloudflare Workers.
//
// Flow:
//   1. Browser registers a PushSubscription with its push service.
//      Returned shape: { endpoint, keys: { p256dh, auth } }
//   2. Browser POSTs it to /push/subscribe → we upsert in Supabase.
//   3. /push/test or /push/broadcast looks up subscription rows and
//      calls sendWebPush() for each one. sendWebPush() builds the
//      VAPID JWT, encrypts the payload (aes128gcm content-encoding,
//      RFC 8291), and POSTs to subscription.endpoint.
//
// The encryption is a strict implementation of draft-ietf-webpush-encryption
// (now RFC 8291). HKDF + AES-128-GCM. ~80 lines.

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } }

function b64uDecode(b64u: string): Uint8Array {
  const b64 = (b64u + '==='.slice((b64u.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function b64uEncode(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

async function importVapidPrivate(d: string): Promise<CryptoKey> {
  // Reconstruct a JWK private key from the raw d. We don't have x/y on
  // hand for sign-only usage, but Web Crypto requires them. Workaround:
  // derive the public point from d on a P-256 curve.
  // Easiest route: keep VAPID_PUBLIC as the raw 65-byte uncompressed
  // point and decompose it back into x/y.
  // The worker is invoked with both VAPID_PUBLIC + VAPID_PRIVATE so we
  // just use them together.
  throw new Error('use importVapidKeyPair instead')
}

async function importVapidKeyPair(
  publicRaw: string,
  privateD: string
): Promise<{ key: CryptoKey; publicRawBytes: Uint8Array }> {
  const pubBytes = b64uDecode(publicRaw)
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC must be raw uncompressed P-256 (65 bytes starting with 0x04)')
  }
  const x = pubBytes.slice(1, 33)
  const y = pubBytes.slice(33, 65)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEncode(x),
    y: b64uEncode(y),
    d: privateD,
    ext: true,
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  return { key, publicRawBytes: pubBytes }
}

async function vapidJwt(env: Env, audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT,
  }
  const enc = (o: object) => b64uEncode(utf8(JSON.stringify(o)))
  const signingInput = `${enc(header)}.${enc(payload)}`
  const { key } = await importVapidKeyPair(env.VAPID_PUBLIC, env.VAPID_PRIVATE)
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    utf8(signingInput)
  )
  return `${signingInput}.${b64uEncode(sigBuf)}`
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    baseKey,
    length * 8
  )
  return new Uint8Array(bits)
}

/**
 * Encrypt a Web Push payload using aes128gcm content-encoding (RFC 8291).
 * Returns { body, headers } ready to POST.
 */
async function encryptPayload(
  payload: Uint8Array,
  recipientP256dh: string,
  recipientAuth: string
): Promise<{ body: Uint8Array; salt: Uint8Array; pubKey: Uint8Array }> {
  // 1. Ephemeral keypair on P-256.
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )
  const ephemeralPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', ephemeral.publicKey)
  )

  // 2. ECDH(ephemeral.priv, recipient.p256dh).
  const recipientPubKey = await crypto.subtle.importKey(
    'raw',
    b64uDecode(recipientP256dh),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: recipientPubKey },
      ephemeral.privateKey,
      256
    )
  )

  // 3. PRK_key = HKDF(auth_secret, sharedSecret, key_info, 32)
  const authSecret = b64uDecode(recipientAuth)
  const keyInfo = concat(
    utf8('WebPush: info\0'),
    b64uDecode(recipientP256dh),
    ephemeralPubRaw
  )
  const prk = await hkdf(sharedSecret, authSecret, keyInfo, 32)

  // 4. 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // 5. content_encryption_key = HKDF(salt, prk, 'Content-Encoding: aes128gcm\0', 16)
  const cek = await hkdf(prk, salt, utf8('Content-Encoding: aes128gcm\0'), 16)
  // 6. nonce = HKDF(salt, prk, 'Content-Encoding: nonce\0', 12)
  const nonce = await hkdf(prk, salt, utf8('Content-Encoding: nonce\0'), 12)

  // 7. encrypt(cek, nonce, payload || 0x02 || padding)
  // Append the record padding delimiter (0x02 for final record), no extra pad.
  const plaintext = concat(payload, new Uint8Array([0x02]))
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, plaintext)
  )

  // 8. Build the aes128gcm content-encoding body:
  //    salt (16) || rs (4, BE) || idlen (1) || keyid (idlen) || ciphertext
  // For Web Push, idlen=65 and keyid=ephemeralPubRaw.
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]) // 4096
  const idlen = new Uint8Array([0x41]) // 65
  const body = concat(salt, rs, idlen, ephemeralPubRaw, ct)
  return { body, salt, pubKey: ephemeralPubRaw }
}

export async function sendWebPush(env: Env, sub: PushSub, payload: object): Promise<Response> {
  const aud = new URL(sub.endpoint).origin
  const jwt = await vapidJwt(env, aud)
  const { body } = await encryptPayload(
    utf8(JSON.stringify(payload)),
    sub.keys.p256dh,
    sub.keys.auth
  )
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      'content-length': String(body.length),
      ttl: '86400',
      urgency: 'normal',
    },
    body,
  })
}

// ---------- /push/subscribe + /push/unsubscribe ---------------------------

async function handlePushSubscribe(req: Request, env: Env): Promise<Response> {
  // Read at most 4KB — a legit PushSubscription is ~500 bytes; anything
  // larger is an attempt to inflate the row or smuggle SQL/JS through
  // free-text fields.
  const raw = await readBoundedJson(req, 4 * 1024)
  if (!raw || typeof raw !== 'object') return json({ error: 'bad json' }, 400)
  const payload = raw as {
    endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown };
    ua?: unknown; lang?: unknown
  }
  // STRICT validation — every field must match its expected shape, or
  // we drop the request. No partial saves.
  const endpoint = safePushEndpoint(payload.endpoint)
  const p256dh = safeBase64Url(payload.keys?.p256dh, 200)
  const auth = safeBase64Url(payload.keys?.auth, 100)
  if (!endpoint || !p256dh || !auth) {
    return json({ error: 'invalid subscription' }, 400)
  }
  // ua/lang are free-text metadata; cap + sanitize but treat as optional.
  const ua = safeString(payload.ua, 300) // standard UA strings stay < 300 chars
  const lang = safeString(payload.lang, 20)
  await supabaseUpsert(env, 'push_subscriptions', {
    endpoint,
    p256dh,
    auth,
    user_agent: ua ?? null,
    lang: lang ?? null,
  }, 'endpoint')
  return json({ ok: true })
}

async function handlePushUnsubscribe(req: Request, env: Env): Promise<Response> {
  const raw = await readBoundedJson(req, 2 * 1024)
  if (!raw || typeof raw !== 'object') return json({ error: 'bad json' }, 400)
  const endpoint = safePushEndpoint((raw as { endpoint?: unknown }).endpoint)
  if (!endpoint) return json({ error: 'invalid endpoint' }, 400)
  // encodeURIComponent is the right defence in depth — even though we
  // already whitelisted the host above, PostgREST takes the value
  // verbatim, so a stray '&' in the path would otherwise extend the
  // query.
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    {
      method: 'DELETE',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  return json({ ok: true })
}

// Helper used here + by /push/broadcast. Upserts on the `endpoint`
// unique column so re-subscribing on the same browser is idempotent.
async function supabaseUpsert(env: Env, table: string, row: object, onConflict: string): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  })
}

// ---------- /push/test --------------------------------------------------

async function handlePushTest(req: Request, env: Env): Promise<Response> {
  const raw = await readBoundedJson(req, 4 * 1024)
  if (!raw || typeof raw !== 'object') return json({ error: 'bad json' }, 400)
  const p = raw as { endpoint?: unknown; title?: unknown; body?: unknown; url?: unknown }
  const endpoint = safePushEndpoint(p.endpoint)
  if (!endpoint) return json({ error: 'invalid endpoint' }, 400)
  // Defaults for optional fields, validated where supplied.
  const title = (p.title === undefined ? null : safeString(p.title, 100)) ?? '🔔 WC26 test'
  const body = (p.body === undefined ? null : safeString(p.body, 240)) ?? 'Push notifications are working — see you at kickoff.'
  // url must stay a relative path within our site — reject any absolute
  // URLs so the notification can't deep-link to phishing pages.
  const rawUrl = p.url === undefined ? '/today' : safeString(p.url, 200)
  if (!rawUrl || !rawUrl.startsWith('/')) {
    return json({ error: 'url must be a relative path' }, 400)
  }
  // Look up the sub in Supabase to grab its keys
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=endpoint,p256dh,auth`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  const rows = (await resp.json()) as Array<{ endpoint: string; p256dh: string; auth: string }>
  if (!rows.length) return json({ error: 'subscription not found' }, 404)
  const sub: PushSub = { endpoint: rows[0].endpoint, keys: { p256dh: rows[0].p256dh, auth: rows[0].auth } }
  const r = await sendWebPush(env, sub, { title, body, url: rawUrl, tag: 'wc26-test' })
  return json({ ok: r.ok, status: r.status })
}

// ---------- /push/broadcast ---------------------------------------------

async function handlePushBroadcast(req: Request, env: Env): Promise<Response> {
  // Admin guard — the broadcast endpoint can blast every saved
  // subscription, so we gate it behind a shared secret in the
  // x-admin-token header. Configure via wrangler secret put ADMIN_TOKEN.
  // Compare in constant time so a brute-force attacker can't measure
  // per-character latency to extract the token.
  const adminToken = (env as Env & { ADMIN_TOKEN?: string }).ADMIN_TOKEN
  const provided = req.headers.get('x-admin-token') ?? ''
  if (!adminToken || !constantTimeEqual(provided, adminToken)) {
    // Same 401 for missing AND wrong token to avoid disclosing
    // whether the header was present.
    return json({ error: 'unauthorised' }, 401)
  }
  const raw = await readBoundedJson(req, 4 * 1024)
  if (!raw || typeof raw !== 'object') return json({ error: 'bad json' }, 400)
  const p = raw as { title?: unknown; body?: unknown; url?: unknown; tag?: unknown }
  const title = (p.title === undefined ? null : safeString(p.title, 100)) ?? 'WC26 Live'
  const body = (p.body === undefined ? null : safeString(p.body, 240)) ?? 'Match update'
  const rawUrl = p.url === undefined ? '/today' : safeString(p.url, 200)
  if (!rawUrl || !rawUrl.startsWith('/')) {
    return json({ error: 'url must be a relative path' }, 400)
  }
  const tag = (p.tag === undefined ? null : safeString(p.tag, 60)) ?? 'wc26-broadcast'
  const result = await broadcastCore(env, { title, body, url: rawUrl, tag })
  return json({ ok: true, ...result })
}

/**
 * Length-padded constant-time string comparison. JS '===' returns as
 * soon as it finds a mismatching byte; that timing leak is enough to
 * extract a secret one character at a time given a network you can
 * watch. This loop compares every byte regardless of where the first
 * mismatch is found.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still walk a constant number of bytes to mask the length
    // difference timing — but the final result is false either way.
    let mismatch = 1
    const len = Math.max(a.length, b.length)
    for (let i = 0; i < len; i++) {
      mismatch |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0)
    }
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Pure broadcast helper — fans out a notification to every saved
 * subscription. Called by the HTTP endpoint AND by the cron-driven
 * kickoff / goal / FT auto-alerts in scheduled(). Auto-prunes 404/410
 * endpoints from Supabase so dead subscriptions don't keep eating
 * subrequests forever.
 */
/**
 * Exported so admin.ts can call it directly. We can't have admin.ts do an
 * internal `fetch(self_url + '/push/broadcast')` because Cloudflare Workers
 * forbid a worker from fetching its own hostname (it would loop).
 */
export async function broadcastCore(
  env: Env,
  notif: { title: string; body: string; url: string; tag: string }
): Promise<{ sent: number; failed: number; total: number }> {
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  )
  const rows = (await resp.json()) as Array<{ endpoint: string; p256dh: string; auth: string }>
  let sent = 0
  let failed = 0
  // Fan-out in batches of 20 to keep the worker invocation under the
  // CPU + subrequest limits.
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20)
    await Promise.all(
      batch.map(async (row) => {
        const r = await sendWebPush(
          env,
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          notif
        )
        if (r.ok) sent++
        else failed++
        if (r.status === 404 || r.status === 410) {
          await fetch(
            `${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`,
            {
              method: 'DELETE',
              headers: {
                apikey: env.SUPABASE_SERVICE_KEY,
                authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              },
            }
          )
        }
      })
    )
  }
  return { sent, failed, total: rows.length }
}

// ============================================================================
// Durable Object: KickoffScheduler
// ============================================================================
//
// Holds a queue of upcoming push items keyed by event id and uses DO
// Alarms to fire each one at the exact second it's due. One singleton
// instance ('singleton' DO name) is enough for the whole tournament —
// 64 matches * one alert each is well within DO storage limits.
//
// Why a DO instead of just a tighter cron:
//   - DO Alarms fire at the requested timestamp ± a few seconds, vs a
//     5-min cron tick that can land anywhere in the 13-17 min window
//     and even miss matches that fall just outside it.
//   - The notification body can honestly say 'in 15 min' because it
//     fires at exactly kickoff - 15 min, not 'somewhere between 13
//     and 17 min before kickoff'.
//   - Cron-level dedupe (KV sentinel) survives DO restarts and won't
//     accidentally re-fire a kickoff that's already gone out.
//
// Protocol (HTTP-shaped because that's how Worker → DO talks):
//   POST /schedule   body: ScheduledPush[]   adds items, sets alarm
//
// The DO is invoked from the 5-min cron via:
//   env.SCHEDULER.get(env.SCHEDULER.idFromName('singleton'))
//     .fetch('https://do/schedule', { method: 'POST', body })

export class KickoffScheduler {
  private state: DurableObjectState
  private env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/schedule' && req.method === 'POST') {
      try {
        const incoming = (await req.json()) as ScheduledPush[]
        if (!Array.isArray(incoming)) return new Response('expected array', { status: 400 })
        // Upsert by id into the queue, keep it sorted by fireAt asc.
        const existing = (await this.state.storage.get<ScheduledPush[]>('queue')) ?? []
        const byId = new Map<string, ScheduledPush>()
        for (const item of existing) byId.set(item.id, item)
        for (const item of incoming) byId.set(item.id, item) // overwrite ok — same id same kickoff time
        const merged = [...byId.values()].sort((a, b) => a.fireAt - b.fireAt)
        await this.state.storage.put('queue', merged)
        // Re-arm the alarm to the earliest pending fireAt.
        const next = merged[0]
        if (next) {
          // setAlarm replaces any existing alarm — no need to clear first.
          await this.state.storage.setAlarm(next.fireAt)
        }
        return new Response(JSON.stringify({ ok: true, queued: incoming.length, total: merged.length }), {
          headers: { 'content-type': 'application/json' },
        })
      } catch (e) {
        return new Response(`schedule failed: ${String(e)}`, { status: 500 })
      }
    }
    if (url.pathname === '/inspect' && req.method === 'GET') {
      // Debug helper — list what's pending. Useful for `wrangler tail`.
      const queue = (await this.state.storage.get<ScheduledPush[]>('queue')) ?? []
      return new Response(JSON.stringify({ queue }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }

  /**
   * Fires when the previously-set alarm reaches its scheduled time.
   * Pops every queue item whose fireAt is in the past (including the
   * one that triggered this alarm), broadcasts their notifications,
   * and re-arms the alarm to the next pending item.
   *
   * Cloudflare guarantees alarm() runs at most ~30s after the requested
   * time. If alarm() throws, CF retries with exponential backoff (up to
   * ~6 times), so transient broadcast failures are forgiven.
   */
  async alarm(): Promise<void> {
    const queue = (await this.state.storage.get<ScheduledPush[]>('queue')) ?? []
    if (queue.length === 0) return
    const now = Date.now()
    const due = queue.filter((i) => i.fireAt <= now + 5_000) // 5s slack
    const remaining = queue.filter((i) => i.fireAt > now + 5_000)

    // Fire each due item — errors on one don't block the others.
    for (const item of due) {
      try {
        await broadcastCore(this.env, item.notif)
        console.log(`[push:do] fired kickoff for event ${item.id}`)
      } catch (e) {
        console.log(`[push:do] broadcast failed for ${item.id}:`, e)
      }
    }

    await this.state.storage.put('queue', remaining)
    // Re-arm for the next pending item, if any.
    if (remaining.length > 0) {
      await this.state.storage.setAlarm(remaining[0].fireAt)
    }
  }
}
