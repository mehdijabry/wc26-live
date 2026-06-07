import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { matches, type Match } from '../data/matches'
import { stadiums } from '../data/stadiums'
import { teamByCode } from '../data/teams'
import { userTimezone, cn } from '../lib/utils'
import { SectionHeader } from './Groups'

const TZ_LABELS: Record<string, string> = {
  Europe: '🇪🇺',
  America: '🌎',
  Asia: '🌏',
  Africa: '🌍',
  Australia: '🇦🇺',
  Pacific: '🌊',
}

export function Schedule() {
  const tz = userTimezone()
  const tzZone = tz.split('/')[0]
  const [filter, setFilter] = useState<'all' | 'group' | 'ko'>('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return matches
    if (filter === 'group') return matches.filter((m) => m.stage === 'group')
    return matches.filter((m) => m.stage !== 'group')
  }, [filter])

  // Group by date
  const byDate = useMemo(() => {
    const m = new Map<string, Match[]>()
    filtered.forEach((match) => {
      const date = new Date(match.kickoffUTC).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
      const arr = m.get(date) ?? []
      arr.push(match)
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

        <div className="flex flex-wrap gap-2 mt-8 mb-8">
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
              {f === 'all' ? 'All matches' : f === 'group' ? 'Group stage' : 'Knockouts'}
            </button>
          ))}
        </div>

        <div className="space-y-8">
          {Array.from(byDate.entries()).map(([date, ms], idx) => (
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
                {ms.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function MatchRow({ match }: { match: Match }) {
  const home = teamByCode(match.home)
  const away = teamByCode(match.away)
  const stadium = stadiums.find((s) => s.id === match.stadium)
  const time = new Date(match.kickoffUTC).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="glass glass-hover rounded-xl px-4 py-3 flex items-center gap-4">
      <div className="font-mono text-xs text-slate-500 w-14 tabular-nums">{time}</div>

      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center gap-2 justify-end text-right min-w-0">
          <span className="truncate text-sm">{home?.name ?? match.home}</span>
          <span className="text-xl">{home?.flag ?? '🏳️'}</span>
        </div>
        <div className="px-3 py-1 rounded-md bg-ink-900/50 text-[10px] font-mono text-slate-500">
          {match.stage === 'group'
            ? `Group ${match.group}`
            : match.stage.toUpperCase()}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl">{away?.flag ?? '🏳️'}</span>
          <span className="truncate text-sm">{away?.name ?? match.away}</span>
        </div>
      </div>

      <div className="hidden sm:block text-[11px] text-slate-500 max-w-[180px] truncate">
        📍 {stadium?.city}, {stadium?.country}
      </div>
    </div>
  )
}
