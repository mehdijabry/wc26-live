import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'

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
  setPick: (p: Pick) => Promise<void>
  clear: () => void
  syncFromCloud: () => Promise<void>
  pushLocalToCloud: () => Promise<void>
}

export const usePredictions = create<State>()(
  persist(
    (set, get) => ({
      alias: '',
      picks: {},
      setAlias: (alias) => set({ alias }),
      setPick: async (p) => {
        // Update locally first (optimistic)
        set((s) => ({ picks: { ...s.picks, [p.matchId]: p } }))
        // Sync to Supabase if logged in
        const user = useAuth.getState().user
        if (supabase && user) {
          await supabase.from('predictions').upsert(
            {
              user_id: user.id,
              match_id: p.matchId,
              home_score: p.homeScore,
              away_score: p.awayScore,
            },
            { onConflict: 'user_id,match_id' }
          )
        }
      },
      clear: () => set({ picks: {} }),

      async syncFromCloud() {
        const user = useAuth.getState().user
        if (!supabase || !user) return
        const { data } = await supabase
          .from('predictions')
          .select('match_id, home_score, away_score, created_at')
          .eq('user_id', user.id)
        if (!data) return
        const picks: Record<string, Pick> = {}
        data.forEach((r) => {
          picks[r.match_id] = {
            matchId: r.match_id,
            homeScore: r.home_score,
            awayScore: r.away_score,
            ts: new Date(r.created_at).getTime(),
          }
        })
        // Merge cloud over local
        set((s) => ({ picks: { ...s.picks, ...picks } }))
      },

      async pushLocalToCloud() {
        const user = useAuth.getState().user
        if (!supabase || !user) return
        const picks = Object.values(get().picks)
        if (picks.length === 0) return
        await supabase.from('predictions').upsert(
          picks.map((p) => ({
            user_id: user.id,
            match_id: p.matchId,
            home_score: p.homeScore,
            away_score: p.awayScore,
          })),
          { onConflict: 'user_id,match_id' }
        )
      },
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
