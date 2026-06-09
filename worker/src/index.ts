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
  'https://pressing90.live',
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

      // National team roster — falls back through several ESPN endpoints
      // because the public site API rarely exposes international rosters
      // until very close to kickoff. We try the WC league path first, then
      // fan out through known confederation leagues.
      const rosterMatch = url.pathname.match(/^\/roster\/([^/]+)$/)
      if (rosterMatch) {
        const code = rosterMatch[1]
        return cors(await fetchRoster(env, code), req)
      }

      // Full team history — past WCs (2022, 2018, 2014, 2010, 2006) + recent
      // friendlies. Aggregates across multiple ESPN league/season paths.
      const historyMatch = url.pathname.match(/^\/team-history\/([^/]+)$/)
      if (historyMatch) {
        const code = historyMatch[1]
        return cors(await fetchTeamHistory(env, code), req)
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
