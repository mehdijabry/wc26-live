import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import {
  deriveLiveGroups,
  nextMatchForTeam,
  recordForTeam,
  relativeTime,
  useTournament,
} from '../store/tournament'
import { TeamSheet } from './TeamSheet'
import { teamBadgeFallback } from '../lib/utils'

// Editorial Continental Champions — one team per confederation gets a
// subtle gradient/ring tone. Uses ESPN abbreviations.
const CONTINENTAL_CHAMPIONS: Record<string, { short: string; tone: string }> = {
  MAR: { short: 'CAF',      tone: 'from-red-700/15 via-yellow-700/5 to-green-700/15 ring-red-500/20' },
  ESP: { short: 'UEFA',     tone: 'from-red-600/10 via-yellow-600/5 to-yellow-700/10 ring-yellow-500/20' },
  ARG: { short: 'CONMEBOL', tone: 'from-sky-600/15 via-white/5 to-sky-600/15 ring-sky-400/20' },
  JPN: { short: 'AFC',      tone: 'from-red-600/15 via-white/5 to-red-700/15 ring-red-500/20' },
  USA: { short: 'CONCACAF', tone: 'from-blue-700/15 via-white/5 to-red-700/15 ring-blue-400/20' },
  NZL: { short: 'OFC',      tone: 'from-slate-600/10 via-white/5 to-slate-700/10 ring-slate-400/20' },
}

export function Groups() {
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const { events, fetchedAt, loading, error, load } = useTournament()
  const groups = useMemo(() => deriveLiveGroups(events), [events])

  return (
    <section id="groups" className="py-20 sm:py-28">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="48 nations · tap a flag for the squad"
          title="The 12 Groups"
          sub="First World Cup with twelve groups of four. Top two from each group plus the eight best third-placed teams advance to the Round of 32. Groups derived live from ESPN — never fabricated."
        />

        <div className="mt-6 flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span>ESPN · {loading && !events.length ? 'loading…' : relativeTime(fetchedAt)}</span>
            <button
              onClick={() => load()}
              disabled={loading}
              className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 transition-colors disabled:opacity-40"
            >
              ↻
            </button>
          </div>
          <span className="text-slate-600">
            👉 tap any country to see its squad
          </span>
        </div>

        {error && (
          <div className="mt-6 glass rounded-xl px-4 py-3 text-xs text-red-400 font-mono">
            {error}
          </div>
        )}

        {!error && events.length === 0 && (
          <GroupsSkeleton />
        )}

        {!error && events.length > 0 && groups.length === 0 && (
          <div className="mt-8 glass rounded-2xl p-8 text-center text-slate-500">
            Not enough group-stage fixtures published yet — groups will appear here as ESPN finalizes them.
          </div>
        )}

        {groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {groups.map((g, idx) => (
              <motion.div
                key={g.letter}
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: idx * 0.03 }}
                className="glass glass-hover rounded-2xl p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="font-display text-2xl font-bold">
                    Group <span className="text-accent-gold">{g.letter}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    {new Date(g.firstKickoff).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric',
                    })} →
                  </span>
                </div>

                {/* Standings table header (only visible once any match has finished) */}
                {g.teams.some((t) => recordForTeam(events, t.abbr).played > 0) && (
                  <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-1.5 text-[9px] uppercase tracking-widest text-slate-600 font-mono mb-1.5 px-3">
                    <span>team</span>
                    <span className="w-5 text-center">P</span>
                    <span className="w-7 text-center">GD</span>
                    <span className="w-5 text-center">Pts</span>
                    <span className="w-3" />
                  </div>
                )}

                <ul className="space-y-1">
                  {g.teams
                    .map((t) => ({ t, rec: recordForTeam(events, t.abbr) }))
                    .sort((a, b) => {
                      if (b.rec.points !== a.rec.points) return b.rec.points - a.rec.points
                      const gdA = a.rec.goalsFor - a.rec.goalsAgainst
                      const gdB = b.rec.goalsFor - b.rec.goalsAgainst
                      if (gdB !== gdA) return gdB - gdA
                      return b.rec.goalsFor - a.rec.goalsFor
                    })
                    .map(({ t, rec }, i) => {
                      const champ = CONTINENTAL_CHAMPIONS[t.abbr]
                      const logo = teamBadgeFallback(t.logo, t.abbr)
                      const qualifying = i < 2 // top 2 qualify
                      return (
                        <li key={t.abbr}>
                          <button
                            type="button"
                            onClick={() => setOpenTeam(t.abbr)}
                            className={
                              'w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-1.5 items-center px-3 py-2 rounded-lg transition-colors group text-left ' +
                              (champ
                                ? `bg-gradient-to-r ${champ.tone.split(' ').slice(0, 3).join(' ')} ring-1 ${champ.tone.split(' ').slice(3).join(' ')} hover:bg-white/[0.08]`
                                : 'bg-white/[0.02] hover:bg-white/[0.08]')
                            }
                            title={`View ${t.name} squad`}
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={
                                  'w-3 h-3 rounded-full shrink-0 ' +
                                  (qualifying
                                    ? 'bg-accent-green/80'
                                    : i === 2
                                      ? 'bg-accent-gold/50'
                                      : 'bg-slate-700')
                                }
                                title={qualifying ? 'Qualifying spot' : i === 2 ? 'Third-place playoff hopeful' : 'Eliminated'}
                              />
                              {logo ? (
                                <img
                                  src={logo}
                                  alt=""
                                  loading="lazy"
                                  className="w-6 h-6 object-contain shrink-0"
                                  onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                              ) : (
                                <span className="w-6 h-6 inline-flex items-center justify-center text-base">🏳️</span>
                              )}
                              <span className="text-sm truncate flex-1 min-w-0">{t.shortName}</span>
                              {champ && (
                                <span className="text-[8px] uppercase tracking-widest text-slate-400 font-mono shrink-0 hidden md:inline">
                                  {champ.short}
                                </span>
                              )}
                            </span>
                            {rec.played > 0 ? (
                              <>
                                <span className="w-5 text-center font-mono text-xs text-slate-400 tabular-nums">{rec.played}</span>
                                <span className={'w-7 text-center font-mono text-xs tabular-nums ' + (rec.goalsFor - rec.goalsAgainst > 0 ? 'text-accent-green' : rec.goalsFor - rec.goalsAgainst < 0 ? 'text-red-400' : 'text-slate-500')}>
                                  {rec.goalsFor - rec.goalsAgainst > 0 ? '+' : ''}{rec.goalsFor - rec.goalsAgainst}
                                </span>
                                <span className="w-5 text-center font-display font-bold text-sm tabular-nums">{rec.points}</span>
                              </>
                            ) : (
                              <>
                                <span className="w-5" />
                                <span className="w-7" />
                                <span className="w-5" />
                              </>
                            )}
                            <span className="text-slate-600 group-hover:text-accent-gold transition-colors text-xs w-3">
                              →
                            </span>
                          </button>
                        </li>
                      )
                    })}
                </ul>

                {/* Next match teaser inside the group card */}
                <GroupNextMatch group={g} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <TeamSheet teamCode={openTeam} open={openTeam !== null} onClose={() => setOpenTeam(null)} />
    </section>
  )
}

