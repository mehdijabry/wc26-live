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
//
// Tiers are intentionally fine-grained so the user sees the BIG matches
// first when scrolling. ESPN's scoreboard returns events in chronological
// order; we re-bucket + sort by tier so Champions League always sits
// above MLS, La Liga above Eredivisie, etc.
//
// Rough ordering rationale (per user feedback): The World Cup itself
// outranks everything; among club competitions the UCL is king, then
// the Top-5 leagues (La Liga bumped slightly per user preference),
// then UEL/UECL, then second-tier internationals (Euro/Copa/AFCON
// when they're actually running), then other big domestic leagues
// (Saudi/MLS/Liga MX/Eredivisie/Primeira/Belgian), then everything
// else. Friendlies are explicitly demoted — they used to be tier 0.
const LEAGUE_META: Record<string, { label: string; tier: number; slug: string }> = {
  // Tier 0 — THE event
  '2026-fifa.world':                 { label: 'FIFA World Cup',          tier: 0, slug: 'fifa.world' },

  // Tier 1 — Champions League (the club crown)
  '2026-uefa.champions':             { label: 'Champions League',        tier: 1, slug: 'uefa.champions' },

  // Tier 2 — Other elite club continental
  '2026-conmebol.libertadores':       { label: 'Copa Libertadores',       tier: 2, slug: 'conmebol.libertadores' },

  // Tier 3 — La Liga (user-bumped)
  '2026-esp.1':                       { label: 'LaLiga',                  tier: 3, slug: 'esp.1' },

  // Tier 4 — Premier League
  '2026-eng.1':                       { label: 'Premier League',          tier: 4, slug: 'eng.1' },

  // Tier 5 — Bundesliga
  '2026-ger.1':                       { label: 'Bundesliga',              tier: 5, slug: 'ger.1' },

  // Tier 6 — Serie A
  '2026-ita.1':                       { label: 'Serie A',                 tier: 6, slug: 'ita.1' },

  // Tier 7 — Ligue 1
  '2026-fra.1':                       { label: 'Ligue 1',                 tier: 7, slug: 'fra.1' },

  // Tier 8 — UEFA Europa League
  '2026-uefa.europa':                 { label: 'Europa League',           tier: 8, slug: 'uefa.europa' },

  // Tier 9 — UEFA Conference League
  '2026-uefa.europa.conf':           { label: 'Conference League',       tier: 9, slug: 'uefa.europa.conf' },

  // Tier 10 — Top international tournaments (when in season)
  '2026-uefa.euro':                  { label: 'UEFA Euro',               tier: 10, slug: 'uefa.euro' },
  '2026-conmebol.america':           { label: 'Copa America',            tier: 10, slug: 'conmebol.america' },
  '2026-caf.nations':                 { label: 'AFCON',                   tier: 10, slug: 'caf.nations' },
  '2026-afc.asian':                   { label: 'Asian Cup',               tier: 10, slug: 'afc.asian' },

  // Tier 11 — National team qualifiers
  '2026-fifa.worldq.uefa':            { label: 'WC Qualifiers · UEFA',    tier: 11, slug: 'fifa.worldq.uefa' },
  '2026-fifa.worldq.conmebol':        { label: 'WC Qualifiers · CONMEBOL', tier: 11, slug: 'fifa.worldq.conmebol' },
  '2026-fifa.worldq.afc':              { label: 'WC Qualifiers · AFC',     tier: 11, slug: 'fifa.worldq.afc' },
  '2026-fifa.worldq.caf':              { label: 'WC Qualifiers · CAF',     tier: 11, slug: 'fifa.worldq.caf' },
  '2026-fifa.worldq.concacaf':        { label: 'WC Qualifiers · CONCACAF', tier: 11, slug: 'fifa.worldq.concacaf' },
  '2026-uefa.nations':                { label: 'UEFA Nations League',     tier: 11, slug: 'uefa.nations' },

  // Tier 12 — Other big domestic leagues
  '2026-sau.1':                       { label: 'Saudi Pro League',         tier: 12, slug: 'sau.1' },
  '2026-usa.1':                       { label: 'Major League Soccer',     tier: 12, slug: 'usa.1' },
  '2026-mex.1':                       { label: 'Liga MX',                 tier: 12, slug: 'mex.1' },
  '2026-bra.1':                       { label: 'Brasileirão',             tier: 12, slug: 'bra.1' },
  '2026-arg.1':                       { label: 'Primera División',         tier: 12, slug: 'arg.1' },

  // Tier 13 — Smaller European top divisions
  '2026-ned.1':                       { label: 'Eredivisie',              tier: 13, slug: 'ned.1' },
  '2026-por.1':                       { label: 'Primeira Liga',           tier: 13, slug: 'por.1' },
  '2026-bel.1':                       { label: 'Belgian Pro League',      tier: 13, slug: 'bel.1' },
  '2026-tur.1':                       { label: 'Süper Lig',               tier: 13, slug: 'tur.1' },
  '2026-sco.1':                       { label: 'Scottish Premiership',    tier: 13, slug: 'sco.1' },

  // Tier 14 — Other CONMEBOL clubs
  '2026-conmebol.sudamericana':       { label: 'Copa Sudamericana',       tier: 14, slug: 'conmebol.sudamericana' },

  // Tier 15 — Second tiers
  '2026-eng.2':                       { label: 'Championship (England)',   tier: 15, slug: 'eng.2' },
  '2026-esp.2':                       { label: 'LaLiga 2',                 tier: 15, slug: 'esp.2' },
  '2026-ger.2':                       { label: '2. Bundesliga',            tier: 15, slug: 'ger.2' },
  '2026-ita.2':                       { label: 'Serie B',                  tier: 15, slug: 'ita.2' },
  '2026-fra.2':                       { label: 'Ligue 2',                  tier: 15, slug: 'fra.2' },

  // Tier 18 — International friendlies (demoted from old tier 0)
  '2026-international-friendly':     { label: 'International friendlies', tier: 18, slug: 'fifa.friendly' },

  // Tier 19 — Club friendlies
  '2026-club-friendly':                { label: 'Club friendlies',          tier: 19, slug: 'club.friendly' },
}

