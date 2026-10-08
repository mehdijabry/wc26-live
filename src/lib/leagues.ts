import { supabase } from './supabase'

/**
 * Ligues privées — la couche d'accès.
 *
 * Schéma et politiques : supabase/migrations/003_leagues.sql.
 *
 * Le classement d'une ligue ne reprend pas le total de points du compte mais
 * les points gagnés DEPUIS l'adhésion de chacun, pour qu'une ligue créée
 * aujourd'hui reste jouable face à quelqu'un qui pronostique depuis un an.
 * C'est la fonction `league_table()` en base qui s'en charge.
 */

export type Ligue = {
  id: string
  slug: string
  name: string
  owner_id: string
  created_at: string
}

export type LigneDeLigue = {
  user_id: string
  alias: string
  avatar_url: string | null
  country: string | null
  points: number
  resolved: number
  joined_at: string
}

/**
 * Le slug est le lien d'invitation, donc le seul rempart : il doit être
 * imprévisible. 10 caractères dans un alphabet de 32 sans voyelles ni
 * caractères ambigus (ni 0/O, ni 1/l) — de quoi rester lisible à l'oral tout
 * en restant impossible à deviner.
 */
export function nouveauSlug(): string {
  const alphabet = '23456789bcdfghjkmnpqrstvwxyz'
  const tirage = new Uint32Array(10)
  crypto.getRandomValues(tirage)
  return Array.from(tirage, (n) => alphabet[n % alphabet.length]).join('')
}

export async function creerLigue(nom: string, proprietaire: string): Promise<Ligue | null> {
  if (!supabase) return null
  const slug = nouveauSlug()
  const { data, error } = await supabase
    .from('leagues')
    .insert({ slug, name: nom.trim().slice(0, 60), owner_id: proprietaire })
    .select()
    .single()
  if (error || !data) return null
  // Le créateur est membre de sa propre ligue, sinon il n'apparaît pas dans
  // son classement.
  await supabase.from('league_members').insert({ league_id: data.id, user_id: proprietaire })
  return data as Ligue
}

export async function ligueParSlug(slug: string): Promise<Ligue | null> {
  if (!supabase) return null
  const { data } = await supabase.from('leagues').select('*').eq('slug', slug).maybeSingle()
  return (data as Ligue) ?? null
}

export async function mesLigues(utilisateur: string): Promise<Ligue[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('league_members')
    .select('leagues(*)')
    .eq('user_id', utilisateur)
  if (!data) return []
  // Supabase renvoie la relation imbriquée ; on l'aplatit.
  return data
    .map((r) => (r as unknown as { leagues: Ligue | null }).leagues)
    .filter((l): l is Ligue => !!l)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export async function rejoindre(idLigue: string, utilisateur: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('league_members')
    .insert({ league_id: idLigue, user_id: utilisateur })
  // 23505 = déjà membre. Ce n'est pas une erreur du point de vue de l'appelant.
  return !error || error.code === '23505'
}

export async function quitter(idLigue: string, utilisateur: string): Promise<void> {
  if (!supabase) return
  await supabase.from('league_members').delete().eq('league_id', idLigue).eq('user_id', utilisateur)
}

export async function classementDeLigue(slug: string): Promise<LigneDeLigue[]> {
  if (!supabase) return []
  const { data } = await supabase.rpc('league_table', { p_slug: slug })
  return (data as LigneDeLigue[]) ?? []
}

/** L'adresse à partager. Volontairement courte : elle se recopie à la main. */
export function lienDInvitation(slug: string): string {
  return `${location.origin}/l/${slug}`
}
