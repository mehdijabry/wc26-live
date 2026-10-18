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
  return (data ?? []) as VideoMatch[]
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
  return (data ?? []) as VideoMatch[]
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