/**
 * Fallback table — ESPN sometimes returns events with season.slug =
 * 'group-stage' / 'regular-season' / 'apertura---finals' / 'torneo-
 * intermedio' which tells us the ROUND but not the LEAGUE. The actual
 * league lives in the event.uid as `l:NNNN`. This map covers the IDs
 * we've seen ESPN serve in /all/scoreboard responses.
 *
 * Discover new IDs: `curl '…/all/scoreboard?dates=YYYYMMDD' | jq '.events[].uid'`
 */
const LEAGUE_BY_ID: Record<string, { label: string; tier: number; slug: string }> = {
  '775':   { label: 'FIFA World Cup',         tier: 0,  slug: 'fifa.world' },
  '2':     { label: 'Champions League',       tier: 1,  slug: 'uefa.champions' },
  '650':   { label: 'Copa Libertadores',      tier: 2,  slug: 'conmebol.libertadores' },
  '15':    { label: 'LaLiga',                 tier: 3,  slug: 'esp.1' },
  '23':    { label: 'Premier League',         tier: 4,  slug: 'eng.1' },
  '10':    { label: 'Bundesliga',             tier: 5,  slug: 'ger.1' },
  '12':    { label: 'Serie A',                tier: 6,  slug: 'ita.1' },
  '9':     { label: 'Ligue 1',                tier: 7,  slug: 'fra.1' },
  '2310':  { label: 'Europa League',          tier: 8,  slug: 'uefa.europa' },
  '20296': { label: 'Conference League',      tier: 9,  slug: 'uefa.europa.conf' },
  '744':   { label: 'UEFA Euro',              tier: 10, slug: 'uefa.euro' },
  '740':   { label: 'Copa America',           tier: 10, slug: 'conmebol.america' },
  '660':   { label: 'CONCACAF Gold Cup',      tier: 10, slug: 'concacaf.gold' },
  '11109': { label: 'AFCON',                  tier: 10, slug: 'caf.nations' },
  '760':   { label: 'AFC Asian Cup',          tier: 10, slug: 'afc.asian' },
  '731':   { label: 'CONCACAF Nations League', tier: 11, slug: 'concacaf.nations' },
  '2247':  { label: 'UEFA Nations League',    tier: 11, slug: 'uefa.nations' },
  '4475':  { label: 'Saudi Pro League',       tier: 12, slug: 'sau.1' },
  '21':    { label: 'Major League Soccer',    tier: 12, slug: 'usa.1' },
  '7':     { label: 'Liga MX',                tier: 12, slug: 'mex.1' },
  '13':    { label: 'Brasileirão',            tier: 12, slug: 'bra.1' },
  '4060':  { label: 'Brasileirão · Série B',  tier: 13, slug: 'bra.2' },
  '76':    { label: 'Primera División · Argentina', tier: 12, slug: 'arg.1' },
  '20':    { label: 'Eredivisie',             tier: 13, slug: 'ned.1' },
  '14':    { label: 'Primeira Liga',          tier: 13, slug: 'por.1' },
  '6':     { label: 'Belgian Pro League',     tier: 13, slug: 'bel.1' },
  '18':    { label: 'Süper Lig',              tier: 13, slug: 'tur.1' },
  '45':    { label: 'Scottish Premiership',   tier: 13, slug: 'sco.1' },
  '4072':  { label: 'EFL Championship',       tier: 15, slug: 'eng.2' },
  '16':    { label: 'LaLiga 2',               tier: 15, slug: 'esp.2' },
  '11':    { label: '2. Bundesliga',          tier: 15, slug: 'ger.2' },
  '83':    { label: 'Serie B',                tier: 15, slug: 'ita.2' },
  '4061':  { label: 'Ligue 2',                tier: 15, slug: 'fra.2' },
  '3922':  { label: 'International friendlies', tier: 18, slug: 'fifa.friendly' },
  '4001':  { label: 'Club friendlies',         tier: 19, slug: 'club.friendly' },
}

