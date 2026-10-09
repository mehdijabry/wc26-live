import { supabase } from './supabase'

/**
 * Le jeu : deux monnaies, des cotes réelles, une récompense au bout.
 *
 * Schéma et garde-fous : supabase/migrations/004_paris.sql.
 *
 * TOUT CE QUI SE NOMME EST ICI. Le jour où « crampons » ou « pressings »
 * doivent changer, c'est ce fichier et lui seul — rien n'est écrit en dur
 * dans les pages.
 */

/** Ce qu'on mise. Offerts chaque jour, perdus si on ne les réclame pas. */
export const JETON = { un: 'crampon', plusieurs: 'crampons' } as const
/** Ce qu'on gagne. C'est le score, et c'est lui qui se convertit. */
export const POINT = { un: 'pressing', plusieurs: 'pressings' } as const

export const JETONS_PAR_JOUR = 5
/**
 * Le plancher d'une mise. À 3, un joueur qui reçoit 5 crampons par jour ne
 * pouvait placer qu'UN pari : les 2 crampons restants étaient inutilisables
 * et perdus le lendemain. À 1, toute la dotation est jouable — cinq petits
 * paris ou un gros, c'est lui qui arbitre.
 *
 * Le même plancher est posé en base (contrainte `bets_stake_check`,
 * migration 005) : les deux doivent bouger ensemble.
 */
export const MISE_MINIMUM = 1

/**
 * Le palier de récompense. Volontairement une constante unique et affichée
 * partout : un joueur doit pouvoir mesurer où il en est, sinon le score ne
 * veut rien dire.
 *
 * ATTENTION — tant qu'un juriste n'a pas validé le versement, ce seuil reste
 * un objectif affiché, pas une promesse contractuelle. De l'argent qui SORT
 * sur des mises à cotes réelles, même sans argent qui entre, c'est la zone
 * où il faut un règlement écrit (voir ce que fait Gamby : 13 articles,
 * exclusion de quatre États américains, vérification d'identité obligatoire).
 *
 * POURQUOI 7 500 ET PLUS 50 000. Le premier seuil avait été posé au doigt
 * mouillé, et il était hors d'atteinte : à cinq crampons par jour et des
 * cotes autour de 2, il demandait des mois de jeu quotidien sans faute —
 * autrement dit une barre que personne n'atteint jamais, ce qui revient à
 * ne rien promettre du tout. 7 500 se gagne, mais se mérite : il faut
 * jouer régulièrement et viser juste. Un objectif qu'on voit approcher
 * tient le joueur ; un objectif inaccessible le fait partir.
 */
export const PALIER = { points: 7_500, recompense: '5 $' } as const

export function nombreDe(
  n: number,
  mot: { un: string; plusieurs: string },
  /** Passer localeOf(lang) : sans ça, un nombre anglais s'écrit à la française. */
  locale?: string,
): string {
  return `${n.toLocaleString(locale)} ${n === 1 ? mot.un : mot.plusieurs}`
}

export type Portefeuille = {
  crampons: number
  pressings: number
  last_claim: string | null
}

export type Cote = {
  match_id: string
  home: number
  draw: number
  away: number
  kickoff: string | null
}

export type Choix = 'home' | 'draw' | 'away'

/** Les marchés ouverts. */
export type Marche = '1x2' | 'exact' | 'scorer'

/**
 * Un joueur pariable sur un match, avec sa cote.
 *
 * Elle est calculée par le worker à partir de trois choses : l'espérance de
 * buts de son équipe (dérivée des cotes 1X2), son poste, et son rendement
 * réel. Voir `cotesButeurs` dans worker/src/index.ts.
 */
export type Buteur = {
  id: string
  nom: string
  /** F, M, D — ESPN n'en distingue pas davantage. */
  poste: string
  equipe: 'dom' | 'ext'
  cote: number
}

/** Au plus dix sélections par bulletin — au-delà, plus personne ne suit. */
export const JAMBES_MAX = 10
/** Plafond de la cote d'un bulletin, posé aussi en base (migration 006). */
export const COTE_MAX = 10_000

