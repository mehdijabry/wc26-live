import { API_BASE, api, eventTeams, type EspnEvent } from './api'
import { trLeague } from './i18n'
import { monogramBadge, teamBadgeFallback } from './utils'

/**
 * Today's-matches pool shared by the Reel composer and the match-day
 * Story composer: majors first (tier ≤ 13), crest URLs canvas-safe
 * (CORS proxy or data-URI monogram), localized time + league label.
 */

export type MatchSlide = {
  home: string
  away: string
  homeLogo: string | null
  awayLogo: string | null
  time: string
  league: string
  live: boolean
  score?: string
}

export function proxied(u: string | null | undefined): string | null {
  return u ? `${API_BASE}/fb-img?u=${encodeURIComponent(u)}` : null
}

/** Today's fixtures pool — majors first, up to 20, operator picks. */
export async function loadMatchPool(lang: 'ar' | 'en' | 'fr'): Promise<MatchSlide[]> {
  const daily = await api.today()
  const slides: MatchSlide[] = []
  for (const comp of daily.competitions) {
    if (comp.tier > 13) continue
    for (const ev of comp.events) {
      const { home, away } = eventTeams(ev as EspnEvent)
      if (!home?.team || !away?.team) continue
      const state = ev.status?.type?.state
      const kickoff = ev.date
        ? new Date(ev.date).toLocaleTimeString(lang === 'ar' ? 'ar-u-nu-latn' : lang, { hour: '2-digit', minute: '2-digit' })
        : ''
      const scoreOf = (c: typeof home) => {
        const raw = (c as { score?: string | { displayValue?: string } }).score
        return typeof raw === 'string' ? raw : raw?.displayValue ?? '0'
      }
      const homeName = home.team.shortDisplayName ?? home.team.displayName ?? '?'
      const awayName = away.team.shortDisplayName ?? away.team.displayName ?? '?'
      // Same crest chain as the site: ESPN logo (with the known-missing
      // list filtered) via the CORS proxy, else the gold monogram —
      // never an empty hole in the slide.
      const hRaw = teamBadgeFallback(home.team.logo, home.team.abbreviation, homeName)
      const aRaw = teamBadgeFallback(away.team.logo, away.team.abbreviation, awayName)
      // data: URIs (monogram) are canvas-safe as-is; http(s) crests go
      // through the CORS proxy.
      const wrap = (u: string | undefined, name: string) =>
        !u ? monogramBadge(name) : u.startsWith('data:') ? u : proxied(u)
      slides.push({
        home: homeName,
        away: awayName,
        homeLogo: wrap(hRaw, homeName),
        awayLogo: wrap(aRaw, awayName),
        time: kickoff,
        league: trLeague(comp.label, lang),
        live: state === 'in',
        score: state === 'in' || state === 'post' ? `${scoreOf(home)}–${scoreOf(away)}` : undefined,
      })
      if (slides.length >= 20) return slides
    }
  }
  return slides
}

