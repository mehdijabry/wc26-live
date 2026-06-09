import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { teamBadgeFallback } from '../lib/utils'
import { broadcastersFor, broadcastersForMatch, countryToFlag, isMatchPaused, liveClock, type Broadcaster, type LiveBroadcaster } from '../lib/api'

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
  // ESPN encodes penalty shootout results on this field. Format is the
  // standard 'goals scored in the shootout' integer; both competitors
  // share the (X) tab next to the regular-time score.
  shootoutScore?: number | string
  statistics?: Array<{ name?: string; displayName?: string; abbreviation?: string; displayValue?: string }>
}

type EventDetail = {
  clock?: { displayValue?: string }
  type?: { text?: string; id?: string; type?: string }
  team?: { id?: string; displayName?: string }
  // ESPN keyEvents use 'participants' for goals — first entry is the
  // scorer, second (when present) is the assister. Cards / subs also
  // populate participants with the involved player(s).
  participants?: Array<{ athlete?: { id?: string; displayName?: string } }>
  // Friendlies / older endpoints sometimes use athletesInvolved instead.
  athletesInvolved?: Array<{ displayName?: string }>
  text?: string
  shortText?: string
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
      status?: { displayClock?: string; period?: number; type?: { description?: string; completed?: boolean; state?: string; detail?: string; shortDetail?: string } }
      details?: EventDetail[]
      broadcasts?: Broadcast[]
      notes?: Array<{ headline?: string; text?: string }>
    }>
    league?: { name?: string; abbreviation?: string }
    season?: { displayName?: string; slug?: string }
  }
  // ESPN summary puts the actual match timeline here, NOT under
  // header.competitions[0].details (which is almost always empty).
  keyEvents?: EventDetail[]
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
  competitionSlug,
  onClose,
}: {
  open: boolean
  eventId: string | undefined
  /** Resolved by tagEvent() in the caller — used for curated broadcaster lookup. */
  competitionSlug?: string
  onClose: () => void
}) {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveBroadcasts, setLiveBroadcasts] = useState<LiveBroadcaster[]>([])
  const [fetchedAt, setFetchedAt] = useState<number>(0)
  // 1-second ticker — drives the live clock display so the minute counts
  // up even between polling intervals (we poll every 30s, that's too slow
  // for a smooth in-match feel).
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!open || !eventId) return
    let cancelled = false
    let timer: number | undefined
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const r = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=${eventId}`
        )
        if (!r.ok) throw new Error(`ESPN ${r.status}`)
        const j = (await r.json()) as SummaryResponse
        if (cancelled) return
        setData(j)
        setFetchedAt(Date.now())
        const status = j.header?.competitions?.[0]?.status?.type?.state
        // 15s polling when live so halftime / FT transitions and goals
        // catch up fast. 5 min otherwise.
        const next = status === 'in' ? 15_000 : 300_000
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

  // 1s ticker — only runs while the match is in progress AND not paused.
  // Forces a re-render every second so the live clock derived from
  // fetchedAt advances on screen even between polls.
  useEffect(() => {
    if (!open) return
    const state = data?.header?.competitions?.[0]?.status?.type?.state
    const isPaused = isMatchPaused(data?.header?.competitions?.[0]?.status?.type?.detail)
    if (state !== 'in' || isPaused) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [open, data?.header?.competitions?.[0]?.status?.type?.state, data?.header?.competitions?.[0]?.status?.type?.detail])

  const comp = data?.header?.competitions?.[0]
  const home = comp?.competitors?.find((c) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c) => c.homeAway === 'away')

  // Once we have the summary, fire a parallel TheSportsDB lookup for the
  // real per-match broadcasters. Live (per-match) data takes priority
  // over the curated comp-level map.
  useEffect(() => {
    if (!open || !home?.team || !away?.team || !comp?.date) {
      setLiveBroadcasts([])
      return
    }
    let cancelled = false
    const homeName = home.team.displayName ?? home.team.shortDisplayName ?? ''
    const awayName = away.team.displayName ?? away.team.shortDisplayName ?? ''
    void broadcastersForMatch(homeName, awayName, comp.date).then((rows) => {
      if (!cancelled) setLiveBroadcasts(rows)
    })
    return () => { cancelled = true }
  }, [open, home?.team?.displayName, away?.team?.displayName, comp?.date])
  const status = comp?.status
  const isLive = status?.type?.state === 'in'
  const isDone = status?.type?.completed
  const kickoff = comp?.date ? new Date(comp.date) : null
  const venue = comp?.venue?.fullName ?? data?.gameInfo?.venue?.fullName
  const venueLoc = comp?.venue?.address ?? data?.gameInfo?.venue?.address
  // Match timeline lives at the top-level keyEvents on the summary
  // payload. Filter out the noise (kickoff / halftime / final whistle
  // texts) so the user only sees actionable plays.
  const rawEvents = data?.keyEvents ?? comp?.details ?? []
  const events = rawEvents.filter((ev) => {
    const t = (ev.type?.type ?? ev.type?.text ?? '').toLowerCase()
    return !/(kickoff|halftime|end\s+(?:of\s+)?(?:regular|game|first|second)|stoppage)/.test(t)
  })
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
                      // Live indicator. Detect halftime so we show 'HT' instead
                      // of a frozen '45+3''. For active play, derive the live
                      // minute from displayClock + elapsed time since fetch so
                      // the counter advances every second between polls.
                      (() => {
                        const isHT = isMatchPaused(status?.type?.detail)
                        const clockLabel = isHT ? 'HT' : liveClock(status?.displayClock ?? '', fetchedAt)
                        return (
                          <div className="text-[11px] uppercase tracking-widest font-mono text-red-500 flex items-center justify-center gap-1.5 mb-2 font-semibold">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                            </span>
                            {isHT ? 'Halftime' : 'Live'}
                            <span className="text-red-500/85 tabular-nums">· {clockLabel}</span>
                          </div>
                        )
                      })()
                    ) : isDone ? (
                      <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">
                        {status?.type?.description ?? 'Full Time'}
                        {/* Penalty shootout? show 'FT (PSO)' so the user knows
                            why the (X) parentheses appear next to the score. */}
                        {(home?.shootoutScore != null || away?.shootoutScore != null) && (
                          <span className="ml-1 text-accent-gold">· PSO</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">
                        {kickoff ? kickoff.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Kickoff'}
                      </div>
                    )}
                    <div className="font-display font-black text-5xl sm:text-6xl tabular-nums leading-none">
                      {isLive || isDone ? (
                        <>
                          <ScoreNumber c={home} other={away} />
                          <span className="mx-2 text-slate-300">–</span>
                          <ScoreNumber c={away} other={home} />
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

              {/* Diffusion — broadcasters grouped by country. Curated
                  rights map for major competitions (UCL, top 5 leagues,
                  WC, AFCON, etc.). For competitions outside the map
                  (Maurice Revello / Torneo Intermedio / friendlies),
                  we fall back to whatever ESPN exposes (US-centric).
                  The section ALWAYS appears when there's at least one
                  data point — no silently empty modal. */}
              <BroadcastSection
                competitionSlug={competitionSlug}
                espnBroadcasts={broadcasts}
                liveBroadcasts={liveBroadcasts}
              />


              {/* Events timeline — scorers (with assister in parentheses
                  when ESPN provides one), cards, substitutions, etc. */}
              {events.length > 0 && (
                <Section title="Match events">
                  <ul className="space-y-2">
                    {events.map((ev, i) => {
                      const isHome = ev.team?.id === home?.team?.id
                      const meta = describeEvent(ev)
                      return (
                        <li key={i} className={'flex items-center gap-3 text-sm ' + (isHome ? '' : 'flex-row-reverse text-right')}>
                          <span className="w-14 font-mono text-slate-500 text-xs shrink-0 text-center">
                            {ev.clock?.displayValue ?? '—'}
                          </span>
                          <span className="shrink-0 w-5 text-base">{eventIcon(ev.type?.type ?? ev.type?.text)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-slate-900 font-medium truncate">
                              {meta.primary}
                              {meta.secondary && (
                                <span className="text-slate-500 font-normal"> ({meta.secondary})</span>
                              )}
                            </div>
                            {meta.detail && (
                              <div className="text-[10px] text-slate-500 mt-0.5 truncate">{meta.detail}</div>
                            )}
                          </div>
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

/**
 * Renders the score number for one team with:
 *   - text-accent-green when this team won (regular time OR penalties)
 *   - text-accent-red   when this team lost
 *   - text-slate-500    on draw (or unknown winner)
 *   - PSO score in (X) tab next to the regular score when shootoutScore exists
 * Falls back to comparing numeric scores when the winner flag isn't set.
 */
function ScoreNumber({ c, other }: { c?: Competitor; other?: Competitor }) {
  if (!c) return <span>–</span>
  const score = scoreOf(c)
  const otherScore = scoreOf(other)
  const num = parseInt(score, 10)
  const oNum = parseInt(otherScore, 10)
  const draw = !isNaN(num) && !isNaN(oNum) && num === oNum && c.shootoutScore == null
  const won = c.winner === true || (c.winner == null && !draw && !isNaN(num) && !isNaN(oNum) && num > oNum)
  const lost = c.winner === false || (c.winner == null && !draw && !isNaN(num) && !isNaN(oNum) && num < oNum)
  const color = draw ? 'text-slate-500' : won ? 'text-accent-green' : lost ? 'text-accent-red' : 'text-slate-900'

  return (
    <span className={color}>
      {score}
      {c.shootoutScore != null && (
        <span className="text-[0.45em] align-top ml-0.5 font-mono tracking-tighter opacity-80">
          ({c.shootoutScore})
        </span>
      )}
    </span>
  )
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
  if (t.includes('own-goal') || t.includes('own goal')) return '🥅'
  if (t.includes('penalty') && t.includes('miss')) return '❌'
  if (t.includes('goal')) return '⚽'
  if (t.includes('yellow')) return '🟨'
  if (t.includes('red')) return '🟥'
  if (t.includes('sub')) return '🔁'
  if (t.includes('penalty')) return '🎯'
  if (t.includes('var')) return '📺'
  return '•'
}

/**
 * Turn an ESPN keyEvent into UI strings:
 *   - primary   = scorer / carded / subbed-in player
 *   - secondary = assister (for goals) or subbed-out player (for subs)
 *   - detail    = description suffix (e.g. 'header following a corner')
 *
 * For goals: participants[0] is the scorer, participants[1] (if present)
 * is the assister. Text often contains 'Assisted by X' which we use as
 * a fallback when participants only has one entry.
 *
 * For substitutions: text says 'Substitution, Team. PlayerIn replaces
 * PlayerOut.' — we parse both names.
 */
function describeEvent(ev: EventDetail): { primary: string; secondary?: string; detail?: string } {
  const type = (ev.type?.type ?? ev.type?.text ?? '').toLowerCase()
  const text = ev.text ?? ''
  const participants = ev.participants ?? []
  const athleteNames = participants.map((p) => p.athlete?.displayName).filter(Boolean) as string[]

  // GOAL — scorer + (assister)
  if (type.includes('goal')) {
    const scorer = athleteNames[0] ?? ev.athletesInvolved?.[0]?.displayName ?? 'Goal'
    let assister = athleteNames[1]
    if (!assister) {
      // Fallback: parse "Assisted by X" from the text
      const m = /Assisted by ([^.]+?)(?:\s+(?:with|following)|\.|$)/i.exec(text)
      if (m) assister = m[1].trim()
    }
    return { primary: scorer, secondary: assister }
  }

  // SUBSTITUTION — 'PlayerIn replaces PlayerOut'
  if (type.includes('sub')) {
    const m = /^Substitution, [^.]+\.\s*(.+?)\s+replaces\s+([^.]+)\./i.exec(text)
    if (m) {
      return { primary: m[1].trim(), secondary: m[2].trim(), detail: 'replaces' }
    }
    return { primary: athleteNames.join(' → ') || ev.type?.text || 'Substitution' }
  }

  // CARDS — player name + reason from text
  if (type.includes('yellow') || type.includes('red') || type.includes('card')) {
    const player = athleteNames[0] ?? ''
    const m = /shown the (?:yellow|red) card for (.+?)\./i.exec(text)
    return {
      primary: player || ev.type?.text || 'Card',
      detail: m ? m[1].trim() : undefined,
    }
  }

  // Generic fallback
  return {
    primary: athleteNames[0] ?? ev.type?.text ?? '—',
    detail: ev.shortText ?? undefined,
  }
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

/* -------------------------------------------------------------------------- */
/* Broadcasters section — curated 'Diffusion' card                            */
/* -------------------------------------------------------------------------- */

function BroadcastSection({
  competitionSlug,
  espnBroadcasts,
  liveBroadcasts,
}: {
  competitionSlug: string | undefined
  espnBroadcasts: Broadcast[]
  liveBroadcasts: LiveBroadcaster[]
}) {
  const curated = competitionSlug ? broadcastersFor(competitionSlug) : null

  // Merge live TheSportsDB per-match data with curated comp-level data.
  // Per-country: take ALL live broadcasters (most accurate, this match);
  // then add curated broadcasters for countries the live feed didn't cover.
  const liveByCountry: Record<string, LiveBroadcaster[]> = {}
  for (const lb of liveBroadcasts) {
    if (!liveByCountry[lb.country]) liveByCountry[lb.country] = []
    liveByCountry[lb.country].push(lb)
  }
  const haveLive = liveBroadcasts.length > 0
  const haveCurated = curated && curated.length > 0
  if (!haveLive && !haveCurated && espnBroadcasts.length === 0) return null

  // Build the unified row set
  type Row =
    | { source: 'live'; country: string; flag: string; name: string; items: LiveBroadcaster[] }
    | { source: 'curated'; country: string; flag: string; name: string; items: Broadcaster[] }
  const rows: Row[] = []
  const seenCountries = new Set<string>()

  // Live first (most accurate)
  for (const country of Object.keys(liveByCountry)) {
    rows.push({
      source: 'live',
      country,
      flag: countryToFlag(country),
      name: country,
      items: liveByCountry[country],
    })
    seenCountries.add(country.toLowerCase())
  }
  // Curated rows for countries not yet covered by live data
  if (curated) {
    for (const r of curated) {
      if (seenCountries.has(r.name.toLowerCase())) continue
      rows.push({
        source: 'curated',
        country: r.country,
        flag: r.flag,
        name: r.name,
        items: r.broadcasters,
      })
    }
  }

  return (
    <Section title="Diffusion · Where to watch">
      {rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="flex items-center gap-1.5 w-32 shrink-0">
                <span className="text-base leading-none">{row.flag}</span>
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 truncate">
                  {row.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {row.source === 'live'
                  ? row.items.map((lb, j) => <LiveChannelPill key={j} b={lb} />)
                  : row.items.map((b, j) => <BroadcasterPill key={j} b={b} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Last-resort ESPN feed when neither live nor curated has data
        <div className="flex flex-wrap gap-2">
          {espnBroadcasts.map((b, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200/70">
              <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                {b.type?.shortName ?? 'TV'}
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {b.media?.shortName ?? b.media?.name ?? '—'}
              </span>
              {b.region && <span className="text-[9px] font-mono uppercase text-slate-400">{b.region}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] font-mono text-slate-400 mt-3 leading-relaxed">
        {haveLive
          ? 'Live broadcast data via TheSportsDB. Local listings may still vary by provider.'
          : haveCurated
          ? '2025-26 rights — verify your provider for local listings.'
          : 'Provided by ESPN — local listings may vary.'}
      </div>
    </Section>
  )
}

function LiveChannelPill({ b }: { b: LiveBroadcaster }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-white border border-slate-200/70">
      {b.logo && (
        <img
          src={b.logo}
          alt=""
          className="w-4 h-4 object-contain shrink-0"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      <span className="font-semibold text-slate-900">{b.channel}</span>
    </div>
  )
}

function BroadcasterPill({ b }: { b: Broadcaster }) {
  return (
    <div className={
      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ' +
      (b.free
        ? 'bg-accent-green/10 border-accent-green/30 text-accent-green'
        : b.type === 'streaming'
          ? 'bg-accent-gold/10 border-accent-gold/30 text-marine-900'
          : 'bg-white border-slate-200/70 text-slate-900')
    }>
      <span className="text-[8px] font-mono uppercase tracking-wider opacity-60">
        {b.free ? 'FREE' : b.type === 'streaming' ? 'STREAM' : 'TV'}
      </span>
      <span className="font-semibold">{b.name}</span>
    </div>
  )
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
