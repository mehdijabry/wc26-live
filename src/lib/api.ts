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
  // season.slug carries the tournament stage: 'group-stage', 'round-of-32',
  // 'round-of-16', 'quarterfinals', 'semifinals', '3rd-place-match', 'final'.
  // Used by deriveBracket to bucket KO events.
  season?: { slug?: string; year?: number; type?: number }
  competitions?: Array<{
    status?: EspnStatus
    competitors?: EspnCompetitor[]
    // Pre-match 1X2 betting odds (DraftKings via ESPN, American moneyline).
    // TWO shapes coexist in the same feed: legacy homeTeamOdds/awayTeamOdds
    // (numbers) and the newer `moneyline.{home,away,draw}.close.odds`
    // (signed strings like '-900'). Finished/live matches come back as
    // odds:[null] — consumers must null-check each entry, not just the array.
    odds?: Array<{
      provider?: { name?: string }
      details?: string
      homeTeamOdds?: { moneyLine?: number }
      awayTeamOdds?: { moneyLine?: number }
      drawOdds?: { moneyLine?: number }
      moneyline?: {
        home?: { close?: { odds?: string }; open?: { odds?: string } }
        away?: { close?: { odds?: string }; open?: { odds?: string } }
        draw?: { close?: { odds?: string }; open?: { odds?: string } }
      }
    } | null>
    venue?: { fullName?: string; address?: { city?: string; country?: string } }
    // ESPN tags every WC26 group-stage event with a human-readable label
    // like "FIFA World Cup, Group A". This is the authoritative source
    // for the group letter — trying to infer letters by kickoff-order
    // silently swaps groups whose first fixture lands earlier than the
    // group before them (WC26 has Group D playing before Group C).
    altGameNote?: string
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
  // ====================================================================
  // TIER BUDGET — keep in sync with tagEvent() category bumps + the
  // LEAGUE_BY_ID block below. User rule: senior men NATIONAL TEAM matches
  // ALWAYS rank above club matches, even friendlies. The fan brain reads
  // a Norway-Argentina friendly as more interesting than a Tuesday
  // LaLiga relegation tussle.
  //
  //    0 -  9   Senior MEN national teams
  //   10 - 29   Senior MEN clubs
  //   30 - 49   Men's youth (via tagEvent() category bump of +30..+36)
  //   50 - 89   Women (via category bump of +50)
  //   90+      'Other competitions' catch-all
  // ====================================================================

  // -- Senior men's NATIONAL TEAMS (always at the top) -----------------

  // Tier 0 — THE tournament
  '2026-fifa.world':                 { label: 'FIFA World Cup',          tier: 0, slug: 'fifa.world' },

  // Tier 1 — Continental crowns (Euro, Copa America, AFCON, Asian Cup, Gold Cup)
  '2026-uefa.euro':                  { label: 'UEFA Euro',               tier: 1, slug: 'uefa.euro' },
  '2026-conmebol.america':           { label: 'Copa America',            tier: 1, slug: 'conmebol.america' },
  '2026-caf.nations':                 { label: 'AFCON',                   tier: 1, slug: 'caf.nations' },
  '2026-afc.asian':                   { label: 'Asian Cup',               tier: 1, slug: 'afc.asian' },

  // Tier 2 — WC and continental qualifiers (still high-stakes)
  '2026-fifa.worldq.uefa':            { label: 'WC Qualifiers · UEFA',    tier: 2, slug: 'fifa.worldq.uefa' },
  '2026-fifa.worldq.conmebol':        { label: 'WC Qualifiers · CONMEBOL', tier: 2, slug: 'fifa.worldq.conmebol' },
  '2026-fifa.worldq.afc':              { label: 'WC Qualifiers · AFC',     tier: 2, slug: 'fifa.worldq.afc' },
  '2026-fifa.worldq.caf':              { label: 'WC Qualifiers · CAF',     tier: 2, slug: 'fifa.worldq.caf' },
  '2026-fifa.worldq.concacaf':        { label: 'WC Qualifiers · CONCACAF', tier: 2, slug: 'fifa.worldq.concacaf' },

  // Tier 3 — UEFA Nations League (annual, official stakes)
  '2026-uefa.nations':                { label: 'UEFA Nations League',     tier: 2, slug: 'uefa.nations' },

  // Tier 8 — National-team friendlies (still senior men national, so
  // above ALL club competitions — that's the user rule).
  '2026-international-friendly':     { label: 'International friendlies', tier: 11, slug: 'fifa.friendly' },

  // -- Senior men's CLUBS ---------------------------------------------

  // Tier 10 — Champions League (the club crown)
  '2026-uefa.champions':             { label: 'Champions League',        tier: 6, slug: 'uefa.champions' },

  // Tier 11 — Copa Libertadores
  '2026-conmebol.libertadores':       { label: 'Copa Libertadores',       tier: 7, slug: 'conmebol.libertadores' },

  // Tier 12-16 — Top 5 European domestic leagues
  '2026-eng.1':                       { label: 'Premier League',          tier: 9, slug: 'eng.1' },
  '2026-esp.1':                       { label: 'LaLiga',                  tier: 9, slug: 'esp.1' },
  '2026-ita.1':                       { label: 'Serie A',                 tier: 9, slug: 'ita.1' },
  '2026-ger.1':                       { label: 'Bundesliga',              tier: 9, slug: 'ger.1' },
  '2026-fra.1':                       { label: 'Ligue 1',                 tier: 9, slug: 'fra.1' },

  // Tier 17-18 — Other UEFA club competitions
  '2026-uefa.europa':                 { label: 'Europa League',           tier: 7, slug: 'uefa.europa' },
  '2026-uefa.europa.conf':           { label: 'Conference League',       tier: 8, slug: 'uefa.europa.conf' },

  // Tier 19 — Other big domestic leagues (Americas + Saudi)
  '2026-sau.1':                       { label: 'Saudi Pro League',         tier: 13, slug: 'sau.1' },
  '2026-usa.1':                       { label: 'Major League Soccer',     tier: 13, slug: 'usa.1' },
  '2026-mex.1':                       { label: 'Liga MX',                 tier: 13, slug: 'mex.1' },
  '2026-bra.1':                       { label: 'Brasileirão',             tier: 13, slug: 'bra.1' },
  '2026-arg.1':                       { label: 'Primera División',         tier: 13, slug: 'arg.1' },

  // Tier 20 — Smaller European top divisions
  '2026-ned.1':                       { label: 'Eredivisie',              tier: 12, slug: 'ned.1' },
  '2026-por.1':                       { label: 'Primeira Liga',           tier: 12, slug: 'por.1' },
  '2026-bel.1':                       { label: 'Belgian Pro League',      tier: 12, slug: 'bel.1' },
  '2026-tur.1':                       { label: 'Süper Lig',               tier: 12, slug: 'tur.1' },
  '2026-sco.1':                       { label: 'Scottish Premiership',    tier: 12, slug: 'sco.1' },

  // Tier 21 — Other CONMEBOL clubs
  '2026-conmebol.sudamericana':       { label: 'Copa Sudamericana',       tier: 8, slug: 'conmebol.sudamericana' },

  // Tier 22 — Second tiers
  '2026-eng.2':                       { label: 'Championship (England)',   tier: 14, slug: 'eng.2' },
  '2026-esp.2':                       { label: 'LaLiga 2',                 tier: 14, slug: 'esp.2' },
  '2026-ger.2':                       { label: '2. Bundesliga',            tier: 14, slug: 'ger.2' },
  '2026-ita.2':                       { label: 'Serie B',                  tier: 14, slug: 'ita.2' },
  '2026-fra.2':                       { label: 'Ligue 2',                  tier: 14, slug: 'fra.2' },

  // Tier 29 — Club friendlies (bottom of the senior-men-club range)
  '2026-club-friendly':                { label: 'Club friendlies',          tier: 29, slug: 'club.friendly' },
}

/**
 * ESPN league ID → competition mapping — THE authoritative ordering of
 * the daily board. Every id/slug/name below comes from ESPN's own
 * leagues dropdown (site.api.espn.com/apis/site/v2/leagues/dropdown
 * ?sport=soccer, 216 entries, pulled 2026-08-15). NEVER add an entry by
 * guessing an id.
 *
 * TIER LADDER (user rule 2026-08-15: "the big 5 leagues first, then the
 * rest by importance"). Lower = higher on the page. Ranges are shared
 * with tagEvent()'s category bumps (+30 youth, +50 women), so keep men's
 * senior entries inside 0-29.
 *
 *    0       FIFA World Cup
 *    1       Continental national crowns (Euro, Copa América, AFCON, Asian Cup, Gold Cup)
 *    2       World Cup qualifiers · UEFA Nations League
 *    3       Continental qualifiers · CONCACAF Nations League · Finalissima
 *    5       Club World Cup · Intercontinental Cup
 *    6       Champions League + its qualifying + UEFA Super Cup
 *    7       Europa League + qualifying · Libertadores
 *    8       Conference League + qualifying · Sudamericana · CAF/AFC/Concacaf CL
 *    9       Big-5 domestic leagues — PL · LaLiga · Serie A · Bundesliga · Ligue 1\n *   10       Big-5 domestic cups · super cups · Carabao Cup
 *   11       National-team friendlies · minor regional national tournaments
 *   11       Strong European leagues — Eredivisie · Primeira · Belgian · Süper Lig · Scottish
 *   12       Big Americas + Saudi — Brasileirão · Argentina · MLS · Liga MX · Saudi Pro League
 *   13       Big-5 second divisions (Championship, LaLiga 2, 2. Bundesliga, Serie B, Ligue 2)
 *   14       Other Europe top flights (Austria, Swiss, Greece, Russia, Denmark, Sweden, Norway…)
 *            + Asia/Africa/Oceania majors (J.League, K League, CSL, A-League, Egypt, Morocco, RSA)
 *   15       Leagues Cup · CONMEBOL/CONCACAF national cups · other Americas top flights (Colombia, Chile, Uruguay…)
 *   16       Third tiers · English League One/Two · Central-America top flights · Indian Super League
 *   17       Regional cups & minor competitions (state championships, USL, MLS Next Pro…)
 *   29       Club friendlies
 *   30-49    Men's youth (via category bump)  ·  50-89 Women  ·  90+ unresolved
 */
