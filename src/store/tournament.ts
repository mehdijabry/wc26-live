import { create } from 'zustand'
import { api, type EspnEvent } from '../lib/api'

/**
 * Shared live tournament state — fetched once from ESPN via the Worker
 * and refreshed periodically. All sections (Schedule, Hero, Groups,
 * Bracket) read from this store so the page never shows stale or
 * fabricated data.
 */

type State = {
  events: EspnEvent[]
  total: number
  hasLive: boolean
  fetchedAt: string | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
}

let pollTimer: number | null = null

export const useTournament = create<State>((set, get) => ({
  events: [],
  total: 0,
  hasLive: false,
  fetchedAt: null,
  loading: false,
  error: null,
  async load() {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const data = await api.tournament()
      set({
        events: data.events ?? [],
        total: data.total,
        hasLive: data.hasLive,
        fetchedAt: data.fetchedAt,
        loading: false,
      })
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load tournament data',
      })
    }
  },
}))

// Boot the global polling loop once (module-level singleton). 30s if live,
// 5 min otherwise. Visibility-aware: pauses when the tab is hidden.
if (typeof window !== 'undefined') {
  const reschedule = () => {
    if (pollTimer) clearTimeout(pollTimer)
    const next = useTournament.getState().hasLive ? 30_000 : 300_000
    pollTimer = window.setTimeout(async () => {
      if (!document.hidden) await useTournament.getState().load()
      reschedule()
    }, next)
  }
  // First load (deferred so it doesn't block initial render)
  setTimeout(() => useTournament.getState().load(), 250)
  reschedule()

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) useTournament.getState().load()
  })
}

// ----- Selectors / helpers -----------------------------------------------

export function selectGroupTeams(events: EspnEvent[]): Map<string, Set<string>> {
  // Only events with a `groupId` or notes pointing to the group stage matter.
  // ESPN's WC fixtures have `season.type` and `competitions[0].notes[].headline`
  // sometimes. For now we infer from competition `notes` if available, or
  // accept all teams seen in 'pre'/'in'/'post' as part of the tournament pool.
  const groups = new Map<string, Set<string>>()
  for (const ev of events) {
    const comp = ev.competitions?.[0]
    if (!comp) continue
    const notes: Array<{ headline?: string }> | undefined = (comp as unknown as { notes?: Array<{ headline?: string }> }).notes
    const groupNote = notes?.find((n) => n.headline?.toUpperCase().startsWith('GROUP '))
    const groupLetter = groupNote?.headline?.replace(/^Group\s*/i, '').trim()
    if (!groupLetter) continue
    const set = groups.get(groupLetter) ?? new Set<string>()
    comp.competitors?.forEach((c) => {
      if (c.team?.abbreviation) set.add(c.team.abbreviation)
    })
    groups.set(groupLetter, set)
  }
  return groups
}

export function nextLiveOrUpcoming(events: EspnEvent[]): EspnEvent | null {
  // Prefer a match currently in progress; else next scheduled
  const live = events.find((e) => e.status?.type?.state === 'in')
  if (live) return live
  const now = Date.now()
  const upcoming = events
    .filter((e) => e.status?.type?.state === 'pre' && e.date && new Date(e.date).getTime() > now)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  return upcoming[0] ?? null
}

/**
 * Derive the 12 WC26 groups (A–L) from the first 72 ESPN events.
 *
 * Group stage = first 72 matches. Each team plays 3 others — its group-mates.
 * We build an adjacency map and cluster connected components. Each cluster
 * of 4 teams is a group. Groups are labelled A→L in order of their first
 * kickoff date.
 */
export type LiveGroup = {
  letter: string
  teams: Array<{
    abbr: string
    name: string
    shortName: string
    logo?: string
    color?: string
  }>
  firstKickoff: string
}