function leagueIdFromUid(uid?: string): string | null {
  if (!uid) return null
  const m = /l:(\d+)/.exec(uid)
  return m ? m[1] : null
}

/**
 * Detect the category (Women / Youth age band) embedded in a slug.
 * Returns null for senior men's (the default — we never label it
 * 'Men' explicitly to keep the UI clean, same as Sofascore/FotMob).
 */
function detectCategory(slug: string): { code: 'W' | 'U23' | 'U21' | 'U20' | 'U19' | 'U18' | 'U17' | 'U15'; label: string } | null {
  const lower = slug.toLowerCase()
  // Women — ESPN uses 'w.' prefix or '-women-' or 'female' marker
  if (
    lower.startsWith('w.') || lower.includes('.w.') ||
    lower.includes('-w-') || lower.includes('-women') ||
    /\bwomen\b/.test(lower) || /\bfemale\b/.test(lower)
  ) {
    return { code: 'W', label: 'Women' }
  }
  // Youth — match the highest age first (U23 before U2 etc.)
  if (lower.includes('u23')) return { code: 'U23', label: 'U23' }
  if (lower.includes('u21')) return { code: 'U21', label: 'U21' }
  if (lower.includes('u20')) return { code: 'U20', label: 'U20' }
  if (lower.includes('u19')) return { code: 'U19', label: 'U19' }
  if (lower.includes('u18')) return { code: 'U18', label: 'U18' }
  if (lower.includes('u17')) return { code: 'U17', label: 'U17' }
  if (lower.includes('u15')) return { code: 'U15', label: 'U15' }
  return null
}

