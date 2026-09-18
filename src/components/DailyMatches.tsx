import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api, competitionLogo, eventTeams, liveClock, roundContext, statusLabel, ymdLocal, type DailyResponse, type EspnEvent } from '../lib/api'
import { useMatchOdds } from '../lib/useMatchOdds'
import { monogramBadge, teamBadgeFallback } from '../lib/utils'
import { SectionHeader } from './Groups'
import { localeOf, trLeague, useLang, useT } from '../lib/i18n'
import { MatchSheet } from './MatchSheet'

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
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [offset, setOffset] = useState(0) // can go -∞ to +∞
  const [data, setData] = useState<DailyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSlugs, setActiveSlugs] = useState<Set<string> | null>(null) // null = all
  const [openMatch, setOpenMatch] = useState<{ id: string; slug: string } | null>(null)
  // When did we last receive ESPN data? Used by liveClock() to add the
  // elapsed minutes since the last poll so the on-screen minute ticks.
  const [fetchedAt, setFetchedAt] = useState<number>(0)
  // 1s tick to force re-renders so the live minute advances without a poll.
  const [, setTick] = useState(0)

  const date = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return d
  }, [offset])

  const dateLabel = useMemo(
    () =>
      date.toLocaleDateString(localeOf(lang), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [date, lang]
  )

  const dateShort = useMemo(
    () =>
      date.toLocaleDateString(localeOf(lang), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    [date, lang]
  )

  // Hold a ref to the live load() so the visibility / focus handlers
  // can trigger a fresh fetch without recreating the polling loop.
  const loadRef = useRef<() => void>(() => {})

  // Competition filter dropdown — closed on outside tap or Escape.
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!filterOpen) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [filterOpen])

  // Initial + poll loop.
  //
  // CRITICAL: the next-interval decision must be based on the FRESH
  // response, NOT the stale `data` from the closure. Previous version
  // read `data?.hasLive` here — on the very first call `data` was
  // still null (initial state), so the first re-poll was scheduled
  // 5 minutes away even when live matches WERE present. That's why
  // goals weren't appearing 'in real time' without a manual refresh.
  useEffect(() => {
    let stop = false
    let timer: number | undefined
    async function load() {
      let fresh: DailyResponse | null = null
      try {
        fresh = await api.today(ymdLocal(date))
        if (stop) return
        setData(fresh)
        setFetchedAt(Date.now())
      } catch {
        if (!stop) setData((prev) => prev)
      } finally {
        if (!stop) setLoading(false)
      }
      if (timer) clearTimeout(timer)
      // 8s when live → near real-time goal / clock updates.
      // 5min otherwise. Network/error path retries in 30s.
      const next = fresh
        ? (fresh.hasLive ? 8_000 : 300_000)
        : 30_000
      timer = window.setTimeout(load, next)
    }
    loadRef.current = load
    load()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [date])

  // 1s ticker — only spins while there's at least one live (and not
  // halftime-paused) match on screen, so we don't burn cycles when
  // nothing's happening.
  useEffect(() => {
    if (!data?.hasLive) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [data?.hasLive])

  // Force a fresh fetch when the user returns to the tab. Chrome
  // throttles setTimeout on background tabs (~once per minute), so
  // without this the user comes back to a 30-min-old scoreboard.
  // Debounced: don't bother if the last fetch was <5s ago.
  useEffect(() => {
    function onVisible() {
      if (document.hidden) return
      if (fetchedAt && Date.now() - fetchedAt < 5_000) return
      loadRef.current?.()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [fetchedAt])

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
          eyebrow={t('football today')}
          title={t('Every match, everywhere')}
        />

        {/* Day navigator — minimal: ‹ chevron · date (tappable date picker) · chevron ›.
            No glass box, no extra padding. Tap the date to jump to ANY day.
            'Jump to today' only surfaces when off-day, and it's a tiny pill. */}
        <div className="mt-8 flex items-center justify-center gap-4 sm:gap-6">
          <button
            onClick={() => setOffset((o) => o - 1)}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors shrink-0"
            aria-label={t('Previous day')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <label className="relative cursor-pointer text-center select-none">
            <div className="font-display font-bold text-lg sm:text-xl capitalize leading-tight whitespace-nowrap">
              {offset === 0 ? t('Today') : dateLabel}
            </div>
            <div className="mt-0.5 flex items-center justify-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <span className="text-slate-400 capitalize">{dateShort}</span>
              {offset !== 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setOffset(0) }}
                  className="text-accent-gold hover:underline"
                >
                  {t('· today ↺')}
                </button>
              )}
              {data?.hasLive && (
                <span className="flex items-center gap-1 text-red-500">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                  </span>
                  {t('live')}
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
            aria-label={t('Next day')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Match count — tiny, right-aligned below */}
        <div className="mt-2 text-[10px] font-mono text-slate-400 text-center">
          {data?.total ?? 0} {t(data?.total === 1 ? 'match' : 'matches')}
        </div>

        {/* Competition filter — compact dropdown. The old chip wall
            (one pill per competition, ~80 on a busy day) ate half the
            mobile viewport before the first match card. Multi-select is
            preserved: rows toggle, 'All' resets. */}
        {data && data.competitions.length > 0 && (
          <div className="mt-5 flex justify-center">
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
                className={
                  'inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono transition-colors ' +
                  (activeSlugs !== null
                    ? 'bg-slate-900 text-white'
                    : 'glass glass-hover text-slate-600')
                }
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M4 5h16l-6.4 7.5V19l-3.2-1.8v-4.7L4 5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                {t('Filter')}
                <span className={activeSlugs !== null ? 'opacity-80' : 'text-slate-400'}>
                  {activeSlugs === null
                    ? t('All')
                    : `${filteredComps.length}/${data.competitions.length}`}
                </span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className={'transition-transform ' + (filterOpen ? 'rotate-180' : '')}>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {filterOpen && (
                <div className="absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2 top-full mt-2 z-30 w-[min(20rem,88vw)] glass rounded-xl p-1.5 max-h-80 overflow-y-auto shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)]">
                  <button
                    onClick={() => { setActiveSlugs(null) }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-100 text-start transition-colors"
                  >
                    <span className={activeSlugs === null ? 'text-slate-900 font-semibold' : 'text-slate-600'}>
                      {t('All')}
                    </span>
                    {activeSlugs === null && <span className="text-accent-gold">✓</span>}
                  </button>
                  <div className="my-1 border-t border-slate-200/60" />
                  {data.competitions.map((c) => {
                    const isActive = activeSlugs === null || activeSlugs.has(c.slug)
                    return (
                      <button
                        key={c.slug}
                        onClick={() => toggleSlug(c.slug)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-100 text-start transition-colors"
                      >
                        <span className={'truncate ' + (isActive ? 'text-slate-900' : 'text-slate-500')}>
                          {trLeague(c.label, lang)}
                        </span>
                        {isActive && <span className="text-accent-gold shrink-0">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="mt-8 space-y-8">
          {loading && (
            <div className="glass rounded-2xl p-8 text-center text-slate-500">
              {t("Loading the day's matches…")}
            </div>
          )}
          {!loading && data && data.total === 0 && (
            <div className="glass rounded-2xl p-8 text-center text-slate-500">
              {t('No matches on')} {dateLabel}.<br />
              <span className="text-xs">{t('Use ← Previous or Next → to pick another day.')}</span>
            </div>
          )}

          {!loading &&
            filteredComps.map((comp) => (
              <CompetitionBlock
                key={comp.slug}
                comp={comp}
                fetchedAt={fetchedAt}
                onPick={(id) => setOpenMatch({ id, slug: comp.slug })}
              />
            ))}
        </div>
      </div>

      {/* Match detail modal — passes the comp slug so the Diffusion
          section can pull broadcasters from the curated rights map. */}
      <MatchSheet
        open={!!openMatch}
        eventId={openMatch?.id}
        competitionSlug={openMatch?.slug}
        onClose={() => setOpenMatch(null)}
      />
    </section>
  )
}

function CompetitionBlock({
  comp,
  fetchedAt,
  onPick,
}: {
  comp: { slug: string; label: string; tier: number; events: EspnEvent[] }
  fetchedAt: number
  onPick: (eventId: string) => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  if (!comp.events?.length) return null
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-slate-600 font-mono">
            {t('Football')}
          </div>
          <div className="font-display font-bold text-xl mt-0.5 flex items-center gap-2">
            {/* Official ESPN league logo when we have one, NOTHING otherwise.
                Per user instruction: 'soit tu mets les logos officiels …
                soit rien' — no emoji fallback. */}
            {competitionLogo(comp.slug) && (
              <img
                src={competitionLogo(comp.slug)!}
                alt=""
                className="w-7 h-7 object-contain shrink-0"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}
            <span className="truncate">{trLeague(comp.label, lang)}</span>
          </div>
        </div>
        <div className="text-xs font-mono text-slate-500 shrink-0 ml-3">
          {comp.events.length} {t(comp.events.length === 1 ? 'match' : 'matches')}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <AnimatePresence>
          {comp.events.map((ev) => (
            <MatchCard key={ev.id} ev={ev} slug={comp.slug} fetchedAt={fetchedAt} onPick={() => onPick(ev.id)} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

function scoreOf(c: unknown): number | null {
  const raw = (c as { score?: string | { displayValue?: string; value?: number } } | undefined)?.score
  const v = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? (raw.displayValue ?? String(raw.value ?? '')) : ''
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function MatchCard({ ev, slug, fetchedAt, onPick }: { ev: EspnEvent; slug: string; fetchedAt: number; onPick: () => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  // Score colouring (user rule): winner green, loser red, level neutral.
  const hs = scoreOf(home), as_ = scoreOf(away)
  let hCol = '', aCol = ''
  if ((s.live || s.finished) && hs !== null && as_ !== null && hs !== as_) {
    hCol = hs > as_ ? 'text-accent-green' : 'text-red-400'
    aCol = as_ > hs ? 'text-accent-green' : 'text-red-400'
  }
  const kickoff = ev.date
    ? new Date(ev.date).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })
    : ''
  const showScore = s.live || s.finished
  const round = roundContext(ev)
  const oddsView = useMatchOdds(ev, slug, fetchedAt)

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
      {/* Round / stake badge — only when ESPN gave us a clean round signal
          AND a non-empty label. User reported the knockout pill rendered
          as a 'black banner with no text' for Almería vs Castellón —
          the cause was 9px text-cream on slate-900 being technically
          present but visually unreadable at that size. Bumped the pill
          to 10.5px white-on-marine, added explicit min-width so very
          short labels (Final, etc.) still feel intentional, and
          short-circuited rendering when label.trim() comes back empty. */}
      {round && round.label.trim().length > 0 && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className={
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-mono font-semibold uppercase tracking-[0.08em] ' +
            (round.knockout
              // ink-900 = #0f172a (real defined colour). Was bg-marine-950
              // but 'marine' isn't in tailwind.config — the class silently
              // resolved to transparent, which is why the pill rendered
              // 'invisible' on the live site.
              ? 'bg-ink-900 text-white'
              : 'bg-slate-100 text-slate-700 border border-slate-200')
          }>
            {round.knockout && <span aria-hidden className="opacity-80">⚔</span>}
            {round.label}
          </span>
          {round.decisive && !s.finished && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-mono font-semibold uppercase tracking-[0.08em] bg-accent-red/15 text-accent-red border border-accent-red/30">
              <span aria-hidden>★</span> Do-or-die
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-2">
        <span>{kickoff}</span>
        {s.live ? (
          // 'LIVE · 87'' — minute ticked locally (liveClock) from the
          // last fetch so the on-card minute advances between polls.
          // Halftime = swap to 'HT' (handled by statusLabel).
          (() => {
            const minute = s.paused ? 'HT' : liveClock(s.rawClock, fetchedAt)
            return (
              <span className="flex items-center gap-1.5 text-red-500 font-semibold uppercase">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                </span>
                {s.paused ? t('HT') : t('Live')}
                {minute && minute.toUpperCase() !== 'LIVE' && !s.paused && (
                  <span className="text-red-500/80 tabular-nums">· {minute}</span>
                )}
              </span>
            )
          })()
        ) : s.finished ? (
          <span className="text-slate-500">{t('FT')}</span>
        ) : (
          <span className="text-slate-500">{t(s.label)}</span>
        )}
      </div>

      <div className="space-y-1.5">
        <TeamRow comp={home} showScore={showScore} scoreClass={hCol} />
        <TeamRow comp={away} showScore={showScore} scoreClass={aCol} />
      </div>

      {oddsView && (
        // 1X2 odds — pre-match, in-play (red dot), or the remembered
        // closing line greyed out on finished games. dir=ltr so the
        // 1/X/2 order never mirrors in Arabic mode.
        <div
          dir="ltr"
          className={'mt-2 flex items-center gap-1 font-mono text-[10px]' + (oddsView.mode === 'closing' ? ' opacity-50' : '')}
          title={oddsView.odds.provider ? `Odds · ${oddsView.odds.provider}` : 'Odds'}
        >
          {oddsView.mode === 'live' && (
            <span className="relative flex h-1.5 w-1.5 mx-0.5" aria-label="Live odds">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
          )}
          {([['1', oddsView.odds.home], ['X', oddsView.odds.draw], ['2', oddsView.odds.away]] as const).map(([k, v]) => (
            <span key={k} className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-slate-200/60 bg-slate-50 px-1.5 py-1">
              <span className="text-slate-500">{k}</span>
              <span className="text-slate-900 font-semibold tabular-nums">{v}</span>
            </span>
          ))}
          <span className="text-[8px] text-slate-500">{oddsView.mode === 'closing' ? t('pre-match') : '18+'}</span>
        </div>
      )}

      <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-[10px] font-mono text-accent-gold/80 flex items-center justify-end gap-1">
        {t('View stats →')}
      </div>
    </motion.button>
  )
}

function TeamRow({
  comp,
  showScore,
  scoreClass = '',
}: {
  comp: ReturnType<typeof eventTeams>['home']
  showScore: boolean
  scoreClass?: string
}) {
  if (!comp) return null
  const teamName = comp.team?.shortDisplayName ?? comp.team?.displayName
  const logo = teamBadgeFallback(comp.team?.logo, comp.team?.abbreviation, teamName)
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
          // Broken crest URL → swap to the generated monogram instead of
          // vanishing (data URIs can't themselves fail, no loop risk).
          onError={(e) => { e.currentTarget.src = monogramBadge(teamName ?? comp.team?.abbreviation ?? '?') }}
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
          (showScore ? 'text-xl w-7 ' + (scoreClass || 'text-slate-900') : 'text-base text-slate-400 w-7')
        }
      >
        {showScore ? score : '–'}
      </span>
    </div>
  )
}
