import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE, api, eventTeams, statusLabel, type EspnEvent, type RosterAthlete, type RosterResponse } from '../lib/api'
import { useTournament } from '../store/tournament'
import { teamBadgeFallback } from '../lib/utils'

/**
 * Team detail sheet — opens when a team row in the Groups grid is clicked.
 * Fetches ESPN /teams/:abbr (logo, colors, links, roster if available) and
 * shows every match this team has in the tournament with live status.
 */

type EspnTeamPayload = {
  team?: {
    id?: string
    displayName?: string
    shortDisplayName?: string
    nickname?: string
    abbreviation?: string
    location?: string
    color?: string
    logos?: Array<{ href?: string }>
    record?: { items?: Array<{ summary?: string; description?: string }> }
    standingSummary?: string
    nextEvent?: Array<{ name?: string; date?: string }>
  }
}

export function TeamSheet({ teamCode, open, onClose }: { teamCode: string | null; open: boolean; onClose: () => void }) {
  const [data, setData] = useState<EspnTeamPayload | null>(null)
  const [roster, setRoster] = useState<RosterResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const events = useTournament((s) => s.events)

  useEffect(() => {
    if (!open || !teamCode) return
    let stop = false
    setLoading(true)
    setError(null)
    setData(null)
    setRoster(null)
    // Team meta + roster in parallel
    Promise.all([
      fetch(`${API_BASE}/teams/${teamCode.toLowerCase()}`).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<EspnTeamPayload>
      }),
      api.roster(teamCode).catch(() => null),
    ])
      .then(([teamData, rosterData]) => {
        if (stop) return
        setData(teamData)
        setRoster(rosterData)
      })
      .catch((e) => !stop && setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => !stop && setLoading(false))
    return () => { stop = true }
  }, [open, teamCode])

  // Tournament matches for this team
  const teamMatches = teamCode
    ? events.filter((ev) => {
        const { home, away } = eventTeams(ev)
        const codes = [home?.team?.abbreviation, away?.team?.abbreviation].filter(Boolean).map((c) => (c as string).toLowerCase())
        return codes.includes(teamCode.toLowerCase())
      })
    : []

  // Lock body scroll while modal is open (iOS Safari friendly)
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const team = data?.team
  const logo = teamBadgeFallback(team?.logos?.[0]?.href, teamCode ?? undefined)
  const color = team?.color ? `#${team.color}` : '#d4af37'
  const athletes = roster?.athletes ?? []

  // Portal the modal to <body> so it escapes any transformed/overflow-hidden
  // ancestor (the Groups motion.div with whileInView creates a transform
  // stacking context on iOS Safari that would otherwise trap our fixed pos).
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] bg-ink-900/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 250 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 sm:p-8 ring-glow"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-5 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {logo ? (
                  <img src={logo} alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0" />
                ) : (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full glass flex items-center justify-center text-2xl">
                    🏳️
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-widest font-mono" style={{ color }}>
                    {team?.location ?? teamCode}
                  </div>
                  <div className="font-display font-bold text-2xl sm:text-3xl truncate">
                    {team?.displayName ?? team?.shortDisplayName ?? teamCode}
                  </div>
                  {team?.record?.items?.[0]?.summary && (
                    <div className="text-xs text-slate-500 font-mono mt-1">
                      Record · {team.record.items[0].summary}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 rounded-full glass glass-hover flex items-center justify-center text-xl shrink-0"
              >
                ×
              </button>
            </div>

            {team?.standingSummary && (
              <div className="glass rounded-xl px-3 py-2 text-xs text-slate-300 font-mono mb-5">
                {team.standingSummary}
              </div>
            )}

            {/* Status */}
            {loading && (
              <div className="glass rounded-xl p-4 text-center text-slate-500 text-sm">
                Loading team data from ESPN…
              </div>
            )}
            {error && (
              <div className="glass rounded-xl p-4 text-center text-red-400 text-xs font-mono">
                {error}
              </div>
            )}

            {/* Tournament matches */}
            <div className="mt-1">
              <div className="text-xs uppercase tracking-widest text-slate-500 font-mono mb-3">
                Tournament matches · {teamMatches.length}
              </div>
              {teamMatches.length === 0 && (
                <div className="glass rounded-xl p-4 text-xs text-slate-500">
                  No fixtures for this team yet — ESPN will publish them as the draw is finalized.
                </div>
              )}
              <div className="space-y-1.5">
                {teamMatches.map((ev) => (
                  <MatchLine key={ev.id} ev={ev} teamCode={teamCode!} />
                ))}
              </div>
            </div>

            {/* Squad — live from ESPN /roster (falls back through several
                confederation endpoints because national rosters are exposed
                inconsistently before kickoff). */}
            <div className="mt-6 pt-6 border-t border-white/5">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-xs uppercase tracking-widest text-slate-500 font-mono">
                  Squad · {athletes.length} {athletes.length === 1 ? 'player' : 'players'}
                </div>
                {roster?.source && (
                  <div className="text-[9px] font-mono text-slate-700 truncate max-w-[60%]" title={roster.source}>
                    ESPN
                  </div>
                )}
              </div>
              {athletes.length === 0 ? (
                <div className="glass rounded-xl p-4 text-xs text-slate-400 leading-relaxed">
                  {loading
                    ? 'Loading squad…'
                    : "ESPN n'a pas encore publié de roster pour cette sélection. La liste apparaîtra ici dès que la fédération la publie — pas d'intervention nécessaire."}
                </div>
              ) : (
                <SquadGrid athletes={athletes} />
              )}
            </div>

            <div className="mt-6 text-[10px] font-mono text-slate-600 text-center">
              Live data · ESPN public API · refresh 30s
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

function SquadGrid({ athletes }: { athletes: RosterAthlete[] }) {
  // Group by position bucket (GK / DEF / MID / FW)
  const buckets: Record<string, RosterAthlete[]> = { GK: [], DEF: [], MID: [], FW: [], Other: [] }
  for (const a of athletes) {
    const pos = (a.position?.abbreviation ?? '').toUpperCase()
    if (pos.startsWith('G')) buckets.GK.push(a)
    else if (pos.startsWith('D') || pos.includes('B')) buckets.DEF.push(a)
    else if (pos.startsWith('M')) buckets.MID.push(a)
    else if (pos.startsWith('F') || pos.startsWith('W') || pos.startsWith('S')) buckets.FW.push(a)
    else buckets.Other.push(a)
  }
  const order: Array<keyof typeof buckets> = ['GK', 'DEF', 'MID', 'FW', 'Other']
  const labels: Record<string, string> = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FW: 'Forwards', Other: 'Others' }
  return (
    <div className="space-y-4">
      {order.map((k) => {
        const list = buckets[k]
        if (!list.length) return null
        return (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-widest text-slate-600 font-mono mb-2">
              {labels[k]} · {list.length}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {list.map((a) => (
                <AthleteRow key={a.id ?? a.fullName} a={a} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AthleteRow({ a }: { a: RosterAthlete }) {
  const name = a.displayName ?? a.fullName ?? a.shortName ?? '?'
  // ESPN national-team athletes rarely expose headshot — fall back to the
  // citizenship flag (always present for international squads).
  const photo = a.headshot?.href ?? a.flag?.href
  const jersey = a.jersey != null ? `#${a.jersey}` : ''
  const pos = a.position?.abbreviation ?? ''
  return (
    <div className="glass rounded-lg px-2.5 py-1.5 flex items-center gap-2.5">
      {photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          className="w-7 h-7 rounded-full object-cover bg-ink-900"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-ink-900/60 flex items-center justify-center text-[10px] font-mono text-slate-500">
          {pos || '·'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate">{name}</div>
        <div className="text-[10px] font-mono text-slate-500 flex gap-2">
          {jersey && <span>{jersey}</span>}
          {pos && <span>{pos}</span>}
          {a.age && <span>{a.age}y</span>}
        </div>
      </div>
    </div>
  )
}

function MatchLine({ ev, teamCode }: { ev: EspnEvent; teamCode: string }) {
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  const isHome = home?.team?.abbreviation?.toLowerCase() === teamCode.toLowerCase()
  const opp = isHome ? away : home
  const us = isHome ? home : away
  const time = ev.date
    ? new Date(ev.date).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—'

  return (
    <div className={`glass rounded-lg px-3 py-2 flex items-center gap-3 ${s.live ? 'ring-1 ring-red-500/30' : ''}`}>
      <div className="text-[10px] font-mono text-slate-500 w-32 shrink-0 truncate">{time}</div>
      <div className="text-[10px] font-mono text-slate-500 w-8">{isHome ? 'vs' : '@'}</div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {(() => {
          const logo = teamBadgeFallback(opp?.team?.logo, opp?.team?.abbreviation)
          return logo ? (
            <img
              src={logo}
              alt=""
              loading="lazy"
              className="w-4 h-4 object-contain"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : null
        })()}
        <span className="text-sm truncate">{opp?.team?.shortDisplayName ?? opp?.team?.displayName ?? '?'}</span>
      </div>
      {s.live && (
        <span className="text-[10px] font-mono text-red-400">{s.label}</span>
      )}
      {s.finished && (
        <span className="text-xs font-display font-bold tabular-nums">
          {us?.score ?? '0'} – {opp?.score ?? '0'}
        </span>
      )}
      {!s.live && !s.finished && (
        <span className="text-[10px] font-mono text-slate-600">{s.label}</span>
      )}
    </div>
  )
}
