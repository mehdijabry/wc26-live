/**
 * LES POSTS — publier un pari gagné sur son profil.
 *
 * Schéma, policies et déclencheurs : supabase/migrations/032_posts_paris_gagnes.sql.
 *
 * Ce que le client envoie à la publication se limite à l'AFFICHAGE des
 * matchs — leur libellé et leur score, qu'il est seul à connaître puisque
 * c'est lui qui interroge ESPN. La cote, la mise et le gain sont relus en
 * base : un post est une vitrine, et une vitrine où l'on écrirait son propre
 * gain ne vaudrait rien.
 */
import { supabase } from './supabase'
import { ficheDuMatch } from './ficheMatch'

export type JambePost = {
  match_id: string
  market: string
  pick: string
  cote: number
  titre: string
  score: string
  /** % des parieurs qui avaient fait le même choix. `null` sous 5 parieurs. */
  part: number | null
}

export type DonneesPost = {
  mise: number
  cote: number
  gain: number
  jambes: JambePost[]
  /** Probabilité implicite de la cote, en %. */
  chance: number | null
  gagnes7: number
  regle_le: string | null
}

export type Post = {
  id: number
  auteur: string
  alias: string
  avatar_url: string | null
  tier: string
  kind: string
  donnees: DonneesPost
  legende: string | null
  created_at: string
  jaimes: number
  jaime: boolean
}

export type Publiable = {
  slip_id: number
  cote: number
  mise: number
  gain: number
  regle_le: string | null
}

export async function parisPubliables(): Promise<Publiable[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('mes_paris_publiables')
  if (error || !data) return []
  return (data as Publiable[]).map((p) => ({ ...p, cote: Number(p.cote), mise: Number(p.mise), gain: Number(p.gain) }))
}

/**
 * Publie, après avoir résolu les libellés et les scores des matchs.
 *
 * La résolution se fait ICI et pas à l'affichage : un post doit rester
 * lisible dans six mois, quand l'API des scores aura oublié le match.
 */
export async function publierPari(
  slipId: number,
  legende: string,
  matchIds: string[],
): Promise<{ id: number } | { erreur: string; code?: string }> {
  if (!supabase) return { erreur: 'hors ligne' }
  const fiches = await Promise.all(
    [...new Set(matchIds)].map(async (id) => {
      const f = await ficheDuMatch(id)
      return { match_id: id, titre: f?.titre ?? '', score: f?.score ?? '' }
    }),
  )
  const { data, error } = await supabase.rpc('publier_pari', {
    p_slip_id: slipId,
    p_legende: legende || null,
    p_matchs: fiches,
  })
  if (error) return { erreur: error.message, code: (error as { code?: string }).code }
  return { id: Number(data) }
}

export async function postsDe(alias: string, limite = 20): Promise<Post[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('posts_profil', { p_alias: alias, p_limite: limite })
  if (error || !data) return []
  return data as Post[]
}

export async function aimerPost(id: number, aimer: boolean): Promise<number | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('aimer_post', { p_post: id, p_aimer: aimer })
  if (error) return null
  return Number(data ?? 0)
}

export async function supprimerPost(id: number): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('posts').delete().eq('id', id)
  return !error
}
