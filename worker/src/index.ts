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

export interface Env {
  CACHE: KVNamespace
  SUPABASE_URL: string
  SUPABASE_SERVICE_KEY: string
}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
const ESPN_SOCCER = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const ALLOW_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://wc26.mehdijabry.dev',
]

// Curated competitions for the daily aggregator. Order matters — it's the
// display order in the UI (top-tier leagues first, then friendlies/other).
const DAILY_LEAGUES: Array<{ slug: string; label: string; tier: number }> = [
  { slug: 'fifa.world',             label: 'FIFA World Cup 26',     tier: 0 },
  { slug: 'uefa.champions',         label: 'UEFA Champions League', tier: 1 },
  { slug: 'uefa.europa',            label: 'UEFA Europa League',    tier: 1 },
  { slug: 'uefa.europa.conf',       label: 'UEFA Conference League',tier: 1 },
  { slug: 'eng.1',                  label: 'Premier League',        tier: 2 },
  { slug: 'esp.1',                  label: 'LaLiga',                tier: 2 },
  { slug: 'ita.1',                  label: 'Serie A',               tier: 2 },
  { slug: 'ger.1',                  label: 'Bundesliga',            tier: 2 },
  { slug: 'fra.1',                  label: 'Ligue 1',               tier: 2 },
  { slug: 'por.1',                  label: 'Liga Portugal',         tier: 3 },
  { slug: 'ned.1',                  label: 'Eredivisie',            tier: 3 },
  { slug: 'tur.1',                  label: 'Süper Lig',             tier: 3 },
  { slug: 'mex.1',                  label: 'Liga MX',               tier: 3 },
  { slug: 'usa.1',                  label: 'MLS',                   tier: 3 },
  { slug: 'sau.1',                  label: 'Saudi Pro League',      tier: 3 },
  { slug: 'arg.1',                  label: 'Liga Profesional',      tier: 3 },
  { slug: 'fifa.friendly',          label: 'International Friendlies', tier: 4 },
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

      // Full fixtures list
      if (url.pathname === '/fixtures') {
        return cors(await cachedFetch(env, 'fixtures', `${ESPN_BASE}/scoreboard?limit=200`, 3600), req)
      }

      // Standings (group stage tables)
      if (url.pathname === '/standings') {
        return cors(await cachedFetch(env, 'standings', `${ESPN_BASE}/standings`, 3600), req)
      }

      // Individual match summary
      const matchMatch = url.pathname.match(/^\/match\/([^/]+)$/)
      if (matchMatch) {
        const id = matchMatch[1]
        return cors(
          await cachedFetch(env, `match:${id}`, `${ESPN_BASE}/summary?event=${id}`, 30),
          req
        )
      }

      // Team roster + meta
      const teamMatch = url.pathname.match(/^\/teams\/([^/]+)$/)
      if (teamMatch) {
        const code = teamMatch[1]
        return cors(
          await cachedFetch(env, `team:${code}`, `${ESPN_BASE}/teams/${code}`, 86400),
          req
        )
      }

      // Daily aggregator — all competitions for a given day
      // /today?date=YYYYMMDD  (default = today UTC)
      if (url.pathname === '/today') {
        const dateParam = url.searchParams.get('date') ?? ymdUtc(new Date())
        return cors(await fetchDaily(env, dateParam), req)
      }

      return cors(json({ error: 'Not found' }, 404), req)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return cors(json({ error: msg }, 500), req)
    }
  },

  // ----- Cron: every 5 min sync finished matches → Supabase --------------
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const sb = await fetch(`${ESPN_BASE}/scoreboard?limit=200`)
      if (!sb.ok) return
      const data = await sb.json<EspnScoreboard>()
      const events = data.events ?? []

      const finished = events.filter((e) => {
        const status = e.status?.type?.state
        return status === 'post' // 'pre' | 'in' | 'post'
      })

      if (finished.length === 0) return

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

// ----- Helpers -----------------------------------------------------------

interface EspnScoreboard {
  events?: Array<{
    id: string
    date?: string
    status?: { type?: { state?: 'pre' | 'in' | 'post' } }
    competitions?: Array<{
      competitors?: Array<{
        homeAway: 'home' | 'away'
        score?: string
        team?: { abbreviation?: string }
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
  h.set('access-control-allow-methods', 'GET, OPTIONS')
  h.set('access-control-allow-headers', 'content-type')
  h.set('vary', 'origin')
  return new Response(resp.body, { status: resp.status, headers: h })
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
