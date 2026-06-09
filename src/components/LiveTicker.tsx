import { useEffect, useState } from 'react'
import {
  api,
  competitionSlugFromEvent,
  eventTeams,
  liveClock,
  statusLabel,
  ymdUtc,
  type DailyResponse,
  type EspnEvent,
} from '../lib/api'
import { teamBadgeFallback } from '../lib/utils'
import { MatchSheet } from './MatchSheet'

/**
 * Horizontal ticker of today's live/finished/upcoming matches —
 * footmercato-style row that sits just under the StickyCountdown.
 * Hides on cold-load until at least one match is found, so it never
 * paints an empty strip.
 */
export function LiveTicker() {
  const [events, setEvents] = useState<EspnEvent[]>([])
  // fetchedAt timestamp the last full ESPN payload arrived at — used by
  // liveClock() to project the on-card minute forward between polls so
  // '67' rolls up to '68' organically without waiting for the next 60s
  // refresh. Same pattern DailyMatches.tsx uses for its match rows.
  const [fetchedAt, setFetchedAt] = useState<number>(Date.now())
  // Ticks the React tree every 5s so the projected liveClock minute can
  // re-compute without us re-fetching ESPN. Cheap rerender, no network.
  const [, setTick] = useState(0)
  const [loaded, setLoaded] = useState(false)
  // User asked: 'il faut que les matchs soient cliquable et qu'il
  // affichent la meme sheet que ceux de la page home avec les meme infos
  // tout pareil'. Hoist the same { id, slug } modal state DailyMatches
  // uses so clicking a ticker card opens the full event-details modal
  // (events timeline, lineups, stats — everything that's on the home
  // and Today pages).
  const [openMatch, setOpenMatch] = useState<{ id: string; slug: string } | null>(null)

  useEffect(() => {
    let stop = false
    async function load() {
      try {
        const today = ymdUtc(new Date())
        const r = await api.today(today)
        if (stop) return
        // Flatten + cap at 20 so the strip stays light
        const all: EspnEvent[] = (r as DailyResponse).competitions.flatMap((c) => c.events)
        // Prioritize: live → upcoming today → finished, sorted by date
        all.sort((a, b) => {
          const w = (e: EspnEvent) => (e.status?.type?.state === 'in' ? 0 : e.status?.type?.state === 'pre' ? 1 : 2)
          const dw = w(a) - w(b)
          if (dw !== 0) return dw
          return (a.date ?? '').localeCompare(b.date ?? '')
        })
        setEvents(all.slice(0, 20))
        setFetchedAt(Date.now())
        setLoaded(true)
      } catch {
        if (!stop) setLoaded(true)
      }
    }
    load()
    const id = setInterval(load, 60_000) // refresh every minute
    // Tick every 5s so the projected liveClock minute roll-up renders
    // even when ESPN hasn't been re-fetched yet. Light: just a counter
    // bump, no network, no DOM thrash beyond the few visible <span>s.
    const tickId = setInterval(() => setTick((n) => n + 1), 5_000)
    return () => { stop = true; clearInterval(id); clearInterval(tickId) }
  }, [])

  if (!loaded || events.length === 0) return null

  return (
    <div
      className="fixed inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200 md:hidden"
      // Adapts to PWA standalone (safe-area-inset-top ~47-59px on notched
      // iPhones). In browser the inset is 0 so we keep the original 60px
      // offset that clears the nav header. Without this the ticker would
      // sit on top of (or under) the Sign in button.
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}
    >
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex gap-2 px-3 py-2 min-w-max">
          {events.map((ev) => (
            <TickerCard
              key={ev.id}
              ev={ev}
              fetchedAt={fetchedAt}
              onPick={() =>
                setOpenMatch({ id: ev.id, slug: competitionSlugFromEvent(ev) })
              }
            />
          ))}
        </div>
      </div>
      <MatchSheet
        open={!!openMatch}
        eventId={openMatch?.id}
        competitionSlug={openMatch?.slug}
        onClose={() => setOpenMatch(null)}
      />
    </div>
  )
}

function TickerCard({
  ev, fetchedAt, onPick,
}: { ev: EspnEvent; fetchedAt: number; onPick: () => void }) {
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  const homeLogo = teamBadgeFallback(home?.team?.logo, home?.team?.abbreviation)
  const awayLogo = teamBadgeFallback(away?.team?.logo, away?.team?.abbreviation)
  const time = ev.date
    ? new Date(ev.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : ''
  const showScore = s.live || s.finished

  // Real-time minute pulled from ESPN's displayClock and projected
  // forward via liveClock(). Paused (halftime) shows 'HT' instead.
  // Matches the format DailyMatches.tsx uses on the home page so the
  // ticker reads as "67'" rather than just "LIVE".
  const liveMinute = s.live
    ? (s.paused ? 'HT' : liveClock(s.rawClock, fetchedAt))
    : null

  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Open ${home?.team?.abbreviation ?? '?'} vs ${away?.team?.abbreviation ?? '?'} details`}
      className={
        'shrink-0 w-[148px] rounded-xl border px-2.5 py-1.5 text-left ' +
        'transition-colors active:scale-[0.98] hover:border-slate-300 ' +
        (s.live ? 'border-accent-red/40 bg-red-50/40' : 'border-slate-200 bg-white')
      }
    >
      <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500 mb-1">
        {s.live ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red/60 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
            </span>
            <span className="text-accent-red font-semibold">
              {liveMinute && liveMinute !== 'LIVE' ? `${liveMinute}${liveMinute === 'HT' ? '' : "'"}` : 'LIVE'}
            </span>
          </>
        ) : s.finished ? (
          <span>FT</span>
        ) : (
          <span>{time}</span>
        )}
      </div>
      <div className="space-y-0.5">
        <TeamLine logo={homeLogo} name={home?.team?.abbreviation ?? '?'} score={home?.score} show={showScore} />
        <TeamLine logo={awayLogo} name={away?.team?.abbreviation ?? '?'} score={away?.score} show={showScore} />
      </div>
    </button>
  )
}

function TeamLine({ logo, name, score, show }: { logo?: string; name: string; score?: string; show: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {logo ? (
        <img src={logo} alt="" loading="lazy" className="w-4 h-4 object-contain shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />
      ) : (
        <span className="w-4 h-4 inline-flex items-center justify-center text-[10px]">⚽</span>
      )}
      <span className="text-[11px] font-semibold text-slate-800 truncate flex-1">{name}</span>
      {show && <span className="text-[12px] font-display font-bold text-slate-900 tabular-nums">{score ?? '0'}</span>}
    </div>
  )
}
