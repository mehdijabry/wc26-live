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
}

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
