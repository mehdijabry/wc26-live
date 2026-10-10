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

/**
 * CRÉER ET REJOINDRE PASSENT PAR LA BASE.
 *
 * Un joueur peut appartenir à plusieurs groupes — ce qui est limité, c'est
 * la RÉCLAMATION du bonus : une seule par jour, et c'est lui qui choisit
 * laquelle (Mehdi, 2026-10-10). Créer un groupe reste deux écritures, la
 * ligue puis l'adhésion de son auteur, et elles doivent être atomiques :
 * une ligue sans son créateur dedans n'apparaîtrait dans aucun classement,
 * pas même le sien.
 *
 * `quitte` reste dans le type pour ne pas faire changer de forme aux
 * appelants, mais vaut toujours NULL : on ne quitte plus rien en entrant.
 */
export type Arrivee = { groupe: string; slug: string; nom: string; quitte: string | null }

export async function creerLigue(nom: string): Promise<Arrivee | null> {
  if (!supabase) return null
  // Le slug est tiré ICI, pas en base : c'est lui qui sert de lien
  // d'invitation, et la page a besoin de le connaître pour y naviguer.
  const slug = nouveauSlug()
  const { data, error } = await supabase.rpc('creer_groupe', {
    p_slug: slug,
    p_nom: nom.trim().slice(0, 60),
  })
  if (error || !data) return null
  const l = Array.isArray(data) ? data[0] : data
  return { groupe: l.groupe as string, slug, nom: l.nom as string, quitte: (l.quitte as string) ?? null }
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

export async function rejoindre(slug: string): Promise<Arrivee | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('rejoindre_groupe', { p_slug: slug })
  if (error || !data) return null
  const l = Array.isArray(data) ? data[0] : data
  return { groupe: l.groupe as string, slug, nom: l.nom as string, quitte: (l.quitte as string) ?? null }
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
