import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { deriveLiveGroups, relativeTime, useTournament } from '../store/tournament'
import { TeamSheet } from './TeamSheet'

// Editorial Continental Champions — one team per confederation gets
// a subtle gradient/ring tone. Uses ESPN abbreviations.
const CONTINENTAL_CHAMPIONS: Record<string, { short: string; tone: string }> = {
  MAR: { short: 'CAF CHAMP',      tone: 'from-red-700/15 via-yellow-700/5 to-green-700/15 ring-red-500/20' },
  ESP: { short: 'UEFA CHAMP',     tone: 'from-red-600/10 via-yellow-600/5 to-yellow-700/10 ring-yellow-500/20' },
  ARG: { short: 'CONMEBOL CHAMP', tone: 'from-sky-600/15 via-white/5 to-sky-600/15 ring-sky-400/20' },
  JPN: { short: 'AFC CHAMP',      tone: 'from-red-600/15 via-white/5 to-red-700/15 ring-red-500/20' },
  USA: { short: 'CONCACAF CHAMP', tone: 'from-blue-700/15 via-white/5 to-red-700/15 ring-blue-400/20' },
  NZL: { short: 'OFC CHAMP',      tone: 'from-slate-600/10 via-white/5 to-slate-700/10 ring-slate-400/20' },
}

export function Groups() {
  const [openTeam, setOpenTeam] = useState<string | null>(null)
  const { events, fetchedAt, loading, error, load } = useTournament()
  const groups = useMemo(() => deriveLiveGroups(events), [events])

  return (
    <section id="groups" className="py-20 sm:py-28">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="48 nations"
          title="The 12 Groups"
          sub="First World Cup with twelve groups of four. Top two from each group plus the eight best third-placed teams advance to the Round of 32. Groups derived live from ESPN — never fabricated."
        />

        <div className="mt-6 flex items-center gap-2 text-[10px] font-mono text-slate-500">
          <span>ESPN · {loading && !events.length ? 'loading…' : relativeTime(fetchedAt)}</span>
          <button
            onClick={() => load()}
            disabled={loading}
            className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 transition-colors disabled:opacity-40"
          >
            ↻
          </button>
        </div>

        {error && (
          <div className="mt-6 glass rounded-xl px-4 py-3 text-xs text-red-400 font-mono">
            {error}
          </div>
        )}

        {!error && events.length === 0 && loading && (
          <div className="mt-8 glass rounded-2xl p-8 text-center text-slate-500">
            Loading groups from ESPN…
          </div>
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
                <div className="flex items-center justify-between mb-4">
                  <div className="font-display text-2xl font-bold">
                    Group <span className="text-accent-gold">{g.letter}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-500">{g.teams.length} teams</span>
                </div>
                <ul className="space-y-2">
                  {g.teams.map((t, i) => {
                    const champ = CONTINENTAL_CHAMPIONS[t.abbr]
                    return (
                      <li key={t.abbr}>
                        <button
                          onClick={() => setOpenTeam(t.abbr)}
                          className={
                            'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors group text-left ' +
                            (champ
                              ? `bg-gradient-to-r ${champ.tone.split(' ').slice(0, 3).join(' ')} ring-1 ${champ.tone.split(' ').slice(3).join(' ')} hover:bg-white/[0.08]`
                              : 'bg-white/[0.02] hover:bg-white/[0.08]')
                          }
                          title={`View ${t.name} details`}
                        >
                          <span className="w-5 text-xs font-mono text-slate-600 group-hover:text-slate-400">
                            #{i + 1}
                          </span>
                          {t.logo ? (
                            <img
                              src={t.logo}
                              alt=""
                              className="w-6 h-6 object-contain shrink-0"
                              onError={(e) => (e.currentTarget.style.display = 'none')}
                            />
                          ) : (
                            <span className="w-6 h-6 inline-flex items-center justify-center text-base">🏳️</span>
                          )}
                          <span className="text-sm flex-1 truncate flex items-center gap-2">
                            <span className="truncate">{t.shortName}</span>
                            {champ && (
                              <span className="text-[9px] uppercase tracking-widest text-slate-300 font-mono shrink-0 hidden sm:inline">
                                {champ.short}
                              </span>
                            )}
                          </span>
                          <span className="text-slate-600 group-hover:text-accent-gold transition-colors text-xs">
                            →
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      <TeamSheet teamCode={openTeam} open={openTeam !== null} onClose={() => setOpenTeam(null)} />
    </section>
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