const LEAGUE_BY_ID: Record<string, { label: string; tier: number; slug: string }> = {
  // ── 0-3 · Senior men NATIONAL TEAMS ─────────────────────────────────
  '606':   { label: 'FIFA World Cup',                    tier: 0, slug: 'fifa.world' },
  '781':   { label: 'UEFA Euro',                         tier: 1, slug: 'uefa.euro' },
  '780':   { label: 'Copa América',                      tier: 1, slug: 'conmebol.america' },
  '3908':  { label: 'Africa Cup of Nations',             tier: 1, slug: 'caf.nations' },
  '20219': { label: 'AFC Asian Cup',                     tier: 1, slug: 'afc.asian.cup' },
  '4004':  { label: 'Concacaf Gold Cup',                 tier: 1, slug: 'concacaf.gold' },
  '3924':  { label: "Men's Olympic Tournament",          tier: 1, slug: 'fifa.olympics' },
  '786':   { label: 'World Cup Qualifiers · UEFA',       tier: 2, slug: 'fifa.worldq.uefa' },
  '787':   { label: 'World Cup Qualifiers · CONMEBOL',   tier: 2, slug: 'fifa.worldq.conmebol' },
  '788':   { label: 'World Cup Qualifiers · Concacaf',   tier: 2, slug: 'fifa.worldq.concacaf' },
  '789':   { label: 'World Cup Qualifiers · AFC',        tier: 2, slug: 'fifa.worldq.afc' },
  '790':   { label: 'World Cup Qualifiers · CAF',        tier: 2, slug: 'fifa.worldq.caf' },
  '792':   { label: 'World Cup Qualifiers · OFC',        tier: 2, slug: 'fifa.worldq.ofc' },
  '23449': { label: 'World Cup Qualifiers · Playoffs',   tier: 2, slug: 'fifa.wcq.ply' },
  '2395':  { label: 'UEFA Nations League',               tier: 2, slug: 'uefa.nations' },
  '3947':  { label: 'Euro Qualifiers',                   tier: 3, slug: 'uefa.euroq' },
  '8315':  { label: 'AFCON Qualifiers',                  tier: 3, slug: 'caf.nations_qual' },
  '5662':  { label: 'Asian Cup Qualifiers',              tier: 3, slug: 'afc.cupq' },
  '19778': { label: 'Gold Cup Qualifiers',               tier: 3, slug: 'concacaf.gold_qual' },
  '19267': { label: 'Concacaf Nations League',           tier: 3, slug: 'concacaf.nations.league' },
  '20704': { label: 'Finalissima',                       tier: 3, slug: 'global.finalissima' },
  '23107': { label: 'Arabian Gulf Cup',                  tier: 11, slug: 'global.gulf_cup' },
  '8365':  { label: 'African Nations Championship',      tier: 11, slug: 'caf.championship' },
  '5672':  { label: 'ASEAN Championship',                tier: 11, slug: 'aff.championship' },
  '18914': { label: 'SAFF Championship',                 tier: 11, slug: 'afc.saff.championship' },
  '20220': { label: 'COSAFA Cup',                        tier: 11, slug: 'caf.cosafa' },

  // ── 5 · Global club ─────────────────────────────────────────────────
  '5501':  { label: 'FIFA Club World Cup',               tier: 5, slug: 'fifa.cwc' },
  '22902': { label: 'FIFA Intercontinental Cup',         tier: 5, slug: 'fifa.intercontinental_cup' },

  // ── 6 · Champions League ────────────────────────────────────────────
  '775':   { label: 'Champions League',                  tier: 6, slug: 'uefa.champions' },

  // ── 7 · THE BIG 5 (order inside the tier: PL → LaLiga → Serie A → Bundesliga → Ligue 1) ──
  '700':   { label: 'Premier League',                    tier: 9, slug: 'eng.1' },
  '740':   { label: 'LaLiga',                            tier: 9, slug: 'esp.1' },
  '730':   { label: 'Serie A',                           tier: 9, slug: 'ita.1' },
  '720':   { label: 'Bundesliga',                        tier: 9, slug: 'ger.1' },
  '710':   { label: 'Ligue 1',                           tier: 9, slug: 'fra.1' },

  // ── 8 · Europa League · Libertadores · Big-5 domestic cups ─────────
  '776':   { label: 'Europa League',                     tier: 7, slug: 'uefa.europa' },
  '783':   { label: 'Copa Libertadores',                 tier: 7, slug: 'conmebol.libertadores' },
  '3918':  { label: 'FA Cup',                            tier: 10, slug: 'eng.fa' },
  '3951':  { label: 'Copa del Rey',                      tier: 10, slug: 'esp.copa_del_rey' },
  '3956':  { label: 'Coppa Italia',                      tier: 10, slug: 'ita.coppa_italia' },
  '3954':  { label: 'DFB-Pokal',                         tier: 10, slug: 'ger.dfb_pokal' },
  '3952':  { label: 'Coupe de France',                   tier: 10, slug: 'fra.coupe_de_france' },

  // ── 9 · Conference League · Sudamericana · other continental club · super cups · League Cup ──
  '20296': { label: 'Conference League',                 tier: 8, slug: 'uefa.europa.conf' },
  '5454':  { label: 'Copa Sudamericana',                 tier: 8, slug: 'conmebol.sudamericana' },
  '2391':  { label: 'CAF Champions League',              tier: 8, slug: 'caf.champions' },
  '3902':  { label: 'AFC Champions League Elite',        tier: 8, slug: 'afc.champions' },
  '5699':  { label: 'Concacaf Champions Cup',            tier: 8, slug: 'concacaf.champions' },
  '5692':  { label: 'Concacaf Champions Cup',            tier: 8, slug: 'concacaf.champions_cup' },
  '5462':  { label: 'UEFA Super Cup',                    tier: 6, slug: 'uefa.super_cup' },
  '5329':  { label: 'Community Shield',                  tier: 10, slug: 'eng.charity' },
  '8102':  { label: 'Supercopa de España',               tier: 10, slug: 'esp.super_cup' },
  '8103':  { label: 'Supercoppa Italiana',               tier: 10, slug: 'ita.super_cup' },
  '8101':  { label: 'DFL-Supercup',                      tier: 10, slug: 'ger.super_cup' },
  '8357':  { label: 'Trophée des Champions',             tier: 10, slug: 'fra.super_cup' },
  '3920':  { label: 'Carabao Cup',                       tier: 10, slug: 'eng.league_cup' },
  '8333':  { label: 'CONMEBOL Recopa',                   tier: 8, slug: 'conmebol.recopa' },
  '18000': { label: 'CAF Confederation Cup',             tier: 8, slug: 'caf.confed' },
  '2466':  { label: 'AFC Champions League Two',          tier: 8, slug: 'afc.cup' },
  '19874': { label: 'Champions League Qualifying',       tier: 6, slug: 'uefa.champions_qual' },
  '19887': { label: 'Europa League Qualifying',          tier: 7, slug: 'uefa.europa_qual' },
  '20221': { label: 'Conference League Qualifying',      tier: 8, slug: 'uefa.europa.conf_qual' },

  // ── 10 · National-team friendlies ──────────────────────────────────
  '3922':  { label: 'International Friendlies',          tier: 11, slug: 'fifa.friendly' },
  '19725': { label: 'Non-FIFA Friendlies',               tier: 11, slug: 'nonfifa' },

  // ── 11 · Strong European leagues ───────────────────────────────────
  '725':   { label: 'Eredivisie',                        tier: 12, slug: 'ned.1' },
  '715':   { label: 'Primeira Liga',                     tier: 12, slug: 'por.1' },
  '3901':  { label: 'Belgian Pro League',                tier: 12, slug: 'bel.1' },
  '3946':  { label: 'Süper Lig',                         tier: 12, slug: 'tur.1' },
  '735':   { label: 'Scottish Premiership',              tier: 12, slug: 'sco.1' },

  // ── 12 · Big Americas + Saudi ──────────────────────────────────────
  '630':   { label: 'Brasileirão',                       tier: 13, slug: 'bra.1' },
  '745':   { label: 'Liga Profesional Argentina',        tier: 13, slug: 'arg.1' },
  '770':   { label: 'MLS',                               tier: 13, slug: 'usa.1' },
  '760':   { label: 'Liga MX',                           tier: 13, slug: 'mex.1' },
  '21231': { label: 'Saudi Pro League',                  tier: 13, slug: 'ksa.1' },

  // ── 13 · Big-5 second divisions ────────────────────────────────────
  '3914':  { label: 'EFL Championship',                  tier: 14, slug: 'eng.2' },
  '3921':  { label: 'LaLiga 2',                          tier: 14, slug: 'esp.2' },
  '3927':  { label: '2. Bundesliga',                     tier: 14, slug: 'ger.2' },
  '3931':  { label: 'Serie B',                           tier: 14, slug: 'ita.2' },
  '3926':  { label: 'Ligue 2',                           tier: 14, slug: 'fra.2' },

  // ── 14 · Other Europe top flights + Asia/Africa/Oceania majors ─────
  '3907':  { label: 'Austrian Bundesliga',               tier: 15, slug: 'aut.1' },
  '3955':  { label: 'Greek Super League',                tier: 15, slug: 'gre.1' },
  '3939':  { label: 'Russian Premier League',            tier: 15, slug: 'rus.1' },
  '3913':  { label: 'Danish Superliga',                  tier: 15, slug: 'den.1' },
  '3945':  { label: 'Allsvenskan',                       tier: 15, slug: 'swe.1' },
  '3960':  { label: 'Eliteserien',                       tier: 15, slug: 'nor.1' },
  '750':   { label: 'J.League',                          tier: 15, slug: 'jpn.1' },
  '8376':  { label: 'Chinese Super League',              tier: 15, slug: 'chn.1' },
  '3906':  { label: 'A-League',                          tier: 15, slug: 'aus.1' },
  '3937':  { label: 'South African Premiership',         tier: 15, slug: 'rsa.1' },
  '3957':  { label: 'KNVB Beker',                        tier: 15, slug: 'ned.cup' },
  '20922': { label: 'Taça de Portugal',                  tier: 15, slug: 'por.taca.portugal' },
  '3959':  { label: 'Scottish Cup',                      tier: 15, slug: 'sco.tennents' },
  '5330':  { label: 'Scottish League Cup',               tier: 15, slug: 'sco.cis' },
  '22057': { label: "Saudi King's Cup",                  tier: 15, slug: 'ksa.kings.cup' },
  '5337':  { label: 'U.S. Open Cup',                     tier: 15, slug: 'usa.open' },
  '8306':  { label: 'Copa do Brasil',                    tier: 15, slug: 'bra.copa_do_brazil' },
  '8107':  { label: 'Copa Argentina',                    tier: 15, slug: 'arg.copa' },
  '10749': { label: 'Johan Cruyff Shield',               tier: 15, slug: 'ned.supercup' },
  '19721': { label: 'Supercopa do Brasil',               tier: 15, slug: 'bra.supercopa_do_brazil' },
  '8346':  { label: 'Supercopa Argentina',               tier: 15, slug: 'arg.supercopa' },
  '17893': { label: 'Campeón de Campeones',              tier: 15, slug: 'mex.campeon' },

  // ── 15 · Leagues Cup · other Americas top flights · their cups ─────
  '19425': { label: 'Leagues Cup',                       tier: 16, slug: 'concacaf.leagues.cup' },
  '650':   { label: 'Colombian Primera A',               tier: 16, slug: 'col.1' },
  '640':   { label: 'Chilean Primera División',          tier: 16, slug: 'chi.1' },
  '680':   { label: 'Liga AUF Uruguaya',                 tier: 16, slug: 'uru.1' },
  '670':   { label: 'Peruvian Liga 1',                   tier: 16, slug: 'per.1' },
  '660':   { label: 'LigaPro Ecuador',                   tier: 16, slug: 'ecu.1' },
  '3934':  { label: 'Paraguayan Primera División',       tier: 16, slug: 'par.1' },
  '3949':  { label: 'Venezuelan Primera División',       tier: 16, slug: 'ven.1' },
  '620':   { label: 'Bolivian Liga Profesional',         tier: 16, slug: 'bol.1' },
  '8313':  { label: 'Copa Colombia',                     tier: 16, slug: 'col.copa' },
  '8312':  { label: 'Copa Chile',                        tier: 16, slug: 'chi.copa_chi' },
  '23284': { label: 'Copa Bolivia',                      tier: 16, slug: 'bol.copa' },
  '19112': { label: 'Superliga Colombiana',              tier: 16, slug: 'col.superliga' },
  '8364':  { label: 'Supercopa de Chile',                tier: 16, slug: 'chi.super_cup' },
  '20526': { label: 'Supercopa Paraguaya',               tier: 16, slug: 'par.1.supercopa' },
  '18771': { label: 'Campeones Cup',                     tier: 16, slug: 'campeones.cup' },
  '22947': { label: 'Concacaf Central American Cup',     tier: 16, slug: 'concacaf.central.american.cup' },

  // ── 16 · Third tiers · Central America · India · Big-5 lower ───────
  '3915':  { label: 'League One',                        tier: 17, slug: 'eng.3' },
  '3916':  { label: 'League Two',                        tier: 17, slug: 'eng.4' },
  '3917':  { label: 'National League',                   tier: 17, slug: 'eng.5' },
  '18481': { label: 'EFL Trophy',                        tier: 17, slug: 'eng.trophy' },
  '3940':  { label: 'Scottish Championship',             tier: 17, slug: 'sco.2' },
  '3933':  { label: 'Keuken Kampioen Divisie',           tier: 17, slug: 'ned.2' },
  '3932':  { label: 'Liga de Expansión MX',              tier: 17, slug: 'mex.2' },
  '4007':  { label: 'Brasileirão Série B',               tier: 17, slug: 'bra.2' },
  '3903':  { label: 'Primera Nacional',                  tier: 17, slug: 'arg.2' },
  '3948':  { label: 'Segunda División Uruguay',          tier: 17, slug: 'uru.2' },
  '3929':  { label: 'Honduran Liga Nacional',            tier: 17, slug: 'hon.1' },
  '4005':  { label: 'Costa Rican Primera División',      tier: 17, slug: 'crc.1' },
  '3928':  { label: 'Guatemalan Liga Nacional',          tier: 17, slug: 'gua.1' },
  '3943':  { label: 'Salvadoran Primera División',       tier: 17, slug: 'slv.1' },
  '8316':  { label: 'Indian Super League',               tier: 17, slug: 'ind.1' },
  '4002':  { label: 'USL Championship',                  tier: 17, slug: 'usa.usl.1' },

  // ── 17 · Regional / minor ──────────────────────────────────────────
  '19915': { label: 'USL League One',                    tier: 18, slug: 'usa.usl.l1' },
  '22059': { label: 'USL Cup',                           tier: 18, slug: 'usa.usl.l1.cup' },
  '3904':  { label: 'Primera B Metropolitana',           tier: 18, slug: 'arg.3' },
  '2265':  { label: 'Campeonato Carioca',                tier: 18, slug: 'bra.camp.carioca' },
  '8207':  { label: 'Campeonato Paulista',               tier: 18, slug: 'bra.camp.paulista' },
  '2272':  { label: 'Campeonato Gaúcho',                 tier: 18, slug: 'bra.camp.gaucho' },
  '10872': { label: 'Campeonato Mineiro',                tier: 18, slug: 'bra.camp.mineiro' },
  '5487':  { label: 'NCAA Men’s Soccer',                 tier: 18, slug: 'usa.ncaa.m.1' },
  '11109': { label: 'Maurice Revello Tournament',        tier: 35, slug: 'maurice.revello' },

  // ── 29 · Club friendlies (bottom of the men's-club range) ──────────
  '19834': { label: 'Club Friendlies',                   tier: 29, slug: 'club.friendly' },
  '11108': { label: 'Emirates Cup',                      tier: 29, slug: 'friendly.emirates_cup' },
  '17929': { label: 'Trofeo Joan Gamper',                tier: 29, slug: 'esp.joan_gamper' },
  '20571': { label: 'Pinatar Cup',                       tier: 29, slug: 'global.pinatar_cup' },

  // ── 50+ · Women (explicit — the scoreboard strips the W marker) ────
  '795':   { label: "Women's World Cup",                 tier: 50, slug: 'fifa.wwc' },
  '17915': { label: "Women's Euro",                      tier: 51, slug: 'uefa.weuro' },
  '3925':  { label: "Women's Olympic Tournament",        tier: 51, slug: 'fifa.w.olympics' },
  '20649': { label: "Women's World Cup Qualifiers · UEFA", tier: 52, slug: 'fifa.wworldq.uefa' },
  '23088': { label: "Women's Nations League",            tier: 52, slug: 'uefa.w.nations' },
  '23523': { label: "Women's Africa Cup of Nations",     tier: 52, slug: 'caf.w.nations' },
  '20703': { label: 'Copa América Femenina',             tier: 52, slug: 'conmebol.america.femenina' },
  '19483': { label: "Women's Champions League",          tier: 55, slug: 'uefa.wchampions' },
  '8097':  { label: "Women's Super League",              tier: 56, slug: 'eng.w.1' },
  '20956': { label: 'Liga F',                            tier: 56, slug: 'esp.w.1' },
  '20955': { label: 'Première Ligue',                    tier: 56, slug: 'fra.w.1' },
  '8301':  { label: 'NWSL',                              tier: 57, slug: 'usa.nwsl' },
  '19945': { label: 'Vrouwen Eredivisie',                tier: 58, slug: 'ned.w.1' },
  '18992': { label: 'A-League Women',                    tier: 58, slug: 'aus.w.1' },
  '3923':  { label: "Women's International Friendlies",  tier: 60, slug: 'fifa.friendly.w' },
}

