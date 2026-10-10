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
  paris: number
  gagnes: number
  joined_at: string
}

/**
 * L'état de déblocage d'un groupe, tel que la barre l'affiche.
 *
 * `manquantsJour` et `manquantsSemaine` sont LE levier : le bonus en soi est
 * petit, ce qui fait bouger un groupe c'est de voir qui bloque et de lui
 * envoyer le message.
 */
export type EtatDuGroupe = {
  membres: number
  actifs: number
  ontParieJour: number
  tauxJour: number
  bonusJour: number
  ontCinqSemaine: number
  tauxSemaine: number
  recompenses: number
  manquantsJour: string[]
  manquantsSemaine: string[]
}

export async function etatDuGroupe(slug: string): Promise<EtatDuGroupe | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('groupe_etat', { p_slug: slug })
  if (error || !data) return null
  const e = Array.isArray(data) ? data[0] : data
  if (!e) return null
  return {
    membres: Number(e.membres ?? 0),
    actifs: Number(e.actifs ?? 0),
    ontParieJour: Number(e.ont_parie_jour ?? 0),
    tauxJour: Number(e.taux_jour ?? 0),
    bonusJour: Number(e.bonus_jour ?? 0),
    ontCinqSemaine: Number(e.ont_cinq_semaine ?? 0),
    tauxSemaine: Number(e.taux_semaine ?? 0),
    recompenses: Number(e.recompenses ?? 0),
    manquantsJour: (e.manquants_jour as string[]) ?? [],
    manquantsSemaine: (e.manquants_semaine as string[]) ?? [],
  }
}

export type Reclamation = { crampons: number; taux: number; groupe: string; deja: boolean }

/**
 * Réclame le bonus du jour pour UN groupe.
 *
 * La base refuse la seconde réclamation de la journée et renvoie alors le
 * groupe déjà pris : l'interface peut donc dire « tu as déjà réclamé chez
 * les Collègues » au lieu d'un refus muet.
 */
export async function reclamerBonus(slug: string): Promise<Reclamation | { erreur: string }> {
  if (!supabase) return { erreur: 'hors ligne' }
  const { data, error } = await supabase.rpc('reclamer_bonus_de_groupe', { p_slug: slug })
  if (error) return { erreur: error.message }
  const r = Array.isArray(data) ? data[0] : data
  if (!r) return { erreur: 'inconnu' }
  return {
    crampons: Number(r.crampons ?? 0),
    taux: Number(r.taux ?? 0),
    groupe: String(r.groupe ?? ''),
    deja: Boolean(r.deja),
  }
}

/**
 * Le bonus déjà réclamé aujourd'hui, s'il y en a un.
 *
 * Lu AVANT d'afficher le bouton : sans ça, l'interface proposerait de
 * réclamer dans chacun de ses groupes et le joueur découvrirait le refus
 * après avoir choisi. La politique RLS n'autorise que ses propres lignes.
 */
export async function bonusDuJour(): Promise<{ groupe: string; crampons: number } | null> {
  if (!supabase) return null
  const aujourdhui = new Date()
  const j = `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, '0')}-${String(aujourdhui.getDate()).padStart(2, '0')}`
  const { data } = await supabase
    .from('group_bonus_paid')
    .select('crampons, leagues(name)')
    .eq('jour', j)
    .maybeSingle()
  if (!data) return null
  const d = data as unknown as { crampons: number; leagues: { name: string } | null }
  return { groupe: d.leagues?.name ?? '', crampons: Number(d.crampons ?? 0) }
}

/**
 * Le podium du JOUR d'un groupe : trois lignes, pas plus.
 *
 * Le classement du groupe compte les points depuis l'adhésion de chacun —
 * c'est ce qui le rend jouable quand on arrive tard. Les médailles, elles,
 * sont quotidiennes. Les deux classements ne peuvent donc pas être le même,
 * et déduire l'un de l'autre ici serait faux.
 */
export async function podiumDuJour(slug: string): Promise<Map<string, number>> {
  const m = new Map<string, number>()
  if (!supabase) return m
  const { data } = await supabase.rpc('podium_du_jour', { p_slug: slug })
  for (const r of (data as Array<{ user_id: string; rang: number }>) ?? []) {
    m.set(r.user_id, Number(r.rang))
  }
  return m
}

/** Combien d'ors, d'argents, de bronzes et de GOAT, tous groupes confondus. */
export type Distinctions = { or: number; argent: number; bronze: number; goat: number }

export async function mesDistinctions(utilisateur: string): Promise<Distinctions> {
  const vide = { or: 0, argent: 0, bronze: 0, goat: 0 }
  if (!supabase) return vide
  const { data, error } = await supabase.rpc('distinctions', { p_user: utilisateur })
  if (error || !data) return vide
  const d = Array.isArray(data) ? data[0] : data
  if (!d) return vide
  return {
    or: Number(d.orees ?? 0),
    argent: Number(d.argents ?? 0),
    bronze: Number(d.bronzes ?? 0),
    goat: Number(d.goats ?? 0),
  }
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
