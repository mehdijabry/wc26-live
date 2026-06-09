import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { api, competitionFlag, eventTeams, roundContext, statusLabel, ymdLocal, type DailyResponse, type EspnEvent } from '../lib/api'
import { teamBadgeFallback } from '../lib/utils'
import { SectionHeader } from './Groups'
import { MatchSheet } from './MatchSheet'

const TIER_LABEL: Record<number, string> = {
  0: 'World stage',
  1: 'European cups',
  2: 'Top 5 leagues',
  3: 'Other leagues',
  4: 'Internationals',
}

/**
 * DailyMatches — the "every game everywhere" board.
 *
 * Date navigation: ← Previous · {date} · Next →. No bounds — the user
 * can scroll a week back, a month forward, etc. A subtle "Jump to
 * today" appears whenever the offset is not 0.
 *
 * Every match card is now a button → opens MatchSheet (portal modal)
 * with full stats, lineups, events timeline. Polled every 30s for live
 * matches. Lineups usually surface ~1h before kickoff (ESPN behaviour).
 *
 * Scoreline display: when a match is live or finished, the score is
 * rendered prominently (24px font, tabular-nums) so the user reads the
 * result at a glance instead of having to hunt for it. Previously
 * shipped 'FT' in tiny mono next to a 12px score, which the user
 * flagged as 'no score shown'.
 */

export function DailyMatches() {
  const [offset, setOffset] = useState(0) // can go -∞ to +∞
  const [data, setData] = useState<DailyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSlugs, setActiveSlugs] = useState<Set<string> | null>(null) // null = all
  const [openMatchId, setOpenMatchId] = useState<string | null>(null)

  const date = useMemo(() => {
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

  const dateShort = useMemo(
    () =>
      date.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
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

  // Tap the centre date to open a native date picker — lets the user
  // jump to ANY day in one gesture instead of clicking next/previous
  // 50 times. We hide the actual <input type="date"> behind the label
  // and translate the picked YYYY-MM-DD back into an offset from today.
  function onPickDate(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    if (!v) return
    const picked = new Date(v + 'T12:00:00')
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const days = Math.round((picked.getTime() - today.getTime()) / 86_400_000)
    setOffset(days)
  }

  return (
    <section id="today" className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="football today"
          title="Every match, everywhere"
          sub="Live scores from all major competitions — useful while you wait for World Cup kickoff. Tap any match for stats, lineups & timeline. Auto-refreshes every 30 seconds when matches are live."
        />

        {/* Day navigator — minimal: ‹ chevron · date (tappable date picker) · chevron ›.
            No glass box, no extra padding. Tap the date to jump to ANY day.
            'Jump to today' only surfaces when off-day, and it's a tiny pill. */}
        <div className="mt-8 flex items-center justify-center gap-4 sm:gap-6">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors shrink-0"
            aria-label="Previous day"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <label className="relative cursor-pointer text-center select-none">
            <div className="font-display font-bold text-lg sm:text-xl capitalize leading-tight whitespace-nowrap">
              {offset === 0 ? 'Today' : dateLabel}
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <span className="text-slate-400 capitalize">{dateShort}</span>
              {offset !== 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setOffset(0) }}
                  className="text-accent-gold hover:underline"
                >
                  · today ↺
                </button>
              )}
              {data?.hasLive && (
                <span className="flex items-center gap-1 text-red-500">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                  </span>
                  live
                </span>
              )}
            </div>
            {/* Native date input — visually hidden, opens on tap of the date label */}
            <input
              type="date"
              value={ymdLocal(date)}
              onChange={onPickDate}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Pick a date"
            />
          </label>

          <button
            onClick={() => setOffset((o) => o + 1)}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors shrink-0"
            aria-label="Next day"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Match count — tiny, right-aligned below */}
        <div className="mt-2 text-[10px] font-mono text-slate-400 text-center">
          {data?.total ?? 0} match{data?.total === 1 ? '' : 'es'}
        </div>

        {/* Competition filter chips */}
        {data && data.competitions.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveSlugs(null)}
              className={
                'px-3 py-1 rounded-full text-xs font-mono transition-colors ' +
                (activeSlugs === null
                  ? 'bg-slate-900 text-white'
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
                      ? 'bg-slate-900 text-white'
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
              Loading the day&apos;s matches…
            </div>
          )}
          {!loading && data && data.total === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-slate-500">
              No matches on {dateLabel}.<br />
              <span className="text-xs">Use ← Previous or Next → to pick another day.</span>
            </div>
          )}

          {!loading &&
            filteredComps.map((comp) => (
              <CompetitionBlock key={comp.slug} comp={comp} onPick={(id) => setOpenMatchId(id)} />
            ))}
        </div>
      </div>

      {/* Match detail modal */}
      <MatchSheet
        open={!!openMatchId}
        eventId={openMatchId ?? undefined}
        onClose={() => setOpenMatchId(null)}
      />
    </section>
  )
}

