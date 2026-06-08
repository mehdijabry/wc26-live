/**
 * WC26 API client — talks to the Cloudflare Worker proxy that
 * caches ESPN's public soccer API for the FIFA World Cup 26.
 */

export const API_BASE =
  import.meta.env.VITE_API_BASE ?? 'https://wc26-api.nameless-violet-5dc1.workers.dev'

export type EspnTeam = {
  id?: string
  abbreviation?: string
  displayName?: string
  shortDisplayName?: string
  logo?: string
  color?: string
}

export type EspnCompetitor = {
  homeAway: 'home' | 'away'
  score?: string
  winner?: boolean
  team?: EspnTeam
}

export type EspnStatus = {
  clock?: number
  displayClock?: string
  period?: number
  type?: { state?: 'pre' | 'in' | 'post'; completed?: boolean; description?: string }
}

export type EspnEvent = {
  id: string
  date?: string
  shortName?: string
  name?: string
  status?: EspnStatus
  competitions?: Array<{
    competitors?: EspnCompetitor[]
    venue?: { fullName?: string; address?: { city?: string; country?: string } }
  }>
}

export type EspnScoreboard = { events?: EspnEvent[] }

async function jget<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`)
  if (!resp.ok) throw new Error(`API ${path} → ${resp.status}`)
  return (await resp.json()) as T
}

export type DailyComp = {
  slug: string
  label: string
  tier: number
  events: EspnEvent[]
}
export type DailyResponse = {
  date: string
  total: number
  hasLive: boolean
  competitions: DailyComp[]
  fetchedAt: string
}

export type TournamentResponse = {
  total: number
  hasLive: boolean
  events: EspnEvent[]
  fetchedAt: string
}

export type RosterAthlete = {
  id?: string
  fullName?: string
  displayName?: string
  shortName?: string
  jersey?: string | number
  position?: { abbreviation?: string; displayName?: string }
  age?: number
  height?: number
  weight?: number
  citizenship?: string
  flag?: { href?: string }
  headshot?: { href?: string }
  birthPlace?: { country?: string }
}

export type RosterResponse = {
  team?: { displayName?: string; abbreviation?: string; logo?: string; logos?: Array<{ href?: string }> }
  athletes: RosterAthlete[]
  source: string | null
  fetchedAt: string
}

export type HistoryEvent = EspnEvent & {
  tag?: string
  competitions?: Array<{
    competitors?: Array<{
      homeAway: 'home' | 'away'
      // `/schedule` endpoint nests score as { value, displayValue, winner }
      score?: string | { value?: number; displayValue?: string; winner?: boolean }
      winner?: boolean
      team?: EspnTeam
    }>
    venue?: { fullName?: string; address?: { city?: string; country?: string } }
  }>
}

export type HistoryResponse = {
  abbr: string
  total: number
  summary: { won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; played: number }
  events: HistoryEvent[]
  fetchedAt: string
}

// WC26 tournament window — June 11 → July 19, 2026. Constraining the
// ESPN scoreboard to this date range avoids contamination from
// pre-tournament friendlies + CAF/UEFA qualifiers, which is what
// caused the connected-component group derivation to produce nonsense
// clusters ("Morocco / Mexico / Canada / Australia" in Group A,
// Morocco AND Group D both showing) because qualifier games linked
// teams across groups. With the date filter we only see the 72 actual
// group-stage matches → clean adjacency map → 12 correct groups.
const TOURNAMENT_DATE_RANGE = '20260611-20260719'

// ESPN's site.api endpoint allows CORS from any origin (we verified
// `access-control-allow-origin: *`), so we can call it directly from
// the browser without going through the proxy worker. The worker
// doesn't forward query strings, which is why date-filtered calls
// were returning only 2 events — we bypass it for scoreboard.
const ESPN_DIRECT = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'

async function jgetDirect<T>(url: string): Promise<T> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
  return resp.json() as Promise<T>
}

// ESPN "all soccer" endpoint — returns every match across every covered
// league for the queried date. Doesn't need a CORS proxy.
const ESPN_ALL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard'

// Per-league label + tier map. Slugs come from event.season.slug.
// Anything not in this map falls into a generic "Other" bucket.
const LEAGUE_META: Record<string, { label: string; tier: number; slug: string }> = {
  // Tier 0 — World stage
  '2026-fifa.world':                 { label: 'FIFA World Cup',          tier: 0, slug: 'fifa.world' },
  '2026-international-friendly':     { label: 'International friendlies', tier: 0, slug: 'fifa.friendly' },
  '2026-uefa.nations':                { label: 'UEFA Nations League',     tier: 0, slug: 'uefa.nations' },
  '2026-uefa.euro':                  { label: 'UEFA Euro',               tier: 0, slug: 'uefa.euro' },
  '2026-conmebol.america':           { label: 'Copa America',            tier: 0, slug: 'conmebol.america' },
  '2026-caf.nations':                 { label: 'AFCON',                   tier: 0, slug: 'caf.nations' },
  // Tier 1 — UEFA club cups
  '2026-uefa.champions':             { label: 'Champions League',        tier: 1, slug: 'uefa.champions' },
  '2026-uefa.europa':                 { label: 'Europa League',           tier: 1, slug: 'uefa.europa' },
  '2026-uefa.europa.conf':           { label: 'Conference League',       tier: 1, slug: 'uefa.europa.conf' },
  // Tier 2 — Top 5 leagues
  '2026-eng.1':                       { label: 'Premier League',          tier: 2, slug: 'eng.1' },
  '2026-esp.1':                       { label: 'LaLiga',                  tier: 2, slug: 'esp.1' },
  '2026-ita.1':                       { label: 'Serie A',                 tier: 2, slug: 'ita.1' },
  '2026-ger.1':                       { label: 'Bundesliga',              tier: 2, slug: 'ger.1' },
  '2026-fra.1':                       { label: 'Ligue 1',                 tier: 2, slug: 'fra.1' },
}

function tagEvent(ev: EspnEvent): { label: string; tier: number; slug: string } {
  const seasonSlug: string | undefined = (ev as unknown as { season?: { slug?: string } }).season?.slug
  if (seasonSlug && LEAGUE_META[seasonSlug]) return LEAGUE_META[seasonSlug]
  // Fallbacks based on substrings
  if (seasonSlug?.includes('fifa.world'))  return { label: 'FIFA World Cup', tier: 0, slug: 'fifa.world' }
  if (seasonSlug?.includes('friendly'))    return { label: 'Friendlies',     tier: 0, slug: 'fifa.friendly' }
  if (seasonSlug?.includes('u20') || seasonSlug?.includes('u21') || seasonSlug?.includes('u23')) {
    return { label: 'Youth internationals', tier: 4, slug: 'youth' }
  }
  return { label: seasonSlug?.replace(/^\d+-/, '').replace(/[-.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Other', tier: 9, slug: seasonSlug ?? 'other' }
}

export const api = {
  health: () => jget<{ ok: boolean; service: string; t: string }>('/health'),
  scoreboard: () => jgetDirect<EspnScoreboard>(
    `${ESPN_DIRECT}/scoreboard?dates=${TOURNAMENT_DATE_RANGE}&limit=200`
  ),
  fixtures: () => jgetDirect<EspnScoreboard>(
    `${ESPN_DIRECT}/scoreboard?dates=${TOURNAMENT_DATE_RANGE}&limit=200`
  ),
  tournament: () => jget<TournamentResponse>('/tournament'),
  standings: () => jget<unknown>('/standings'),
  match: (id: string) => jget<{ header?: unknown; gameInfo?: unknown }>(`/match/${id}`),
  team: (code: string) => jget<unknown>(`/teams/${code}`),
  roster: (code: string) => jget<RosterResponse>(`/roster/${code.toLowerCase()}`),
  // v=2 bumps the URL when the Worker history schema changes (added knockout
  // rounds + qualifiers + AFCON) so browsers don't keep serving the old
  // /team-history payload from their HTTP cache.
  history: (code: string) => jget<HistoryResponse>(`/team-history/${code.toLowerCase()}?v=2`),
  // Daily matches — bypasses our Cloudflare worker (which silently filtered
  // out 75% of ESPN's events) and calls ESPN's /all/scoreboard direct.
  // Groups by league via event.season.slug. Returns the same DailyResponse
  // shape the UI already consumes.
  today: async (date?: string): Promise<DailyResponse> => {
    const d = date ?? ymdLocal(new Date())
    const raw = await jgetDirect<EspnScoreboard>(`${ESPN_ALL}?dates=${d}&limit=300`)
    const events = raw.events ?? []
    // Group events by league slug
    const byLeague = new Map<string, { label: string; tier: number; events: EspnEvent[] }>()
    let hasLive = false
    for (const ev of events) {
      const tag = tagEvent(ev)
      const cur = byLeague.get(tag.slug) ?? { label: tag.label, tier: tag.tier, events: [] }
      cur.events.push(ev)
      byLeague.set(tag.slug, cur)
      if (ev.status?.type?.state === 'in') hasLive = true
    }
    // Sort each league's events by kickoff
    const competitions: DailyComp[] = Array.from(byLeague.entries())
      .map(([slug, v]) => ({
        slug,
        label: v.label,
        tier: v.tier,
        events: v.events.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
      }))
      // Tier 0 first, then by tier, then by label
      .sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label))
    return {
      date: d,
      total: events.length,
      hasLive,
      competitions,
      fetchedAt: new Date().toISOString(),
    }
  },
}

/* -------------------------------------------------------------------------- */
/* News articles — straight from ESPN per-league /news endpoint               */
/* CORS is open, no key required. We fan out across the leagues we care       */
/* about and merge by `published` desc client-side.                           */
/* -------------------------------------------------------------------------- */

export type NewsArticle = {
  id: string
  headline: string
  description: string
  publishedAt: string
  image?: string
  href?: string
  byline?: string
  source: string   // "Premier League", "FIFA World Cup", etc. (derived)
}

const NEWS_LEAGUES: Array<{ slug: string; label: string }> = [
  { slug: 'fifa.world',      label: 'FIFA World Cup' },
  { slug: 'uefa.champions',  label: 'Champions League' },
  { slug: 'eng.1',           label: 'Premier League' },
  { slug: 'esp.1',           label: 'LaLiga' },
  { slug: 'ita.1',           label: 'Serie A' },
  { slug: 'ger.1',           label: 'Bundesliga' },
  { slug: 'fra.1',           label: 'Ligue 1' },
  { slug: 'caf.nations_qualifying', label: 'CAF qualifying' },
  { slug: 'fifa.friendly',   label: 'Friendlies' },
]

type EspnArticle = {
  id?: number | string
  headline?: string
  description?: string
  published?: string
  byline?: string
  images?: Array<{ url?: string }>
  links?: { web?: { href?: string }; mobile?: { href?: string } }
}

export async function fetchNews(perLeague = 4): Promise<NewsArticle[]> {
  const all = await Promise.all(
    NEWS_LEAGUES.map(async (lg) => {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${lg.slug}/news?limit=${perLeague}`
        const r = await fetch(url)
        if (!r.ok) return []
        const d = await r.json() as { articles?: EspnArticle[] }
        const arr = d.articles ?? []
        return arr.map((a) => ({
          id: String(a.id ?? a.headline ?? Math.random()),
          headline: a.headline ?? '',
          description: a.description ?? '',
          publishedAt: a.published ?? '',
          image: a.images?.[0]?.url,
          href: a.links?.web?.href ?? a.links?.mobile?.href,
          byline: a.byline,
          source: lg.label,
        })) as NewsArticle[]
      } catch {
        return []
      }
    })
  )
  const merged = all.flat()
  // Dedup by headline + sort newest first
  const seen = new Set<string>()
  const deduped: NewsArticle[] = []
  for (const a of merged) {
    const key = a.headline.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(a)
  }
  deduped.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
  return deduped
}

// "YYYYMMDD" for a Date in the USER's local timezone — what ESPN expects
// when you want matches that take place on a given LOCAL day. Was UTC
// before, which mis-bucketed late-evening games (e.g. a 22h00 EDT game
// is 02h00 UTC next day → it disappeared from the user's "Today" view).
export function ymdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

// Kept for backwards compat with old callers — alias to ymdLocal now.
export const ymdUtc = ymdLocal

// Helper: ESPN status → simple label
export function statusLabel(ev: EspnEvent): { label: string; live: boolean; finished: boolean } {
  const s = ev.status?.type?.state
  if (s === 'in') return { label: ev.status?.displayClock ?? 'LIVE', live: true, finished: false }
  if (s === 'post') return { label: ev.status?.type?.description ?? 'FT', live: false, finished: true }
  return { label: ev.status?.type?.description ?? 'Scheduled', live: false, finished: false }
}

export function eventTeams(ev: EspnEvent): { home: EspnCompetitor | undefined; away: EspnCompetitor | undefined } {
  const comp = ev.competitions?.[0]
  const home = comp?.competitors?.find((c) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c) => c.homeAway === 'away')
  return { home, away }
}
