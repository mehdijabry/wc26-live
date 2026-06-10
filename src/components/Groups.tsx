import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import {
  deriveLiveGroups,
  nextMatchForTeam,
  recordForTeam,
  relativeTime,
  useTournament,
} from '../store/tournament'
import { teamBadgeFallback } from '../lib/utils'
import { LottieLoader } from './LottieLoader'
import { getCachedTeamForm, prefetchTeamForms, type TeamForm } from '../lib/api'
import { TeamSheet } from './TeamSheet'

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
  // TeamSheet modal — re-enabled 2026-06-10 after user feedback that
  // the standalone /team/:abbr SEO page is too light vs the 5-tab
  // modal experience (Infos / Squad / WC26 / History / Stats). The
  // SEO pages remain in the sitemap and are still crawlable directly,
  // but in-app clicks open the rich modal. The TeamSheet also surfaces
  // a 'Read the full team page →' link to /team/:abbr in its Infos
  // tab for visitors who want the standalone read.
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const { events, fetchedAt, loading, error, load } = useTournament()
  const groups = useMemo(() => deriveLiveGroups(events), [events])

  // Prefetch form (last-5 W/D/L → score 0..15) for every WC team in the
  // groups so the colored dot on each row reads as actual form instead
  // of just 'qualifying / eliminated' static state. forceRender ticks
  // up whenever a batch lands so the row-level getCachedTeamForm() calls
  // pick up the new data without each row tracking its own state.
  const [, setFormTick] = useState(0)
  useEffect(() => {
    if (groups.length === 0) return
    const abbrs = groups.flatMap((g) => g.teams.map((t) => t.abbr))
    let cancelled = false
    void prefetchTeamForms(abbrs).then(() => {
      if (!cancelled) setFormTick((n) => n + 1)
    })
    return () => { cancelled = true }
  }, [groups])

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
              className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-40"
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
                    .map(({ t, rec }) => {
                      const champ = CONTINENTAL_CHAMPIONS[t.abbr]
                      const logo = teamBadgeFallback(t.logo, t.abbr)
                      return (
                        <li key={t.abbr}>
                          {/* Click opens the rich 5-tab TeamSheet modal
                              (Infos / Squad / WC26 / History / Stats).
                              For SEO, the team's standalone page lives
                              at /team/:abbr and is reachable via the
                              sitemap + the 'Read the full team page →'
                              link inside the modal — Google still
                              crawls it as a first-class URL. */}
                          <button
                            type="button"
                            onClick={() => setOpenTeam(t.abbr)}
                            aria-label={`View ${t.name} squad, fixtures and history`}
                            className={
                              'w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-1.5 items-center px-3 py-2 rounded-lg transition-colors group text-left ' +
                              (champ
                                ? `bg-gradient-to-r ${champ.tone.split(' ').slice(0, 3).join(' ')} ring-1 ${champ.tone.split(' ').slice(3).join(' ')} hover:bg-slate-100`
                                : 'bg-slate-50 hover:bg-slate-100')
                            }
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <FormDot abbr={t.abbr} />
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
                                <span className="text-[8px] uppercase tracking-widest text-slate-600 font-mono shrink-0 hidden md:inline">
                                  {champ.short}
                                </span>
                              )}
                            </span>
                            {rec.played > 0 ? (
                              <>
                                <span className="w-5 text-center font-mono text-xs text-slate-600 tabular-nums">{rec.played}</span>
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

      {/* TeamSheet — opens with the 5-tab rich view (Infos / Squad /
          WC26 / History / Stats). One instance for the whole Groups
          component, driven by openTeam state above. */}
      <TeamSheet
        teamCode={openTeam}
        open={openTeam !== null}
        onClose={() => setOpenTeam(null)}
      />
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
    <div className={'mt-3 pt-3 border-t border-slate-200/70 flex items-center gap-2 text-[10px] font-mono ' + (isLive ? 'text-red-400' : 'text-slate-500')}>
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
    <div className="mt-12 flex flex-col items-center justify-center py-16">
      <LottieLoader name="whistle" size={120} caption="Fetching the draw from ESPN…" />
    </div>
  )
}

/**
 * Form-coloured indicator dot. Reads from the synchronous cache in
 * api.ts that Groups() pre-warms on mount, so the dot pops in with the
 * right colour as soon as the team-history batch finishes (no row-level
 * useEffect needed).
 *
 * Tooltip shows the last-5 sequence (e.g. "Form: WWDLW · 10/15") so the
 * visitor sees both the dot colour AND why.
 */
function FormDot({ abbr }: { abbr: string }) {
  const form = getCachedTeamForm(abbr)
  if (!form) {
    return (
      <span
        className="w-3 h-3 rounded-full shrink-0 bg-slate-300/60 animate-pulse"
        title="Form loading…"
      />
    )
  }
  const palette: Record<TeamForm['color'], string> = {
    green:  'bg-emerald-500',
    yellow: 'bg-yellow-400',
    orange: 'bg-orange-500',
    red:    'bg-red-500',
  }
  return (
    <span
      className={'w-3 h-3 rounded-full shrink-0 ' + palette[form.color]}
      title={`Form: ${form.lastFive.join('') || '—'} · ${form.score}/15 (last ${form.played} matches)`}
    />
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
      <p className="text-slate-600 max-w-3xl text-base sm:text-lg leading-relaxed">{sub}</p>
    </motion.div>
  )
}