function leagueIdFromUid(uid?: string): string | null {
  if (!uid) return null
  const m = /l:(\d+)/.exec(uid)
  return m ? m[1] : null
}

// In-tier display order for the competitions that share a tier and have
// a conventional order everyone expects. Anything not listed ranks after
// the listed ones (alphabetically). Keep short — this is the ONLY place
// that overrides the tier ladder.
const SLUG_RANK: Record<string, number> = {
  // Tier 6: UCL → its qualifying → UEFA Super Cup
  'uefa.champions': 1, 'uefa.champions_qual': 2, 'uefa.super_cup': 3,
  // Tier 7: UEL → its qualifying → Libertadores
  'uefa.europa': 1, 'uefa.europa_qual': 2, 'conmebol.libertadores': 3,
  // Tier 8: Conference → its qualifying → Sudamericana → continental CLs
  'uefa.europa.conf': 1, 'uefa.europa.conf_qual': 2, 'conmebol.sudamericana': 3,
  'caf.champions': 4, 'afc.champions': 5, 'concacaf.champions': 6, 'concacaf.champions_cup': 6,
  // Tier 9: the Big 5, conventional order
  'eng.1': 1, 'esp.1': 2, 'ita.1': 3, 'ger.1': 4, 'fra.1': 5,
  // Tier 10: domestic cups then super cups then Carabao
  'eng.fa': 1, 'esp.copa_del_rey': 2, 'ita.coppa_italia': 3, 'ger.dfb_pokal': 4, 'fra.coupe_de_france': 5,
  'eng.league_cup': 6, 'eng.charity': 7, 'esp.super_cup': 8, 'ita.super_cup': 9, 'ger.super_cup': 10, 'fra.super_cup': 11,
  // Tier 12
  'ned.1': 1, 'por.1': 2, 'bel.1': 3, 'tur.1': 4, 'sco.1': 5,
  // Tier 13
  'bra.1': 1, 'arg.1': 2, 'usa.1': 3, 'mex.1': 4, 'ksa.1': 5, 'sau.1': 5,
  // Tier 14
  'eng.2': 1, 'esp.2': 2, 'ita.2': 3, 'ger.2': 4, 'fra.2': 5,
}
function slugRank(slug: string): number {
  return SLUG_RANK[slug] ?? 999
}

// ─── Dynamic league-name resolution ─────────────────────────────────────
// The static LEAGUE_META / LEAGUE_BY_ID tables can't cover every league
// ESPN's /all scoreboard emits (Carabao Cup, Liga de Expansión MX, USL…).
// Unresolved leagues used to render as 'Other competitions' or, worse, a
// round marker masquerading as a name ('Apertura 2026', 'First Stage').
// User rule: EVERY competition shows its real name. Resolution chain:
//   1. static tables (curated labels + tiers) — unchanged
//   2. ESPN header scoreboard (1 bulk request/session → id → name)
//   3. per-league match summary (1 request per still-unknown league;
//      header.league carries id + name + slug)
// Results persist in localStorage so each league is resolved once ever.
const DYN_LS_KEY = 'p90.dynLeagues.v2' // v2: tier ladder rewrite 2026-08-15 (old v1 entries carried tier 45)
const dynLeagues = new Map<string, { label: string; tier: number; slug: string }>()
try {
  const raw = localStorage.getItem(DYN_LS_KEY)
  if (raw) {
    for (const [id, v] of Object.entries(JSON.parse(raw) as Record<string, { label: string; tier: number; slug: string }>)) {
      dynLeagues.set(id, v)
    }
  }
} catch { /* SSR / private mode */ }

function persistDynLeagues() {
  try { localStorage.setItem(DYN_LS_KEY, JSON.stringify(Object.fromEntries(dynLeagues))) } catch { /* full/private */ }
}

let headerFetchedThisSession = false

