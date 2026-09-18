import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, eventTeams, liveClock, statusLabel, ymdLocal, type DailyResponse, type EspnEvent } from '../lib/api'
import { useMatchOdds } from '../lib/useMatchOdds'
import { monogramBadge, teamBadgeFallback } from '../lib/utils'
import { useSiteSettings } from '../store/siteSettings'
import { localeOf, trLeague, useLang, useT } from '../lib/i18n'
import { MatchSheet } from './MatchSheet'

/**
 * Hero — "MATCH NIGHT" broadcast scoreboard.
 *
 * The most important match of the day, rendered like a stadium board:
 * giant Anton digits, live minute, venue line, pitch-circle backdrop.
 * Rotates through the top-3 featured matches (live first, then biggest
 * competition, then next kickoff) every 7s with a digit-flip transition.
 * Tapping the board opens the same MatchSheet modal used everywhere.
 * Data: the exact api.today() feed the board below uses.
 */

type Feat = { ev: EspnEvent; slug: string; label: string; tier: number }

// User rule (2026-08-25): the scoreboard carries ONLY the big stage —
// national-team tournaments, European club comps + qualifying, the Big 5,
// their major cups, strong Euro leagues and the big Americas/Saudi
// leagues (tier ≤ 13). Friendlies and everything smaller (2nd divisions,
// minor leagues, youth, women's tiers 30+) never reach the board. ALL
// qualifying matches rotate — not just three.
const MAJOR_TIER_MAX = 13
const EXCLUDED_SLUGS = new Set(['fifa.friendly', 'nonfifa', 'club.friendly'])

function pickFeatured(d: DailyResponse): Feat[] {
  const flat: Feat[] = []
  for (const c of d.competitions) {
    if (c.tier > MAJOR_TIER_MAX || EXCLUDED_SLUGS.has(c.slug)) continue
    for (const ev of c.events) flat.push({ ev, slug: c.slug, label: c.label, tier: c.tier })
  }
  const state = (f: Feat) => f.ev.status?.type?.state ?? 'pre'
  const w = (f: Feat) => (state(f) === 'in' ? 0 : state(f) === 'pre' ? 1 : 2)
  flat.sort((a, b) =>
    w(a) - w(b)
    || a.tier - b.tier
    || (a.ev.date ?? '').localeCompare(b.ev.date ?? ''))
  return flat
}

export function Hero() {
  return <HeroScoreboard home />
}

/**
 * The broadcast scoreboard itself — reused by the home page (with the
 * sr-only h1 + quick-jump CTAs) and by /today (board only).
 */