/** Une sélection en cours de composition, côté écran. */
export type Selection = {
  matchId: string
  marche: Marche
  /** 'home' | 'draw' | 'away', ou '2-1' pour un score exact. */
  pick: string
  cote: number
  /** « Lyon — Lens », pour l'afficher dans le bulletin. */
  titre: string
  /** « Domicile », « Nul », « 2-1 » : le choix, en clair. */
  libelle: string
}

/** Une sélection déjà jouée, telle qu'elle revient de la base. */
export type Jambe = {
  match_id: string
  market: Marche
  pick: string
  odds: number
  status: 'open' | 'won' | 'lost' | 'void'
}

/** Un bulletin posé. */
export type Bulletin = {
  id: number
  stake: number
  odds: number
  status: 'open' | 'won' | 'lost' | 'void'
  payout: number | null
  created_at: string
  legs: Jambe[]
}

/**
 * La cote d'un bulletin : le produit de ses cotes. C'est tout l'intérêt du
 * combiné — trois matchs à 2,00 ne paient pas 2,00 mais 8,00 — et c'est
 * aussi tout son risque, puisqu'une seule erreur fait tout tomber.
 *
 * Cette fonction n'est qu'un AFFICHAGE. La cote qui compte est recalculée
 * par place_slip() en base ; si les deux divergent, c'est la base qui a
 * raison, et c'est voulu.
 */
export function coteCombinee(sel: Selection[]): number {
  if (!sel.length) return 0
  const p = sel.reduce((t, s) => t * s.cote, 1)
  return Math.min(p, COTE_MAX)
}

export async function portefeuille(utilisateur: string): Promise<Portefeuille | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('profiles')
    .select('crampons, pressings, last_claim')
    .eq('id', utilisateur)
    .maybeSingle()
  return (data as Portefeuille) ?? null
}

/**
 * Réclame les jetons du jour. Côté base, c'est une fois par jour et pas plus ;
 * les jours sautés ne se rattrapent pas.
 */
export async function reclamerDuJour(): Promise<{ solde: number; dejaReclame: boolean } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('claim_daily')
  if (error || !data) return null
  const l = Array.isArray(data) ? data[0] : data
  return { solde: l.solde as number, dejaReclame: l.deja_reclame as boolean }
}

/** Vrai quand les jetons du jour n'ont pas encore été pris. */
export function reclamableAujourdhui(p: Portefeuille | null): boolean {
  if (!p) return false
  if (!p.last_claim) return true
  const aujourdhui = new Date()
  const j = `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, '0')}-${String(aujourdhui.getDate()).padStart(2, '0')}`
  return p.last_claim < j
}

/** Les cotes publiées par le worker pour les matchs à venir. */
export async function cotes(): Promise<Map<string, Cote>> {
  if (!supabase) return new Map()
  const { data, error } = await supabase
    .from('match_odds')
    .select('match_id, home, draw, away, kickoff')
    .order('kickoff', { ascending: true })
  // On REMONTE l'erreur au lieu de rendre une carte vide. La page n'affiche
  // que les matchs présents dans cette carte : une requête ratée silencieuse
  // donnait « aucun match ce jour-là », c'est-à-dire un mensonge, et la page
  // restait vide pour toujours puisque rien ne la relançait.
  if (error) throw new Error(error.message)
  const m = new Map<string, Cote>()
  for (const c of (data as Cote[]) ?? []) m.set(c.match_id, c)
  return m
}

/**
 * La grille des scores exacts d'UN match, à la demande.
 *
 * Elle voyageait avec les cotes 1X2 de tous les matchs, et faisait passer ce
 * chargement — dont dépend l'affichage même des cartes — de 47 Ko à 223 Ko.
 * Sur un réseau lent, la page restait vide le temps que ça descende. Une
 * grille que presque personne n'ouvre n'a pas à retarder la liste que tout
 * le monde regarde : même traitement que les buteurs.
 */
export async function grilleDuMatch(matchId: string): Promise<Record<string, number>> {
  if (!supabase) return {}
  const { data } = await supabase
    .from('match_odds')
    .select('exact')
    .eq('match_id', matchId)
    .maybeSingle()
  return ((data as { exact?: Record<string, number> | null } | null)?.exact ?? {})
}

