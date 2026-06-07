import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { useAuth } from './auth'

/**
 * Full-bracket prediction state.
 * - groupStandings: per group, ordered array of team codes (1st, 2nd, 3rd, 4th)
 * - thirdPlaceAdvancing: 8 team codes that advance from the 4 best 3rd-placed
 * - koWinners: matchId → winning team code (R32-1, R16-1, QF-1, SF-1, FINAL, 3RD)
 */

export type GroupLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L'

export type BracketState = {
  groupStandings: Partial<Record<GroupLetter, string[]>>  // { "A": ["MAR","MEX","AUS","CAN"], ...}
  thirdPlaceAdvancing: string[]                            // 8 team codes
  koWinners: Record<string, string>                        // { "R32-1": "MAR", ... }
  thirdPlaceWinner: string | null
  finalWinner: string | null
  isPublished: boolean
  shareSlug: string | null

  // mutations
  setGroupRank: (letter: GroupLetter, ordering: string[]) => void
  toggleThirdAdvancing: (code: string) => void
  setKoWinner: (matchId: string, code: string) => void
  setThirdPlaceWinner: (code: string | null) => void
  setFinalWinner: (code: string | null) => void
  reset: () => void

  // I/O
  load: () => Promise<void>
  save: () => Promise<{ error?: string }>
  publish: (slug?: string) => Promise<{ error?: string; url?: string }>
  unpublish: () => Promise<void>
}

const initial = {
  groupStandings: {} as Partial<Record<GroupLetter, string[]>>,
  thirdPlaceAdvancing: [] as string[],
  koWinners: {} as Record<string, string>,
  thirdPlaceWinner: null,
  finalWinner: null,
  isPublished: false,
  shareSlug: null as string | null,
}

export const useBracket = create<BracketState>()(
  persist(
    (set, get) => ({
      ...initial,

      setGroupRank: (letter, ordering) =>
        set((s) => ({ groupStandings: { ...s.groupStandings, [letter]: ordering } })),

      toggleThirdAdvancing: (code) =>
        set((s) => {
          const exists = s.thirdPlaceAdvancing.includes(code)
          if (exists) return { thirdPlaceAdvancing: s.thirdPlaceAdvancing.filter((c) => c !== code) }
          if (s.thirdPlaceAdvancing.length >= 8) return {}
          return { thirdPlaceAdvancing: [...s.thirdPlaceAdvancing, code] }
        }),

      setKoWinner: (matchId, code) =>
        set((s) => ({ koWinners: { ...s.koWinners, [matchId]: code } })),

      setThirdPlaceWinner: (code) => set({ thirdPlaceWinner: code }),
      setFinalWinner: (code) => set({ finalWinner: code }),

      reset: () => set(initial),

      async load() {
        const user = useAuth.getState().user
        if (!supabase || !user) return
        const { data } = await supabase
          .from('bracket_predictions')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!data) return
        set({
          groupStandings: data.group_standings ?? {},
          thirdPlaceAdvancing: data.third_place_advancing ?? [],
          koWinners: data.ko_winners ?? {},
          thirdPlaceWinner: data.third_place_winner ?? null,
          finalWinner: data.final_winner ?? null,
          isPublished: !!data.is_published,
          shareSlug: data.share_slug ?? null,
        })
      },

      async save() {
        const user = useAuth.getState().user
        if (!supabase) return { error: 'Supabase not configured' }
        if (!user) return { error: 'Sign in to save your bracket' }
        const s = get()
        const { error } = await supabase
          .from('bracket_predictions')
          .upsert(
            {
              user_id: user.id,
              group_standings: s.groupStandings,
              third_place_advancing: s.thirdPlaceAdvancing,
              ko_winners: s.koWinners,
              third_place_winner: s.thirdPlaceWinner,
              final_winner: s.finalWinner,
            },
            { onConflict: 'user_id' }
          )
        if (error) return { error: error.message }
        return {}
      },

      async publish(slug) {
        const user = useAuth.getState().user
        if (!supabase) return { error: 'Supabase not configured' }
        if (!user) return { error: 'Sign in first' }
        const profile = useAuth.getState().profile
        const finalSlug = slug ?? profile?.alias ?? `fan-${user.id.slice(0, 6)}`
        // make sure latest state is saved first
        await get().save()
        const { error } = await supabase
          .from('bracket_predictions')
          .update({ is_published: true, share_slug: finalSlug })
          .eq('user_id', user.id)
        if (error) return { error: error.message }
        set({ isPublished: true, shareSlug: finalSlug })
        return { url: `${window.location.origin}/u/${finalSlug}` }
      },

      async unpublish() {
        const user = useAuth.getState().user
        if (!supabase || !user) return
        await supabase
          .from('bracket_predictions')
          .update({ is_published: false })
          .eq('user_id', user.id)
        set({ isPublished: false })
      },
    }),
    { name: 'wc2026-bracket' }
  )
)

// ----- Helpers --------------------------------------------------------------

// Map R32 match index → (groupRunnerA, groupRunnerB) following the FIFA WC26
// draw rules: 12 groups → top 2 + 8 best 3rd place → 32. Order below is the
// official slot layout from FIFA's bracket template.
// Slot 'A1' = winner of group A, 'A2' = runner-up of A, '3A' = third of A.
// Refer to the FIFA WC26 official bracket PDF for exact pairings.
export type Slot = `${GroupLetter}1` | `${GroupLetter}2` | `3${GroupLetter}` | string

// Round of 32 slot layout (simplified — official pairings).
// 16 matches. Each match has two slot references.
export const R32_LAYOUT: Array<[Slot, Slot]> = [
  ['A1', 'B2'],   // M1
  ['C1', 'F2'],   // M2
  ['D1', '3E/F/H/I'],
  ['B1', 'A2'],
  ['E1', 'I2'],
  ['F1', '3A/D/E/I'],
  ['G1', 'H2'],
  ['H1', 'G2'],
  ['I1', 'C2'],
  ['J1', 'D2'],
  ['K1', 'E2'],
  ['L1', '3F/I/J/L'],
  ['L2', '3A/B/F/L'],
  ['J2', '3A/B/E/J'],
  ['K2', '3B/D/G/K'],
  ['3C/E/G/H', '3B/D/G/L'],
]

export type KoStage = 'R32' | 'R16' | 'QF' | 'SF' | 'TP' | 'FINAL'

export function koMatchIds(stage: KoStage): string[] {
  const counts: Record<KoStage, number> = { R32: 16, R16: 8, QF: 4, SF: 2, TP: 1, FINAL: 1 }
  return Array.from({ length: counts[stage] }, (_, i) => `${stage}-${i + 1}`)
}
