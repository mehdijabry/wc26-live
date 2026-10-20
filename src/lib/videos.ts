/**
 * LES VIDÉOS DE MATCH — buts et résumés.
 *
 * Table et fonctions : supabase/migrations/034_videos_de_match.sql.
 *
 * On ne stocke jamais une vidéo, seulement son identifiant : elle reste
 * chez l'ayant droit et c'est son lecteur qui la joue. C'est ce qui rend
 * l'opération légitime, et c'est aussi pour ça qu'on n'en reverse jamais
 * une sur la page Facebook.
 */
import { supabase } from './supabase'

export type VideoMatch = {
  video_id: string
  source: string
  kind: 'but' | 'resume' | 'resume_long' | 'resume_court' | string
  titre: string
  description: string | null
  publie_at: string
  match_id: string | null
  competition: string | null
  equipe_dom: string | null
  equipe_ext: string | null
  score_dom: number | null
  score_ext: number | null
  buteur: string | null
  minute: string | null
  /** Rangée en base quand elle ne se déduit pas de l'identifiant (X). */
  vignette?: string | null
  /** Durée en secondes. null pour une vidéo X, que YouTube ne mesure pas. */
  duree_s?: number | null
}

/**
 * LA DURÉE, TELLE QU'ON LA LIT SUR UNE VIGNETTE : « 2:14 », « 1:09:48 ».
 *
 * Mehdi, 18/10/2026 : « distingue-les grâce à la durée ». Un match a
 * souvent deux vidéos — le résumé court et l'extended — et deux cartes
 * portant les mêmes équipes se lisent comme un doublon. La durée est la
 * seule chose qui les sépare pour de bon, et elle se lit sans traduction.
 *
 * Les chiffres restent latins partout, y compris en arabe (règle du
 * 13/10) : c'est une durée de lecteur vidéo, pas un nombre de phrase.
 */
export function dureeLisible(s: number | null | undefined): string | null {
  const n = Math.round(Number(s ?? 0))
  if (!Number.isFinite(n) || n <= 0) return null
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), sec = n % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/**
 * COURT OU LONG ? Le `kind` décide, pas la durée.
 *
 * La durée AFFICHE la différence, elle ne la détermine pas : un extended
 * de Bundesliga peut être plus court qu'un résumé de Ligue des champions,
 * et classer sur un seuil ferait sauter des vidéos d'une section à l'autre
 * d'un jour sur l'autre. Le diffuseur, lui, titre « EXTENDED HIGHLIGHTS »
 * — c'est lui qui sait, et c'est ce que `classer()` a déjà lu côté worker.
 */
export const estLong = (v: VideoMatch): boolean => v.kind === 'resume_long'

/**
 * UNE SEULE VERSION PAR MATCH.
 *
 * Mehdi, 20/10/2026 : « il y a des doublons dans highlights, leurs durées
 * ne sont pas pareilles — la durée doit être un filtre de classement, on
 * ne publie qu'une version peu importe laquelle, jamais deux versions du
 * même match ».
 *
 * D'où viennent les doublons, relevés sur trois jours :
 *   · la Serie A publie DEUX FOIS le même résumé, une version au titre
 *     italien et une au titre anglais — « Poker Lombardo Ferma il
 *     Cagliari » (182 s) et « Dominant Monza End Cagliari's Strong Run »
 *     (142 s). Même match, même jour, même `kind` ;
 *   · beIN publie « HIGHLIGHTS » puis « EXTENDED HIGHLIGHTS » — ceux-là se
 *     distinguaient déjà par le `kind`, mais restaient deux cartes ;
 *   · et il arrive qu'une même vidéo soit remise en ligne sous deux
 *     identifiants, sans équipes détectées : deux cartes « ? – ? » de
 *     durée rigoureusement identique.
 *
 * QUI GAGNE. Le `kind` d'abord — court, puis résumé, puis extended : c'est
 * l'ordre que la publication Facebook suit déjà, et le court est celui qui
 * porte le score dans son titre. À `kind` égal, LA PLUS LONGUE gagne : à
 * contenu identique, autant montrer la version la plus fournie. Inverser
 * tient en une ligne (`b.duree - a.duree`).
 *
 * CE QU'ON NE TOUCHE PAS : les buts. Un match en a plusieurs, les fondre
 * par rencontre n'en laisserait qu'un.
 */
const RANG_KIND: Record<string, number> = { resume_court: 0, resume: 1, resume_long: 2 }
const estResume = (v: VideoMatch): boolean => v.kind in RANG_KIND

const sansAccent = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

/**
 * LA CLÉ D'UNE RENCONTRE. Les deux équipes TRIÉES, pour qu'une remise en
 * ligne qui inverse domicile et extérieur ne crée pas un second match, et
 * la journée, pour que l'aller et le retour restent deux rencontres.
 *
 * Sans équipes, on retombe sur la durée EXACTE à la seconde près, dans la
 * même source et le même format : c'est ce qui sépare deux re-publications
 * d'une même vidéo de deux matchs différents. La durée seule ne suffirait
 * pas sur des résumés qui durent tous trois minutes — d'où la restriction
 * aux lignes dont les équipes manquent, qui sont rares.
 */
