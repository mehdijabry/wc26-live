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

export function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const delta = Date.now() - new Date(iso).getTime()
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} min ago`
  return `${Math.floor(delta / 3_600_000)}h ago`
}
