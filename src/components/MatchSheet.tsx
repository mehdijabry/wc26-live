import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { teamBadgeFallback } from '../lib/utils'

/**
 * MatchSheet — modal opened by tapping any match card on the daily
 * schedule. Fetches ESPN's per-event summary endpoint, which works on
 * any valid league slug as long as the event id is correct.
 *
 * Renders:
 *  - Header with both teams, current score, status, kickoff, venue.
 *  - Live events timeline (goals · cards · subs) from competitions[0].details.
 *  - Team statistics (possession, shots, fouls, corners, …) from boxscore.
 *  - Lineups (rosters[].roster) when ESPN has them — usually revealed
 *    ~1h before kickoff for major matches.
 *
 * Auto-refreshes every 30s when the match is live, every 5min otherwise
 * (so pre-match lineups appear without manual reload). Stops polling on
 * close.
 */

type Competitor = {
  homeAway?: 'home' | 'away'
  team?: { id?: string; displayName?: string; shortDisplayName?: string; abbreviation?: string; logo?: string }
  score?: string | { displayValue?: string; value?: number }
  winner?: boolean
  statistics?: Array<{ name?: string; displayName?: string; abbreviation?: string; displayValue?: string }>
}

type EventDetail = {
  clock?: { displayValue?: string }
  type?: { text?: string; id?: string }
  team?: { id?: string }
  athletesInvolved?: Array<{ displayName?: string }>
  scoreValue?: number
  scoringPlay?: boolean
}

type Broadcast = {
  type?: { shortName?: string; longName?: string; slug?: string } // 'TV' / 'STREAMING' / 'RADIO'
  market?: { type?: string } // 'National' / 'Home' / 'Away'
  media?: { shortName?: string; name?: string; callLetters?: string }
  lang?: string
  region?: string
  isNational?: boolean
}

type SummaryResponse = {
  header?: {
    id?: string
    competitions?: Array<{
      date?: string
      venue?: { fullName?: string; address?: { city?: string; country?: string } }
      competitors?: Competitor[]
      status?: { displayClock?: string; period?: number; type?: { description?: string; completed?: boolean; state?: string } }
      details?: EventDetail[]
      broadcasts?: Broadcast[]
      notes?: Array<{ headline?: string; text?: string }>
    }>
    league?: { name?: string; abbreviation?: string }
    season?: { displayName?: string; slug?: string }
  }
  boxscore?: {
    teams?: Array<{
      team?: { id?: string; displayName?: string; logo?: string }
      statistics?: Array<{ name?: string; displayName?: string; abbreviation?: string; displayValue?: string }>
    }>
  }
  rosters?: Array<{
    team?: { id?: string; displayName?: string; logo?: string }
    roster?: Array<{
      starter?: boolean
      jersey?: string
      position?: { abbreviation?: string; displayName?: string }
      athlete?: { id?: string; displayName?: string; shortName?: string; headshot?: { href?: string } }
    }>
  }>
  gameInfo?: { venue?: { fullName?: string; address?: { city?: string; country?: string } } }
  broadcasts?: Broadcast[]
}

function scoreOf(c: Competitor | undefined): string {
  if (!c) return '–'
  const s = c.score
  if (typeof s === 'string') return s || '0'
  if (s && typeof s === 'object') return s.displayValue ?? String(s.value ?? 0)
  return '0'
}