function CompetitionBlock({
  comp,
  onPick,
}: {
  comp: { slug: string; label: string; tier: number; events: EspnEvent[] }
  onPick: (eventId: string) => void
}) {
  if (!comp.events?.length) return null
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-slate-600 font-mono">
            {TIER_LABEL[comp.tier] ?? 'Football'}
          </div>
          <div className="font-display font-bold text-xl mt-0.5 flex items-center gap-2">
            <span className="text-2xl leading-none" aria-hidden>{competitionFlag(comp.slug)}</span>
            <span className="truncate">{comp.label}</span>
          </div>
        </div>
        <div className="text-xs font-mono text-slate-500 shrink-0 ml-3">
          {comp.events.length} match{comp.events.length === 1 ? '' : 'es'}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence>
          {comp.events.map((ev) => (
            <MatchCard key={ev.id} ev={ev} onPick={() => onPick(ev.id)} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function MatchCard({ ev, onPick }: { ev: EspnEvent; onPick: () => void }) {
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  const kickoff = ev.date
    ? new Date(ev.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : ''
  const showScore = s.live || s.finished
  const round = roundContext(ev)

  return (
    <motion.button
      type="button"
      onClick={onPick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={
        'glass rounded-xl p-3.5 relative text-left w-full hover:bg-white/80 active:scale-[0.99] transition ' +
        (s.live ? 'ring-1 ring-red-500/30' : '') +
        (round?.decisive && !s.finished ? ' ring-1 ring-accent-red/40' : '')
      }
      aria-label={`Open match details`}
    >
      {/* Round / stake badge — only when ESPN gave us a clean round signal.
          Knockout matches get a darker pill; decisive (one team eliminated
          if it loses) tags red so the user spots high-stakes fixtures. */}
      {round && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className={
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider ' +
            (round.knockout
              ? 'bg-slate-900 text-cream'
              : 'bg-slate-200 text-slate-700')
          }>
            {round.knockout && <span aria-hidden>⚔</span>}
            {round.label}
          </span>
          {round.decisive && !s.finished && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-accent-red/15 text-accent-red border border-accent-red/30">
              <span aria-hidden>★</span> Do-or-die
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-2">
        <span>{kickoff}</span>
        {s.live ? (
          // 'LIVE · 87'' — caller-friendly minute next to the LIVE label so
          // the user knows exactly where the match is. ESPN ships
          // displayClock as '87'' / 'HT' / '45+2'' etc; we show both.
          <span className="flex items-center gap-1.5 text-red-500 font-semibold uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            Live
            {s.label && s.label.toUpperCase() !== 'LIVE' && (
              <span className="text-red-500/80 tabular-nums">· {s.label}</span>
            )}
          </span>
        ) : s.finished ? (
          <span className="text-slate-500">FT</span>
        ) : (
          <span className="text-slate-500">{s.label}</span>
        )}
      </div>

      <div className="space-y-1.5">
        <TeamRow comp={home} showScore={showScore} />
        <TeamRow comp={away} showScore={showScore} />
      </div>

      <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-[10px] font-mono text-accent-gold/80 flex items-center justify-end gap-1">
        View stats <span aria-hidden>→</span>
      </div>
    </motion.button>
  )
}

function TeamRow({
  comp,
  showScore,
}: {
  comp: ReturnType<typeof eventTeams>['home']
  showScore: boolean
}) {
  if (!comp) return null
  const logo = teamBadgeFallback(comp.team?.logo, comp.team?.abbreviation)
  // Score can be a string ("2") on /scoreboard or an object ({value, displayValue})
  // on /schedule. Handle both so finished matches always show a number.
  const rawScore = (comp as { score?: string | { displayValue?: string; value?: number } }).score
  const score = typeof rawScore === 'string'
    ? rawScore
    : rawScore && typeof rawScore === 'object'
      ? (rawScore.displayValue ?? String(rawScore.value ?? 0))
      : '0'
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
      <span className="flex-1 text-sm truncate text-slate-900">
        {comp.team?.shortDisplayName ?? comp.team?.displayName ?? '—'}
      </span>
      <span
        className={
          'font-display font-bold tabular-nums text-right ' +
          (showScore ? 'text-xl text-slate-900 w-7' : 'text-base text-slate-400 w-7')
        }
      >
        {showScore ? score : '–'}
      </span>
    </div>
  )
}