// Strip a category marker from a slug so the BASE competition can be
// matched against LEAGUE_META. e.g. 'w.uefa.champions' → 'uefa.champions',
// 'u21-international-friendly' → 'international-friendly'.
function stripCategory(slug: string): string {
  return slug
    .replace(/^w\.|\.w\.|-w-|w-|-women-?|women-?/gi, '')
    .replace(/u(15|17|18|19|20|21|23)[-.]?/gi, '')
    .replace(/--+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
}

function tagEvent(ev: EspnEvent): { label: string; tier: number; slug: string } {
  const seasonSlug: string | undefined = (ev as unknown as { season?: { slug?: string } }).season?.slug
  const uid = (ev as unknown as { uid?: string }).uid

  // Detect category FIRST so we can apply it as a suffix to every
  // competition label (Champions League · U21, LaLiga · Women, etc.)
  const cat = detectCategory(seasonSlug ?? '')

  // Look up the BASE competition (men's senior) — strip category markers
  // from the slug before matching so 'w.uefa.champions' still finds UCL.
  const baseSlug = cat ? stripCategory(seasonSlug ?? '') : seasonSlug

  // Prefer the per-season slug lookup first (covers our canonical mappings)
  let base = baseSlug ? LEAGUE_META[baseSlug] : undefined
  // Try with year prefix re-prepended too — '2026-uefa.champions'
  if (!base && baseSlug) base = LEAGUE_META['2026-' + baseSlug.replace(/^\d+-/, '')]

  // Then the ESPN league ID embedded in event.uid (`s:600~l:11109~e:…`).
  // Catches generic season slugs like 'group-stage' / 'regular-season' /
  // 'apertura---finals' where ESPN encodes the league only in the uid.
  if (!base) {
    const leagueId = leagueIdFromUid(uid)
    if (leagueId && LEAGUE_BY_ID[leagueId]) base = LEAGUE_BY_ID[leagueId]
  }

  // Substring fallbacks
  if (!base) {
    const bare = (baseSlug ?? '').replace(/^\d+-/, '')
    if (bare.includes('fifa.world')) {
      base = bare.includes('worldq')
        ? { label: 'WC Qualifiers', tier: 11, slug: 'fifa.worldq' }
        : { label: 'FIFA World Cup', tier: 0, slug: 'fifa.world' }
    } else if (bare.includes('uefa.champions')) {
      base = { label: 'Champions League', tier: 1, slug: 'uefa.champions' }
    } else if (bare.includes('uefa.europa.conf')) {
      base = { label: 'Conference League', tier: 9, slug: 'uefa.europa.conf' }
    } else if (bare.includes('uefa.europa')) {
      base = { label: 'Europa League', tier: 8, slug: 'uefa.europa' }
    } else if (bare.includes('uefa.euro')) {
      base = { label: 'UEFA Euro', tier: 10, slug: 'uefa.euro' }
    } else if (bare.includes('conmebol.libert')) {
      base = { label: 'Copa Libertadores', tier: 2, slug: 'conmebol.libertadores' }
    } else if (bare.includes('international-friendly')) {
      base = { label: 'International friendlies', tier: 18, slug: 'fifa.friendly' }
    } else if (bare.includes('club-friendly') || bare.includes('club.friendly')) {
      base = { label: 'Club friendlies', tier: 19, slug: 'club.friendly' }
    } else {
      // Last resort — title-case the slug
      const pretty = bare.replace(/[-.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Other'
      base = { label: pretty, tier: 16, slug: seasonSlug ?? 'other' }
    }
  }

  // Apply category suffix + adjust tier so men's stays above women's
  // and youth (matches FIFA/UEFA fixture display conventions). Slugs
  // get the category appended so men's UCL and women's UCL group
  // separately on the day board.
  if (cat) {
    const tierBump = cat.code === 'W' ? 1 : cat.code === 'U23' ? 4 : 6
    return {
      label: `${base.label} · ${cat.label}`,
      tier: base.tier + tierBump,
      slug: `${base.slug}.${cat.code.toLowerCase()}`,
    }
  }
  return base
}

/**
 * Flag emoji for a competition slug. Used by the UI to put a small
 * country marker next to 'Brasileirão · Série B' so the user knows
 * which country a generic league name refers to. Tournament slugs
 * (UCL / WC / etc.) return a tournament-specific icon instead.
 */
export function competitionFlag(slug: string): string {
  // Tournament icons first
  if (slug.startsWith('fifa.world')) return '🏆'
  if (slug.startsWith('uefa.champions')) return '⭐'
  if (slug.startsWith('uefa.europa.conf')) return '🟢'
  if (slug.startsWith('uefa.europa')) return '🟠'
  if (slug.startsWith('uefa.euro')) return '🇪🇺'
  if (slug.startsWith('uefa.nations')) return '🇪🇺'
  if (slug.startsWith('conmebol.libert')) return '🏆'
  if (slug.startsWith('conmebol.sudameric')) return '🏆'
  if (slug.startsWith('conmebol.america')) return '🌎'
  if (slug.startsWith('concacaf.gold')) return '🌎'
  if (slug.startsWith('concacaf.nations')) return '🌎'
  if (slug.startsWith('caf.nations')) return '🌍'
  if (slug.startsWith('afc.asian')) return '🌏'
  if (slug.includes('fifa.friendly') || slug === 'fifa.friendly' || slug === 'international-friendly') return '🌍'
  if (slug === 'club.friendly') return '⚽'
  if (slug === 'youth') return '🧒'
  if (slug === 'women') return '⚽'
  // Country leagues — slug pattern XXX.N (eng.1, esp.2, bra.1)
  const country = slug.split('.')[0]
  const FLAGS: Record<string, string> = {
    eng: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', esp: '🇪🇸', ger: '🇩🇪', ita: '🇮🇹', fra: '🇫🇷',
    bra: '🇧🇷', arg: '🇦🇷', ned: '🇳🇱', por: '🇵🇹', bel: '🇧🇪',
    tur: '🇹🇷', sco: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', sau: '🇸🇦', usa: '🇺🇸', mex: '🇲🇽',
    chi: '🇨🇱', col: '🇨🇴', uru: '🇺🇾', per: '🇵🇪', ecu: '🇪🇨',
    jpn: '🇯🇵', kor: '🇰🇷', aus: '🇦🇺', uae: '🇦🇪', qat: '🇶🇦',
    egy: '🇪🇬', mar: '🇲🇦', ksa: '🇸🇦', den: '🇩🇰', swe: '🇸🇪',
    nor: '🇳🇴', fin: '🇫🇮', swi: '🇨🇭', aut: '🇦🇹', cze: '🇨🇿',
    pol: '🇵🇱', rou: '🇷🇴', gre: '🇬🇷', cro: '🇭🇷', srb: '🇷🇸',
  }
  return FLAGS[country] ?? '⚽'
}

/**
 * Derive round / stake context from an ESPN event so the UI can show
 * 'Round of 16 · 2nd Leg', 'Matchday 5', 'Final', etc. Returns null
 * when ESPN's data doesn't carry an explicit round (e.g. plain league
 * regular-season fixture without a matchday note).
 *
 * Signals used:
 *  - event.season.slug — 'final', 'semifinals', 'quarterfinals',
 *    'round-of-16', 'group-stage', 'play-in', 'qualifying' …
 *  - event.competitions[0].notes[0].headline — '2nd Leg - X advance',
 *    'Matchday 8', 'Group A', etc.
 */
export function roundContext(ev: EspnEvent): {
  label: string
  short: string
  knockout: boolean
  decisive: boolean
} | null {
  const seasonSlug = (ev as unknown as { season?: { slug?: string; displayName?: string } }).season?.slug ?? ''
  const notes = (ev.competitions?.[0] as { notes?: Array<{ headline?: string; text?: string }> } | undefined)?.notes ?? []
  const head = notes[0]?.headline ?? notes[0]?.text ?? ''
  const lower = (seasonSlug + ' ' + head).toLowerCase()

  // Knockout rounds — return early since they're the clearest signal
  if (/^final$/.test(seasonSlug) || /^(\d+(st|nd|rd|th)?\s+)?leg/i.test(head) && lower.includes('final') && !lower.includes('semi') && !lower.includes('quarter')) {
    return { label: 'Final', short: 'F', knockout: true, decisive: true }
  }
  if (lower.includes('semifinal')) {
    return { label: 'Semifinal' + (legSuffix(head) ?? ''), short: 'SF', knockout: true, decisive: legSuffix(head) === ' · 2nd Leg' || !legSuffix(head) }
  }
  if (lower.includes('quarterfinal') || lower.includes('quarter-final') || seasonSlug === 'quarterfinals') {
    return { label: 'Quarterfinal' + (legSuffix(head) ?? ''), short: 'QF', knockout: true, decisive: legSuffix(head) === ' · 2nd Leg' || !legSuffix(head) }
  }
  const r16 = /round[-\s]of[-\s](16|32|64)/i.exec(lower)
  if (r16) {
    return {
      label: `Round of ${r16[1]}` + (legSuffix(head) ?? ''),
      short: `R${r16[1]}`,
      knockout: true,
      decisive: legSuffix(head) === ' · 2nd Leg',
    }
  }
  if (lower.includes('play-off') || lower.includes('playoff') || lower.includes('play-in')) {
    return { label: 'Play-off' + (legSuffix(head) ?? ''), short: 'PO', knockout: true, decisive: true }
  }
  if (lower.includes('group-stage') || lower.includes('group stage')) {
    const md = /match[-\s]?day\s*(\d+)/i.exec(head)
    return { label: md ? `Group · MD ${md[1]}` : 'Group stage', short: md ? `MD${md[1]}` : 'GS', knockout: false, decisive: false }
  }
  // League matchday
  const md = /match[-\s]?day\s*(\d+)/i.exec(head)
  if (md) return { label: `Matchday ${md[1]}`, short: `MD${md[1]}`, knockout: false, decisive: false }

  // Qualifying / pre-season
  if (lower.includes('qualifying')) {
    return { label: 'Qualifying round', short: 'Q', knockout: true, decisive: true }
  }
  return null
}

// Returns ' · 1st Leg' / ' · 2nd Leg' when the headline mentions it, else null.
function legSuffix(head: string): string | null {
  const m = /(1st|2nd)\s+Leg/i.exec(head)
  if (!m) return null
  return ' · ' + m[1] + ' Leg'
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