export function HeroScoreboard({ home = false }: { home?: boolean }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const wc26Visible = useSiteSettings((s) => s.wc26Visible)
  const [feats, setFeats] = useState<Feat[]>([])
  const [cur, setCur] = useState(0)
  const [flipping, setFlipping] = useState(false)
  const [fetchedAt, setFetchedAt] = useState(0)
  const [open, setOpen] = useState<{ id: string; slug: string } | null>(null)
  const [, tick] = useState(0)
  const reduced = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  // Load + refresh the day's feed (shares the browser-side league cache
  // with DailyMatches; one extra request per 60s while the hero is up).
  useEffect(() => {
    let stop = false
    let timer: number | undefined
    async function load() {
      try {
        const d = await api.today(ymdLocal(new Date()))
        if (stop) return
        setFeats(pickFeatured(d))
        setFetchedAt(Date.now())
      } catch { /* keep previous */ }
      timer = window.setTimeout(load, 60_000)
    }
    load()
    return () => { stop = true; if (timer) clearTimeout(timer) }
  }, [])

  // Carousel — digit-flip transition between featured matches.
  const go = (i: number) => {
    if (i === cur || feats.length === 0) return
    setFlipping(true)
    window.setTimeout(() => { setCur(i); setFlipping(false) }, 240)
  }
  const curRef = useRef(cur); curRef.current = cur
  const featsRef = useRef(feats); featsRef.current = feats
  useEffect(() => {
    if (reduced.current) return
    const id = window.setInterval(() => {
      const n = featsRef.current.length
      if (n > 1) {
        const next = (curRef.current + 1) % n
        setFlipping(true)
        window.setTimeout(() => { setCur(next); setFlipping(false) }, 240)
      }
    }, 7000)
    return () => clearInterval(id)
  }, [])

  // 1s ticker so a live minute advances between polls.
  useEffect(() => {
    const id = window.setInterval(() => tick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const f = feats[Math.min(cur, Math.max(0, feats.length - 1))]
  const view = useMemo(() => {
    if (!f) return null
    const { home, away } = eventTeams(f.ev)
    const s = statusLabel(f.ev)
    const comp = f.ev.competitions?.[0]
    const venue = comp?.venue
    const name = (c: typeof home) => c?.team?.shortDisplayName ?? c?.team?.displayName ?? '—'
    const logo = (c: typeof home) =>
      teamBadgeFallback(c?.team?.logo, c?.team?.abbreviation, name(c)) ?? monogramBadge(name(c))
    const score = (c: typeof home) => {
      const raw = (c as { score?: string | { displayValue?: string } } | undefined)?.score
      const v = typeof raw === 'string' ? raw : raw?.displayValue
      return s.live || s.finished ? (v ?? '0') : '–'
    }
    // Score colouring (user rule): winner green, loser red, level cream.
    const hs = score(home), as_ = score(away)
    let hCol = 'text-slate-900', aCol = 'text-slate-900'
    if ((s.live || s.finished) && hs !== '–' && as_ !== '–') {
      const hn2 = parseInt(hs, 10), an2 = parseInt(as_, 10)
      if (Number.isFinite(hn2) && Number.isFinite(an2) && hn2 !== an2) {
        hCol = hn2 > an2 ? 'text-accent-green' : 'text-red-400'
        aCol = an2 > hn2 ? 'text-accent-green' : 'text-red-400'
      }
    }
    return {
      label: f.label, live: s.live, finished: s.finished, paused: s.paused,
      preLabel: s.label, rawClock: s.rawClock,
      h: { n: name(home), l: logo(home), s: hs, col: hCol },
      a: { n: name(away), l: logo(away), s: as_, col: aCol },
      venue: venue?.fullName ? `${venue.fullName}${venue.address?.city ? ' · ' + venue.address.city : ''}` : null,
      kickoff: f.ev.date ? new Date(f.ev.date).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' }) : '',
    }
  }, [f, fetchedAt, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  // Odds live outside the memo: the hook polls the in-play feed on its own.
  const oddsView = useMatchOdds(f?.ev, f?.slug, fetchedAt)

  const digitCls =
    'font-display text-[64px] sm:text-[110px] leading-none min-w-[56px] sm:min-w-[92px] text-center ' +
    'rounded-2xl border border-slate-200/70 px-2 pt-1 sm:px-3 sm:pt-2 ' +
    'bg-gradient-to-b from-white/5 to-transparent [text-shadow:0_6px_30px_rgba(217,181,74,0.25)] ' +
    'transition-all duration-300 ' + (flipping ? 'opacity-0 -translate-y-3 scale-90' : '')

  return (
    <section id="hero" className="relative overflow-hidden py-10 sm:py-14 border-b border-slate-200/60">
      {/* pitch geometry backdrop */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] sm:w-[540px] sm:h-[540px] rounded-full border border-slate-200/50 opacity-60" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-slate-200/50 to-transparent" />

      <div className="container max-w-6xl mx-auto px-6 relative">
        {/* SEO h1 — home only; /today carries its own sr-only h1. DO NOT
            delete: the home went h1-less once and Google stopped
            indexing for 2 weeks. */}
        {home && (
          <h1 className="sr-only">
            Pressing 90’ — live football scores, results and news
          </h1>
        )}

        {view ? (
          <>
            <div className="flex items-center justify-center gap-3 font-mono text-[12px] tracking-[0.22em] uppercase text-accent-gold">
              {view.live && (
                <span className="flex items-center gap-2 text-red-500">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  {t('LIVE')}
                </span>
              )}
              <span>{trLeague(view.label, lang)}</span>
            </div>

            <button
              type="button"
              onClick={() => f && setOpen({ id: f.ev.id, slug: f.slug })}
              className="mt-6 w-full grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-7 cursor-pointer group"
              aria-label="Open match details"
            >
              <TeamSide n={view.h.n} logo={view.h.l} />
              <div>
                {/* MOBILE: each crest sits NEXT TO its own digit — with the
                    stacked layout (team above, team below) it was impossible
                    to tell which score belonged to whom. Desktop keeps the
                    broadcast layout (TeamSide columns left/right). */}
                <div className="flex items-center justify-between sm:justify-center gap-1 sm:gap-4 w-full">
                  <MobileSide n={view.h.n} logo={view.h.l} />
                  <span className={digitCls + ' ' + view.h.col}>{view.h.s}</span>
                  <span className="font-display text-accent-gold text-3xl sm:text-5xl -translate-y-1">–</span>
                  <span className={digitCls + ' ' + view.a.col}>{view.a.s}</span>
                  <MobileSide n={view.a.n} logo={view.a.l} />
                </div>
                <div className={'mt-3 text-center font-mono text-[13px] tracking-[0.14em] ' + (view.live ? 'text-red-500' : 'text-slate-500')}>
                  {view.live
                    ? (view.paused ? '● ' + t('HT') : '● ' + (liveClock(view.rawClock, fetchedAt) || 'LIVE'))
                    : view.finished ? t('FT') : t('KICK-OFF') + ' ' + view.kickoff}
                </div>
                {view.venue && (
                  <div className="mt-1.5 text-center font-mono text-[11px] text-slate-400 tracking-[0.06em]">
                    {view.venue}
                  </div>
                )}
                {oddsView && (
                  // 1X2 odds — pre-match, in-play (red dot), or greyed
                  // closing line once finished. dir=ltr so the order
                  // never mirrors in Arabic mode.
                  <div
                    dir="ltr"
                    className={'mt-2.5 flex items-center justify-center gap-1.5 font-mono text-[11px]' + (oddsView.mode === 'closing' ? ' opacity-50' : '')}
                    title={oddsView.odds.provider ? `Odds · ${oddsView.odds.provider}` : 'Odds'}
                  >
                    {oddsView.mode === 'live' && (
                      <span className="relative flex h-1.5 w-1.5" aria-label="Live odds">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
                      </span>
                    )}
                    {([['1', oddsView.odds.home], ['X', oddsView.odds.draw], ['2', oddsView.odds.away]] as const).map(([k, v]) => (
                      <span key={k} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200/60 bg-white/5 px-2 py-1">
                        <span className="text-slate-500">{k}</span>
                        <span className="text-slate-900 font-semibold tabular-nums">{v}</span>
                      </span>
                    ))}
                    <span className="text-[9px] text-slate-500">{oddsView.mode === 'closing' ? t('pre-match') : '18+'}</span>
                  </div>
                )}
              </div>
              <TeamSide n={view.a.n} logo={view.a.l} />
            </button>

            {feats.length > 1 && feats.length <= 8 && (
              <div className="mt-7 flex justify-center gap-2">
                {feats.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => go(i)}
                    aria-label={`Featured match ${i + 1}`}
                    className={'h-1 w-7 rounded-full transition-colors ' + (i === cur ? 'bg-accent-gold' : 'bg-slate-200 hover:bg-slate-300')}
                  />
                ))}
              </div>
            )}
            {feats.length > 8 && (
              <div className="mt-7 flex items-center justify-center gap-4">
                <button
                  onClick={() => go((cur - 1 + feats.length) % feats.length)}
                  aria-label={t('Previous featured match')}
                  className="w-9 h-9 rounded-full glass glass-hover flex items-center justify-center text-slate-600 hover:text-slate-900"
                >
                  ‹
                </button>
                <span className="font-mono text-[11px] tracking-[0.2em] text-slate-500 tabular-nums">
                  {cur + 1} / {feats.length}
                </span>
                <button
                  onClick={() => go((cur + 1) % feats.length)}
                  aria-label={t('Next featured match')}
                  className="w-9 h-9 rounded-full glass glass-hover flex items-center justify-center text-slate-600 hover:text-slate-900"
                >
                  ›
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="h-[220px] sm:h-[260px] rounded-2xl glass animate-pulse" />
        )}

        {/* quick jumps — home only */}
        {home && (
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <a href="#today" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors">
            {t("Today's matches ↓")}
          </a>
          <a href="#articles" className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass glass-hover text-sm font-semibold">
            {t('Articles ↓')}
          </a>
          {wc26Visible && (
            <Link to="/wc26" className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass glass-hover text-sm font-semibold">
              {t('WC26 archive →')}
            </Link>
          )}
        </div>
        )}
      </div>

      <MatchSheet
        open={!!open}
        eventId={open?.id}
        competitionSlug={open?.slug}
        onClose={() => setOpen(null)}
      />
    </section>
  )
}

/** Mobile-only team identity flanking its own score digit. */
function MobileSide({ n, logo }: { n: string; logo: string }) {
  return (
    <div className="sm:hidden flex flex-col items-center gap-1.5 w-[5.5rem] shrink-0 min-w-0">
      <img
        src={logo}
        alt=""
        className="w-16 h-16 object-contain drop-shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
        onError={(e) => { e.currentTarget.src = monogramBadge(n) }}
      />
      <div className="w-full text-center text-[13px] font-display tracking-wide text-slate-900 truncate leading-tight">
        {n}
      </div>
    </div>
  )
}

function TeamSide({ n, logo }: { n: string; logo: string }) {
  return (
    <div className="hidden sm:flex sm:flex-col items-center justify-center gap-3 sm:gap-4 text-center">
      <img
        src={logo}
        alt=""
        className="w-14 h-14 sm:w-20 sm:h-20 object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)] group-hover:scale-105 transition-transform"
        onError={(e) => { e.currentTarget.src = monogramBadge(n) }}
      />
      <div>
        <div className="font-display text-xl sm:text-2xl tracking-wide text-slate-900">{n}</div>
      </div>
    </div>
  )
}