async function ensureLeagueNames(events: EspnEvent[]): Promise<void> {
  const unknown = new Set<string>()
  const sampleEvent = new Map<string, string>()
  for (const ev of events) {
    const id = leagueIdFromUid((ev as { uid?: string }).uid)
    if (!id || LEAGUE_BY_ID[id] || dynLeagues.has(id)) continue
    unknown.add(id)
    if (ev.id && !sampleEvent.has(id)) sampleEvent.set(id, ev.id)
  }
  if (unknown.size === 0) return

  // Layer 2 — bulk header map (once per session; covers most leagues
  // with matches today).
  if (!headerFetchedThisSession) {
    headerFetchedThisSession = true
    try {
      const r = await fetch('https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=soccer', {
        signal: AbortSignal.timeout(5000),
      })
      const d = await r.json() as { sports?: Array<{ leagues?: Array<{ id?: number | string; name?: string; shortName?: string; slug?: string }> }> }
      for (const lg of d.sports?.[0]?.leagues ?? []) {
        const id = String(lg.id ?? '')
        const label = lg.name ?? lg.shortName
        if (!id || !label || dynLeagues.has(id)) continue
        // Inherit the curated entry (label + tier) when the slug is known
        // to LEAGUE_META; otherwise a neutral minor-league tier.
        const meta = lg.slug ? (LEAGUE_META['2026-' + lg.slug] ?? LEAGUE_META[lg.slug]) : undefined
        dynLeagues.set(id, meta ?? { label, tier: 20, slug: lg.slug ?? 'dyn-' + id })
      }
    } catch { /* header down — the summary path below still resolves */ }
  }
  for (const id of Array.from(unknown)) if (dynLeagues.has(id)) unknown.delete(id)

  // Layer 3 — one summary call per still-unknown league (capped).
  await Promise.all(Array.from(unknown).slice(0, 8).map(async (id) => {
    const evId = sampleEvent.get(id)
    if (!evId) return
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${evId}`, {
        signal: AbortSignal.timeout(5000),
      })
      const d = await r.json() as { header?: { league?: { name?: string; abbreviation?: string; slug?: string } } }
      const lg = d.header?.league
      const label = lg?.name ?? lg?.abbreviation
      if (!label) return
      const meta = lg?.slug ? (LEAGUE_META['2026-' + lg.slug] ?? LEAGUE_META[lg.slug]) : undefined
      dynLeagues.set(id, meta ?? { label, tier: 20, slug: lg?.slug ?? 'dyn-' + id })
    } catch { /* stays unknown — slug fallback still applies */ }
  }))
  persistDynLeagues()
}

/**
 * Detect the category (Women / Youth age band) embedded in a string —
 * either a season slug OR an event name. ESPN often puts the age band
 * only in the event name ('Canada U20 at Ivory Coast U23'), not the
 * slug, so we have to scan both. Returns null for senior men's (the
 * default — we never label it 'Men' explicitly, same as Sofascore /
 * FotMob conventions).
 */
function detectCategory(text: string): { code: 'W' | 'U23' | 'U21' | 'U20' | 'U19' | 'U18' | 'U17' | 'U15'; label: string } | null {
  const lower = text.toLowerCase()
  // Women — ESPN markers across slugs and names
  if (
    lower.startsWith('w.') || lower.includes('.w.') ||
    lower.includes('-w-') || lower.includes('-women') ||
    /\bwomen\b/.test(lower) || /\bfemale\b/.test(lower) ||
    /\bwoman'?s?\b/.test(lower)
  ) {
    return { code: 'W', label: 'Women' }
  }
  // Youth — \b ensures we match 'u20' but not 'studio' or random
  // substrings. Highest age first so U23 wins over U2.
  if (/\bu-?23\b/.test(lower)) return { code: 'U23', label: 'U23' }
  if (/\bu-?21\b/.test(lower)) return { code: 'U21', label: 'U21' }
  if (/\bu-?20\b/.test(lower)) return { code: 'U20', label: 'U20' }
  if (/\bu-?19\b/.test(lower)) return { code: 'U19', label: 'U19' }
  if (/\bu-?18\b/.test(lower)) return { code: 'U18', label: 'U18' }
  if (/\bu-?17\b/.test(lower)) return { code: 'U17', label: 'U17' }
  if (/\bu-?15\b/.test(lower)) return { code: 'U15', label: 'U15' }
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
  const eventName = (ev as unknown as { name?: string; shortName?: string }).name ?? ''
  const eventShort = (ev as unknown as { name?: string; shortName?: string }).shortName ?? ''

  // Detect category from BOTH the slug AND the event name — ESPN often
  // puts U20/U23/Women only in the name ('Canada U20 at Ivory Coast U23'
  // with slug just 'group-stage'). Without this we'd label a U20 youth
  // friendly as a senior men's match.
  const cat =
    detectCategory(seasonSlug ?? '') ??
    detectCategory(eventName) ??
    detectCategory(eventShort)

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
    // Dynamically-resolved leagues (ESPN header / summary lookups,
    // persisted in localStorage) — see ensureLeagueNames().
    else if (leagueId && dynLeagues.has(leagueId)) base = dynLeagues.get(leagueId)!
  }

  // Substring fallbacks
  if (!base) {
    const bare = (baseSlug ?? '').replace(/^\d+-/, '')
    if (bare.includes('fifa.world')) {
      base = bare.includes('worldq')
        ? { label: 'World Cup Qualifiers', tier: 2, slug: 'fifa.worldq' }
        : { label: 'FIFA World Cup', tier: 0, slug: 'fifa.world' }
    } else if (bare.includes('uefa.champions')) {
      base = { label: 'Champions League', tier: 6, slug: 'uefa.champions' }
    } else if (bare.includes('uefa.europa.conf')) {
      base = { label: 'Conference League', tier: 8, slug: 'uefa.europa.conf' }
    } else if (bare.includes('uefa.europa')) {
      base = { label: 'Europa League', tier: 7, slug: 'uefa.europa' }
    } else if (bare.includes('uefa.euro')) {
      base = { label: 'UEFA Euro', tier: 1, slug: 'uefa.euro' }
    } else if (bare.includes('conmebol.libert')) {
      base = { label: 'Copa Libertadores', tier: 7, slug: 'conmebol.libertadores' }
    } else if (bare.includes('international-friendly')) {
      // National-team friendlies — senior men, so they rank above ALL
      // club competitions (user rule).
      base = { label: 'International Friendlies', tier: 11, slug: 'fifa.friendly' }
    } else if (bare.includes('club-friendly') || bare.includes('club.friendly')) {
      base = { label: 'Club friendlies', tier: 29, slug: 'club.friendly' }
    } else {
      // Last resort — title-case the slug AS A COMPETITION NAME.
      //
      // Watch list: 'league-phase', 'group-stage', 'regular-season',
      // 'play-off', 'final', 'qualifying'. These are ROUND markers ESPN
      // emits as season.slug when the league isn't otherwise resolvable.
      // Rendering them as competition headers ('League Phase', 'Group
      // Stage') is confusing — the user can't tell which competition the
      // match belongs to. When we can't map to a real league, label the
      // group 'Other competitions' so it's at least visibly a catch-all
      // and not a fake round-as-competition string.
      // A season slug that is (or starts with) a round marker must NEVER
      // become a section name — 'Apertura 2026', 'First Stage', 'Third
      // Round' as competition headers was exactly the user complaint.
      // With the dynamic resolver above this branch is a corner case;
      // when it does fire we label the section 'Football' rather than
      // the banned 'Other competitions' catch-all.
      const ROUND_MARKERS = [
        'league-phase', 'group-stage', 'regular-season', 'play-off',
        'playoff', 'final', 'qualifying', 'qualifier', 'apertura',
        'clausura', 'intermedio', 'first-round', 'second-round',
        'third-round', 'fourth-round', 'first-stage', 'second-stage',
        'stage-', 'stage 1', 'knockout', 'promotion', 'relegation',
        'round-of', 'torneo',
      ]
      const looksLikeRound = ROUND_MARKERS.some((m) => bare.startsWith(m) || bare.includes(m))
      const pretty = looksLikeRound
        ? 'Football'
        : (bare.replace(/[-.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Football')
      // Tier 90 → catch-all bucket lives below women (50-89) so the
      // daily board never floats an unidentified competition above
      // properly-tagged ones.
      base = { label: pretty, tier: 90, slug: seasonSlug ?? 'other' }
    }
  }

  // Apply category suffix + bump the tier so the daily board orders
  // matches by audience priority. User rule (locked in): senior men's
  // national-team matches ALWAYS rank above club matches, even when the
  // national match is just a friendly; youth and women drop below all
  // senior men's. So the tier budget is:
  //
  //    0 -  9  : Senior MEN national teams (WC, continental, qualifiers,
  //              Nations League, national friendlies — friendlies last)
  //   10 - 29  : Senior MEN clubs (UCL → top 5 → MLS → second tiers → club friendlies)
  //   30 - 49  : Men's youth (U23 first, descending age)
  //   50 - 89  : Women (any age, any competition)
  //   90+     : 'Other competitions' catch-all
  //
  // Within each category-bump range the base tier ordering is preserved
  // so the inside structure (UCL > Europa > Nations etc.) still holds.
  if (cat) {
    const tierBump =
      cat.code === 'W'   ? 50 :   // Women's competitions → 50-89 range
      cat.code === 'U23' ? 30 :   // Youth: U23 first, then descending age
      cat.code === 'U21' ? 31 :
      cat.code === 'U20' ? 32 :
      cat.code === 'U19' ? 33 :
      cat.code === 'U18' ? 34 :
      cat.code === 'U17' ? 35 :
      cat.code === 'U15' ? 36 :
      40                              // Unknown category — between youth and women
    return {
      label: `${base.label} · ${cat.label}`,
      tier: base.tier + tierBump,
      slug: `${base.slug}.${cat.code.toLowerCase()}`,
    }
  }
  return base
}

/**
 * Official competition logo URL (ESPN CDN) for a given canonical slug.
 *
 * Every entry verified via:
 *   curl '.../{slug}/scoreboard' | jq '.leagues[0].logos'
 * and the default href is what's stored here. Returns null for any slug
 * we DON'T have an official asset for — the caller renders nothing in
 * that case (no emoji fallback, per user instruction: "soit tu mets les
 * logos officiels … soit rien").
 *
 * Category suffix (.w / .u20 / .u23) is stripped before lookup so the
 * women's UCL still resolves to the UCL logo.
 */
const COMPETITION_LOGOS: Record<string, string> = {
  // Major tournaments
  'fifa.world':             'https://a.espncdn.com/i/leaguelogos/soccer/500/4.png',
  'uefa.champions':         'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png',
  'uefa.europa':            'https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png',
  'uefa.europa.conf':       'https://a.espncdn.com/i/leaguelogos/soccer/500/20296.png',
  'uefa.euro':              'https://a.espncdn.com/i/leaguelogos/soccer/500/74.png',
  'uefa.nations':           'https://a.espncdn.com/i/leaguelogos/soccer/500/2395.png',
  'conmebol.libertadores':  'https://a.espncdn.com/i/leaguelogos/soccer/500/58.png',
  'conmebol.america':       'https://a.espncdn.com/i/leaguelogos/soccer/500/83.png',
  'conmebol.sudamericana':  'https://a.espncdn.com/i/leaguelogos/soccer/500/1208.png',
  'concacaf.gold':          'https://a.espncdn.com/i/leaguelogos/soccer/500/59.png',
  'caf.nations':            'https://a.espncdn.com/i/leaguelogos/soccer/500/76.png',
  // Top 5 — first divisions
  'esp.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png',
  'eng.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png',
  'ger.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png',
  'ita.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png',
  'fra.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png',
  // Other major domestic
  'usa.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png',
  'mex.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/22.png',
  'ned.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/11.png',
  'por.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/14.png',
  'bel.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/6.png',
  'tur.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/18.png',
  'sco.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/45.png',
  'bra.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/85.png',
  'arg.1':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/1.png',
  // Second tiers
  'eng.2':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/24.png',
  'esp.2':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/107.png',
  'ger.2':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/97.png',
  'ita.2':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/99.png',
  'fra.2':                  'https://a.espncdn.com/i/leaguelogos/soccer/500/96.png',
}

/**
 * Returns the official ESPN logo URL for a competition, or null when we
 * don't have one verified. CALLER MUST render nothing on null — no
 * emoji placeholder (per user instruction).
 */
export function competitionLogo(slug: string): string | null {
  // Strip our category suffix (.w / .u20 / .u23 etc.) before lookup
  const base = slug.replace(/\.(w|u\d{2})$/i, '')
  return COMPETITION_LOGOS[base] ?? null
}

// Backwards-compat — the old emoji function is gone. If something still
// imports competitionFlag it'll be a build error pointing here.
export const competitionFlag = competitionLogo

/* -------------------------------------------------------------------------- */
/* Broadcast rights — per competition, per country                            */
/*                                                                            */
/* ESPN's free API returns broadcasters but only for the US market. There is  */
/* no comprehensive free API for global per-country football TV rights. This  */
/* map is curated manually from public rights deal announcements for the     */
/* 2025-26 season. It needs annual review when rights re-tender.              */
/*                                                                            */
/* Country codes are ISO 3166 alpha-2. The country list focuses on (1) the   */
/* big-five European audiences, (2) the host countries USA / MEX / CAN for   */
/* WC26, (3) the Maghreb / MENA region (Morocco bias). Add more as needed.  */
/* -------------------------------------------------------------------------- */

export type Broadcaster = { name: string; type: 'tv' | 'streaming'; free?: boolean }

const FREE_TV = (name: string): Broadcaster => ({ name, type: 'tv', free: true })
const TV = (name: string): Broadcaster => ({ name, type: 'tv' })
const STREAM = (name: string): Broadcaster => ({ name, type: 'streaming' })

const BROADCAST_RIGHTS: Record<string, Record<string, Broadcaster[]>> = {
  'fifa.world': {
    // ─── Host countries ──────────────────────────────────────────
    US: [TV('FOX'), TV('Telemundo')],
    MX: [TV('Televisa'), TV('TV Azteca')],
    CA: [TV('TSN'), TV('CTV')],

    // ─── Big-five European audiences ─────────────────────────────
    // M6 is the sole free-to-air rights holder for the 2026 World
    // Cup in France (54 matches, including ALL Equipe de France
    // games — confirmed by M6 press release March 2024 + Wikipedia
    // broadcaster table). beIN Sports holds the pay-TV deal covering
    // the full 104-match slate (announced February 2026). TF1 has
    // NOT acquired WC26 rights — verified 2026-06-12, do NOT re-add
    // unless Wikipedia or M6/beIN release explicit updates.
    FR: [FREE_TV('M6'), TV('beIN Sports')],
    GB: [FREE_TV('BBC'), FREE_TV('ITV')],
    DE: [FREE_TV('ARD'), FREE_TV('ZDF'), STREAM('MagentaTV')],
    IT: [FREE_TV('RAI')],
    ES: [FREE_TV('La 1 (RTVE)'), STREAM('DAZN')],

    // ─── Other UEFA nations qualified for WC26 ───────────────────
    NL: [TV('NOS'), STREAM('Videoland')],
    BE: [FREE_TV('RTBF'), FREE_TV('VRT'), TV('Pickx Sports')],
    PT: [FREE_TV('RTP'), TV('SIC')],
    CH: [FREE_TV('SRF'), FREE_TV('RTS'), FREE_TV('RSI')], // Switzerland — SRG SSR public pool
    AT: [FREE_TV('ORF 1')],                                // Austria
    HR: [FREE_TV('HRT')],                                   // Croatia
    CZ: [FREE_TV('ČT Sport')],                              // Czechia
    NO: [FREE_TV('NRK'), FREE_TV('TV 2')],                 // Norway
    SE: [FREE_TV('SVT'), TV('TV4')],                       // Sweden
    BA: [FREE_TV('BHRT')],                                  // Bosnia & Herzegovina
    // Scottish viewers fall under the GB entry above (BBC / ITV pool).

    // ─── MENA / North Africa ─────────────────────────────────────
    MA: [FREE_TV('SNRT (Al Aoula · Arryadia)')],
    DZ: [FREE_TV('ENTV')],
    TN: [FREE_TV('Watania')],
    EG: [TV('ON Sport'), FREE_TV('ETV')],
    SA: [TV('SSC')],
    AE: [TV('AD Sports')],
    QA: [TV('beIN Sports MENA')],
    JO: [FREE_TV('Jordan TV'), TV('beIN Sports MENA')],
    IQ: [FREE_TV('Al Iraqiya'), TV('beIN Sports MENA')],
    IR: [FREE_TV('IRIB Varzesh')],

    // ─── Sub-Saharan Africa qualified nations ────────────────────
    CI: [FREE_TV('RTI')],                                   // Ivory Coast
    SN: [FREE_TV('RTS')],                                   // Senegal
    GH: [FREE_TV('GTV Sports+'), TV('SuperSport')],         // Ghana
    CD: [FREE_TV('RTNC')],                                  // DR Congo
    ZA: [TV('SABC'), TV('SuperSport')],                     // South Africa
    CV: [FREE_TV('RTC')],                                   // Cape Verde

    // ─── Americas qualified nations (beyond host trio) ───────────
    BR: [FREE_TV('Globo'), TV('SporTV'), TV('CazéTV')],
    AR: [TV('TyC Sports'), TV('TV Pública')],
    UY: [TV('TenField'), TV('Canal 10')],                   // Uruguay
    CO: [TV('Caracol'), TV('RCN')],                         // Colombia
    EC: [TV('Teleamazonas'), TV('GamaTV')],                 // Ecuador
    PY: [FREE_TV('Tigo Sports'), TV('Telefuturo')],         // Paraguay
    HT: [FREE_TV('TNH'), TV('Télémax')],                    // Haiti
    PA: [TV('TVN'), TV('RPC')],                             // Panama
    CW: [TV('TeleCuraçao')],                                // Curaçao

    // ─── AFC / Oceania qualified nations ─────────────────────────
    JP: [TV('TV Asahi'), TV('Fuji TV'), TV('NHK'), STREAM('ABEMA')],
    KR: [TV('KBS'), TV('SBS'), TV('MBC')],                  // South Korea — broadcaster pool
    AU: [TV('Channel 9'), STREAM('Optus Sport')],           // Australia
    NZ: [TV('Sky Sport NZ'), STREAM('Three Now')],          // New Zealand
    UZ: [TV('UZTV'), TV('Match TV')],                       // Uzbekistan
    TR: [FREE_TV('TRT 1')],                                 // Turkey
  },

  'uefa.champions': {
    FR: [TV('Canal+'), TV('beIN Sports')],
    GB: [TV('TNT Sports'), STREAM('discovery+')],
    US: [STREAM('Paramount+'), TV('CBS')],
    DE: [STREAM('Amazon Prime Video'), STREAM('DAZN')],
    IT: [TV('Sky Sport'), STREAM('Amazon Prime Video')],
    ES: [TV('Movistar Plus+')],
    NL: [STREAM('Ziggo Sport'), STREAM('SBS6')],
    BE: [TV('Pickx Sports'), TV('VTM')],
    PT: [TV('Eleven Sports'), TV('TVI')],
    MA: [TV('beIN Sports MENA')],
    DZ: [TV('beIN Sports MENA')],
    TN: [TV('beIN Sports MENA')],
    SA: [TV('SSC')],
    QA: [TV('beIN Sports MENA')],
    MX: [STREAM('HBO Max'), TV('TUDN')],
    CA: [STREAM('Paramount+'), TV('DAZN')],
    BR: [STREAM('HBO Max'), TV('SBT'), STREAM('TNT Sports')],
  },

  'uefa.europa': {
    FR: [TV('Canal+'), TV('W9')],
    GB: [TV('TNT Sports')],
    US: [STREAM('Paramount+')],
    DE: [STREAM('RTL+')],
    IT: [TV('Sky Sport'), STREAM('DAZN')],
    ES: [TV('Movistar Plus+')],
    MA: [TV('beIN Sports MENA')],
  },

  'uefa.europa.conf': {
    FR: [TV('Canal+')],
    GB: [TV('TNT Sports')],
    US: [STREAM('Paramount+')],
    DE: [STREAM('RTL+')],
    IT: [TV('Sky Sport')],
    MA: [TV('beIN Sports MENA')],
  },

  'eng.1': {
    FR: [TV('Canal+ Foot')],
    GB: [TV('Sky Sports'), TV('TNT Sports'), STREAM('Amazon Prime')],
    US: [TV('NBC Sports'), STREAM('Peacock'), TV('USA Network')],
    DE: [TV('Sky Deutschland'), STREAM('WOW')],
    IT: [TV('Sky Sport'), STREAM('NOW')],
    ES: [STREAM('DAZN'), TV('Movistar Plus+')],
    MA: [TV('beIN Sports MENA')],
    SA: [TV('SSC')],
    MX: [TV('Sky México'), STREAM('Caliente TV')],
  },

  'esp.1': {
    FR: [TV('beIN Sports')],
    GB: [STREAM('LaLiga TV'), STREAM('Premier Sports')],
    US: [STREAM('ESPN+')],
    DE: [STREAM('DAZN')],
    IT: [STREAM('DAZN')],
    ES: [TV('Movistar Plus+'), STREAM('DAZN'), TV('M+ LaLiga TV')],
    MA: [TV('beIN Sports MENA')],
    MX: [TV('Sky México')],
  },

  'ger.1': {
    FR: [TV('beIN Sports')],
    GB: [TV('Sky Sports')],
    US: [STREAM('ESPN+')],
    DE: [TV('Sky Deutschland'), STREAM('DAZN'), STREAM('WOW')],
    IT: [TV('Sky Sport')],
    ES: [TV('Movistar Plus+')],
    MA: [TV('beIN Sports MENA')],
  },

  'ita.1': {
    FR: [TV('beIN Sports')],
    GB: [TV('TNT Sports')],
    US: [TV('CBS Sports'), STREAM('Paramount+')],
    DE: [STREAM('DAZN')],
    IT: [STREAM('DAZN'), TV('Sky Sport')],
    ES: [STREAM('DAZN')],
    MA: [TV('beIN Sports MENA')],
  },

  'fra.1': {
    FR: [STREAM('Ligue 1+'), TV('beIN Sports')],
    GB: [TV('TNT Sports')],
    US: [TV('beIN Sports'), STREAM('Fubo')],
    DE: [STREAM('DAZN')],
    IT: [STREAM('DAZN')],
    ES: [STREAM('DAZN')],
    MA: [TV('beIN Sports MENA')],
  },

  'usa.1': {
    US: [STREAM('Apple TV (MLS Season Pass)'), TV('FOX'), TV('FS1')],
    CA: [STREAM('Apple TV (MLS Season Pass)'), TV('TSN')],
    MX: [STREAM('Apple TV (MLS Season Pass)')],
    GB: [STREAM('Apple TV (MLS Season Pass)')],
    FR: [STREAM('Apple TV (MLS Season Pass)')],
  },

  'mex.1': {
    MX: [TV('Televisa'), TV('TV Azteca'), TV('TUDN'), STREAM('ViX')],
    US: [TV('TUDN'), TV('Univision'), STREAM('ViX')],
    CA: [TV('TUDN'), STREAM('ViX')],
  },

  'conmebol.libertadores': {
    FR: [TV('beIN Sports')],
    GB: [STREAM('Premier Sports')],
    US: [TV('beIN Sports'), TV('FS1'), TV('Telemundo')],
    DE: [STREAM('DAZN')],
    IT: [STREAM('Mola TV')],
    ES: [TV('Movistar Plus+')],
    BR: [FREE_TV('Globo'), TV('SBT'), STREAM('ESPN'), STREAM('Paramount+')],
    AR: [TV('ESPN'), TV('Fox Sports'), STREAM('Star+')],
    CL: [STREAM('ESPN'), STREAM('Star+')],
    CO: [STREAM('ESPN'), STREAM('Star+')],
    MA: [TV('beIN Sports MENA')],
  },

  'conmebol.america': {
    FR: [TV('beIN Sports')],
    US: [TV('FOX'), TV('FS1'), TV('Univision'), TV('Telemundo')],
    BR: [FREE_TV('Globo'), TV('SporTV')],
    AR: [TV('TyC Sports'), TV('DSports')],
    MA: [TV('beIN Sports MENA')],
  },

  'concacaf.gold': {
    FR: [TV('beIN Sports')],
    US: [TV('FOX'), TV('FS1'), TV('Univision'), TV('TUDN')],
    MX: [TV('Univision'), TV('TUDN')],
    CA: [TV('OneSoccer'), TV('TLN')],
    MA: [TV('beIN Sports MENA')],
  },

  'caf.nations': {
    FR: [TV('beIN Sports')],
    GB: [STREAM('FIFA+')],
    US: [STREAM('beIN Sports')],
    MA: [FREE_TV('SNRT (Al Aoula · Arryadia)'), TV('beIN Sports MENA')],
    DZ: [FREE_TV('ENTV')],
    TN: [FREE_TV('Watania')],
    EG: [TV('On Sport'), TV('beIN Sports MENA')],
    SA: [TV('SSC'), TV('beIN Sports MENA')],
    QA: [TV('beIN Sports MENA')],
  },

  'uefa.euro': {
    FR: [FREE_TV('TF1'), FREE_TV('M6'), TV('beIN Sports')],
    GB: [FREE_TV('BBC'), FREE_TV('ITV')],
    US: [STREAM('FuboTV'), TV('FOX')],
    DE: [FREE_TV('ARD'), FREE_TV('ZDF'), STREAM('MagentaTV')],
    IT: [FREE_TV('RAI'), TV('Sky Sport')],
    ES: [FREE_TV('La 1 (RTVE)')],
    MA: [TV('beIN Sports MENA')],
  },

  'uefa.nations': {
    FR: [TV('M6'), TV('beIN Sports')],
    GB: [STREAM('Viaplay')],
    US: [STREAM('FuboTV'), TV('Fox Sports')],
    DE: [STREAM('DAZN'), FREE_TV('ARD'), FREE_TV('ZDF')],
    IT: [TV('Sky Sport'), TV('Mediaset')],
    ES: [FREE_TV('La 1 (RTVE)')],
    MA: [TV('beIN Sports MENA')],
  },

  'sau.1': {
    SA: [TV('SSC'), STREAM('Shahid')],
    MA: [TV('SSC'), STREAM('Shahid')],
    AE: [TV('SSC')],
    EG: [TV('SSC')],
    FR: [TV('beIN Sports')],
    GB: [STREAM('DAZN')],
  },

  'bra.1': {
    BR: [FREE_TV('Globo'), STREAM('Premiere'), STREAM('Globoplay'), STREAM('Amazon Prime')],
    US: [STREAM('Paramount+'), TV('ESPN')],
    PT: [TV('Sport TV')],
  },

  'arg.1': {
    AR: [TV('TNT Sports'), TV('ESPN'), TV('TV Pública')],
    BR: [STREAM('Star+')],
    US: [STREAM('Fanatiz'), TV('ESPN')],
    ES: [STREAM('DAZN')],
  },
}

const COUNTRY_NAMES: Record<string, string> = {
  FR: 'France', GB: 'United Kingdom', US: 'United States', DE: 'Germany',
  IT: 'Italy', ES: 'Spain', NL: 'Netherlands', BE: 'Belgium', PT: 'Portugal',
  MA: 'Morocco', DZ: 'Algeria', TN: 'Tunisia', EG: 'Egypt',
  SA: 'Saudi Arabia', AE: 'United Arab Emirates', QA: 'Qatar',
  MX: 'Mexico', CA: 'Canada', BR: 'Brazil', AR: 'Argentina',
  CL: 'Chile', CO: 'Colombia', JP: 'Japan',
  // WC26 qualified nations added 2026-06-12
  CH: 'Switzerland', AT: 'Austria', HR: 'Croatia', CZ: 'Czechia',
  NO: 'Norway', SE: 'Sweden', BA: 'Bosnia and Herzegovina',
  JO: 'Jordan', IQ: 'Iraq', IR: 'Iran',
  CI: 'Ivory Coast', SN: 'Senegal', GH: 'Ghana', CD: 'DR Congo',
  ZA: 'South Africa', CV: 'Cape Verde',
  UY: 'Uruguay', EC: 'Ecuador', PY: 'Paraguay', HT: 'Haiti',
  PA: 'Panama', CW: 'Curaçao',
  KR: 'South Korea', AU: 'Australia', NZ: 'New Zealand',
  UZ: 'Uzbekistan', TR: 'Turkey',
}

const COUNTRY_FLAGS: Record<string, string> = {
  FR: '🇫🇷', GB: '🇬🇧', US: '🇺🇸', DE: '🇩🇪', IT: '🇮🇹', ES: '🇪🇸',
  NL: '🇳🇱', BE: '🇧🇪', PT: '🇵🇹', MA: '🇲🇦', DZ: '🇩🇿', TN: '🇹🇳',
  EG: '🇪🇬', SA: '🇸🇦', AE: '🇦🇪', QA: '🇶🇦', MX: '🇲🇽', CA: '🇨🇦',
  BR: '🇧🇷', AR: '🇦🇷', CL: '🇨🇱', CO: '🇨🇴', JP: '🇯🇵',
  // WC26 qualified nations
  CH: '🇨🇭', AT: '🇦🇹', HR: '🇭🇷', CZ: '🇨🇿', NO: '🇳🇴', SE: '🇸🇪',
  BA: '🇧🇦', JO: '🇯🇴', IQ: '🇮🇶', IR: '🇮🇷',
  CI: '🇨🇮', SN: '🇸🇳', GH: '🇬🇭', CD: '🇨🇩', ZA: '🇿🇦', CV: '🇨🇻',
  UY: '🇺🇾', EC: '🇪🇨', PY: '🇵🇾', HT: '🇭🇹', PA: '🇵🇦', CW: '🇨🇼',
  KR: '🇰🇷', AU: '🇦🇺', NZ: '🇳🇿', UZ: '🇺🇿', TR: '🇹🇷',
}

/**
 * Returns broadcasters grouped by country for a competition. Strips
 * the category suffix (.w / .u20 / .u23) so women's UCL inherits the
 * UCL rights. Returns null when we don't have data for the comp.
 */
export function broadcastersFor(slug: string): Array<{ country: string; flag: string; name: string; broadcasters: Broadcaster[] }> | null {
  const base = slug.replace(/\.(w|u\d{2})$/i, '')
  const map = BROADCAST_RIGHTS[base]
  if (!map) return null
  return Object.entries(map).map(([code, list]) => ({
    country: code,
    flag: COUNTRY_FLAGS[code] ?? '',
    name: COUNTRY_NAMES[code] ?? code,
    broadcasters: list,
  }))
}

// ===== /watch/[country] page helpers =====================================
// The 'Where to watch the WC in <country>' editorial pages need to know
// (1) which countries we actually have rights data for, (2) per country,
// which competitions, (3) human-friendly metadata for SEO + URLs.

/** IANA timezone per country — used to convert UTC kickoff to local time. */
const COUNTRY_TIMEZONES: Record<string, string> = {
  FR: 'Europe/Paris',       GB: 'Europe/London',     US: 'America/New_York',
  DE: 'Europe/Berlin',      IT: 'Europe/Rome',       ES: 'Europe/Madrid',
  NL: 'Europe/Amsterdam',   BE: 'Europe/Brussels',   PT: 'Europe/Lisbon',
  MA: 'Africa/Casablanca',  DZ: 'Africa/Algiers',    TN: 'Africa/Tunis',
  EG: 'Africa/Cairo',       SA: 'Asia/Riyadh',       AE: 'Asia/Dubai',
  QA: 'Asia/Qatar',         MX: 'America/Mexico_City', CA: 'America/Toronto',
  BR: 'America/Sao_Paulo',  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',   CO: 'America/Bogota',    JP: 'Asia/Tokyo',
  // WC26 qualified nations
  CH: 'Europe/Zurich',      AT: 'Europe/Vienna',     HR: 'Europe/Zagreb',
  CZ: 'Europe/Prague',      NO: 'Europe/Oslo',       SE: 'Europe/Stockholm',
  BA: 'Europe/Sarajevo',    TR: 'Europe/Istanbul',
  JO: 'Asia/Amman',         IQ: 'Asia/Baghdad',      IR: 'Asia/Tehran',
  UZ: 'Asia/Tashkent',      KR: 'Asia/Seoul',
  AU: 'Australia/Sydney',   NZ: 'Pacific/Auckland',
  CI: 'Africa/Abidjan',     SN: 'Africa/Dakar',      GH: 'Africa/Accra',
  CD: 'Africa/Kinshasa',    ZA: 'Africa/Johannesburg',
  CV: 'Atlantic/Cape_Verde',
  UY: 'America/Montevideo', EC: 'America/Guayaquil', PY: 'America/Asuncion',
  HT: 'America/Port-au-Prince', PA: 'America/Panama',
  CW: 'America/Curacao',
}

/** URL slug per country — keeps URLs SEO-friendly. */
const COUNTRY_SLUGS: Record<string, string> = {
  FR: 'france',          GB: 'united-kingdom',  US: 'united-states',
  DE: 'germany',         IT: 'italy',           ES: 'spain',
  NL: 'netherlands',     BE: 'belgium',         PT: 'portugal',
  MA: 'morocco',         DZ: 'algeria',         TN: 'tunisia',
  EG: 'egypt',           SA: 'saudi-arabia',    AE: 'united-arab-emirates',
  QA: 'qatar',           MX: 'mexico',          CA: 'canada',
  BR: 'brazil',          AR: 'argentina',       CL: 'chile',
  CO: 'colombia',        JP: 'japan',
  // WC26 qualified nations added 2026-06-12 — every URL is the lowercased,
  // kebab-cased English name. /watch/switzerland, /watch/south-korea, etc.
  CH: 'switzerland',     AT: 'austria',         HR: 'croatia',
  CZ: 'czechia',         NO: 'norway',          SE: 'sweden',
  BA: 'bosnia-and-herzegovina',
  JO: 'jordan',          IQ: 'iraq',            IR: 'iran',
  CI: 'ivory-coast',     SN: 'senegal',         GH: 'ghana',
  CD: 'dr-congo',        ZA: 'south-africa',    CV: 'cape-verde',
  UY: 'uruguay',         EC: 'ecuador',         PY: 'paraguay',
  HT: 'haiti',           PA: 'panama',          CW: 'curacao',
  KR: 'south-korea',     AU: 'australia',       NZ: 'new-zealand',
  UZ: 'uzbekistan',      TR: 'turkey',
}

const SLUG_TO_COUNTRY = Object.fromEntries(
  Object.entries(COUNTRY_SLUGS).map(([code, slug]) => [slug, code])
)

export type WatchCountry = {
  code: string         // ISO 3166-1 alpha-2 (uppercase)
  slug: string         // URL slug ('france', 'morocco')
  name: string         // Display name ('France', 'Morocco')
  flag: string         // Emoji flag
  timezone: string     // IANA tz
}

/** Resolve a slug to a country payload, or null when unknown. */
export function watchCountryFromSlug(slug: string): WatchCountry | null {
  const code = SLUG_TO_COUNTRY[slug.toLowerCase()]
  if (!code) return null
  return {
    code,
    slug,
    name: COUNTRY_NAMES[code] ?? code,
    flag: COUNTRY_FLAGS[code] ?? '',
    timezone: COUNTRY_TIMEZONES[code] ?? 'UTC',
  }
}

/** List every country we have rights data for, for the /watch index. */
export function listWatchCountries(): WatchCountry[] {
  return Object.keys(COUNTRY_SLUGS)
    .filter((code) => COUNTRY_NAMES[code])
    .map((code) => ({
      code,
      slug: COUNTRY_SLUGS[code],
      name: COUNTRY_NAMES[code],
      flag: COUNTRY_FLAGS[code] ?? '',
      timezone: COUNTRY_TIMEZONES[code] ?? 'UTC',
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * For a given country, returns every competition we know they have
 * broadcast rights to. Used to build the editorial 'while you're here,
 * here's everything else' rail on the country page.
 */
export function competitionsForCountry(code: string): Array<{
  slug: string
  broadcasters: Broadcaster[]
}> {
  const out: Array<{ slug: string; broadcasters: Broadcaster[] }> = []
  for (const [slug, map] of Object.entries(BROADCAST_RIGHTS)) {
    const list = map[code]
    if (list && list.length > 0) out.push({ slug, broadcasters: list })
  }
  return out
}

/** Human-readable label for a competition slug — for the country-page rails. */
export function competitionLabel(slug: string): string {
  return COMPETITION_LABELS[slug] ?? slug
}

const COMPETITION_LABELS: Record<string, string> = {
  'fifa.world':            'FIFA World Cup 2026',
  'uefa.champions':        'UEFA Champions League',
  'uefa.europa':           'UEFA Europa League',
  'uefa.europa.conf':      'UEFA Conference League',
  'uefa.euro':             'UEFA Euro',
  'uefa.nations':          'UEFA Nations League',
  'eng.1':                 'Premier League',
  'esp.1':                 'LaLiga',
  'ger.1':                 'Bundesliga',
  'ita.1':                 'Serie A',
  'fra.1':                 'Ligue 1',
  'usa.1':                 'Major League Soccer',
  'sau.1':                 'Saudi Pro League',
  'bra.1':                 'Brasileirão',
  'arg.1':                 'Primera División (Argentina)',
}

/**
 * Looks up the season slug for an event and resolves to a competition
 * slug we can use for broadcaster lookup. Same logic as tagEvent() but
 * exposed for callers that already have the event.
 */
export function competitionSlugFromEvent(ev: EspnEvent): string {
  return tagEvent(ev).slug
}

/**
 * Compute a live-ticking clock string from ESPN's displayClock plus the
 * elapsed time since we fetched it. ESPN ships '32'' at fetch — we add
 * (now - fetchedAt) minutes and render '34'' two minutes later WITHOUT
 * re-polling. Used by the MatchCard and the MatchSheet hero so both
 * surfaces tick in sync.
 *
 * Formats handled:
 *   "32'"        → simple running clock, counts up
 *   "45+3'"      → first/second half stoppage, increments only the +N
 *   "32'" → 45+ → rolls past 45 once elapsed pushes past it
 *   "HT" / ""    → returned as-is (caller checks halftime detail above)
 */
export function liveClock(displayClock: string, fetchedAt: number): string {
  if (!displayClock || !fetchedAt) return displayClock || "0'"
  const elapsed = Math.max(0, Math.floor((Date.now() - fetchedAt) / 60_000))
  if (elapsed === 0) return displayClock

  const stoppage = /^(\d+)\+(\d+)'?/.exec(displayClock)
  if (stoppage) {
    const base = stoppage[1]
    const extra = parseInt(stoppage[2], 10) + elapsed
    return `${base}+${extra}'`
  }
  const plain = /^(\d+)'?/.exec(displayClock)
  if (plain) {
    const m = parseInt(plain[1], 10)
    const next = m + elapsed
    if (m < 45 && next >= 45) return `45+${next - 45}'`
    if (m < 90 && next >= 90) return `90+${next - 90}'`
    return `${next}'`
  }
  return displayClock
}

/**
 * Halftime / paused-state detection. ESPN sets status.type.detail to
 * 'Halftime' (or 'HT' on some endpoints) when the clock is paused at
 * 45+ between the two halves. Without this check we render the frozen
 * '45+3'' value, which the user (rightly) complained about.
 */
export function isMatchPaused(detail: string | undefined): boolean {
  if (!detail) return false
  return /^(HT|Halftime|Half-time|Pause|Stoppage|Break)/i.test(detail)
}

/* -------------------------------------------------------------------------- */
/* TheSportsDB — per-match TV broadcasters by country                         */
/*                                                                            */
/* CORS-open, free tier. Two-step lookup:                                     */
/*   1. searchevents.php?e=Home_vs_Away  → returns TheSportsDB event id       */
/*   2. lookuptv.php?id={tsdbId}         → returns broadcasters per country  */
/* Results are richer than ESPN (Norwich v Palace returned DAZN Spain + RMC   */
/* Sport France, France v N. Ireland returned TF1, etc.) and cover the same  */
/* per-country breakdown footmercato shows. Coverage isn't 100% — some        */
/* obscure matches return empty — so we always fall back to the curated map.  */
/* -------------------------------------------------------------------------- */

const TSDB = 'https://www.thesportsdb.com/api/v1/json/3'

export type LiveBroadcaster = {
  country: string
  channel: string
  logo?: string
}

const tsdbCache = new Map<string, Promise<LiveBroadcaster[]>>()

export async function broadcastersForMatch(
  homeTeam: string,
  awayTeam: string,
  matchDateISO: string,
): Promise<LiveBroadcaster[]> {
  // Cache key — same match opened repeatedly hits the cache
  const key = `${homeTeam}|${awayTeam}|${matchDateISO.slice(0, 10)}`
  const cached = tsdbCache.get(key)
  if (cached) return cached

  const run = (async (): Promise<LiveBroadcaster[]> => {
    // Strip 'FC', 'Club', accent diacritics — TheSportsDB sometimes matches
    // better with the canonical short name
    const slug = (s: string) =>
      s.replace(/\s+/g, '+').replace(/\./g, '').trim()

    const eventName = `${slug(homeTeam)}_vs_${slug(awayTeam)}`
    try {
      const search = await fetch(`${TSDB}/searchevents.php?e=${eventName}`)
      if (!search.ok) return []
      const sj = await search.json() as { event?: Array<{ idEvent?: string; dateEvent?: string }> }
      const candidates = sj.event ?? []
      // Pick the one whose date matches (within ±1 day) so we don't pull a
      // historic same-name fixture
      const target = matchDateISO.slice(0, 10)
      const targetTs = new Date(target).getTime()
      const best = candidates
        .filter((c) => c.idEvent && c.dateEvent)
        .map((c) => ({ c, dt: Math.abs(new Date(c.dateEvent!).getTime() - targetTs) }))
        .sort((a, b) => a.dt - b.dt)[0]
      if (!best || best.dt > 2 * 86_400_000) return []

      const tv = await fetch(`${TSDB}/lookuptv.php?id=${best.c.idEvent}`)
      if (!tv.ok) return []
      const tj = await tv.json() as { tvevent?: Array<{ strCountry?: string; strChannel?: string; strLogo?: string }> }
      const out: LiveBroadcaster[] = []
      const seen = new Set<string>()
      for (const t of tj.tvevent ?? []) {
        const k = `${t.strCountry ?? ''}|${t.strChannel ?? ''}`
        if (seen.has(k) || !t.strCountry || !t.strChannel) continue
        seen.add(k)
        out.push({
          country: t.strCountry,
          channel: t.strChannel,
          logo: t.strLogo,
        })
      }
      return out
    } catch {
      return []
    }
  })()

  tsdbCache.set(key, run)
  return run
}

// Map TheSportsDB country names → ISO country codes / flag emoji for
// merging with our curated map.
export function countryToFlag(name: string): string {
  const MAP: Record<string, string> = {
    'France': '🇫🇷', 'United Kingdom': '🇬🇧', 'England': '🇬🇧', 'UK': '🇬🇧',
    'United States': '🇺🇸', 'USA': '🇺🇸', 'Germany': '🇩🇪', 'Italy': '🇮🇹',
    'Spain': '🇪🇸', 'Netherlands': '🇳🇱', 'Belgium': '🇧🇪', 'Portugal': '🇵🇹',
    'Morocco': '🇲🇦', 'Algeria': '🇩🇿', 'Tunisia': '🇹🇳', 'Egypt': '🇪🇬',
    'Saudi Arabia': '🇸🇦', 'United Arab Emirates': '🇦🇪', 'Qatar': '🇶🇦',
    'Mexico': '🇲🇽', 'Canada': '🇨🇦', 'Brazil': '🇧🇷', 'Argentina': '🇦🇷',
    'Chile': '🇨🇱', 'Colombia': '🇨🇴', 'Japan': '🇯🇵', 'Croatia': '🇭🇷',
    'Switzerland': '🇨🇭', 'Austria': '🇦🇹', 'Poland': '🇵🇱', 'Sweden': '🇸🇪',
    'Norway': '🇳🇴', 'Denmark': '🇩🇰', 'Turkey': '🇹🇷', 'Greece': '🇬🇷',
    'International': '🌐',
  }
  return MAP[name] ?? ''
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
    // For WC2026 matches specifically we know the group letters from the
    // live group derivation (see ensureWcGroupMap below). Look up either
    // competitor's team abbreviation in the cached team→letter map and
    // promote the label from generic 'Group stage' to e.g. 'Group D'.
    // ESPN's scoreboard endpoint never ships the group letter directly —
    // we infer it from the connected-components graph of group-stage
    // matches (same algo as the WC26 Groups page so the letter assignment
    // is consistent across the app).
    const uid = (ev as unknown as { uid?: string }).uid ?? ''
    if (uid.includes('l:606')) {
      const competitors = ev.competitions?.[0]?.competitors ?? []
      const homeAbbr = (competitors[0]?.team?.abbreviation ?? '').toUpperCase()
      const awayAbbr = (competitors[1]?.team?.abbreviation ?? '').toUpperCase()
      const letter = WC_GROUP_MAP.get(homeAbbr) ?? WC_GROUP_MAP.get(awayAbbr)
      if (letter) {
        return { label: `Group ${letter}`, short: `G${letter}`, knockout: false, decisive: false }
      }
    }
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

/**
 * Form score for a team — computed from the last 5 finished international
 * matches via the team-history endpoint. Standard football PPG formula:
 * win = 3pts, draw = 1pt, loss = 0pts, max = 15. Higher score = better form.
 *
 * Color tier follows the convention used by transfermarkt / sofascore:
 *   12-15 → green  (excellent: ≥4 wins or all draws + 1 win)
 *    8-11 → yellow (good: more wins than losses)
 *    4-7  → orange (mixed: ~half wins/draws, some losses)
 *    0-3  → red    (poor: hardly any wins)
 */
export type TeamForm = {
  /** Raw last-5 points, 0..15 (W=3 · D=1 · L=0). Legacy field. */
  score: number
  /**
   * Recency-weighted form rating on a 6.3..10 scale.
   *
   * The 6.3 floor is a deliberate calibration choice. Every team in
   * this dataset qualified for the FIFA World Cup — a non-trivial
   * baseline of competence (top ~24% of FIFA-ranked nations). A
   * winless WC team is still a competent national side, so rating
   * them 0/10 is misleading vs. (say) a Liga MX bottom-half club.
   * The scale therefore expresses 'how is THIS WC team doing relative
   * to its peers', not 'how good is this team in absolute terms'.
   *
   *   per_match    = result_pts + clamp(gd, -3, +3) × 0.5
   *     result_pts ∈ {W:3, D:1, L:0}
   *     so per_match ∈ [-1.5, +4.5]
   *   weighted     = Σ ( per_match × position_weight )
   *     position_weight ∈ {1, 2, 3, 4, 5}  (oldest → newest)
   *     so weighted ∈ [-22.5, +67.5]    (range 90)
   *   normalised   = (weighted - -22.5) / 90       ∈ [0, 1]
   *   score10      = 6.3 + normalised × 3.7        ∈ [6.3, 10]
   *
   * Recency weighting means a team that's just won three on the
   * bounce after a poor start scores higher than a team that
   * started strong and lost its last three.
   *
   * The GD term keeps the rating honest — a 4-0 thrashing reads
   * differently from a 1-0 grind, and a 0-3 hammering hurts more
   * than a 0-1 scrappy defeat — without letting one freakish 7-0
   * result swamp the curve (GD capped at ±3 per match).
   */
  score10: number
  /** '8.4' — pre-formatted for direct render. */
  display: string
  lastFive: ('W' | 'D' | 'L')[]
  color: 'green' | 'yellow' | 'orange' | 'red'
  played: number         // how many of the last 5 we actually have data for
}

// Thresholds calibrated against the 6.3..10 range. Reds are rare —
// a WC team has to be properly out of form to fall below 6.8.
function colorForScore10(s10: number): TeamForm['color'] {
  if (s10 >= 8.5) return 'green'  // strong form, in-form contender
  if (s10 >= 7.5) return 'yellow' // steady
  if (s10 >= 6.8) return 'orange' // worrying for a WC team
  return 'red'                    // properly bad
}

const FORM_CACHE = new Map<string, TeamForm>()
const FORM_INFLIGHT = new Map<string, Promise<TeamForm | null>>()

/**
 * Look up a team's form synchronously from the cache. Returns null if
 * the team hasn't been fetched yet — pair with prefetchTeamForms() at
 * page mount to populate the cache for the teams currently visible.
 */
export function getCachedTeamForm(abbr: string | undefined | null): TeamForm | null {
  if (!abbr) return null
  return FORM_CACHE.get(abbr.toUpperCase()) ?? null
}

/**
 * Fetch a single team's form. Shared with prefetchTeamForms(); both go
 * through the same FORM_INFLIGHT map so simultaneous callers de-dupe.
 */
async function fetchTeamFormOnce(abbr: string): Promise<TeamForm | null> {
  const code = abbr.toUpperCase()
  if (FORM_CACHE.has(code)) return FORM_CACHE.get(code)!
  if (FORM_INFLIGHT.has(code)) return FORM_INFLIGHT.get(code)!
  const promise = (async (): Promise<TeamForm | null> => {
    try {
      const h = await jget<HistoryResponse>(`/team-history/${code.toLowerCase()}?v=2`)
      // ESPN /team-history puts status on competitions[0].status, not on
      // the event root (which is null). Reading both keeps the filter
      // working on either shape. Without this, the finished filter
      // matched zero events for every team and the form was always 0/red.
      const finished = (h.events ?? []).filter((ev) => {
        const root = (ev.status as { type?: { state?: string } } | undefined)?.type?.state
        const comp = ev.competitions?.[0] as { status?: { type?: { state?: string } } } | undefined
        return (root ?? comp?.status?.type?.state) === 'post'
      })
      // ESPN /team-history returns events NEWEST-FIRST (verified
       // against /team-history/mar — first entry was 2026-06-07, last
       // entry 1994-06-19). The previous .slice(-5) therefore took the
       // OLDEST 5 events in the dataset — Morocco's first form rating
       // was computed from their 1994 & 1998 World Cup matches.
       //
       // Take the newest 5, then reverse so the OLDEST of the window
       // comes first — that way position weight 1 = oldest of the 5
       // and position weight 5 = newest, matching the docstring above.
       const lastFiveWithGD = finished.slice(0, 5).reverse().map((ev) => {
        const cs = ev.competitions?.[0]?.competitors ?? []
        const mine = cs.find((c) => c.team?.abbreviation?.toUpperCase() === code)
        const other = cs.find((c) => c.team?.abbreviation?.toUpperCase() !== code)
        const myRaw = (mine as { score?: unknown } | undefined)?.score
        const opRaw = (other as { score?: unknown } | undefined)?.score
        const my = typeof myRaw === 'object' && myRaw
          ? Number((myRaw as { value?: number }).value ?? 0)
          : Number(myRaw ?? 0)
        const op = typeof opRaw === 'object' && opRaw
          ? Number((opRaw as { value?: number }).value ?? 0)
          : Number(opRaw ?? 0)
        const myN = Number.isFinite(my) ? my : 0
        const opN = Number.isFinite(op) ? op : 0
        const result: 'W' | 'D' | 'L' = myN > opN ? 'W' : myN === opN ? 'D' : 'L'
        return { result, gd: myN - opN }
      })
      const lastFive = lastFiveWithGD.map((x) => x.result)
      // Legacy raw points (sum, no weighting) — kept for backwards compat.
      const score = lastFive.reduce(
        (acc, r) => acc + (r === 'W' ? 3 : r === 'D' ? 1 : 0),
        0
      )
      // ─── Recency-weighted 6.3..10 rating ─────────────────────────────
      // See TeamForm.score10 docstring for the full formula. Range
      // here is anchored on the assumption that every team in this
      // dataset qualified for the WC — a 0/10 would be misleading
      // versus club-football peers, so the worst case is 6.3.
      const SUM_WEIGHTS = 15      // 1+2+3+4+5
      const PER_MATCH_MAX = 4.5   // W (3) + GD cap (+3) × 0.5
      const PER_MATCH_MIN = -1.5  // L (0) + GD cap (-3) × 0.5
      const FULL_MAX = PER_MATCH_MAX * SUM_WEIGHTS   //  67.5
      const FULL_MIN = PER_MATCH_MIN * SUM_WEIGHTS   // -22.5
      const FULL_RANGE = FULL_MAX - FULL_MIN          //  90
      let activeMax = 0
      let activeMin = 0
      let weightedTotal = 0
      lastFiveWithGD.forEach(({ result, gd }, i) => {
        const w = i + 1   // 1..5  (oldest..newest of the window)
        const pts = result === 'W' ? 3 : result === 'D' ? 1 : 0
        const gdCapped = Math.max(-3, Math.min(3, gd))
        const matchScore = pts + gdCapped * 0.5
        weightedTotal += matchScore * w
        activeMax += PER_MATCH_MAX * w
        activeMin += PER_MATCH_MIN * w
      })
      // If fewer than 5 matches are available, the range scales with
      // them so a team with only 2 known matches doesn't artificially
      // read low against a full-window team. We normalise against the
      // observed window's max/min rather than the full 5-game range.
      const observedRange =
        lastFiveWithGD.length === 5 ? FULL_RANGE : activeMax - activeMin
      const observedMin = lastFiveWithGD.length === 5 ? FULL_MIN : activeMin
      const normalised =
        observedRange > 0 ? (weightedTotal - observedMin) / observedRange : 0
      // No data at all? Default to 7.0 (mid of the 6.3..10 range) so
      // the cell never reads suspiciously low for a team we just don't
      // have results for yet.
      const score10 =
        lastFiveWithGD.length === 0 ? 7.0 : 6.3 + normalised * 3.7
      const display = score10.toFixed(1)
      const form: TeamForm = {
        score,
        score10,
        display,
        lastFive,
        color: colorForScore10(score10),
        played: lastFive.length,
      }
      FORM_CACHE.set(code, form)
      return form
    } catch {
      return null
    } finally {
      FORM_INFLIGHT.delete(code)
    }
  })()
  FORM_INFLIGHT.set(code, promise)
  return promise
}

/**
 * Prefetch form for many teams in one go — used on the Groups page to
 * populate dots for all 48 WC teams at once. Honours the cache so a
 * second call with overlapping teams doesn't refetch.
 *
 * Concurrency cap of 8 keeps us under the browser's per-host connection
 * limit (~6) without serialising the queue.
 */
export async function prefetchTeamForms(abbrs: string[]): Promise<void> {
  const queue = [...new Set(abbrs.map((a) => a.toUpperCase()))].filter(
    (a) => !FORM_CACHE.has(a)
  )
  const CONCURRENCY = 8
  const workers: Promise<void>[] = []
  let i = 0
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push((async () => {
      while (i < queue.length) {
        const code = queue[i++]
        if (code) await fetchTeamFormOnce(code)
      }
    })())
  }
  await Promise.all(workers)
}

/**
 * WC2026 team→group-letter cache. Populated by ensureWcGroupMap() on the
 * first daily fetch; read synchronously by roundContext() when it spots
 * a WC group-stage event. We rebuild it the same way the Groups page
 * does (connected-components on the 72 group-stage matches, clusters of
 * 4 sorted by first kickoff → letters A..L) so the letter shown next to
 * Brazil-Morocco on the daily board matches the letter on the WC26 page.
 *
 * Same-session cache: ESPN's draw doesn't change mid-tournament, and a
 * single 200ms fetch on app boot beats hitting the schedule endpoint
 * once per render. If the fetch fails we leave the map empty — daily
 * board falls back to plain 'Group stage' for WC matches until the next
 * try succeeds.
 */
const WC_GROUP_MAP = new Map<string, string>()
let wcGroupMapPromise: Promise<void> | null = null

async function ensureWcGroupMap(): Promise<void> {
  if (WC_GROUP_MAP.size > 0) return
  if (wcGroupMapPromise) return wcGroupMapPromise
  wcGroupMapPromise = (async () => {
    try {
      const raw = await jgetDirect<EspnScoreboard>(
        `${ESPN_DIRECT}/scoreboard?dates=${TOURNAMENT_DATE_RANGE}&limit=300`
      )
      const sorted = [...(raw.events ?? [])].sort(
        (a, b) => (a.date ?? '').localeCompare(b.date ?? '')
      )
      const groupStage = sorted.slice(0, 72)
      if (groupStage.length === 0) return

      // adjacency: every team → set of opponents they faced in the group stage
      const adj = new Map<string, Set<string>>()
      const firstKickoff = new Map<string, string>()
      for (const ev of groupStage) {
        const competitors = ev.competitions?.[0]?.competitors ?? []
        if (competitors.length < 2) continue
        const a = (competitors[0]?.team?.abbreviation ?? '').toUpperCase()
        const b = (competitors[1]?.team?.abbreviation ?? '').toUpperCase()
        if (!a || !b) continue
        if (!adj.has(a)) adj.set(a, new Set())
        if (!adj.has(b)) adj.set(b, new Set())
        adj.get(a)!.add(b)
        adj.get(b)!.add(a)
        const d = ev.date ?? ''
        for (const code of [a, b]) {
          const prev = firstKickoff.get(code)
          if (!prev || d < prev) firstKickoff.set(code, d)
        }
      }

      // DFS connected components — each cluster of 4 is one group.
      const seen = new Set<string>()
      const clusters: Array<{ teams: string[]; firstKickoff: string }> = []
      for (const team of adj.keys()) {
        if (seen.has(team)) continue
        const cluster: string[] = []
        const stack = [team]
        let kickoff = '9999-99-99'
        while (stack.length) {
          const t = stack.pop()!
          if (seen.has(t)) continue
          seen.add(t)
          cluster.push(t)
          const k = firstKickoff.get(t)
          if (k && k < kickoff) kickoff = k
          for (const n of adj.get(t) ?? []) if (!seen.has(n)) stack.push(n)
        }
        if (cluster.length === 4) clusters.push({ teams: cluster, firstKickoff: kickoff })
      }
      clusters.sort((a, b) => a.firstKickoff.localeCompare(b.firstKickoff))
      const letters = 'ABCDEFGHIJKL'.split('')
      clusters.slice(0, 12).forEach((c, i) => {
        const letter = letters[i] ?? '?'
        for (const team of c.teams) WC_GROUP_MAP.set(team, letter)
      })
    } catch { /* leave map empty; next call retries */ }
    finally { wcGroupMapPromise = null }
  })()
  return wcGroupMapPromise
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
  // Worker first (KV-cached), then DIRECT ESPN fallback from the
  // browser. Post-tournament (Aug 2026) Akamai started 403-ing ESPN
  // requests from Cloudflare Workers IPs, so /tournament came back with
  // 0 events and the whole WC26 archive (bracket, groups, schedule)
  // rendered as an endless "Fetching the draw…". Browser IPs pass fine
  // and ESPN's CORS is open — same trick api.today already uses.
  tournament: async (): Promise<TournamentResponse> => {
    let viaWorker: TournamentResponse | null = null
    try { viaWorker = await jget<TournamentResponse>('/tournament') } catch { /* fall through */ }
    if (viaWorker && (viaWorker.events?.length ?? 0) > 0) return viaWorker
    const raw = await jgetDirect<EspnScoreboard>(
      `${ESPN_DIRECT}/scoreboard?dates=${TOURNAMENT_DATE_RANGE}&limit=300`
    )
    const events = raw.events ?? []
    return {
      total: events.length,
      hasLive: events.some((e) => e.status?.type?.state === 'in'),
      events,
      fetchedAt: new Date().toISOString(),
    }
  },
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
    // ── Local-day correctness ──────────────────────────────────────
    // `d` is the visitor's LOCAL calendar day. ESPN's `dates=` param
    // buckets matches by US Eastern time, so one bucket never maps 1:1
    // onto the visitor's day: a 22:00 ET kickoff is TOMORROW for a
    // visitor in Morocco and must appear under his next local day.
    // Fix: compute the local 24h window [00:00, 24:00), fetch every
    // ESPN bucket the window's edges touch (converted to both ET and
    // UTC so we cover either bucketing convention — usually 2 buckets),
    // then keep only events whose real kickoff timestamp falls inside
    // the local window. Times were already displayed local; now the
    // DAY grouping is local too.
    const y = Number(d.slice(0, 4))
    const mo = Number(d.slice(4, 6))
    const da = Number(d.slice(6, 8))
    const start = new Date(y, mo - 1, da)       // local midnight
    const end = new Date(y, mo - 1, da + 1)     // next local midnight
    const ymdInZone = (dt: Date, timeZone: string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone }).format(dt).replace(/-/g, '')
    const edges = [start, new Date(end.getTime() - 1)]
    const buckets = Array.from(new Set(
      edges.flatMap((dt) => [ymdInZone(dt, 'America/New_York'), ymdInZone(dt, 'UTC')])
    ))
    // Kick the WC group-letter cache off in parallel with the daily fetch
    // — by the time we group + render, roundContext() can look up team
    // abbreviations synchronously and label WC matches 'Group D' instead
    // of just 'Group stage'. All promises typically finish under 250ms.
    const [raws] = await Promise.all([
      Promise.all(buckets.map((b) =>
        jgetDirect<EspnScoreboard>(`${ESPN_ALL}?dates=${b}&limit=300`)
          .catch(() => ({ events: [] as EspnEvent[] }))
      )),
      ensureWcGroupMap(),
    ])
    const seen = new Set<string>()
    const events: EspnEvent[] = []
    const startMs = start.getTime()
    const endMs = end.getTime()
    for (const raw of raws) {
      for (const ev of raw.events ?? []) {
        if (!ev.id || seen.has(ev.id)) continue
        seen.add(ev.id)
        if (!ev.date) continue
        const t = new Date(ev.date).getTime()
        if (t >= startMs && t < endMs) events.push(ev)
      }
    }
    // Resolve every league's real name BEFORE grouping — tagEvent reads
    // the dynamic map synchronously. Cheap: cached leagues cost nothing,
    // unknown ones resolve once ever (localStorage).
    await ensureLeagueNames(events)
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
    // Sort each league's events by play state first — live games
    // surface to the top of the section so visitors don't have to scan
    // past pre-match cards to find what's actually on right now. Then
    // upcoming (sorted by kickoff so the next one to start is first),
    // then finished. State weight: in=0, pre=1, post=2.
    const stateWeight = (ev: EspnEvent): number => {
      const s = ev.status?.type?.state
      return s === 'in' ? 0 : s === 'pre' ? 1 : 2
    }
    const competitions: DailyComp[] = Array.from(byLeague.entries())
      .map(([slug, v]) => ({
        slug,
        label: v.label,
        tier: v.tier,
        events: v.events.sort((a, b) => {
          const dw = stateWeight(a) - stateWeight(b)
          if (dw !== 0) return dw
          return (a.date ?? '').localeCompare(b.date ?? '')
        }),
      }))
      // Tier asc, then a fixed in-tier rank for the marquee slugs (so the
      // Big 5 read PL → LaLiga → Serie A → Bundesliga → Ligue 1 instead of
      // alphabetically), then label.
      .sort((a, b) =>
        a.tier - b.tier
        || slugRank(a.slug) - slugRank(b.slug)
        || a.label.localeCompare(b.label))
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
        const r = await fetch(url, { signal: AbortSignal.timeout(4000) })
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

// Helper: ESPN status → simple label.
// rawClock + paused are exposed so the caller (MatchCard) can run
// liveClock() against them for the ticking display.
export function statusLabel(ev: EspnEvent): {
  label: string
  live: boolean
  finished: boolean
  rawClock: string
  paused: boolean
} {
  const s = ev.status?.type?.state
  const detail = (ev.status?.type as { detail?: string })?.detail
  const paused = isMatchPaused(detail)
  const rawClock = ev.status?.displayClock ?? ''
  if (s === 'in') {
    // ZOMBIE-MATCH GUARD. ESPN sometimes flips lower-tier matches
    // (Argentine Primera C, women's reserves, friendlies they don't
    // track live) to state='in' HOURS before the actual kickoff,
    // with displayClock stuck at "0'" because no real-time feed is
    // wired up. We get matches showing as "LIVE · 0'" at 7pm for a
    // 1am kickoff. The event.date is the source of truth — if the
    // scheduled kickoff is still in the future by more than a
    // 90-second slack, downgrade to 'Scheduled' regardless of what
    // ESPN's status block claims.
    const eventDate = ev.date ? Date.parse(ev.date) : NaN
    const clockMs = parseClockMs(rawClock)
    if (Number.isFinite(eventDate) && eventDate - Date.now() > 90_000 && clockMs === 0) {
      return {
        label: ev.status?.type?.description ?? 'Scheduled',
        live: false,
        finished: false,
        rawClock,
        paused: false,
      }
    }
    return {
      label: paused ? 'HT' : (rawClock || 'LIVE'),
      live: true,
      finished: false,
      rawClock,
      paused,
    }
  }
  if (s === 'post') return { label: ev.status?.type?.description ?? 'FT', live: false, finished: true, rawClock, paused: false }
  return { label: ev.status?.type?.description ?? 'Scheduled', live: false, finished: false, rawClock, paused: false }
}

/** Parse '0'', '45+2'', '67'' into milliseconds. Returns 0 for missing/invalid. */
function parseClockMs(clock: string): number {
  if (!clock) return 0
  const stoppage = /^(\d+)\+(\d+)'?/.exec(clock)
  if (stoppage) return (parseInt(stoppage[1], 10) + parseInt(stoppage[2], 10)) * 60_000
  const plain = /^(\d+)'?/.exec(clock)
  if (plain) return parseInt(plain[1], 10) * 60_000
  return 0
}

export function eventTeams(ev: EspnEvent): { home: EspnCompetitor | undefined; away: EspnCompetitor | undefined } {
  const comp = ev.competitions?.[0]
  const home = comp?.competitors?.find((c) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c) => c.homeAway === 'away')
  return { home, away }
}

// American moneyline → European decimal odds (-120 → '1.83', +295 → '3.95').
// Accepts the string form ('-900', '+1700') the newer feed shape uses.
function mlToDecimal(ml: number | string | undefined): string | null {
  const n = typeof ml === 'string' ? parseInt(ml, 10) : ml
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return null
  const dec = n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n)
  return dec.toFixed(2)
}

