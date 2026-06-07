import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Pick = {
  matchId: string
  homeScore: number
  awayScore: number
  winner?: string
  ts: number
}

type State = {
  alias: string
  picks: Record<string, Pick>
  setAlias: (a: string) => void
  setPick: (p: Pick) => void
  clear: () => void
}

export const usePredictions = create<State>()(
  persist(
    (set) => ({
      alias: '',
      picks: {},
      setAlias: (alias) => set({ alias }),
      setPick: (p) => set((s) => ({ picks: { ...s.picks, [p.matchId]: p } })),
      clear: () => set({ picks: {} }),
    }),
    { name: 'wc2026-predictions' }
  )
)

export function shareLink(picks: Record<string, Pick>, alias: string): string {
  const payload = btoa(
    JSON.stringify({
      alias,
      p: Object.values(picks).map((p) => [p.matchId, p.homeScore, p.awayScore]),
    })
  )
  return `${location.origin}${location.pathname}#picks=${payload}`
}

export function loadFromHash(): { alias: string; picks: Record<string, Pick> } | null {
  const m = location.hash.match(/picks=([^&]+)/)
  if (!m) return null
  try {
    const data = JSON.parse(atob(m[1]))
    const picks: Record<string, Pick> = {}
    for (const [matchId, h, a] of data.p) {
      picks[matchId] = { matchId, homeScore: h, awayScore: a, ts: Date.now() }
    }
    return { alias: data.alias || '', picks }
  } catch {
    return null
  }
}
