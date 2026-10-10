import { teamBadgeFallback } from './utils'
import { localeOf, type Lang } from './i18n'
import type { EspnEvent } from './api'

/**
 * Ce qu'on lit d'un match ESPN, au même endroit pour tout le monde.
 *
 * Ces quatre fonctions vivaient dans la page de paris. Quand la page
 * d'analyse est née, elle a dû les importer de là — deux problèmes : le
 * linter signalait à juste titre qu'un fichier de composants ne doit pas
 * exporter d'utilitaires, et surtout une page se remettait à dépendre de
 * l'autre alors qu'on venait précisément de les séparer.
 *
 * Elles sont donc ici. C'est le seul endroit qui connaisse la forme exacte
 * d'un événement ESPN, et le jour où elle change, un seul fichier bouge.
 */

export type Camp = { nom: string; logo?: string; score?: string }

export function camps(ev: EspnEvent): { dom: Camp; ext: Camp } | null {
  const c = ev.competitions?.[0]?.competitors ?? []
  const d = c.find((x) => x.homeAway === 'home')
  const e = c.find((x) => x.homeAway === 'away')
  if (!d?.team || !e?.team) return null
  const vers = (x: NonNullable<typeof d>): Camp => ({
    nom: x.team!.shortDisplayName ?? x.team!.displayName ?? x.team!.abbreviation ?? '?',
    logo: x.team!.logo ?? teamBadgeFallback(x.team!.logo, x.team!.abbreviation, x.team!.displayName),
    score: x.score,
  })
  return { dom: vers(d), ext: vers(e) }
}

export function etat(ev: EspnEvent): 'avant' | 'direct' | 'fini' {
  const s = ev.status?.type?.state ?? ev.competitions?.[0]?.status?.type?.state
  if (s === 'post') return 'fini'
  if (s === 'in') return 'direct'
  return 'avant'
}

export function heure(ev: EspnEvent, lang: Lang): string {
  return ev.date
    ? new Date(ev.date).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })
    : ''
}

/** Notre identifiant de match : l'identifiant ESPN préfixé d'un `e`. */
export function idDePronostic(ev: EspnEvent): string {
  return `e${ev.id}`
}