export type MatchOdds = { home: string; draw: string; away: string; provider?: string }

/**
 * Pre-match 1X2 odds in European decimal format, or null when unavailable.
 * ESPN only prices about half of upcoming fixtures (big leagues mostly)
 * and nulls the entry once a match kicks off, so a missing return is
 * normal. Handles both feed shapes (see the odds type above).
 */
export function eventOdds(ev: EspnEvent): MatchOdds | null {
  if (ev.status?.type?.state !== 'pre') return null
  const o = ev.competitions?.[0]?.odds?.find(Boolean)
  if (!o) return null
  const side = (s?: { close?: { odds?: string }; open?: { odds?: string } }) =>
    s?.close?.odds ?? s?.open?.odds
  const home = mlToDecimal(o.homeTeamOdds?.moneyLine ?? side(o.moneyline?.home))
  const draw = mlToDecimal(o.drawOdds?.moneyLine ?? side(o.moneyline?.draw))
  const away = mlToDecimal(o.awayTeamOdds?.moneyLine ?? side(o.moneyline?.away))
  if (!home || !draw || !away) return null
  const res: MatchOdds = { home, draw, away, provider: o.provider?.name }
  // Remember the latest pre-match line: ESPN nulls `odds` at kick-off, so
  // this stored copy is the only way a finished card can still show what
  // the market said before the game ("closing odds", greyed out).
  rememberClosingOdds(ev.id, res)
  return res
}