export function deriveLiveGroups(events: EspnEvent[]): LiveGroup[] {
  // Sort by kickoff
  const sorted = [...events].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  // Take first 72 matches as the group stage
  const groupStage = sorted.slice(0, 72)
  if (groupStage.length === 0) return []

  // Build adjacency map of team → set of group-mates
  const adj = new Map<string, Set<string>>()
  const teamData = new Map<string, { name: string; shortName: string; logo?: string; color?: string }>()
  const teamFirstKickoff = new Map<string, string>()

  for (const ev of groupStage) {
    const comp = ev.competitions?.[0]
    if (!comp) continue
    const competitors = comp.competitors ?? []
    if (competitors.length < 2) continue
    const a = competitors[0]?.team
    const b = competitors[1]?.team
    if (!a?.abbreviation || !b?.abbreviation) continue
    const aa = a.abbreviation.toUpperCase()
    const ba = b.abbreviation.toUpperCase()
    if (!adj.has(aa)) adj.set(aa, new Set())
    if (!adj.has(ba)) adj.set(ba, new Set())
    adj.get(aa)!.add(ba)
    adj.get(ba)!.add(aa)
    if (a.displayName && !teamData.has(aa)) {
      teamData.set(aa, {
        name: a.displayName,
        shortName: a.shortDisplayName ?? a.displayName,
        logo: a.logo,
        color: a.color,
      })
    }
    if (b.displayName && !teamData.has(ba)) {
      teamData.set(ba, {
        name: b.displayName,
        shortName: b.shortDisplayName ?? b.displayName,
        logo: b.logo,
        color: b.color,
      })
    }
    const date = ev.date ?? ''
    for (const code of [aa, ba]) {
      const prev = teamFirstKickoff.get(code)
      if (!prev || date < prev) teamFirstKickoff.set(code, date)
    }
  }

  // Cluster connected components (DFS)
  const visited = new Set<string>()
  const clusters: Array<{ teams: string[]; firstKickoff: string }> = []
  for (const team of adj.keys()) {
    if (visited.has(team)) continue
    const cluster: string[] = []
    const stack = [team]
    let firstKickoff = '9999-99-99'
    while (stack.length) {
      const t = stack.pop()!
      if (visited.has(t)) continue
      visited.add(t)
      cluster.push(t)
      const kickoff = teamFirstKickoff.get(t)
      if (kickoff && kickoff < firstKickoff) firstKickoff = kickoff
      const neighbors = adj.get(t)
      if (neighbors) for (const n of neighbors) if (!visited.has(n)) stack.push(n)
    }
    // Only keep clusters of exactly 4 (proper WC26 group)
    if (cluster.length === 4) clusters.push({ teams: cluster, firstKickoff })
  }

  // Sort clusters by first kickoff, label A→L
  clusters.sort((a, b) => a.firstKickoff.localeCompare(b.firstKickoff))
  const letters = 'ABCDEFGHIJKL'.split('')
  return clusters.slice(0, 12).map((c, i) => ({
    letter: letters[i],
    firstKickoff: c.firstKickoff,
    teams: c.teams
      .map((abbr) => ({
        abbr,
        name: teamData.get(abbr)?.name ?? abbr,
        shortName: teamData.get(abbr)?.shortName ?? abbr,
        logo: teamData.get(abbr)?.logo,
        color: teamData.get(abbr)?.color,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

export function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const delta = Date.now() - new Date(iso).getTime()
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`
  return `${Math.floor(delta / 3_600_000)}h ago`
}

// ----- Per-team helpers -------------------------------------------------

export type TeamRecord = {
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export function recordForTeam(events: EspnEvent[], abbr: string): TeamRecord {
  const r: TeamRecord = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  const A = abbr.toUpperCase()
  for (const ev of events) {
    if (ev.status?.type?.state !== 'post') continue
    const comp = ev.competitions?.[0]
    const cs = comp?.competitors ?? []
    if (cs.length < 2) continue
    const mine = cs.find((c) => c.team?.abbreviation?.toUpperCase() === A)
    const other = cs.find((c) => c.team?.abbreviation?.toUpperCase() !== A)
    if (!mine || !other) continue
    const my = parseInt(mine.score ?? '0', 10)
    const op = parseInt(other.score ?? '0', 10)
    r.played++
    r.goalsFor += my
    r.goalsAgainst += op
    if (my > op) { r.won++; r.points += 3 }
    else if (my === op) { r.drawn++; r.points += 1 }
    else r.lost++
  }
  return r
}

export function nextMatchForTeam(events: EspnEvent[], abbr: string): EspnEvent | null {
  const A = abbr.toUpperCase()
  const now = Date.now()
  return events
    .filter((ev) => {
      if (ev.status?.type?.state === 'post') return false
      const cs = ev.competitions?.[0]?.competitors ?? []
      return cs.some((c) => c.team?.abbreviation?.toUpperCase() === A)
        && ev.date && new Date(ev.date).getTime() > now - 7_200_000 // include matches up to 2h late (live)
    })
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0] ?? null
}

export function matchesForTeam(events: EspnEvent[], abbr: string): EspnEvent[] {
  const A = abbr.toUpperCase()
  return events.filter((ev) => {
    const cs = ev.competitions?.[0]?.competitors ?? []
    return cs.some((c) => c.team?.abbreviation?.toUpperCase() === A)
  })
}

// ----- Group standings + qualifier projection ---------------------------
//
// recordForTeam above considers ALL the team's matches (group + knockout).
// For the standings of a single group we must restrict to the team's three
// group-stage matches only — otherwise a KO win would inflate the table.

export type GroupRow = {
  abbr: string
  name: string
  record: TeamRecord
  goalDiff: number
}

export type GroupStanding = {
  letter: string
  rows: GroupRow[]            // sorted by points → GD → GF
  matchdayLabel: string       // "MD3 · final" | "MD2 · live" | "MD1 · upcoming"
}

function isGroupStageEvent(ev: EspnEvent): boolean {
  return (ev.season?.slug ?? '') === 'group-stage'
}

function recordForTeamInGroup(groupEvents: EspnEvent[], abbr: string): TeamRecord {
  // Same maths as recordForTeam but scoped to the events passed in.
  const r: TeamRecord = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  const A = abbr.toUpperCase()
  for (const ev of groupEvents) {
    if (ev.status?.type?.state !== 'post') continue
    const cs = ev.competitions?.[0]?.competitors ?? []
    if (cs.length < 2) continue
    const mine = cs.find((c) => c.team?.abbreviation?.toUpperCase() === A)
    const other = cs.find((c) => c.team?.abbreviation?.toUpperCase() !== A)
    if (!mine || !other) continue
    const my = parseInt(mine.score ?? '0', 10)
    const op = parseInt(other.score ?? '0', 10)
    r.played++
    r.goalsFor += my
    r.goalsAgainst += op
    if (my > op) { r.won++; r.points += 3 }
    else if (my === op) { r.drawn++; r.points += 1 }
    else r.lost++
  }
  return r
}

export function deriveGroupStandings(events: EspnEvent[], groups: LiveGroup[]): GroupStanding[] {
  // Restrict the universe of events to the group stage. Falls back to the
  // first 72 events sorted by date when ESPN hasn't tagged season.slug yet.
  let groupStage = events.filter(isGroupStageEvent)
  if (groupStage.length === 0) {
    groupStage = [...events].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).slice(0, 72)
  }
  return groups.map((g) => {
    // The three group matches per team: events whose BOTH competitors are
    // in this group's team set. Filtering this way avoids accidentally
    // counting a KO match against an outside opponent.
    const teamSet = new Set(g.teams.map((t) => t.abbr.toUpperCase()))
    const matches = groupStage.filter((ev) => {
      const cs = ev.competitions?.[0]?.competitors ?? []
      if (cs.length < 2) return false
      const a = cs[0]?.team?.abbreviation?.toUpperCase()
      const b = cs[1]?.team?.abbreviation?.toUpperCase()
      return !!a && !!b && teamSet.has(a) && teamSet.has(b)
    })
    const rows: GroupRow[] = g.teams.map((t) => {
      const record = recordForTeamInGroup(matches, t.abbr)
      return {
        abbr: t.abbr,
        name: t.name,
        record,
        goalDiff: record.goalsFor - record.goalsAgainst,
      }
    })
    rows.sort((a, b) => {
      if (b.record.points !== a.record.points) return b.record.points - a.record.points
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff
      return b.record.goalsFor - a.record.goalsFor
    })
    // Matchday label — best-effort indicator of group state. Each group
    // has 6 matches total (4 teams × 3 matchdays); if any group match is
    // currently 'in' state, surface that; if all 6 are 'post', label MD3
    // final; otherwise pick the highest MD that has any 'post' event.
    const anyLive = matches.some((m) => m.status?.type?.state === 'in')
    const completed = matches.filter((m) => m.status?.type?.state === 'post').length
    const matchdayLabel = anyLive
      ? 'live'
      : completed >= 6 ? 'MD3 · final'
      : completed >= 4 ? 'MD3 · in progress'
      : completed >= 2 ? 'MD2 · in progress'
      : completed >= 1 ? 'MD1 · in progress'
      : 'upcoming'
    return { letter: g.letter, rows, matchdayLabel }
  })
}

// ----- Qualified teams for the Round of 32 ------------------------------
//
// Twelve group winners + twelve runners-up qualify automatically. The eight
// best third-placed teams complete the 32-team bracket. Tiebreakers follow
// FIFA's published order: points → goal difference → goals for. The next
// FIFA tiebreakers (fair-play points, drawing of lots) aren't exposed in
// ESPN's feed, so we stop there and label the cutoff with `provisional`
// when the 8th vs 9th third-placed teams are tied on the visible fields.

export type Qualified = {
  firsts: string[]            // 12 group-winner abbreviations (in group order A→L)
  seconds: string[]           // 12 runners-up abbreviations
  bestThirds: string[]        // up to 8 third-placed abbreviations
  remainingThirds: string[]   // the other thirds (4) — for context
  provisional: boolean        // true if the 8/9 cutoff is on tied teams
}

export function deriveQualified(standings: GroupStanding[]): Qualified {
  const firsts: string[] = []
  const seconds: string[] = []
  const thirds: Array<{ abbr: string; points: number; gd: number; gf: number; group: string }> = []
  for (const s of standings) {
    if (s.rows[0]) firsts.push(s.rows[0].abbr)
    if (s.rows[1]) seconds.push(s.rows[1].abbr)
    if (s.rows[2]) thirds.push({
      abbr: s.rows[2].abbr,
      points: s.rows[2].record.points,
      gd: s.rows[2].goalDiff,
      gf: s.rows[2].record.goalsFor,
      group: s.letter,
    })
  }
  thirds.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.gd !== a.gd) return b.gd - a.gd
    return b.gf - a.gf
  })
  const bestThirds = thirds.slice(0, 8).map((t) => t.abbr)
  const remainingThirds = thirds.slice(8).map((t) => t.abbr)
  // Flag provisional if the 8th and 9th best are dead-locked on visible
  // tiebreakers — the editor (or FIFA) will resolve via fair-play / draw.
  const provisional = thirds.length >= 9
    && thirds[7].points === thirds[8].points
    && thirds[7].gd === thirds[8].gd
    && thirds[7].gf === thirds[8].gf
  return { firsts, seconds, bestThirds, remainingThirds, provisional }
}

// ----- Knockout bracket -------------------------------------------------
//
// ESPN tags each event with a season.slug for the stage and pre-populates
// the knockout pairings from the moment of the draw. For matches that
// haven't been resolved yet, competitors carry placeholder displayNames
// like "Semifinal 1 Winner" with abbreviation "SFW1" — these stay visible
// until the upstream match completes, at which point ESPN auto-fills the
// real team. The cascade therefore comes free from the data feed; we just
// bucket events by stage and surface them as-is.

export type BracketMatchTeam = {
  abbr: string                // either real 3-letter code or placeholder ref ("SFW1")
  name: string
  score?: string
  winner?: boolean
  isPlaceholder: boolean      // true while we're waiting on the previous round
}

export type BracketMatch = {
  id: string
  date?: string
  shortName?: string
  venue?: string
  city?: string
  stage: BracketStage
  status: 'pre' | 'in' | 'post'
  home: BracketMatchTeam | null
  away: BracketMatchTeam | null
}

export type BracketStage =
  | 'round-of-32'
  | 'round-of-16'
  | 'quarterfinals'
  | 'semifinals'
  | '3rd-place-match'
  | 'final'

export const BRACKET_STAGES: BracketStage[] = [
  'round-of-32',
  'round-of-16',
  'quarterfinals',
  'semifinals',
  '3rd-place-match',
  'final',
]

function toBracketTeam(c: { team?: { abbreviation?: string; displayName?: string }; score?: string; winner?: boolean } | undefined): BracketMatchTeam | null {
  if (!c) return null
  const abbr = c.team?.abbreviation ?? '?'
  const name = c.team?.displayName ?? abbr
  // Placeholder rule: ESPN uses 3-4 letter codes for real teams (FRA, USA,
  // MAR…) and tokens like "SFW1", "QFW2", "RD16 W8" for unresolved slots.
  // The simplest discriminator is "displayName contains 'Winner' or 'Loser'".
  const isPlaceholder = /winner|loser/i.test(name) || /^(SF|QF|RD|R\d)/i.test(abbr)
  return {
    abbr,
    name,
    score: c.score,
    winner: c.winner,
    isPlaceholder,
  }
}

export function deriveBracket(events: EspnEvent[]): Record<BracketStage, BracketMatch[]> {
  const empty: Record<BracketStage, BracketMatch[]> = {
    'round-of-32': [],
    'round-of-16': [],
    'quarterfinals': [],
    'semifinals': [],
    '3rd-place-match': [],
    'final': [],
  }
  for (const ev of events) {
    const slug = ev.season?.slug as BracketStage | undefined
    if (!slug || !(slug in empty)) continue
    const comp = ev.competitions?.[0]
    const cs = comp?.competitors ?? []
    const home = toBracketTeam(cs.find((c) => c.homeAway === 'home') ?? cs[0])
    const away = toBracketTeam(cs.find((c) => c.homeAway === 'away') ?? cs[1])
    const state = (comp?.status?.type?.state ?? ev.status?.type?.state ?? 'pre') as 'pre' | 'in' | 'post'
    empty[slug].push({
      id: ev.id,
      date: ev.date,
      shortName: ev.shortName,
      venue: comp?.venue?.fullName,
      city: comp?.venue?.address?.city,
      stage: slug,
      status: state,
      home,
      away,
    })
  }
  for (const s of BRACKET_STAGES) {
    empty[s].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  }
  return empty
}
