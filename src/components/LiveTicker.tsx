import { useEffect, useState } from 'react'
import { api, eventTeams, statusLabel, ymdUtc, type DailyResponse, type EspnEvent } from '../lib/api'
import { teamBadgeFallback } from '../lib/utils'

/**
 * Horizontal ticker of today's live/finished/upcoming matches —
 * footmercato-style row that sits just under the StickyCountdown.
 * Hides on cold-load until at least one match is found, so it never
 * paints an empty strip.
 */
export function LiveTicker() {
  const [events, setEvents] = useState<EspnEvent[]>([])
  const [loaded, setLoaded] = useState(false)

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
        setLoaded(true)
      } catch {
        if (!stop) setLoaded(true)
      }
    }
    load()
    const id = setInterval(load, 60_000) // refresh every minute
    return () => { stop = true; clearInterval(id) }
  }, [])

  if (!loaded || events.length === 0) return null

  return (
    <div className="fixed top-[60px] inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200 md:hidden">
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex gap-2 px-3 py-2 min-w-max">
          {events.map((ev) => <TickerCard key={ev.id} ev={ev} />)}
        </div>
      </div>
    </div>
  )
}

function TickerCard({ ev }: { ev: EspnEvent }) {
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  const homeLogo = teamBadgeFallback(home?.team?.logo, home?.team?.abbreviation)
  const awayLogo = teamBadgeFallback(away?.team?.logo, away?.team?.abbreviation)
  const time = ev.date
    ? new Date(ev.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : ''
  const showScore = s.live || s.finished

  return (
    <div className={'shrink-0 w-[148px] rounded-xl border px-2.5 py-1.5 ' + (s.live ? 'border-accent-red/40 bg-red-50/40' : 'border-slate-200 bg-white')}>
      <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500 mb-1">
        {s.live ? (
          <>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red/60 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
            </span>
            <span className="text-accent-red font-semibold">LIVE</span>
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
    </div>
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
