import { useEffect, useState } from 'react'
import { closingOdds, eventOdds, fetchLiveOdds, statusLabel, type EspnEvent, type MatchOdds } from './api'

export type OddsView = { odds: MatchOdds; mode: 'pre' | 'live' | 'closing' }

/**
 * 1X2 odds for a match card, whatever the match state:
 *  - pre      → scoreboard odds (also persists them as closing odds)
 *  - live     → in-play line from ESPN's core feed, re-checked on every
 *               poll tick (fetchedAt) but throttled to 60s in api.ts
 *  - finished → the greyed-out closing line this browser remembered
 */
export function useMatchOdds(
  ev: EspnEvent | undefined,
  leagueSlug: string | undefined,
  fetchedAt: number
): OddsView | null {
  const s = ev ? statusLabel(ev) : null
  const isLive = !!s?.live
  const evId = ev?.id
  const [live, setLive] = useState<MatchOdds | null>(null)

  useEffect(() => {
    if (!isLive || !evId || !leagueSlug) { setLive(null); return }
    let on = true
    void fetchLiveOdds(evId, leagueSlug).then((o) => { if (on) setLive(o) })
    return () => { on = false }
  }, [evId, leagueSlug, isLive, fetchedAt])

  if (!ev || !s) return null
  if (isLive) return live ? { odds: live, mode: 'live' } : null
  if (s.finished) {
    const c = closingOdds(ev.id)
    return c ? { odds: c, mode: 'closing' } : null
  }
  const pre = eventOdds(ev)
  return pre ? { odds: pre, mode: 'pre' } : null
}
