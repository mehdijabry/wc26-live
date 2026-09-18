/**
 * /ai/chat — WC26 conversational assistant for ai.pressing90.live.
 *
 * Flow per turn:
 *   1. Receive { messages: [{ role, content }, …] } from the chat UI.
 *   2. Append a system prompt that primes the model with our brand voice
 *      and a tool catalogue. Live and static tools are mixed — the model
 *      picks the right one per question.
 *   3. Loop: call Workers AI (Llama 3.1 8B-fast) with the tool catalogue.
 *      If it returns a tool_call, execute it locally, append the result
 *      as a "tool" role message, and re-call the model. Bail out after
 *      4 hops to avoid runaway tool loops.
 *   4. When the model produces a final answer (no tool_calls), return it.
 *
 * Tools are split into:
 *   - LIVE (ESPN / Supabase / our own worker endpoints) — current scores,
 *     standings, bracket, top scorers, news. Always returns today's truth.
 *   - STATIC (`./wc26-data/*`, derived from the wc26-mcp npm package,
 *     MIT-licensed by Jordan Lyall) — head-to-head, city guides, venues,
 *     visa info, fan zones, team backgrounders. Edits at most once per
 *     tournament season; live data wins when it conflicts.
 *
 * Cost: Llama 3.1 8B-fast is bundled in the free Workers AI tier (10k
 * neurons / day). Each tool-use turn typically uses 2-4 neurons, so the
 * free tier supports ~2-3k turns/day before paid tier kicks in.
 */

import type { Env } from './index'
import { cityGuides } from './wc26-data/city-guides'
import { historicalMatchups } from './wc26-data/historical-matchups'
import { teamProfiles } from './wc26-data/team-profiles'
import { venues } from './wc26-data/venues'
import { visaInfo } from './wc26-data/visa-info'
import { fanZones } from './wc26-data/fan-zones'
import { teams as staticTeams } from './wc26-data/teams'
import { tournamentRules } from './wc26-data/tournament-rules'

// ─── Tool catalogue ────────────────────────────────────────────────────
//
// Workers AI's tool-use format follows the OpenAI function-calling spec:
//   { type: 'function', function: { name, description, parameters: <JSON Schema> } }
// The model returns tool_calls = [{ name, arguments: <JSON string> }].

type ToolDef = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string; enum?: string[] }>
      required?: string[]
    }
  }
}