// ─── Closing odds memory (client-side) ───────────────────────────────
// eventId → last pre-match 1X2 seen, persisted in localStorage so the
// line survives reloads. Pruned after 7 days — the daily board never
// looks further back than that.
const ODDS_LS = 'p90.closingOdds.v1'
type StoredOdds = MatchOdds & { ts: number }
let closingStore: Record<string, StoredOdds> | null = null
let closingFlush: number | undefined

function loadClosingStore(): Record<string, StoredOdds> {
  if (!closingStore) {
    try { closingStore = JSON.parse(localStorage.getItem(ODDS_LS) ?? '{}') as Record<string, StoredOdds> } catch { closingStore = {} }
    const cutoff = Date.now() - 7 * 86_400_000
    for (const k of Object.keys(closingStore)) {
      if ((closingStore[k]?.ts ?? 0) < cutoff) delete closingStore[k]
    }
  }
  return closingStore
}

function rememberClosingOdds(evId: string, o: MatchOdds): void {
  try {
    const s = loadClosingStore()
    const cur = s[evId]
    if (cur && cur.home === o.home && cur.draw === o.draw && cur.away === o.away) return
    s[evId] = { ...o, ts: Date.now() }
    // Debounced write — eventOdds runs on every card render.
    clearTimeout(closingFlush)
    closingFlush = window.setTimeout(() => {
      try { localStorage.setItem(ODDS_LS, JSON.stringify(s)) } catch { /* quota */ }
    }, 1500)
  } catch { /* SSR / storage blocked */ }
}

