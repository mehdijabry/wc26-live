import { supabase } from './supabase'

/**
 * Les avatars 3D, et le choix du joueur.
 *
 * ── LA LISTE VIT EN BASE, PAS ICI ─────────────────────────────────────────
 * Le sélecteur doit l'afficher et la base doit valider le choix. Deux copies
 * finiraient par diverger, et ajouter un avatar deviendrait un déploiement.
 * Une ligne insérée dans `public.avatars` suffit (migration 022).
 *
 * ── LE CHOIX NE S'ÉCRIT PAS EN DIRECT ─────────────────────────────────────
 * `avatar_url` s'affiche sur la vignette d'un joueur dans le classement,
 * donc chez tout le monde. Laisser le navigateur y écrire une chaîne libre
 * laisserait n'importe qui faire charger l'image de son choix — ou un pixel
 * de traçage — par tous les visiteurs. La colonne n'est plus écrivable ; on
 * passe par `choisir_avatar()`, qui n'accepte qu'une clé connue et compose
 * l'adresse elle-même.
 */
export function urlAvatar(cle: string): string {
  return `/media/icones/profile/${cle}.png`
}

/** La clé derrière une adresse enregistrée, pour cocher la bonne vignette. */
export function cleDeLUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = /\/media\/icones\/profile\/([a-z0-9-]+)\.png$/.exec(url)
  return m ? m[1]! : null
}

export async function listeAvatars(): Promise<string[]> {
  if (!supabase) return []
  const { data } = await supabase.from('avatars').select('cle').order('ordre')
  return ((data as Array<{ cle: string }> | null) ?? []).map((a) => a.cle)
}

/** Renvoie la nouvelle adresse, ou null quand on revient à l'initiale. */
export async function choisirAvatar(cle: string | null): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('choisir_avatar', { p_cle: cle })
  if (error) throw new Error(error.message)
  return (data as string | null) ?? null
}