export function MatchSheet({
  open,
  eventId,
  onClose,
}: {
  open: boolean
  eventId: string | undefined
  onClose: () => void
}) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !eventId) return
    let cancelled = false
    let timer: number | undefined
    setLoading(true)
    setError(null)

    async function load() {
      try {
        // Pass eng.1 as a stable placeholder league — ESPN serves the
        // event regardless. Cuts the need to map every event to its slug.
        const r = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=${eventId}`
        )
        if (!r.ok) throw new Error(`ESPN ${r.status}`)
        const j = (await r.json()) as SummaryResponse
        if (cancelled) return
        setData(j)
        // Decide refresh interval from status
        const status = j.header?.competitions?.[0]?.status?.type?.state
        const next = status === 'in' ? 30_000 : 300_000
        timer = window.setTimeout(load, next)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [open, eventId])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const comp = data?.header?.competitions?.[0]
  const home = comp?.competitors?.find((c) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c) => c.homeAway === 'away')
  const status = comp?.status
  const isLive = status?.type?.state === 'in'
  const isDone = status?.type?.completed
  const kickoff = comp?.date ? new Date(comp.date) : null
  const venue = comp?.venue?.fullName ?? data?.gameInfo?.venue?.fullName
  const venueLoc = comp?.venue?.address ?? data?.gameInfo?.venue?.address
  const events = comp?.details ?? []
  const stats = data?.boxscore?.teams ?? []
  const rosters = data?.rosters ?? []

  // Round / stake context for the badge in the hero. Two sources:
  //   - season.slug ('final', 'quarterfinals', etc.)
  //   - competition.notes[0].headline ('Matchday 5', '2nd Leg - X advance')
  const seasonSlug = data?.header?.season?.slug ?? ''
  const noteHead = comp?.notes?.[0]?.headline ?? comp?.notes?.[0]?.text ?? ''
  const roundLabel = deriveRoundLabel(seasonSlug, noteHead)

  // Broadcasts — top-level first (more complete on summary endpoint),
  // fall back to competition-level if missing. Dedupe by name/region.
  const allBroadcasts: Broadcast[] = [...(data?.broadcasts ?? []), ...(comp?.broadcasts ?? [])]
  const broadcasts = dedupeBroadcasts(allBroadcasts)

  const node = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm"
          />
          <motion.aside
            key="sheet"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className="fixed inset-x-2 sm:inset-x-4 z-[130] mx-auto max-w-3xl bg-paper rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
            }}
          >
            {/* Sticky top bar — kickoff date + close */}
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-paper">
              <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-slate-500 truncate">
                {kickoff ? kickoff.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                {venue && <span className="mx-2 text-slate-300">·</span>}
                {venue && <span className="text-slate-600">{venue}{venueLoc?.city ? ` · ${venueLoc.city}` : ''}</span>}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 w-9 h-9 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-xl leading-none"
              >×</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              {/* Hero score */}
              <div className="px-6 py-7 border-b border-slate-200">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <TeamColumn c={home} align="right" />
                  <div className="text-center">
                    {isLive ? (
                      <div className="text-[10px] uppercase tracking-widest font-mono text-red-500 flex items-center justify-center gap-1.5 mb-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                        </span>
                        Live · {status?.displayClock ?? "0'"}
                      </div>
                    ) : isDone ? (
                      <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">
                        {status?.type?.description ?? 'Full Time'}
                      </div>
                    ) : (
                      <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">
                        {kickoff ? kickoff.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Kickoff'}
                      </div>
                    )}
                    <div className="font-display font-black text-5xl sm:text-6xl tabular-nums leading-none">
                      {isLive || isDone ? (
                        <>
                          {scoreOf(home)}
                          <span className="mx-2 text-slate-300">–</span>
                          {scoreOf(away)}
                        </>
                      ) : (
                        <span className="text-slate-300">vs</span>
                      )}
                    </div>
                  </div>
                  <TeamColumn c={away} align="left" />
                </div>
                {(data?.header?.league?.name || roundLabel) && (
                  <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
                    {data?.header?.league?.name && (
                      <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500">
                        {data.header.league.name}
                      </span>
                    )}
                    {roundLabel && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 text-cream text-[10px] uppercase tracking-wider font-mono">
                          {roundLabel}
                        </span>
                      </>
                    )}
                    {noteHead && /aggregate|advance|win/i.test(noteHead) && (
                      <span className="basis-full text-center mt-2 text-xs text-accent-gold font-mono">
                        {noteHead}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Loading / error */}
              {loading && !data && (
                <div className="p-8 text-center text-sm text-slate-500">Loading match details…</div>
              )}
              {error && !data && (
                <div className="p-8 text-center text-sm text-slate-500">
                  Couldn&apos;t load this match. ESPN may not have detailed data published yet.
                </div>
              )}

              {/* Broadcast — where to watch. ESPN data is mostly US-centric
                  but we surface what they give us; users in other regions
                  see a note explaining their local broadcaster may differ. */}
              {broadcasts.length > 0 && (
                <Section title="Where to watch">
                  <div className="flex flex-wrap gap-2">
                    {broadcasts.map((b, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200/70"
                      >
                        <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                          {b.type?.shortName ?? 'TV'}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {b.media?.shortName ?? b.media?.name ?? b.media?.callLetters ?? '—'}
                        </span>
                        {b.region && b.region !== 'us' && (
                          <span className="text-[9px] font-mono uppercase text-slate-400">
                            {b.region}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-3 leading-relaxed">
                    Official broadcasters via ESPN — your local listings
                    may differ depending on your country and provider.
                  </div>
                </Section>
              )}

              {/* Events timeline */}
              {events.length > 0 && (
                <Section title="Match events">
                  <ul className="space-y-2">
                    {events.map((ev, i) => {
                      const isHome = ev.team?.id === home?.team?.id
                      return (
                        <li key={i} className="flex items-center gap-3 text-sm">
                          <span className="w-12 text-right font-mono text-slate-500 text-xs shrink-0">
                            {ev.clock?.displayValue ?? '—'}
                          </span>
                          <span className="shrink-0 w-5">{eventIcon(ev.type?.text)}</span>
                          <span className={'flex-1 truncate ' + (isHome ? 'text-left' : 'text-right')}>
                            {(ev.athletesInvolved ?? []).map((a) => a.displayName).join(', ') || ev.type?.text || '—'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </Section>
              )}

              {/* Stats */}
              {stats.length === 2 && stats[0].statistics?.length && stats[1].statistics?.length && (
                <Section title="Team stats">
                  <div className="space-y-2.5">
                    {(stats[0].statistics ?? []).slice(0, 12).map((s, i) => {
                      const homeStat = s
                      const awayStat = stats[1].statistics?.[i]
                      if (!awayStat) return null
                      const homeVal = parseFloat((homeStat.displayValue ?? '0').replace('%', '')) || 0
                      const awayVal = parseFloat((awayStat.displayValue ?? '0').replace('%', '')) || 0
                      const total = homeVal + awayVal || 1
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1">
                            <span className="text-slate-900 font-semibold">{homeStat.displayValue ?? '—'}</span>
                            <span className="uppercase tracking-wider">{s.displayName ?? s.abbreviation}</span>
                            <span className="text-slate-900 font-semibold">{awayStat.displayValue ?? '—'}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-200 flex overflow-hidden">
                            <div className="bg-marine-900" style={{ width: `${(homeVal / total) * 100}%` }} />
                            <div className="bg-accent-gold ml-auto" style={{ width: `${(awayVal / total) * 100}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}

              {/* Lineups */}
              {rosters.length === 2 && (rosters[0].roster?.length || rosters[1].roster?.length) ? (
                <Section title={isDone || isLive ? 'Lineups' : 'Predicted lineups'}>
                  <div className="grid grid-cols-2 gap-3">
                    {rosters.map((r) => (
                      <div key={r.team?.id}>
                        <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2 flex items-center gap-2">
                          {r.team?.logo && <img src={r.team.logo} alt="" className="w-4 h-4 object-contain" />}
                          {r.team?.displayName}
                        </div>
                        <ul className="space-y-1">
                          {(r.roster ?? []).filter((p) => p.starter).slice(0, 11).map((p) => (
                            <li key={p.athlete?.id} className="flex items-center gap-2 text-xs">
                              <span className="w-5 text-right font-mono text-slate-400 tabular-nums">{p.jersey ?? '—'}</span>
                              <span className="text-slate-400 text-[9px] w-7 font-mono">{p.position?.abbreviation}</span>
                              <span className="flex-1 truncate">{p.athlete?.shortName ?? p.athlete?.displayName}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : !loading && !isDone ? (
                <Section title="Predicted lineups">
                  <div className="text-xs text-slate-500 text-center py-4">
                    Lineups not announced yet. They&apos;re usually revealed about 1 hour before kickoff.
                  </div>
                </Section>
              ) : null}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(node, document.body)
}

function TeamColumn({ c, align }: { c: Competitor | undefined; align: 'left' | 'right' }) {
  if (!c) return <div />
  const logo = teamBadgeFallback(c.team?.logo, c.team?.abbreviation)
  return (
    <div className={'flex flex-col items-center gap-2 ' + (align === 'right' ? 'sm:items-end' : 'sm:items-start')}>
      {logo ? (
        <img src={logo} alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-contain" />
      ) : (
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-100" />
      )}
      <div className="text-center sm:text-inherit font-display font-bold text-sm sm:text-base text-slate-900">
        {c.team?.shortDisplayName ?? c.team?.displayName ?? '—'}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 sm:px-6 py-5 border-b border-slate-100 last:border-0">
      <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-accent-gold mb-3">
        {title}
      </div>
      {children}
    </div>
  )
}

function eventIcon(text: string | undefined): string {
  const t = (text ?? '').toLowerCase()
  if (t.includes('goal')) return '⚽'
  if (t.includes('yellow')) return '🟨'
  if (t.includes('red')) return '🟥'
  if (t.includes('sub')) return '🔁'
  if (t.includes('penalty')) return '🎯'
  return '•'
}

/**
 * Render-friendly round label from ESPN's season.slug + competition notes.
 * Mirrors roundContext() in lib/api.ts but returns just a string for
 * inline display in the MatchSheet hero.
 */
function deriveRoundLabel(seasonSlug: string, noteHeadline: string): string | null {
  const lower = (seasonSlug + ' ' + noteHeadline).toLowerCase()
  if (/^final$/.test(seasonSlug)) return 'Final'
  if (lower.includes('semifinal')) return 'Semifinal' + (legSuffix(noteHeadline) ?? '')
  if (lower.includes('quarterfinal') || seasonSlug === 'quarterfinals') return 'Quarterfinal' + (legSuffix(noteHeadline) ?? '')
  const r = /round[-\s]of[-\s](16|32|64)/i.exec(lower)
  if (r) return `Round of ${r[1]}` + (legSuffix(noteHeadline) ?? '')
  if (lower.includes('play-off') || lower.includes('playoff')) return 'Play-off' + (legSuffix(noteHeadline) ?? '')
  if (lower.includes('group-stage') || lower.includes('group stage')) {
    const md = /match[-\s]?day\s*(\d+)/i.exec(noteHeadline)
    return md ? `Group · MD ${md[1]}` : 'Group stage'
  }
  const md = /match[-\s]?day\s*(\d+)/i.exec(noteHeadline)
  if (md) return `Matchday ${md[1]}`
  if (lower.includes('qualifying')) return 'Qualifying round'
  return null
}
function legSuffix(head: string): string | null {
  const m = /(1st|2nd)\s+Leg/i.exec(head)
  return m ? ' · ' + m[1] + ' Leg' : null
}

/** De-duplicate broadcasts by media+region so we don't show 'Paramount+ Paramount+'. */
function dedupeBroadcasts(list: Broadcast[]): Broadcast[] {
  const seen = new Set<string>()
  const out: Broadcast[] = []
  for (const b of list) {
    const key = (b.media?.shortName ?? b.media?.name ?? '') + ':' + (b.region ?? '')
    if (key === ':' || seen.has(key)) continue
    seen.add(key)
    out.push(b)
  }
  return out
}
