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
export const MISE_MINIMUM = 3

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
 */
export const PALIER = { points: 50_000, recompense: '5 $' } as const

export function nombreDe(n: number, mot: { un: string; plusieurs: string }): string {
  return `${n.toLocaleString('fr-FR')} ${n === 1 ? mot.un : mot.plusieurs}`
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

export type Pari = {
  id: number
  match_id: string
  pick: Choix
  stake: number
  odds: number
  status: 'open' | 'won' | 'lost' | 'void'
  payout: number | null
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
  const { data } = await supabase
    .from('match_odds')
    .select('match_id, home, draw, away, kickoff')
    .order('kickoff', { ascending: true })
  const m = new Map<string, Cote>()
  for (const c of (data as Cote[]) ?? []) m.set(c.match_id, c)
  return m
}

export async function mesParis(utilisateur: string): Promise<Map<string, Pari>> {
  if (!supabase) return new Map()
  const { data } = await supabase
    .from('bets')
    .select('id, match_id, pick, stake, odds, status, payout')
    .eq('user_id', utilisateur)
  const m = new Map<string, Pari>()
  for (const b of (data as Pari[]) ?? []) m.set(b.match_id, b)
  return m
}

/**
 * Pose un pari. On n'envoie PAS la cote : le déclencheur en base la lit dans
 * `match_odds` et écrase tout ce que le client prétendrait. Il vérifie aussi
 * le coup d'envoi et le solde, puis débite les jetons — le tout dans la même
 * transaction, donc un refus ne laisse jamais de débit orphelin.
 */
export async function parier(
  utilisateur: string,
  matchId: string,
  choix: Choix,
  mise: number,
): Promise<{ ok: true } | { ok: false; raison: string }> {
  if (!supabase) return { ok: false, raison: 'Hors ligne' }
  if (mise < MISE_MINIMUM) return { ok: false, raison: `Mise minimum : ${MISE_MINIMUM}` }

  const { error } = await supabase
    .from('bets')
    .insert({ user_id: utilisateur, match_id: matchId, pick: choix, stake: mise })

  if (!error) return { ok: true }

  // Les messages viennent des `raise exception` de place_bet_guard().
  const m = error.message || ''
  if (m.includes('Crampons insuffisants')) return { ok: false, raison: 'Pas assez de crampons' }
  if (m.includes('Le match a commencé')) return { ok: false, raison: 'Le match a commencé' }
  if (m.includes('Aucune cote')) return { ok: false, raison: 'Match non pariable' }
  if (error.code === '23505') return { ok: false, raison: 'Tu as déjà parié sur ce match' }
  return { ok: false, raison: 'Pari refusé' }
}
