import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DELAI_SUPABASE, fetchBorne } from './reseau'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * LE CLIENT PASSE PAR UN `fetch` BORNÉ — et c'est le point important.
 *
 * Mehdi, 18/10/2026 : « il faut absolument actualiser pour que ça charge ».
 * Une requête Supabase partie au réveil de l'appareil peut rester en l'air
 * sans jamais aboutir ni échouer, et le composant qui l'attend reste sur
 * son squelette pour toujours — `ResumesALaUne` en tête. Douze secondes :
 * une instance froide répond en cinq à quinze sur cellulaire, et au-delà
 * il vaut mieux une erreur franche qu'une attente sans fin.
 *
 * ON NE RETENTE RIEN ICI. Le client sert aussi les écritures — un pari
 * posé, des crampons débités — et rejouer une écriture dont on n'a pas vu
 * la réponse, c'est risquer de la passer deux fois. La reprise appartient
 * aux appelants qui SAVENT qu'ils lisent.
 */
export const supabase: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          fetch: (entree, init) => fetchBorne(entree as RequestInfo | URL, init as RequestInit, DELAI_SUPABASE),
        },
      })
    : null

export const SUPABASE_CONFIGURED = supabase !== null

/**
 * ⚠️ `withTimeout` NE SUFFIT PAS, ET N'A JAMAIS SUFFI. Il faut PENSER à
 * l'appeler, donc chaque appel écrit depuis l'a oublié et le blocage est
 * revenu par la porte d'à côté (18/10/2026). La vraie borne est désormais
 * dans le `fetch` du client, ci-dessus : on ne peut plus l'oublier. Celle-ci
 * reste utile pour borner autre chose qu'une requête — une promesse d'auth
 * qui dépend d'un verrou local, par exemple.
 *
 * Race a Supabase (or any other) promise against a timeout. Returns the
 * fallback if the timeout fires first — never throws. Without this guard,
 * a slow Supabase cold-start (5-15s on mobile cellular) keeps NewsTicker
 * stuck on a loader and freezes auth.getSession() forever, both of which
 * happen in production on Chrome Android. Use this whenever a Supabase
 * call gates UI rendering.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(fallback) },
    )
  })
}

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
  /** Les points de classement : mise × 10 × min(cote, 5) sur un pari
   *  gagné, cumulés et jamais reperdus. Migration 012. */
  ranking_points: number
  /** Le portefeuille du jeu — voir src/lib/jeu.ts et la migration 004. */
  crampons: number
  pressings: number
  /** Analyses IA offertes qui restent à consommer — lien de bienvenue ou
   *  don de l'administration. Migration 019. */
  analyses_offertes: number
  last_claim: string | null
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
