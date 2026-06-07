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