function cleRencontre(v: VideoMatch): string {
  const jour = v.publie_at.slice(0, 10)
  if (v.equipe_dom && v.equipe_ext) {
    return `${jour}|${[sansAccent(v.equipe_dom), sansAccent(v.equipe_ext)].sort().join('~')}`
  }
  if (v.duree_s) return `${jour}|sans-equipes|${v.source}|${v.kind}|${v.duree_s}`
  return `id|${v.video_id}`   // rien pour décider : on la garde telle quelle
}

/** Ne laisse qu'un résumé par rencontre. Les buts traversent intacts. */
export function uneVersionParMatch(liste: VideoMatch[]): VideoMatch[] {
  const garde = new Map<string, VideoMatch>()
  for (const v of liste) {
    if (!estResume(v)) continue
    const cle = cleRencontre(v)
    const vu = garde.get(cle)
    if (!vu) { garde.set(cle, v); continue }
    const mieux = RANG_KIND[v.kind] !== RANG_KIND[vu.kind]
      ? RANG_KIND[v.kind] < RANG_KIND[vu.kind]
      : (v.duree_s ?? 0) > (vu.duree_s ?? 0)
    if (mieux) garde.set(cle, v)
  }
  // On refiltre la liste d'origine plutôt que de rendre les gagnants : son
  // ordre est celui que la base a trié, et les buts doivent rester à leur
  // place au milieu des résumés.
  const gagnants = new Set([...garde.values()].map((v) => v.video_id))
  return liste.filter((v) => !estResume(v) || gagnants.has(v.video_id))
}

export type Journee = { jour: string; nombre: number }

/**
 * Rend `null` quand la lecture échoue, et une liste vide quand il n'y a
 * rien — ce ne sont pas la même chose, et l'écran ne doit pas dire « aucun
 * but aujourd'hui » parce que le réseau a toussé.
 */
export async function videosRecentes(kind: string | null, limite = 30): Promise<VideoMatch[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('videos_recentes', { p_kind: kind, p_limite: limite })
  if (error) return null
  return uneVersionParMatch((data ?? []) as VideoMatch[])
}

/**
 * LES JOURNÉES QUI ONT DES VIDÉOS, la plus récente d'abord.
 *
 * Mehdi, 18/10/2026 : « chaque date agit comme une playlist qui a un lien
 * propre, et c'est ce lien qu'on va publier en commentaire ». Facebook
 * pénalise les liens en description : ils passent en premier commentaire,
 * et un commentaire a besoin d'une adresse qui désigne une journée précise
 * — « les résumés récents » aura changé demain.
 */
export async function joursDeVideos(kind: string | null, limite = 30): Promise<Journee[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('jours_de_videos', { p_kind: kind, p_limite: limite })
  if (error) return null
  return (data ?? []) as Journee[]
}

/** Une journée entière. `jour` est une date UTC, « 2026-10-18 ». */
export async function videosDuJour(jour: string, kind: string | null): Promise<VideoMatch[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('videos_du_jour', { p_jour: jour, p_kind: kind })
  if (error) return null
  return uneVersionParMatch((data ?? []) as VideoMatch[])
}

/**
 * LE JOUR D'UNE VIDÉO, EN UTC.
 *
 * Le même découpage que la base (migration 038) et que `jourDuJeu()` :
 * `toLocaleDateString` du navigateur rangerait un résumé publié à 23 h 30
 * UTC dans la journée du lendemain pour un lecteur à Tokyo, et le lien de
 * playlist posté en commentaire renverrait alors sur une journée vide.
 */
export const jourDeVideo = (v: VideoMatch): string => v.publie_at.slice(0, 10)

/** Groupe une liste déjà triée en journées, sans changer l'ordre. */
export function parJournee(liste: VideoMatch[]): { jour: string; videos: VideoMatch[] }[] {
  const jours: { jour: string; videos: VideoMatch[] }[] = []
  for (const v of liste) {
    const j = jourDeVideo(v)
    const dernier = jours[jours.length - 1]
    if (dernier && dernier.jour === j) dernier.videos.push(v)
    else jours.push({ jour: j, videos: [v] })
  }
  return jours
}

/** L'adresse du lecteur, selon la source. */
export function lienVideo(v: VideoMatch): string {
  return v.source.startsWith('x-')
    ? `https://x.com/i/status/${v.video_id}`
    : `https://www.youtube.com/watch?v=${v.video_id}`
}

/**
 * Celle qui est RANGÉE gagne : une vidéo X n'a pas d'adresse de vignette
 * déductible de son identifiant, et sans elle ses cartes sortaient avec un
 * cadre vide. Pour YouTube, elle se recalcule toujours.
 */
export const vignetteDe = (v: VideoMatch): string | null =>
  v.vignette ?? (v.source.startsWith('x-') ? null : `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`)