/**
 * Les buteurs pariables d'un match, du plus probable au plus improbable.
 *
 * Chargé À LA DEMANDE, match par match : la page des pronostics affiche
 * jusqu'à cent quatre-vingts rencontres, et vingt-huit joueurs par match
 * feraient passer son chargement de quelques centaines de kilo-octets à
 * plusieurs méga-octets pour une liste que presque personne n'ouvrira.
 *
 * Une liste vide est une réponse normale : le marché n'existe que sur les
 * compétitions dont ESPN publie vraiment les buteurs.
 */
export async function buteursDuMatch(matchId: string): Promise<Buteur[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('match_scorers')
    .select('players')
    .eq('match_id', matchId)
    .maybeSingle()
  return ((data as { players?: Buteur[] } | null)?.players ?? [])
}

/**
 * Les bulletins du joueur, les plus récents d'abord, avec leurs sélections.
 *
 * Une seule requête : PostgREST imbrique bet_legs grâce à la clé étrangère.
 * Les politiques de lecture font le filtrage — on ne demande donc même pas
 * « les miens », on ne peut de toute façon voir que les siens.
 */
export async function mesBulletins(): Promise<Bulletin[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('bet_slips')
    .select('id, stake, odds, status, payout, created_at, legs:bet_legs(match_id, market, pick, odds, status)')
    .order('created_at', { ascending: false })
    .limit(50)
  return (data as Bulletin[]) ?? []
}

/**
 * Les matchs déjà joués, pour les signaler sur les cartes.
 * Un même match peut apparaître dans plusieurs bulletins (un simple et un
 * combiné) : on garde la liste, pas seulement la dernière.
 */
export function jambesParMatch(bulletins: Bulletin[]): Map<string, Jambe[]> {
  const m = new Map<string, Jambe[]>()
  for (const b of bulletins) {
    for (const j of b.legs ?? []) {
      const l = m.get(j.match_id) ?? []
      l.push(j)
      m.set(j.match_id, l)
    }
  }
  return m
}

/**
 * Pose un bulletin.
 *
 * LE POINT DE SÉCURITÉ, INCHANGÉ ET RENFORCÉ : on n'envoie ni cote ni
 * identité. Seulement, pour chaque sélection, sur quel match et quel choix —
 * plus la mise. `place_slip()` lit auth.uid() elle-même, va chercher chaque
 * cote en base, vérifie chaque coup d'envoi, calcule le produit et débite,
 * dans une seule transaction. Un refus ne laisse jamais de débit orphelin.
 */
export async function poserBulletin(
  sel: Selection[],
  mise: number,
): Promise<{ ok: true; id: number } | { ok: false; raison: string }> {
  if (!supabase) return { ok: false, raison: 'Hors ligne' }
  if (!sel.length) return { ok: false, raison: 'Aucune sélection' }
  if (sel.length > JAMBES_MAX) return { ok: false, raison: `${JAMBES_MAX} sélections au maximum` }
  if (mise < MISE_MINIMUM) return { ok: false, raison: `Mise minimum : ${MISE_MINIMUM}` }

  const { data, error } = await supabase.rpc('place_slip', {
    p_legs: sel.map((s) => ({ match_id: s.matchId, market: s.marche, pick: s.pick })),
    p_stake: mise,
  })

  if (!error) return { ok: true, id: Number(data) }

  // Les messages viennent des `raise exception` de place_slip().
  const m = error.message || ''
  if (m.includes('Crampons insuffisants')) return { ok: false, raison: 'Pas assez de crampons' }
  if (m.includes('Le match a commencé')) return { ok: false, raison: 'Un match a déjà commencé' }
  if (m.includes('Aucune cote')) return { ok: false, raison: 'Un match n’est plus pariable' }
  if (m.includes('Un seul pari par match')) return { ok: false, raison: 'Un seul pari par match dans un bulletin' }
  if (m.includes('Connexion requise')) return { ok: false, raison: 'Connexion requise' }
  if (m.includes('sélections par bulletin')) return { ok: false, raison: `De 1 à ${JAMBES_MAX} sélections` }
  return { ok: false, raison: 'Bulletin refusé' }
}