const TOOLS: ToolDef[] = [
  // ── LIVE tools ───────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_live_matches',
      description: 'Returns today\'s and currently-live World Cup 2026 matches with real-time scores, status (scheduled/live/halftime/full-time), goals, and venues. Always use this for "what\'s happening now", "score of X vs Y", "is the match live", and same-day questions.',
      parameters: {
        type: 'object',
        properties: {
          team: { type: 'string', description: 'Optional FIFA 3-letter code to filter (e.g. "mar" for Morocco, "fra" for France).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_results',
      description: 'Returns recently finished World Cup 2026 matches (last 7 days) with final scores. Use this when the user asks "who won X vs Y", "result of yesterday\'s match", "X\'s last match".',
      parameters: {
        type: 'object',
        properties: {
          team: { type: 'string', description: 'Optional FIFA 3-letter code to filter.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_standings',
      description: 'Returns current group standings (live, computed from finished + ongoing matches) for one or all groups.',
      parameters: {
        type: 'object',
        properties: {
          group: { type: 'string', description: 'Optional group letter A-L. Omit for all groups.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_news',
      description: 'Returns the latest Pressing 90 World Cup briefings (editorial articles) published on our site. Use this for "latest news", "what\'s happening with X", "today\'s briefing".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional keyword to narrow (matches title + excerpt).' },
          limit: { type: 'string', description: 'Optional max number of articles (default 5).' },
        },
      },
    },
  },

  // ── STATIC tools (encyclopaedic, change rarely) ──────────────────
  {
    type: 'function',
    function: {
      name: 'get_team_profile',
      description: 'Returns the editorial team profile: coach, key players, playing style, World Cup history, qualifying summary. Use this for "tell me about X", "what\'s X\'s style", "who plays for X".',
      parameters: {
        type: 'object',
        properties: {
          team: { type: 'string', description: 'FIFA 3-letter code (e.g. "mar", "arg", "fra").' },
        },
        required: ['team'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_head_to_head',
      description: 'Returns the World Cup history between two teams: total matches, wins/draws/losses, goals, and a narrative summary of past meetings.',
      parameters: {
        type: 'object',
        properties: {
          team_a: { type: 'string', description: 'FIFA 3-letter code for the first team.' },
          team_b: { type: 'string', description: 'FIFA 3-letter code for the second team.' },
        },
        required: ['team_a', 'team_b'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_city_guide',
      description: 'Returns a travel guide for a host city: highlights, transit, food & drink, things to do, local tips.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Host city or venue id (e.g. "New York", "metlife", "Mexico City", "azteca").' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_venue',
      description: 'Returns details about a World Cup 2026 stadium: capacity, location, weather, notable facts.',
      parameters: {
        type: 'object',
        properties: {
          venue: { type: 'string', description: 'Venue id or city (e.g. "metlife", "azteca", "Los Angeles").' },
        },
        required: ['venue'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fan_zones',
      description: 'Returns official FIFA Fan Festival locations for a host city (capacity, hours, activities, transit).',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Host city name.' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_visa_info',
      description: 'Returns entry requirements (visa, ESTA, eTA) for a team\'s nationals entering a host country.',
      parameters: {
        type: 'object',
        properties: {
          team: { type: 'string', description: 'FIFA 3-letter code (nationality).' },
          host_country: { type: 'string', description: 'Optional "USA", "Mexico", or "Canada". Omit for all three.' },
        },
        required: ['team'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tournament_rules',
      description: 'Returns the official FIFA World Cup 2026 format and rules: 48 teams, 12 groups, knockout structure, substitutions, yellow-card thresholds, technology (VAR, semi-automated offside), squad size, venues, awards. Use this for ANY question about how the tournament works, qualification math, suspensions, extra time, hosts, dates.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Searches the broader web (Brave Search) for recent articles when our own sources (get_news for pressing90, ESPN for live scores, get_tournament_rules for format) are insufficient. ONLY use this if: (a) the user explicitly asks to search the web / asks for an external source, OR (b) you have already tried the appropriate internal tool and it returned no relevant result. Never call this as a first step — pressing90 articles and ESPN come first.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query in plain language. Include "World Cup 2026" or relevant team names to keep results on-topic.' },
          freshness: { type: 'string', description: 'Optional time filter: "pd" (past day), "pw" (past week), "pm" (past month). Default "pw".' },
        },
        required: ['query'],
      },
    },
  },
]

// ─── Tool implementations ─────────────────────────────────────────────

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
const SITE = 'https://pressing90.live'

/** Normalise a 3-letter team code (lowercase, trimmed). */
function tcode(s: string | undefined): string {
  return (s ?? '').trim().toLowerCase().slice(0, 3)
}

/** Pretty team display name from a static team record. Falls back to code. */
function teamName(code: string): string {
  const t = staticTeams.find((x) => x.code.toLowerCase() === code.toLowerCase())
  return t?.name ?? code.toUpperCase()
}

/** Format an ISO instant in a target IANA timezone as "HH:mm". */
function localTime(iso: string | undefined, tz: string): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  } catch { return '—' }
}

async function toolGetLiveMatches(env: Env, args: { team?: string }): Promise<unknown> {
  const r = await fetch(`${ESPN_BASE}/scoreboard?limit=50`)
  if (!r.ok) return { error: 'scoreboard_unavailable' }
  const data = await r.json<{ events?: Array<{
    id?: string
    date?: string
    name?: string
    status?: { type?: { state?: string; shortDetail?: string; description?: string } }
    competitions?: Array<{
      venue?: { fullName?: string; address?: { city?: string; country?: string } }
      competitors?: Array<{ homeAway?: string; score?: string; team?: { abbreviation?: string; displayName?: string } }>
      notes?: Array<{ headline?: string; type?: string }>
    }>
  }> }>()
  const team = tcode(args.team)
  const events = (data.events ?? [])
    .filter((ev) => {
      if (!team) return true
      const comp = ev.competitions?.[0]
      return comp?.competitors?.some((c) => (c.team?.abbreviation ?? '').toLowerCase() === team)
    })
    .slice(0, 12)
    .map((ev) => {
      const comp = ev.competitions?.[0]
      const home = comp?.competitors?.find((c) => c.homeAway === 'home')
      const away = comp?.competitors?.find((c) => c.homeAway === 'away')
      const stage = comp?.notes?.find((n) => n.type === 'event')?.headline ?? ev.status?.type?.description
      return {
        date_utc: ev.date,
        // Pre-computed local times in the three most-asked viewer
        // timezones so the model NEVER has to do timezone math itself
        // (Llama gets that wrong roughly half the time).
        kickoff_utc: localTime(ev.date, 'UTC'),
        kickoff_paris: localTime(ev.date, 'Europe/Paris'),
        kickoff_morocco: localTime(ev.date, 'Africa/Casablanca'),
        kickoff_new_york: localTime(ev.date, 'America/New_York'),
        kickoff_los_angeles: localTime(ev.date, 'America/Los_Angeles'),
        kickoff_mexico_city: localTime(ev.date, 'America/Mexico_City'),
        status: ev.status?.type?.state,         // 'pre' | 'in' | 'post'
        status_label: ev.status?.type?.shortDetail,  // "Sat 7:00 PM", "HT", "FT", "62'", …
        stage,
        venue: comp?.venue?.fullName,
        venue_city: comp?.venue?.address?.city,
        venue_country: comp?.venue?.address?.country,
        home: { team: home?.team?.displayName, code: home?.team?.abbreviation, score: home?.score },
        away: { team: away?.team?.displayName, code: away?.team?.abbreviation, score: away?.score },
      }
    })
  return { count: events.length, matches: events }
}

async function toolGetRecentResults(env: Env, args: { team?: string }): Promise<unknown> {
  // ESPN scoreboard returns finished events in 'post' state. Pull a wider
  // window and filter ourselves.
  const r = await fetch(`${ESPN_BASE}/scoreboard?limit=200`)
  if (!r.ok) return { error: 'scoreboard_unavailable' }
  const data = await r.json<{ events?: Array<{
    date?: string
    status?: { type?: { state?: string } }
    competitions?: Array<{ competitors?: Array<{ homeAway?: string; score?: string; team?: { abbreviation?: string; displayName?: string } }> }>
  }> }>()
  const team = tcode(args.team)
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000
  const results = (data.events ?? [])
    .filter((ev) => ev.status?.type?.state === 'post')
    .filter((ev) => (ev.date ? Date.parse(ev.date) >= sevenDaysAgo : false))
    .filter((ev) => {
      if (!team) return true
      const comp = ev.competitions?.[0]
      return comp?.competitors?.some((c) => (c.team?.abbreviation ?? '').toLowerCase() === team)
    })
    .slice(0, 20)
    .map((ev) => {
      const comp = ev.competitions?.[0]
      const home = comp?.competitors?.find((c) => c.homeAway === 'home')
      const away = comp?.competitors?.find((c) => c.homeAway === 'away')
      return {
        date: ev.date,
        home: { team: home?.team?.displayName, code: home?.team?.abbreviation, score: home?.score },
        away: { team: away?.team?.displayName, code: away?.team?.abbreviation, score: away?.score },
      }
    })
  return { count: results.length, results }
}

async function toolGetStandings(env: Env, args: { group?: string }): Promise<unknown> {
  // ESPN exposes WC standings at the /apis/v2/ (NOT /site/v2/) sub-tree.
  // The response is a tree: root.children = [{ name: "Group A", standings: { entries: [...] } }, ...].
  // Each entry has stats[] with named fields we flatten into a compact
  // table so the LLM doesn't have to traverse the giant raw payload.
  try {
    const r = await fetch('https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings', {
      cf: { cacheTtl: 60, cacheEverything: true },
    })
    if (!r.ok) return { error: 'standings_unavailable', status: r.status }
    const data = await r.json<{
      children?: Array<{
        name?: string
        abbreviation?: string
        standings?: { entries?: Array<{
          team?: { abbreviation?: string; displayName?: string }
          stats?: Array<{ name?: string; type?: string; value?: number; displayValue?: string }>
        }> }
      }>
    }>()

    function statOf(stats: Array<{ name?: string; type?: string; value?: number; displayValue?: string }> | undefined, key: string): string {
      const s = stats?.find((x) => x.name === key || x.type === key)
      return s?.displayValue ?? '—'
    }

    const groups = (data.children ?? [])
      .filter((g) => (g.name ?? '').toLowerCase().startsWith('group'))
      .map((g) => {
        const letter = (g.name ?? '').replace(/^Group\s+/i, '').trim()
        const standings = (g.standings?.entries ?? [])
          .map((e) => ({
            team: e.team?.displayName,
            code: e.team?.abbreviation,
            played: statOf(e.stats, 'gamesPlayed'),
            wins:   statOf(e.stats, 'wins'),
            draws:  statOf(e.stats, 'ties'),
            losses: statOf(e.stats, 'losses'),
            goals_for: statOf(e.stats, 'pointsFor'),
            goals_against: statOf(e.stats, 'pointsAgainst'),
            goal_diff: statOf(e.stats, 'pointDifferential'),
            points: statOf(e.stats, 'points'),
          }))
          // Sort by points desc, then goal diff desc, then goals for desc.
          // ESPN already orders this way but be defensive.
          .sort((a, b) => {
            const pa = parseInt(a.points, 10) || 0
            const pb = parseInt(b.points, 10) || 0
            if (pa !== pb) return pb - pa
            const ga = parseInt(a.goal_diff.replace('+', ''), 10) || 0
            const gb = parseInt(b.goal_diff.replace('+', ''), 10) || 0
            return gb - ga
          })
        return { group: letter, standings }
      })

    // Filter to a single group if requested.
    if (args.group) {
      const target = args.group.trim().toUpperCase()
      const one = groups.find((g) => g.group.toUpperCase() === target)
      if (!one) return { error: 'group_not_found', queried: args.group, available: groups.map((g) => g.group) }
      return one
    }
    return { count: groups.length, groups }
  } catch (e) {
    return { error: 'standings_fetch_failed', detail: String(e) }
  }
}

async function toolGetNews(env: Env, args: { query?: string; limit?: string }): Promise<unknown> {
  const limit = Math.max(1, Math.min(parseInt(args.limit ?? '5', 10) || 5, 10))
  let qs = `select=slug,title,excerpt,published_at&status=eq.published&order=published_at.desc&limit=${limit}`
  if (args.query?.trim()) {
    const q = encodeURIComponent(`%${args.query.trim()}%`)
    qs += `&or=(title.ilike.${q},excerpt.ilike.${q})`
  }
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/articles?${qs}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  })
  if (!r.ok) return { error: 'news_fetch_failed' }
  const rows = await r.json<Array<{ slug: string; title: string; excerpt: string | null; published_at: string }>>()
  return {
    count: rows.length,
    articles: rows.map((row) => ({
      title: row.title,
      excerpt: row.excerpt,
      published_at: row.published_at,
      link: `${SITE}/news/${row.slug}`,
    })),
  }
}

async function toolGetTeamProfile(args: { team: string }): Promise<unknown> {
  const code = tcode(args.team)
  const upper = code.toUpperCase()
  const profile = teamProfiles.find((p) => p.team_id.toLowerCase() === code)

  // Live enrichment — ESPN team meta + roster, fetched in parallel.
  // The static profile is editorial lore (style of play, philosophy,
  // World Cup history) and rarely changes; rosters and coaches DO
  // change between camps, so we always trust ESPN for the current
  // squad. The two sources are explicitly labelled in the payload
  // so the LLM (and through it, the user) can tell them apart.
  type EspnTeamMeta = {
    team?: {
      displayName?: string
      shortDisplayName?: string
      abbreviation?: string
      coach?: Array<{ firstName?: string; lastName?: string }>
      record?: { items?: Array<{ summary?: string }> }
    }
  }
  type EspnRosterEntry = {
    fullName?: string
    displayName?: string
    position?: { name?: string; abbreviation?: string }
    jersey?: string
    age?: number
    team?: { displayName?: string }  // club
  }

  // Hit ESPN directly rather than looping back through our own worker —
  // self-fetches across the same hostname don't reliably work on
  // Cloudflare Workers (the runtime refuses to re-enter the same script),
  // and going direct also avoids paying the bot-filter / CORS overhead
  // for an internal call. Use a real browser UA because ESPN sometimes
  // serves a 403 to default Workers UAs.
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'
  const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
  // For the team endpoint we add ?enable=roster,stats — same query our
  // own /roster handler uses, which returns the team meta + athletes in
  // one go and is the only one ESPN populates for international squads.
  const [teamRes, rosterRes] = await Promise.allSettled([
    fetch(`${ESPN}/teams/${upper}`, { headers: { 'user-agent': BROWSER_UA } }).then((r) => r.ok ? r.json<EspnTeamMeta>() : null),
    fetch(`${ESPN}/teams/${upper}?enable=roster,stats`, { headers: { 'user-agent': BROWSER_UA } }).then((r) => r.ok ? r.json<{ team?: { athletes?: Array<{ items?: EspnRosterEntry[] }> | EspnRosterEntry[] } }>() : null),
  ])

  const live: {
    coach: string | null
    record: string | null
    roster_source: string
    squad: Array<{ name: string; position: string; jersey: string; age: number | null; club: string | null }>
    roster_count: number
  } = {
    coach: null,
    record: null,
    roster_source: 'unavailable',
    squad: [],
    roster_count: 0,
  }
  if (teamRes.status === 'fulfilled' && teamRes.value?.team) {
    const t = teamRes.value.team
    const c = t.coach?.[0]
    if (c?.firstName || c?.lastName) {
      live.coach = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()
    }
    live.record = t.record?.items?.[0]?.summary ?? null
  }
  if (rosterRes.status === 'fulfilled' && rosterRes.value?.team?.athletes) {
    // ESPN nests athletes under team.athletes. Sometimes it's a flat array
    // of players, sometimes it's grouped by position with each group
    // wrapping its players in `items` — flatten both shapes here.
    const raw = rosterRes.value.team.athletes
    let ath: EspnRosterEntry[] = []
    if (Array.isArray(raw) && raw.length) {
      const first = raw[0] as unknown
      if (first && typeof first === 'object' && 'items' in (first as object)) {
        ath = (raw as Array<{ items?: EspnRosterEntry[] }>).flatMap((g) => g.items ?? [])
      } else {
        ath = raw as EspnRosterEntry[]
      }
    }
    live.roster_source = 'espn (live)'
    live.roster_count = ath.length
    live.squad = ath.slice(0, 30).map((a) => ({
      name: a.fullName ?? a.displayName ?? '?',
      position: a.position?.abbreviation ?? a.position?.name ?? '?',
      jersey: a.jersey ?? '',
      age: typeof a.age === 'number' ? a.age : null,
      club: a.team?.displayName ?? null,
    }))
  }

  return {
    // Live data wins for current state — these are what the user sees
    // on TV today, not what was true at the static profile's build time.
    LIVE: {
      coach_current: live.coach,
      recent_record: live.record,
      current_squad: live.squad,
      squad_size: live.roster_count,
      source: 'ESPN (refreshed daily)',
    },
    // Static editorial profile — only the LORE columns (style, history)
    // remain authoritative; ignore profile.coach / profile.key_players
    // if LIVE.* came back populated, they may be outdated.
    STATIC_LORE: profile ? {
      playing_style: profile.playing_style,
      world_cup_history: profile.world_cup_history,
      qualifying_summary: profile.qualifying_summary,
      // Deliberately NOT exposing profile.coach + profile.key_players
      // here — they would override the live data above. The LLM is
      // instructed (system prompt) to trust LIVE over STATIC for
      // anything roster-related.
    } : null,
    site_link: `${SITE}/team/${code}`,
  }
}

function toolGetHeadToHead(args: { team_a: string; team_b: string }): unknown {
  const a = tcode(args.team_a)
  const b = tcode(args.team_b)
  const match = historicalMatchups.find(
    (m) =>
      (m.team_a.toLowerCase() === a && m.team_b.toLowerCase() === b) ||
      (m.team_a.toLowerCase() === b && m.team_b.toLowerCase() === a)
  )
  if (!match) {
    return {
      error: 'no_world_cup_history',
      message: `${teamName(a)} and ${teamName(b)} have never met in a World Cup according to our records.`,
    }
  }
  return match
}

function toolGetCityGuide(args: { city: string }): unknown {
  const q = (args.city ?? '').toLowerCase().trim()
  const guide = cityGuides.find(
    (g) => g.venue_id.toLowerCase() === q || g.metro_area.toLowerCase().includes(q)
  )
  if (!guide) return { error: 'city_not_found', queried: args.city }
  return guide
}

function toolGetVenue(args: { venue: string }): unknown {
  const q = (args.venue ?? '').toLowerCase().trim()
  const venue = venues.find(
    (v) => v.id.toLowerCase() === q || v.city.toLowerCase().includes(q) || v.name.toLowerCase().includes(q)
  )
  if (!venue) return { error: 'venue_not_found', queried: args.venue }
  return venue
}

function toolGetFanZones(args: { city: string }): unknown {
  const q = (args.city ?? '').toLowerCase().trim()
  const zones = fanZones.filter((z) => z.city.toLowerCase().includes(q))
  if (zones.length === 0) return { error: 'no_fan_zones', queried: args.city }
  return { count: zones.length, zones }
}

function toolGetVisaInfo(args: { team: string; host_country?: string }): unknown {
  const code = tcode(args.team)
  const teamRow = visaInfo.find((v) => v.team_id.toLowerCase() === code)
  if (!teamRow) return { error: 'visa_info_not_found', team: code }
  const host = args.host_country?.trim().toLowerCase()
  const reqs = host
    ? teamRow.entry_requirements.filter((r) => r.country.toLowerCase() === host)
    : teamRow.entry_requirements
  if (reqs.length === 0) return { error: 'host_country_not_found', team: code, host: args.host_country }
  return { nationality: teamRow.nationality, passport_country: teamRow.passport_country, requirements: reqs }
}

function toolGetTournamentRules(): unknown {
  // Static JSON — returned as-is. The model gets a structured doc it can
  // quote from. See ./wc26-data/tournament-rules.ts for the source.
  return tournamentRules
}

async function toolWebSearch(env: Env, args: { query?: string; freshness?: string }): Promise<unknown> {
  // Brave Search API — used ONLY when the user asked to search the web,
  // or when no internal tool returned a useful result. Key is provisioned
  // as `BRAVE_API_KEY` via `wrangler secret put`. If the secret is missing
  // the tool returns a structured error so the model can apologise rather
  // than silently 500.
  const key = env.BRAVE_API_KEY
  if (!key) {
    return {
      error: 'web_search_unavailable',
      detail: 'BRAVE_API_KEY is not configured on the worker. Ask the site owner to add it.',
    }
  }
  const q = (args.query ?? '').trim()
  if (!q) return { error: 'missing_query' }
  const freshness = ['pd', 'pw', 'pm'].includes(args.freshness ?? '') ? args.freshness! : 'pw'

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=6&freshness=${freshness}&safesearch=moderate`
  try {
    const r = await fetch(url, {
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip',
        'x-subscription-token': key,
      },
    })
    if (!r.ok) {
      return { error: 'brave_http_error', status: r.status }
    }
    type BraveResult = {
      web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string; meta_url?: { hostname?: string } }> }
    }
    const data = await r.json<BraveResult>()
    const results = (data.web?.results ?? []).slice(0, 6).map((res) => ({
      title: res.title ?? '',
      url: res.url ?? '',
      hostname: res.meta_url?.hostname ?? (res.url ? new URL(res.url).hostname : ''),
      published: res.age ?? null,
      snippet: res.description ?? '',
    }))
    return {
      query: q,
      freshness,
      count: results.length,
      results,
      source: 'Brave Search',
      note: 'External results. Cite the hostname so users know it\'s not from pressing90.',
    }
  } catch (e) {
    return { error: 'brave_fetch_failed', detail: String(e) }
  }
}

// Dispatch — given a tool name + JSON args, run it.
async function runTool(env: Env, name: string, argsJson: string): Promise<unknown> {
  let args: Record<string, string>
  try { args = JSON.parse(argsJson || '{}') } catch { args = {} }
  switch (name) {
    case 'get_live_matches':    return toolGetLiveMatches(env, args)
    case 'get_recent_results':  return toolGetRecentResults(env, args)
    case 'get_standings':       return toolGetStandings(env, args)
    case 'get_news':            return toolGetNews(env, args)
    case 'get_team_profile':    return toolGetTeamProfile(args as { team: string })
    case 'get_head_to_head':    return toolGetHeadToHead(args as { team_a: string; team_b: string })
    case 'get_city_guide':      return toolGetCityGuide(args as { city: string })
    case 'get_venue':           return toolGetVenue(args as { venue: string })
    case 'get_fan_zones':       return toolGetFanZones(args as { city: string })
    case 'get_visa_info':       return toolGetVisaInfo(args as { team: string; host_country?: string })
    case 'get_tournament_rules':return toolGetTournamentRules()
    case 'web_search':          return toolWebSearch(env, args as { query?: string; freshness?: string })
    default: return { error: 'unknown_tool', name }
  }
}

// ─── System prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Pressing 90 AI Assistant — a World Cup 2026 expert that answers fan questions accurately, with substance, and in the user's language.

# Voice
- Knowledgeable and factual, like a sports desk editor. Substantive, not glib.
- 2–4 sentences by default. Add a 3rd or 4th when context helps (group, stage, venue, stakes).
- Reply in the LANGUAGE the user wrote in (French → French, English → English, Spanish → Spanish, etc.).

# Tool usage
- ANY question about today's matches, scores, results, standings, news → call the matching LIVE tool FIRST. Never guess.
- Background facts (history, style, city info, visa, venues, fan zones) → call the matching STATIC tool.
- Questions about the tournament format, rules, qualification math, suspensions, substitutions, hosts, dates → \`get_tournament_rules\`.
- Chain tools when useful: a "who won and what's their record" → \`get_recent_results\` + \`get_head_to_head\`.
- If a tool returns \`{ error: ... }\`, say so plainly. Do not invent data.

# Source priority (CRITICAL — read in order)
1. **Pressing 90 articles first** — for editorial, analysis, "what's happening with X" type questions, ALWAYS call \`get_news\` first. Our own coverage wins.
2. **ESPN live + static tools next** — scores, standings, team profiles, head-to-head, venues, visa, rules. These are authoritative for facts.
3. **\`web_search\` (Brave) ONLY in two cases**:
   (a) The user *explicitly* asks you to search the web ("cherche sur le web", "regarde ailleurs", "search online", "find an article", "have you checked external sources"). Their words must signal an external search.
   (b) You already called the appropriate internal tool (e.g. \`get_news\`) AND it returned no relevant result, AND the question is about something a news search can plausibly answer (recent events, transfers, injuries, press conferences).
   Never call \`web_search\` as the FIRST tool. Never call it for live scores, standings, rules — those have authoritative internal sources.
- When you do use \`web_search\` results, always cite the hostname inline ("selon X.com, …") so users see it's not our own content.
- If the user's message contains an explicit external-search trigger ("cherche sur le web", "regarde ailleurs", "search online", "find an article", "external source", "fact-check this online"), you MUST call \`web_search\` even if you already called another tool that came back empty. The user's wording is the authorisation — don't second-guess it.
- If \`web_search\` returns \`{ error: 'web_search_unavailable' }\`, say so transparently: "La recherche web externe n'est pas activée sur ce déploiement — demande à l'admin du site d'ajouter la clé Brave."

# Team profiles — LIVE vs STATIC_LORE (CRITICAL)
- \`get_team_profile\` returns TWO sections:
  · **LIVE** — coach_current, recent_record, current_squad (refreshed from ESPN daily). This is the truth as of today.
  · **STATIC_LORE** — playing_style, world_cup_history, qualifying_summary (editorial, written ahead of the tournament).
- ALWAYS trust LIVE for: who the coach is, who's in the squad right now, recent form.
- USE STATIC_LORE for: how the team plays, their World Cup history, the qualifying story.
- If LIVE.coach_current is populated, use it. Do NOT fall back to a coach name from STATIC_LORE — that field has been removed precisely to prevent stale answers.
- If the user contradicts you on a coach/squad detail and LIVE.* is empty, acknowledge the gap: "Notre flux ESPN ne nous a pas remonté l'info — votre source est probablement plus à jour."
- If LIVE.squad is empty but the user asks about players, say the international roster isn't yet exposed in the ESPN feed for that team, and offer the recent club info from history instead.

# Time zones (CRITICAL — Llama gets this wrong without help)
- The \`get_live_matches\` tool returns kickoff times PRE-COMPUTED in six time zones:
  \`kickoff_utc\`, \`kickoff_paris\`, \`kickoff_morocco\`, \`kickoff_new_york\`, \`kickoff_los_angeles\`, \`kickoff_mexico_city\`.
- ALWAYS pick the time zone that matches the user's question. If they ask "au Maroc" / "in Morocco" / "à Casablanca", use \`kickoff_morocco\`. For "à Paris" or "en France", use \`kickoff_paris\`. For "in New York", \`kickoff_new_york\`. If unspecified, default to local venue time (use \`kickoff_new_york\` for US venues, \`kickoff_mexico_city\` for Mexican venues, etc.).
- Never compute a time zone offset yourself. Always read the pre-computed field.

- WC26 matches are played only in the USA, Mexico, and Canada. When the user mentions another country (Morocco, France, etc.) in a time-zone context, they mean the local time of that country, not the venue.

# Facts vs. user pushback (CRITICAL — anti-sycophancy)
- When a tool returned data and the user contradicts it ("non c'est à 23h, pas 22h"), DO NOT cave. Politely hold the line:
  • "Notre source live (ESPN) donne X. Si tu vois Y ailleurs, c'est peut-être un décalage de fuseau — vérifie : c'est X UTC / Y heure de Paris / Z heure du Maroc."
- Only update if the user provides a credible reason (e.g. cites the FIFA official site with a specific URL). Never just because they sound certain.
- If you don't know, say "Je n'ai pas l'info" — never invent.

# Match answers — always include
1. Teams + 3-letter codes (e.g. "Morocco (MAR) vs Haiti (HAI)").
2. Kickoff in the right time zone (see above).
3. Venue + city if known.
4. Stage / group / round if known.
5. Current status if live (e.g. "live, 2nd half, 62'", "half-time", "full-time, MAR 2-1 HAI").

# Links — drive traffic to pressing90.live
- End relevant answers with at most ONE "→ pressing90.live/<route>" link.
- ONLY these route patterns exist — any other URL on pressing90.live is a 404, so NEVER invent one:
  · \`pressing90.live/team/<lowercase-3-letter-code>\` — team page (e.g. \`/team/mar\`, \`/team/fra\`).
  · \`pressing90.live/today\` — today's matches.
  · \`pressing90.live/wc26\` — bracket + groups.
  · \`pressing90.live/news\` — news list.
  · \`pressing90.live/news/<slug>\` — ONLY use the exact URL returned by \`get_news\`. Never compose a slug yourself.
  · \`pressing90.live/watch/<country-slug>\` — where-to-watch by country (e.g. \`/watch/morocco\`).
  · \`pressing90.live/stadiums\` — venues overview.
- If no route fits the question, omit the link entirely.
- Routes that DON'T exist: \`/venue/...\`, \`/city/...\`, \`/match/...\`, \`/history/...\`. Never link them.

# Constants
- Today: ${new Date().toISOString().slice(0, 10)}.
- Tournament: 11 June – 19 July 2026, 48 nations, USA + Mexico + Canada.

# Out of scope
- Politely redirect anything not WC26 / football / host cities / travel-to-WC.`

// ─── Entry point ───────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  tool_call_id?: string
  name?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

interface AiResponse {
  response?: string
  tool_calls?: Array<{ name: string; arguments: string | Record<string, unknown> }>
}

// ─── gpt-oss-120b adapter ──────────────────────────────────────────────
//
// gpt-oss exposes Cloudflare's "Responses API" shape, NOT the OpenAI
// chat-completions shape Llama uses. Differences we have to bridge:
//
//   Input:
//     - chat-completions: { messages: [{role, content}, …], tools: [{type:'function', function:{…}}] }
//     - responses API:    { instructions: <system>, input: <items[]>, tools: [{type:'function', name, description, parameters}] }
//                          where items[] is a mix of {role,content}, {type:'function_call',…}, {type:'function_call_output',…}
//
//   Output:
//     - chat-completions: { response: '…', tool_calls: [{name, arguments}] }
//     - responses API:    { output: [{type:'reasoning',…}, {type:'message',role:'assistant',content:[{type:'output_text',text:'…'}]}, {type:'function_call',call_id,name,arguments}] }
//
// We translate both ways so the existing tool-use loop body in
// handleAiChat() doesn't have to know which model it's talking to.

const GPT_OSS_MODEL = '@cf/openai/gpt-oss-120b'

type GptOssInputItem =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

type GptOssOutputItem =
  | { type: 'reasoning'; summary?: unknown; content?: unknown }
  | { type: 'message'; role?: string; content?: Array<{ type?: string; text?: string }> }
  | { type: 'function_call'; call_id?: string; name?: string; arguments?: string }

/** Convert our chat-completions messages array into gpt-oss responses
 *  API shape: { instructions, input[] }. The system message becomes
 *  instructions; everything else lands in input[] as either a plain
 *  {role,content}, a function_call (assistant tool invocation) or a
 *  function_call_output (tool result). */
function toGptOssInput(messages: ChatMessage[]): { instructions: string; input: GptOssInputItem[] } {
  let instructions = ''
  const input: GptOssInputItem[] = []
  for (const m of messages) {
    if (m.role === 'system') {
      instructions = (instructions ? instructions + '\n\n' : '') + m.content
      continue
    }
    if (m.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: m.tool_call_id ?? '',
        output: m.content,
      })
      continue
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      for (const tc of m.tool_calls) {
        input.push({
          type: 'function_call',
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })
      }
      continue
    }
    // Plain text message (user or assistant).
    input.push({ role: m.role as 'user' | 'assistant', content: m.content })
  }
  return { instructions, input }
}

/** Convert our OpenAI-style tools[] into the flat schema gpt-oss expects
 *  (no inner 'function' wrapping; name/description/parameters at the top
 *  level alongside type). */
function toGptOssTools(tools: ToolDef[]): unknown[] {
  return tools.map((t) => ({
    type: 'function',
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }))
}

/** Parse the gpt-oss output[] array into the shape our loop expects:
 *  a final text string plus a list of tool calls to execute next hop. */
function fromGptOssOutput(out: { output?: GptOssOutputItem[] }): {
  finalText: string
  toolCalls: Array<{ id: string; name: string; arguments: string }>
} {
  let finalText = ''
  const toolCalls: Array<{ id: string; name: string; arguments: string }> = []
  for (const item of out.output ?? []) {
    if (item.type === 'function_call') {
      toolCalls.push({
        id: item.call_id ?? `fc_${toolCalls.length}`,
        name: item.name ?? '',
        arguments: item.arguments ?? '{}',
      })
    } else if (item.type === 'message') {
      for (const c of item.content ?? []) {
        if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') {
          finalText += c.text
        }
      }
    }
    // 'reasoning' items are gpt-oss's chain-of-thought scratchpad; skip.
  }
  return { finalText: finalText.trim(), toolCalls }
}

/** Single inference call, normalised to a common return shape. */
async function runModel(
  ai: { run: (model: string, input: unknown) => Promise<unknown> },
  messages: ChatMessage[],
  tools: ToolDef[],
): Promise<{ finalText: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }> {
  const { instructions, input } = toGptOssInput(messages)
  const raw = await ai.run(GPT_OSS_MODEL, {
    instructions,
    input,
    tools: toGptOssTools(tools),
    max_output_tokens: 1200,
    // 'low' keeps latency tight (~2-3s); bump to 'medium' if answers
    // start feeling shallow on multi-step reasoning questions.
    reasoning: { effort: 'low' },
  })
  return fromGptOssOutput(raw as { output?: GptOssOutputItem[] })
}

export async function handleAiChat(env: Env, req: Request): Promise<Response> {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors })

  const body = await req.json().catch(() => null) as { messages?: ChatMessage[] } | null
  const userMessages = body?.messages ?? []
  if (userMessages.length === 0) {
    return new Response(JSON.stringify({ error: 'no_messages' }), { status: 400, headers: { ...cors, 'content-type': 'application/json' } })
  }

  const ai = (env as Env & { AI?: { run: (model: string, input: unknown) => Promise<unknown> } }).AI
  if (!ai) {
    return new Response(JSON.stringify({ error: 'AI_BINDING_MISSING' }), { status: 503, headers: { ...cors, 'content-type': 'application/json' } })
  }

  // Conversation buffer — start with the system prompt, append the
  // user's history. We mutate this as we resolve tool calls.
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...userMessages.slice(-20), // cap history to keep prompt budget sane
  ]

  // Tool-use loop. Hard cap at 4 hops to avoid runaway model behaviour.
  for (let hop = 0; hop < 4; hop++) {
    const { finalText, toolCalls } = await runModel(ai, messages, TOOLS)

    if (toolCalls.length === 0) {
      // Model gave a final answer.
      return new Response(JSON.stringify({ reply: finalText }), {
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
      })
    }

    // Execute every requested tool and append results so the next hop
    // sees them as `function_call` + `function_call_output` items.
    for (const call of toolCalls) {
      const result = await runTool(env, call.name, call.arguments)
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }],
      })
      messages.push({
        role: 'tool',
        name: call.name,
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 4000), // cap each tool result to stay in context
      })
    }
  }

  // Reached the hop cap — produce a final answer from what we have.
  const finalRun = await runModel(
    ai,
    [
      ...messages,
      { role: 'user', content: 'Now give the user a substantive final answer using only the tool results gathered above. Reply in the user\'s language. Do not request more tools.' },
    ],
    [], // no tools on the wrap-up call — force a text reply
  )
  return new Response(JSON.stringify({ reply: finalRun.finalText }), {
    status: 200,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

