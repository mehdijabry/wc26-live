import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { api, eventTeams, statusLabel, ymdLocal, type DailyResponse, type EspnEvent } from '../lib/api'
import { teamBadgeFallback } from '../lib/utils'
import { SectionHeader } from './Groups'

const TIER_LABEL: Record<number, string> = {
  0: 'World stage',
  1: 'European cups',
  2: 'Top 5 leagues',
  3: 'Other leagues',
  4: 'Internationals',
}

export function DailyMatches() {
  const [offset, setOffset] = useState(0) // -1 = yesterday, 0 = today, +1 = tomorrow
  const [data, setData] = useState<DailyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSlugs, setActiveSlugs] = useState<Set<string> | null>(null) // null = all

  const date = useMemo(() => {
    // Use LOCAL date so 'Today' for the user really means today in their
    // timezone — not UTC. A 22h kickoff EDT used to vanish into UTC's
    // next day; this fixes it.
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d
  }, [offset])
  const dateLabel = useMemo(
    () =>
      date.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [date]
  )

  // Initial + poll loop (30s if live, 5min otherwise)
  useEffect(() => {
    let stop = false
    let timer: number | undefined
    async function load() {
      try {
        setLoading(data === null)
        const fresh = await api.today(ymdLocal(date))
        if (stop) return
        setData(fresh)
      } catch {
        if (!stop) setData((prev) => prev) // keep last
      } finally {
        if (!stop) setLoading(false)
      }
      const next = data?.hasLive ? 30_000 : 300_000
      timer = window.setTimeout(load, next)
    }
    load()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date.getTime()])

  const filteredComps = useMemo(() => {
    if (!data) return []
    if (!activeSlugs) return data.competitions
    return data.competitions.filter((c) => activeSlugs.has(c.slug))
  }, [data, activeSlugs])

  function toggleSlug(slug: string) {
    setActiveSlugs((prev) => {
      const set = new Set(prev ?? data?.competitions.map((c) => c.slug) ?? [])
      if (set.has(slug)) set.delete(slug)
      else set.add(slug)
      return set
    })
  }

  return (
    <section id="today" className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="football today"
          title="Every match, everywhere"
          sub="Live scores from all major competitions — useful while you wait for World Cup kickoff. Auto-refreshes every 30 seconds when matches are live."
        />

        {/* Day navigator */}
        <div className="mt-8 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1 glass rounded-full p-1">
            {[-1, 0, 1].map((d) => (
              <button
                key={d}
                onClick={() => setOffset(d)}
                className={
                  'px-4 py-1.5 rounded-full text-sm transition-all ' +
                  (offset === d
                    ? 'bg-accent-gold text-ink-900 font-semibold'
                    : 'text-slate-600 hover:text-slate-900')
                }
              >
                {d === -1 ? '← Yesterday' : d === 0 ? 'Today' : 'Tomorrow →'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
            <span className="capitalize">{dateLabel}</span>
            {data?.hasLive && (
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                live
              </span>
            )}
            <span>· {data?.total ?? 0} match{data?.total === 1 ? '' : 'es'}</span>
          </div>
        </div>

        {/* Competition filter chips */}
        {data && data.competitions.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveSlugs(null)}
              className={
                'px-3 py-1 rounded-full text-xs font-mono transition-colors ' +
                (activeSlugs === null
                  ? 'bg-slate-200 text-white'
                  : 'glass glass-hover text-slate-600')
              }
            >
              All
            </button>
            {data.competitions.map((c) => {
              const isActive = activeSlugs === null || activeSlugs.has(c.slug)
              return (
                <button
                  key={c.slug}
                  onClick={() => toggleSlug(c.slug)}
                  className={
                    'px-3 py-1 rounded-full text-xs font-mono transition-colors ' +
                    (isActive
                      ? 'bg-slate-200 text-white'
                      : 'glass glass-hover text-slate-500')
                  }
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Body */}
        <div className="mt-8 space-y-8">
          {loading && (
            <div className="glass rounded-2xl p-8 text-center text-slate-500">
              Loading the day's matches…
            </div>
          )}
          {!loading && data && data.total === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-slate-500">
              No matches on {dateLabel}.<br />
              <span className="text-xs">Try yesterday or tomorrow above.</span>
            </div>
          )}

          {!loading &&
            filteredComps.map((comp) => (
              <CompetitionBlock key={comp.slug} comp={comp} />
            ))}
        </div>
      </div>
    </section>
  )
}

function CompetitionBlock({ comp }: { comp: { slug: string; label: string; tier: number; events: EspnEvent[] } }) {
  if (!comp.events?.length) return null
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-600 font-mono">
            {TIER_LABEL[comp.tier] ?? 'Football'}
          </div>
          <div className="font-display font-bold text-xl mt-0.5">{comp.label}</div>
        </div>
        <div className="text-xs font-mono text-slate-500">
          {comp.events.length} match{comp.events.length === 1 ? '' : 'es'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence>
          {comp.events.map((ev) => (
            <MatchCard key={ev.id} ev={ev} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function MatchCard({ ev }: { ev: EspnEvent }) {
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  const kickoff = ev.date
    ? new Date(ev.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={
        'glass rounded-xl p-3.5 relative ' +
        (s.live ? 'ring-1 ring-red-500/30' : '')
      }
    >
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-2">
        <span>{kickoff}</span>
        {s.live ? (
          <span className="flex items-center gap-1 text-red-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            {s.label}
          </span>
        ) : s.finished ? (
          <span className="text-slate-600">FT</span>
        ) : (
          <span className="text-slate-600">{s.label}</span>
        )}
      </div>

      <div className="space-y-1.5">
        <TeamRow comp={home} live={s.live || s.finished} />
        <TeamRow comp={away} live={s.live || s.finished} />
      </div>
    </motion.div>
  )
}

function TeamRow({ comp, live }: { comp: ReturnType<typeof eventTeams>['home']; live: boolean }) {
  if (!comp) return null
  const logo = teamBadgeFallback(comp.team?.logo, comp.team?.abbreviation)
  return (
    <div className="flex items-center gap-2.5">
      {logo ? (
        <img
          src={logo}
          alt=""
          loading="lazy"
          className="w-5 h-5 object-contain"
          onError={(e) => ((e.currentTarget.style.display = 'none'))}
        />
      ) : (
        <span className="w-5 h-5 inline-flex items-center justify-center text-xs">⚽</span>
      )}
      <span className="flex-1 text-sm truncate">
        {comp.team?.shortDisplayName ?? comp.team?.displayName ?? '—'}
      </span>
      <span
        className={
          'font-display font-bold text-lg tabular-nums w-6 text-right ' +
          (live ? 'text-white' : 'text-slate-600')
        }
      >
        {live ? (comp.score ?? '0') : '–'}
      </span>
    </div>
  )
}
