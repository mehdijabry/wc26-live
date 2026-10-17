/**
 * LES NOTIFICATIONS — la couche d'accès.
 *
 * Schéma, policies et déclencheurs : supabase/migrations/030_notifications.sql.
 *
 * La base ne stocke JAMAIS la phrase affichée, seulement un type et ses
 * données. Le site se lit en trois langues : une phrase française écrite en
 * base serait illisible pour un lecteur arabe, et une traduction corrigée ne
 * rattraperait pas l'historique. La composition se fait donc au rendu, avec
 * le dictionnaire — voir `Notifications.tsx`.
 */
import { supabase } from './supabase'

export type Notif = {
  id: number
  kind:
    | 'ami_demande'
    | 'ami_acceptee'
    | 'nouvel_abonne'
    | 'post_abonne'
    | 'post_aime'
    | 'crampons_recus'
    | 'pari_pose'
    | 'pari_gagne'
    | 'pari_perdu'
    | 'pari_annule'
    | 'pari_copie'
    | 'club'
  donnees: Record<string, unknown>
  lien: string | null
  lu: boolean
  created_at: string
}

export async function mesNotifications(limite = 40): Promise<Notif[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('mes_notifications', { p_limite: limite })
  if (error || !data) return []
  return (data as Notif[]).map((n) => ({ ...n, donnees: (n.donnees ?? {}) as Record<string, unknown> }))
}

/**
 * Le compteur seul, pour la pastille. Une lecture d'entier, pas la liste
 * entière : la pastille est sondée régulièrement et sur tout le site.
 *
 * Rend `null` quand la lecture échoue — et NON zéro. Zéro veut dire « rien
 * de nouveau » ; un réseau coupé ne doit pas éteindre la pastille d'une
 * demande d'ami qui attend (voir feedback-donnee-absente-vs-echec).
 */
export async function nonLues(): Promise<number | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('notifs_non_lues')
  if (error) return null
  return Number(data ?? 0)
}

export async function marquerLues(): Promise<void> {
  if (!supabase) return
  await supabase.rpc('marquer_notifs_lues')
}

export async function effacerNotif(id: number): Promise<void> {
  if (!supabase) return
  await supabase.from('notifications').delete().eq('id', id)
}

/** Répondre à une demande d'ami depuis le panneau, sans changer de page. */
export async function repondreAmi(demandeur: string, accepter: boolean): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.rpc('repondre_ami', { p_demandeur: demandeur, p_accepter: accepter })
  return !error
}

/** Les clubs suivis du joueur connecté. */
export async function clubsSuivis(): Promise<string[]> {
  if (!supabase) return []
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) return []
  const { data: p } = await supabase.from('profiles').select('clubs_suivis').eq('id', id).maybeSingle()
  const l = (p as { clubs_suivis?: string[] } | null)?.clubs_suivis
  return Array.isArray(l) ? l : []
}

export async function enregistrerClubsSuivis(clubs: string[]): Promise<string[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('suivre_clubs', { p_clubs: clubs })
  if (error) return null
  return (data as string[]) ?? []
}