/** Last pre-match 1X2 this browser saw for a now-finished event, or null. */
export function closingOdds(evId: string): MatchOdds | null {
  try {
    const o = loadClosingStore()[evId]
    return o ? { home: o.home, draw: o.draw, away: o.away, provider: o.provider } : null
  } catch { return null }
}

// ─── Live (in-play) odds ─────────────────────────────────────────────
// The scoreboard drops odds at kick-off, but ESPN's core odds feed keeps
// a 'DraftKings - Live Odds' entry updating through the match. Cached
// per event for 60s so a 30s scoreboard poll doesn't double the traffic.
const liveOddsCache = new Map<string, { odds: MatchOdds | null; at: number }>()

export async function fetchLiveOdds(evId: string, leagueSlug: string): Promise<MatchOdds | null> {
  const hit = liveOddsCache.get(evId)
  if (hit && Date.now() - hit.at < 60_000) return hit.odds
  let odds: MatchOdds | null = null
  try {
    const r = await fetch(
      `https://sports.core.api.espn.com/v2/sports/soccer/leagues/${leagueSlug}/events/${evId}/competitions/${evId}/odds`
    )
    if (r.ok) {
      const data = (await r.json()) as {
        items?: Array<{
          provider?: { name?: string }
          homeTeamOdds?: { moneyLine?: number }
          awayTeamOdds?: { moneyLine?: number }
          drawOdds?: { moneyLine?: number }
        }>
      }
      const it = (data.items ?? []).find((i) => /live/i.test(i.provider?.name ?? ''))
      if (it) {
        const home = mlToDecimal(it.homeTeamOdds?.moneyLine)
        const draw = mlToDecimal(it.drawOdds?.moneyLine)
        const away = mlToDecimal(it.awayTeamOdds?.moneyLine)
        if (home && draw && away) odds = { home, draw, away, provider: it.provider?.name }
      }
    }
  } catch { /* ESPN hiccup or unknown slug — no live odds for this poll */ }
  liveOddsCache.set(evId, { odds, at: Date.now() })
  return odds
}
