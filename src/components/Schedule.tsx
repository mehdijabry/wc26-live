import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { userTimezone, cn, teamBadgeFallback } from '../lib/utils'
import { SectionHeader } from './Groups'
import { useTournament, relativeTime } from '../store/tournament'
import { eventTeams, statusLabel, type EspnEvent } from '../lib/api'

const TZ_LABELS: Record<string, string> = {
  Europe: '🇪🇺',
  America: '🌎',
  Asia: '🌏',
  Africa: '🌍',
  Australia: '🇦🇺',
  Pacific: '🌊',
}

type Filter = 'all' | 'group' | 'ko'

function inferStage(ev: EspnEvent): 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final' | 'tp' {
  const comp = ev.competitions?.[0] as unknown as { notes?: Array<{ headline?: string }> } | undefined
  const headline = comp?.notes?.find((n) => n.headline)?.headline?.toLowerCase() ?? ''
  if (headline.includes('group')) return 'group'
  if (headline.includes('round of 32')) return 'r32'
  if (headline.includes('round of 16')) return 'r16'
  if (headline.includes('quarter')) return 'qf'
  if (headline.includes('semi')) return 'sf'
  if (headline.includes('third')) return 'tp'
  if (headline.includes('final')) return 'final'
  return 'group'
}

function groupLetter(ev: EspnEvent): string | null {
  const comp = ev.competitions?.[0] as unknown as { notes?: Array<{ headline?: string }> } | undefined
  const headline = comp?.notes?.find((n) => n.headline)?.headline ?? ''
  const m = headline.match(/Group\s+([A-L])/i)
  return m ? m[1].toUpperCase() : null
}

export function Schedule() {
  const tz = userTimezone()
  const tzZone = tz.split('/')[0]
  const [filter, setFilter] = useState<Filter>('all')

  const { events, fetchedAt, hasLive, loading, error, load } = useTournament()
  const [, force] = useState(0)
  useEffect(() => { const i = setInterval(() => force((x) => x + 1), 30_000); return () => clearInterval(i) }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    if (filter === 'group') return events.filter((e) => inferStage(e) === 'group')
    return events.filter((e) => inferStage(e) !== 'group')
  }, [events, filter])

  const byDate = useMemo(() => {
    const m = new Map<string, EspnEvent[]>()
    filtered.forEach((ev) => {
      if (!ev.date) return
      const date = new Date(ev.date).toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric',
      })
      const arr = m.get(date) ?? []
      arr.push(ev)
      m.set(date, arr)
    })
    return m
  }, [filtered])

  return (
    <section id="schedule" className="py-20 sm:py-28 border-t border-white/5">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="every match"
          title="Schedule"
          sub={`All kickoff times converted to your local timezone. ${TZ_LABELS[tzZone] || '🌐'} ${tz}.`}
        />

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'group', 'ko'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm transition-colors',
                  filter === f
                    ? 'bg-accent-gold text-ink-900 font-semibold'
                    : 'glass glass-hover text-slate-300'
                )}
              >
                {f === 'all' ? `All ${events.length || ''}`.trim() : f === 'group' ? 'Group stage' : 'Knockouts'}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-slate-500">
            {hasLive && (
              <span className="flex items-center gap-1.5 text-red-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                LIVE
              </span>
            )}
            <span>ESPN · {loading ? 'updating…' : relativeTime(fetchedAt)}</span>
            <button
              onClick={() => load()}
              disabled={loading}
              className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 transition-colors disabled:opacity-40"
            >
              ↻
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 glass rounded-xl px-4 py-3 text-xs text-red-400 font-mono">
            {error}
          </div>
        )}

        {events.length === 0 && loading && (
          <div className="mt-8 glass rounded-2xl p-8 text-center text-slate-500">
            Loading schedule from ESPN…
          </div>
        )}

        {events.length === 0 && !loading && !error && (
          <div className="mt-8 glass rounded-2xl p-8 text-center text-slate-500">
            No matches yet. Schedule will populate as ESPN publishes the draw.
          </div>
        )}

        <div className="mt-8 space-y-8">
          {Array.from(byDate.entries()).map(([date, evs], idx) => (
            <motion.div
              key={date}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: idx * 0.02 }}
            >
              <div className="text-xs uppercase tracking-widest text-slate-500 font-mono mb-3">
                {date}
              </div>
              <div className="space-y-2">
                {evs.map((ev) => (
                  <MatchRow key={ev.id} ev={ev} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function MatchRow({ ev }: { ev: EspnEvent }) {
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  const stage = inferStage(ev)
  const grp = groupLetter(ev)
  const time = ev.date
    ? new Date(ev.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '—'
  const venue = ev.competitions?.[0]?.venue
  const stageLabel = stage === 'group'
    ? (grp ? `Group ${grp}` : 'Group')
    : stage.toUpperCase()

  return (
    <div className={cn(
      'glass glass-hover rounded-xl px-4 py-3 flex items-center gap-4',
      s.live && 'ring-1 ring-red-500/30'
    )}>
      <div className="font-mono text-xs text-slate-500 w-14 tabular-nums">{time}</div>

      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2 justify-end text-right min-w-0">
          <span className="truncate text-sm">{home?.team?.shortDisplayName ?? home?.team?.displayName ?? '—'}</span>
          {(() => {
            const logo = teamBadgeFallback(home?.team?.logo, home?.team?.abbreviation)
            return logo ? (
              <img src={logo} alt="" loading="lazy" className="w-5 h-5 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : null
          })()}
          {s.finished && <span className="font-display font-bold text-lg tabular-nums w-6">{home?.score ?? '0'}</span>}
        </div>
        <div className={cn(
          'px-3 py-1 rounded-md text-[10px] font-mono',
          s.live ? 'bg-red-500/20 text-red-300' : s.finished ? 'bg-white/5 text-slate-400' : 'bg-ink-900/50 text-slate-500'
        )}>
          {s.live ? s.label : s.finished ? 'FT' : stageLabel}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {s.finished && <span className="font-display font-bold text-lg tabular-nums w-6">{away?.score ?? '0'}</span>}
          {(() => {
            const logo = teamBadgeFallback(away?.team?.logo, away?.team?.abbreviation)
            return logo ? (
              <img src={logo} alt="" loading="lazy" className="w-5 h-5 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : null
          })()}
          <span className="truncate text-sm">{away?.team?.shortDisplayName ?? away?.team?.displayName ?? '—'}</span>
        </div>
      </div>

      {venue?.fullName && (
        <div className="hidden sm:block text-[11px] text-slate-500 max-w-[180px] truncate">
          📍 {venue.address?.city ?? venue.fullName}
        </div>
      )}
    </div>
  )
}
