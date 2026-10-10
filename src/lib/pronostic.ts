import { supabase } from './supabase'
import { API_BASE } from './api'

/**
 * Le pronostic d'un match : ce qu'on en sait, ce qu'il coûte, et comment on
 * l'ouvre.
 *
 * TROIS RÈGLES, et elles tiennent tout le reste.
 *
 * 1. ON NE PROPOSE QUE CE QU'ON PEUT SERVIR. Notre calendrier vient d'ESPN et
 *    couvre des championnats que notre fournisseur de pronostics n'a pas —
 *    D2 écossaise, Primera B argentine, Liga de Expansión. Mesuré le
 *    10 octobre 2026 : 305 matchs couverts sur 395 pariables. Pour les 90
 *    autres, le bouton n'apparaît pas du tout. Faire payer un déblocage qui
 *    n'aurait rien à montrer serait voler le joueur (Mehdi, 2026-10-10).
 *
 * 2. LE PRIX EST CALCULÉ EN BASE, PAS ICI. `prix_pronostic()` est la seule
 *    source de vérité ; cette page ne fait que l'afficher. Même raison que
 *    pour les cotes : ce que le client annonce ne doit jamais être ce qui
 *    est débité.
 *
 * 3. UN MATCH DÉBLOQUÉ RESTE OUVERT. Pour toujours, gratuitement, et il ne
 *    consomme qu'une marche de l'échelle du jour. On paie le pronostic, pas
 *    la lecture.
 */

export type EquipeComposition = {
  team_id: number
  team_name: string
  formation: string
  confidence: number
  players: JoueurComposition[]
  substitutes: JoueurComposition[]
}

export type JoueurComposition = {
  id: number
  name: string
  short_name: string
  /** Générique : G, D, M ou F. Voir l'avertissement de `lignesDeLaFormation`. */
  position: string
  jersey_number: number | null
  ai_score: number | null
}

export type Absent = {
  id: number
  name: string
  short_name: string
  /** `injured`, `suspended`… */
  status: string
  reason: string | null
}

export type Carte = {
  match: string
  source: number | null
  leurs: {
    probabilites: { dom: number; nul: number; ext: number } | null
    xg: { dom: number; ext: number } | null
    plusDe: { un5: number; deux5: number; trois5: number } | null
    lesDeuxMarquent: number | null
    scoreProbable: string | null
    corners: { huit5: number; neuf5: number; dix5: number } | null
    confiance: number | null
    modele: string | null
    incoherent: boolean
  } | null
  composition: { home: EquipeComposition; away: EquipeComposition } | null
  absents: { home: Absent[]; away: Absent[] } | null
  statutComposition: 'confirmed' | 'predicted' | 'unavailable' | string
}

/**
 * Les matchs pour lesquels un pronostic existe.
 *
 * Public et sans jeton : le site a besoin de cette liste AVANT toute
 * connexion, pour ne pas afficher un bouton qu'il ne pourrait pas honorer.
 * Une erreur rend un ensemble VIDE, et c'est volontaire — mieux vaut ne
 * proposer aucun pronostic que d'en proposer un qui échouera après paiement.
 */
export async function pronosticsDisponibles(): Promise<Set<string>> {
  try {
    const r = await fetch(`${API_BASE}/jeu/pronostics-dispo`)
    if (!r.ok) return new Set()
    const d = (await r.json()) as { matchs?: string[] }
    return new Set(d.matchs ?? [])
  } catch {
    return new Set()
  }
}

/** Les matchs que ce joueur a déjà ouverts : ils ne se repaient jamais. */
export async function mesPronostics(): Promise<Set<string>> {
  if (!supabase) return new Set()
  const { data, error } = await supabase.from('prediction_unlocks').select('match_id')
  if (error) throw new Error(error.message)
  return new Set(((data as Array<{ match_id: string }>) ?? []).map((x) => x.match_id))
}

export type Prix = { crampons: number; pressings: number; rang: number }

/**
 * Ce que coûtera le PROCHAIN déblocage du jour.
 *
 * Le rang se compte sur les déblocages d'aujourd'hui, et la grille vient de
 * `prix_pronostic()`. Deux appels plutôt qu'un calcul local : si la grille
 * change en base, l'affichage suit sans redéploiement du site.
 */
export async function prixDuProchain(): Promise<Prix | null> {
  if (!supabase) return null
  const aujourdhui = new Date()
  const j = `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, '0')}-${String(aujourdhui.getDate()).padStart(2, '0')}`
  const { count, error } = await supabase
    .from('prediction_unlocks')
    .select('id', { count: 'exact', head: true })
    .eq('jour', j)
  if (error) throw new Error(error.message)
  const n = count ?? 0
  const { data, error: e2 } = await supabase.rpc('prix_pronostic', { n })
  if (e2) throw new Error(e2.message)
  const l = Array.isArray(data) ? data[0] : data
  return {
    crampons: Number((l as { crampons?: number })?.crampons ?? 0),
    pressings: Number((l as { pressings?: number })?.pressings ?? 0),
    rang: n + 1,
  }
}

