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

export const api = {
  health: () => jget<{ ok: boolean; service: string; t: string }>('/health'),
  scoreboard: () => jget<EspnScoreboard>('/scoreboard'),
  fixtures: () => jget<EspnScoreboard>('/fixtures'),
  tournament: () => jget<TournamentResponse>('/tournament'),
  standings: () => jget<unknown>('/standings'),
  match: (id: string) => jget<{ header?: unknown; gameInfo?: unknown }>(`/match/${id}`),
  team: (code: string) => jget<unknown>(`/teams/${code}`),
  roster: (code: string) => jget<RosterResponse>(`/roster/${code.toLowerCase()}`),
  history: (code: string) => jget<HistoryResponse>(`/team-history/${code.toLowerCase()}`),
  today: (date?: string) => jget<DailyResponse>(`/today${date ? `?date=${date}` : ''}`),
}

// "YYYYMMDD" for a Date in UTC — matches the /today?date= query param
export function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

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
