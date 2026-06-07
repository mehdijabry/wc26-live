import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

export const SUPABASE_CONFIGURED = supabase !== null

// Public types mirroring the SQL schema
export type Profile = {
  id: string
  alias: string
  country: string | null
  avatar_url: string | null
  total_points: number
  total_predictions: number
  resolved_predictions: number
  accuracy_pct: number
  current_streak: number
  best_streak: number
  tier: 'Rookie' | 'Amateur' | 'Pro' | 'Elite' | 'Legend'
}

export type PredictionRow = {
  id: number
  user_id: string
  match_id: string
  home_score: number
  away_score: number
  scorer_ids: string[] | null
  card_player_ids: string[] | null
  points: number | null
  points_breakdown: Record<string, number> | null
  created_at: string
}

export type LeaderboardRow = Profile