/** Ouvre un pronostic. La base débite, vérifie le solde et reste idempotente. */
export async function debloquer(
  match: string,
  monnaie: 'crampons' | 'pressings',
): Promise<{ deja: boolean; crampons: number; pressings: number; rang: number }> {
  if (!supabase) throw new Error('hors ligne')
  const { data, error } = await supabase.rpc('debloquer_pronostic', {
    p_match: match,
    p_monnaie: monnaie,
  })
  if (error) throw new Error(error.message)
  const l = Array.isArray(data) ? data[0] : data
  return {
    deja: Boolean((l as { deja?: boolean })?.deja),
    crampons: Number((l as { crampons?: number })?.crampons ?? 0),
    pressings: Number((l as { pressings?: number })?.pressings ?? 0),
    rang: Number((l as { rang?: number })?.rang ?? 0),
  }
}

/**
 * La carte elle-même. Le worker revérifie le jeton ET le déblocage : sans
 * cette double vérification côté serveur, appeler l'adresse à la main
 * suffirait à contourner le prix.
 */
export async function carte(match: string): Promise<Carte> {
  if (!supabase) throw new Error('hors ligne')
  const { data } = await supabase.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton) throw new Error('connexion requise')

  const r = await fetch(`${API_BASE}/jeu/pronostic?match=${encodeURIComponent(match)}`, {
    headers: { authorization: `Bearer ${jeton}` },
  })
  if (r.status === 402) throw new Error('non débloqué')
  if (!r.ok) throw new Error(`pronostic indisponible (${r.status})`)
  return (await r.json()) as Carte
}

/**
 * Les lignes d'une formation, de la défense à l'attaque.
 *
 * POURQUOI PAS LE POSTE DU JOUEUR. Les postes fournis sont génériques —
 * G, D, M, F — et ils ne concordent pas toujours avec la formation annoncée :
 * mesuré sur Arsenal le 10 octobre 2026, onze joueurs en 4-2-3-1 dont CINQ
 * marqués « D ». Placer d'après la lettre dessinerait une défense à cinq là
 * où le fournisseur annonce une défense à quatre. On place donc d'après la
 * FORMATION, dans l'ordre où les joueurs sont donnés — la convention de tous
 * les tableaux de composition.
 */
export function lignesDeLaFormation(formation: string, joueurs: JoueurComposition[]): JoueurComposition[][] {
  const tailles = formation
    .split(/[^0-9]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0)

  const gardien = joueurs[0]
  const champ = joueurs.slice(1)
  // Une formation qui ne totalise pas dix joueurs de champ est inutilisable :
  // on retombe sur une seule ligne plutôt que d'en perdre en route.
  const total = tailles.reduce((a, b) => a + b, 0)
  if (!tailles.length || total !== champ.length) {
    return gardien ? [[gardien], champ] : [champ]
  }

  const lignes: JoueurComposition[][] = gardien ? [[gardien]] : []
  let i = 0
  for (const t of tailles) {
    lignes.push(champ.slice(i, i + t))
    i += t
  }
  return lignes
}

/**
 * Le motif d'une absence, dit dans la langue du site.
 *
 * Le fournisseur écrit en anglais et en forme libre : « Hamstring Injury »,
 * « Cruciate Ligament Injury », « Knee Injury ». Les traduire une par une
 * serait sans fin ; on reconnaît donc la PARTIE DU CORPS, qui est un
 * vocabulaire fermé, et on compose « Blessure : ischio-jambiers ».
 *
 * Le deux-points évite tout accord. Sa PONCTUATION, elle, appartient à
 * chaque langue : le français met une espace devant, l'arabe et l'anglais
 * non. C'est donc le gabarit traduit qui la porte, pas le code.
 *
 * Un motif non reconnu est rendu TEL QUEL plutôt que masqué. Mieux vaut un
 * mot anglais qu'une absence sans raison — le joueur doit savoir pourquoi un
 * titulaire manque.
 */
const PARTIES = [
  'hamstring', 'cruciate ligament', 'knee', 'ankle', 'calf', 'thigh', 'groin', 'back',
  'shoulder', 'foot', 'hip', 'head', 'achilles', 'muscle', 'illness', 'fitness',
] as const

export function motifLisible(a: Absent, t: (s: string) => string): string {
  const brut = (a.reason ?? '').toLowerCase()
  if (/suspend|red card|yellow card/.test(a.status + ' ' + brut)) return t('suspended')
  // Les expressions les plus longues d'abord : « cruciate ligament » avant
  // « ligament », sinon on perdrait la précision.
  const partie = [...PARTIES].sort((x, y) => y.length - x.length).find((p) => brut.includes(p))
  if (partie) return t('{motif}: {partie}').replace('{motif}', t('injury')).replace('{partie}', t(partie))
  if (a.reason) return a.reason
  return a.status === 'injured' ? t('injured') : a.status
}