function GroupNextMatch({ group }: { group: ReturnType<typeof deriveLiveGroups>[number] }) {
  const events = useTournament((s) => s.events)
  const next = useMemo(() => {
    let earliest: { ev: ReturnType<typeof nextMatchForTeam>; date: string } | null = null
    for (const t of group.teams) {
      const ev = nextMatchForTeam(events, t.abbr)
      if (!ev?.date) continue
      if (!earliest || ev.date < earliest.date) earliest = { ev, date: ev.date }
    }
    return earliest?.ev ?? null
  }, [events, group])

  if (!next) return null
  const cs = next.competitions?.[0]?.competitors ?? []
  const home = cs.find((c) => c.homeAway === 'home')?.team
  const away = cs.find((c) => c.homeAway === 'away')?.team
  const isLive = next.status?.type?.state === 'in'
  const kickoff = next.date
    ? new Date(next.date).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : ''
  return (
    <div className={'mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-[10px] font-mono ' + (isLive ? 'text-red-400' : 'text-slate-500')}>
      <span className="uppercase tracking-widest text-slate-600">{isLive ? 'LIVE' : 'NEXT'}</span>
      <span className="truncate flex-1">
        {home?.shortDisplayName ?? home?.abbreviation ?? '?'}
        <span className="text-slate-700"> vs </span>
        {away?.shortDisplayName ?? away?.abbreviation ?? '?'}
      </span>
      <span className="text-slate-600 shrink-0">{kickoff}</span>
    </div>
  )
}

function GroupsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass rounded-2xl p-5 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-7 w-24 bg-white/5 rounded" />
            <div className="h-3 w-16 bg-white/5 rounded" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02]">
                <div className="w-6 h-6 rounded-full bg-white/5" />
                <div className="h-3 flex-1 bg-white/5 rounded" />
                <div className="w-5 h-5 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string
  title: string
  sub: string
}) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <div className="text-xs uppercase tracking-widest text-accent-gold font-mono mb-3">
        {eyebrow}
      </div>
      <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight mb-3">
        {title}
      </h2>
      <p className="text-slate-400 max-w-3xl text-base sm:text-lg leading-relaxed">{sub}</p>
    </motion.div>
  )
}
