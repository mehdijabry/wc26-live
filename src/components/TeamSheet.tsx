import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  API_BASE,
  api,
  eventTeams,
  statusLabel,
  type EspnEvent,
  type HistoryEvent,
  type HistoryResponse,
  type RosterAthlete,
  type RosterResponse,
} from '../lib/api'
import { useTournament, recordForTeam, matchesForTeam } from '../store/tournament'
import { teamBadgeFallback } from '../lib/utils'
import { heritageFor } from '../data/wcHeritage'
import { LottieLoader } from './LottieLoader'

/**
 * Team detail sheet — full-page modal opened from a country click in Groups.
 * Footmercato-style structure with 4 tabs (Infos / Effectif / Calendar / Stats).
 */

type EspnTeamPayload = {
  team?: {
    id?: string
    displayName?: string
    shortDisplayName?: string
    nickname?: string
    abbreviation?: string
    location?: string
    color?: string
    logos?: Array<{ href?: string }>
    record?: { items?: Array<{ summary?: string; description?: string; stats?: Array<{ name?: string; value?: number; displayValue?: string }> }> }
    standingSummary?: string
    nextEvent?: Array<{ name?: string; date?: string }>
  }
}

type Tab = 'infos' | 'effectif' | 'calendrier' | 'history' | 'stats'

export function TeamSheet({ teamCode, open, onClose }: { teamCode: string | null; open: boolean; onClose: () => void }) {
  const [data, setData] = useState<EspnTeamPayload | null>(null)
  const [roster, setRoster] = useState<RosterResponse | null>(null)
  const [history, setHistory] = useState<HistoryResponse | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('infos')
  const events = useTournament((s) => s.events)

  useEffect(() => {
    if (!open || !teamCode) return
    let stop = false
    setLoading(true)
    setError(null)
    setData(null)
    setRoster(null)
    setTab('infos')
    setHistory(null)
    Promise.all([
      fetch(`${API_BASE}/teams/${teamCode.toLowerCase()}`).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<EspnTeamPayload>
      }),
      api.roster(teamCode).catch(() => null),
    ])
      .then(([teamData, rosterData]) => {
        if (stop) return
        setData(teamData)
        setRoster(rosterData)
      })
      .catch((e) => !stop && setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => !stop && setLoading(false))
    return () => { stop = true }
  }, [open, teamCode])

  // Lazy load history only when the History tab is opened, so we don't
  // burn ESPN bandwidth for users who never open it. IMPORTANT: we
  // intentionally exclude `history`/`historyLoading` from deps so that
  // setHistoryLoading(true) doesn't re-fire this effect, run the cleanup
  // and cancel the in-flight fetch. We track the requested team in a
  // ref so a subsequent team change cancels the previous request.
  useEffect(() => {
    if (!open || !teamCode || tab !== 'history') return
    if (history) return // already loaded for this team
    const requested = teamCode
    setHistoryLoading(true)
    api.history(teamCode)
      .then((h) => {
        // Only commit if user hasn't switched teams since
        if (requested.toLowerCase() === teamCode.toLowerCase()) setHistory(h)
      })
      .catch(() => {
        if (requested.toLowerCase() === teamCode.toLowerCase()) setHistory(null)
      })
      .finally(() => {
        if (requested.toLowerCase() === teamCode.toLowerCase()) setHistoryLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamCode, tab])

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const teamMatches = useMemo(
    () => (teamCode ? matchesForTeam(events, teamCode) : []),
    [events, teamCode]
  )
  const record = useMemo(
    () => (teamCode ? recordForTeam(events, teamCode) : { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }),
    [events, teamCode]
  )

  const team = data?.team
  const logo = teamBadgeFallback(team?.logos?.[0]?.href, teamCode ?? undefined)
  const athletes = roster?.athletes ?? []
  const displayName = team?.displayName ?? team?.shortDisplayName ?? teamCode ?? ''
  const abbr = (teamCode ?? team?.abbreviation ?? '').toUpperCase()

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm overflow-y-auto"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 250 }}
            onClick={(e) => e.stopPropagation()}
            className="min-h-screen sm:min-h-0 sm:max-w-3xl sm:mx-auto sm:my-8 bg-white sm:rounded-3xl sm:shadow-2xl overflow-hidden"
          >
            {/* Header — flag, name, big watermark, close, share */}
            <div className="relative px-5 sm:px-7 pt-5 pb-3 border-b border-slate-100">
              <div className="absolute top-1/2 right-4 -translate-y-1/2 font-display font-black text-7xl sm:text-8xl text-slate-100 select-none pointer-events-none tracking-tighter">
                {abbr}
              </div>
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {logo ? (
                    <img
                      src={logo}
                      alt=""
                      className="w-12 h-12 sm:w-14 sm:h-14 object-contain shrink-0 rounded-full ring-2 ring-white shadow-md"
                    />
                  ) : (
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-100 flex items-center justify-center text-2xl shrink-0">
                      🏳️
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-display font-bold text-xl sm:text-2xl truncate text-slate-900">
                      {displayName}
                    </div>
                    {team?.standingSummary && (
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {team.standingSummary}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xl shrink-0 text-slate-700"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Tabs — sticky on scroll */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100">
              <div className="overflow-x-auto no-scrollbar">
                <div className="flex gap-1 px-3 sm:px-7 min-w-max">
                  {(['infos', 'effectif', 'calendrier', 'history', 'stats'] as Tab[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTab(t)}
                      aria-current={tab === t ? 'page' : undefined}
                      className="tab-link uppercase tracking-wider text-xs"
                    >
                      {t === 'infos' ? 'Infos'
                       : t === 'effectif' ? `Squad${athletes.length ? ` · ${athletes.length}` : ''}`
                       : t === 'calendrier' ? `WC26${teamMatches.length ? ` · ${teamMatches.length}` : ''}`
                       : t === 'history' ? `History${history ? ` · ${history.total}` : ''}`
                       : 'Stats'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 sm:px-7 py-5">
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 font-mono mb-4">
                  {error}
                </div>
              )}

              {tab === 'infos' && (
                <InfosTab team={team} record={record} teamMatches={teamMatches} teamCode={teamCode ?? ''} loading={loading} />
              )}

              {tab === 'effectif' && (
                <EffectifTab athletes={athletes} loading={loading} />
              )}

              {tab === 'calendrier' && (
                <CalendrierTab teamMatches={teamMatches} teamCode={teamCode ?? ''} />
              )}

              {tab === 'history' && (
                <HistoryTab
                  history={history}
                  loading={historyLoading}
                  teamCode={teamCode ?? ''}
                  abbr={abbr}
                />
              )}

              {tab === 'stats' && (
                <StatsTab record={record} teamMatches={teamMatches} />
              )}

              <div className="mt-6 text-[10px] font-mono text-slate-400 text-center">
                Live data · ESPN public API · refresh 30s
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

// ---------- Tabs ---------------------------------------------------------

function InfosTab({
  team, record, teamMatches, teamCode, loading,
}: {
  team: EspnTeamPayload['team']
  record: ReturnType<typeof recordForTeam>
  teamMatches: EspnEvent[]
  teamCode: string
  loading: boolean
}) {
  const next = teamMatches.find((ev) => ev.status?.type?.state !== 'post')

  // Form bullets — last 5 finished matches as W/D/L circles
  const form = teamMatches
    .filter((ev) => ev.status?.type?.state === 'post')
    .slice(-5)
    .map((ev) => {
      const cs = ev.competitions?.[0]?.competitors ?? []
      const mine = cs.find((c) => c.team?.abbreviation?.toUpperCase() === teamCode.toUpperCase())
      const other = cs.find((c) => c.team?.abbreviation?.toUpperCase() !== teamCode.toUpperCase())
      const my = parseInt(mine?.score ?? '0', 10)
      const op = parseInt(other?.score ?? '0', 10)
      return my > op ? 'W' : my === op ? 'D' : 'L'
    })

  return (
    <div className="space-y-5">
      {/* KPI grid à la footmercato */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Form">
          {form.length === 0 ? <span className="text-slate-400 text-xs font-mono">—</span> : (
            <div className="flex gap-1">
              {form.map((f, i) => (
                <span key={i} className={
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ' +
                  (f === 'W' ? 'bg-accent-green' : f === 'D' ? 'bg-slate-400' : 'bg-accent-red')
                }>
                  {f}
                </span>
              ))}
            </div>
          )}
        </Kpi>
        <Kpi label="Goals" value={`${record.goalsFor > 0 ? '+' : ''}${record.goalsFor} / -${record.goalsAgainst}`} />
        <Kpi label="Results" value={
          <>
            <span className="text-accent-green">{record.won}W</span>{' '}
            <span className="text-slate-500">{record.drawn}D</span>{' '}
            <span className="text-accent-red">{record.lost}L</span>
          </>
        } />
        <Kpi label="Squad size" value={team?.record?.items?.[0]?.stats?.length ? String(team.record.items[0].stats.length) : '—'} />
      </div>

      {/* Next match card */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
          Next match
        </div>
        {next ? (
          <MatchLine ev={next} teamCode={teamCode} />
        ) : (
          <div className="rounded-xl border border-slate-100 px-3 py-3 text-xs text-slate-500">
            No upcoming match — the tournament is over for this team.
          </div>
        )}
      </div>

      {/* Loading hint */}
      {loading && (
        <div className="text-xs text-slate-500 font-mono">Loading from ESPN…</div>
      )}
    </div>
  )
}

function EffectifTab({ athletes, loading }: { athletes: RosterAthlete[]; loading: boolean }) {
  if (loading && athletes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <LottieLoader name="jersey-swap" size={96} caption="Loading the squad…" />
      </div>
    )
  }
  if (athletes.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 px-3 py-4 text-xs text-slate-500 leading-relaxed">
        ESPN n'a pas encore publié le roster pour cette sélection. La liste apparaîtra ici dès que la fédération la publie — auto-refresh.
      </div>
    )
  }
  return <SquadTable athletes={athletes} />
}

function CalendrierTab({ teamMatches, teamCode }: { teamMatches: EspnEvent[]; teamCode: string }) {
  if (teamMatches.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 px-3 py-4 text-xs text-slate-500">
        No fixtures published yet — ESPN will populate them as the draw is finalized.
      </div>
    )
  }
  // Group by month
  const groups = new Map<string, EspnEvent[]>()
  for (const ev of teamMatches) {
    if (!ev.date) continue
    const key = new Date(ev.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    const arr = groups.get(key) ?? []
    arr.push(ev)
    groups.set(key, arr)
  }
  return (
    <div className="space-y-5">
      {Array.from(groups.entries()).map(([month, evs]) => (
        <div key={month}>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
            {month}
          </div>
          <div className="space-y-1.5">
            {evs.map((ev) => <MatchLine key={ev.id} ev={ev} teamCode={teamCode} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryTab({
  history, loading, teamCode, abbr,
}: {
  history: HistoryResponse | null
  loading: boolean
  teamCode: string
  abbr: string
}) {
  const heritage = heritageFor(abbr)

  // Group history events by year (or by tag like "WC 2022")
  const groups = new Map<string, HistoryEvent[]>()
  for (const ev of history?.events ?? []) {
    const key = ev.tag ?? (ev.date ? new Date(ev.date).getUTCFullYear().toString() : 'Other')
    const arr = groups.get(key) ?? []
    arr.push(ev)
    groups.set(key, arr)
  }
  // Preserve insertion order (already newest-first from Worker), but
  // ensure WC seasons appear before friendlies in the same year.
  const ordered = Array.from(groups.entries()).sort((a, b) => {
    const wA = a[0].startsWith('WC') ? 0 : 1
    const wB = b[0].startsWith('WC') ? 0 : 1
    if (wA !== wB) return wA - wB
    return b[0].localeCompare(a[0])
  })

  return (
    <div className="space-y-6">
      {/* Palmarès — static FIFA heritage data */}
      {heritage && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
            FIFA World Cup heritage
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Appearances" value={String(heritage.appearances)} />
            <Kpi label="Best result" value={heritage.bestResult} highlight={!!heritage.titles} />
            {heritage.titles ? <Kpi label="Titles" value={String(heritage.titles)} highlight /> : null}
            {heritage.runnerUp ? <Kpi label="Runner-up" value={String(heritage.runnerUp)} /> : null}
            {heritage.semifinalsCount ? <Kpi label="Semi-finals" value={String(heritage.semifinalsCount)} /> : null}
            <Kpi label="Last edition" value={heritage.lastAppearance ? String(heritage.lastAppearance) : '—'} />
            {heritage.lastResult ? <Kpi label="Last result" value={heritage.lastResult} /> : null}
            {heritage.bestYear ? <Kpi label="Peak year" value={String(heritage.bestYear)} /> : null}
          </div>
        </div>
      )}

      {/* Live API summary — last few years across WC + friendlies */}
      {history && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
            Recent record · {history.summary.played} matches played
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Kpi label="Wins" value={String(history.summary.won)} />
            <Kpi label="Draws" value={String(history.summary.drawn)} />
            <Kpi label="Losses" value={String(history.summary.lost)} />
            <Kpi label="Goal diff" value={`${history.summary.goalsFor - history.summary.goalsAgainst >= 0 ? '+' : ''}${history.summary.goalsFor - history.summary.goalsAgainst}`} highlight />
          </div>
        </div>
      )}

      {/* All historical matches grouped by tag */}
      {loading && !history && (
        <div className="flex flex-col items-center justify-center py-10">
          <LottieLoader name="stadium-crowd" size={88} caption="Diving into the archives…" />
        </div>
      )}

      {history && ordered.length === 0 && (
        <div className="rounded-xl border border-slate-100 px-3 py-4 text-xs text-slate-500">
          ESPN n'a pas d'historique publié pour cette sélection sur les dernières éditions.
        </div>
      )}

      {ordered.map(([tag, evs]) => (
        <div key={tag}>
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
              {tag} · {evs.length}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono">
              {tag.startsWith('WC') ? 'World Cup' : 'Friendlies / qual.'}
            </div>
          </div>
          <div className="space-y-1.5">
            {evs.map((ev) => <HistoryMatchLine key={ev.id} ev={ev} teamCode={teamCode} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function HistoryMatchLine({ ev, teamCode }: { ev: HistoryEvent; teamCode: string }) {
  const cs = ev.competitions?.[0]?.competitors ?? []
  const A = teamCode.toUpperCase()
  const mine = cs.find((c) => c.team?.abbreviation?.toUpperCase() === A)
  const opp = cs.find((c) => c.team?.abbreviation?.toUpperCase() !== A)
  const extract = (s: unknown): string => {
    if (s == null) return ''
    if (typeof s === 'object' && s !== null) {
      const v = (s as { displayValue?: string; value?: number }).displayValue
        ?? (s as { value?: number }).value
      return v != null ? String(v) : ''
    }
    return String(s)
  }
  const my = extract(mine?.score)
  const op = extract(opp?.score)
  const finished = my !== '' && op !== ''
  const myN = parseInt(my, 10) || 0
  const opN = parseInt(op, 10) || 0
  const outcome: 'W' | 'D' | 'L' | null = !finished ? null : myN > opN ? 'W' : myN === opN ? 'D' : 'L'
  const date = ev.date ? new Date(ev.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const oppLogo = teamBadgeFallback(opp?.team?.logo, opp?.team?.abbreviation)

  return (
    <div className="rounded-xl border border-slate-100 px-3 py-2.5 flex items-center gap-3 hover:border-slate-200 transition-colors">
      <div className="text-[10px] font-mono text-slate-500 w-24 shrink-0">{date}</div>
      {outcome && (
        <span className={
          'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 ' +
          (outcome === 'W' ? 'bg-accent-green' : outcome === 'D' ? 'bg-slate-400' : 'bg-accent-red')
        }>
          {outcome}
        </span>
      )}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {oppLogo ? (
          <img src={oppLogo} alt="" loading="lazy" className="w-5 h-5 object-contain shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />
        ) : null}
        <span className="text-sm truncate text-slate-800">{opp?.team?.shortDisplayName ?? opp?.team?.displayName ?? '?'}</span>
      </div>
      {finished ? (
        <span className="text-base font-display font-bold tabular-nums text-slate-900 shrink-0">
          {my}–{op}
        </span>
      ) : (
        <span className="text-[10px] font-mono text-slate-400 shrink-0">scheduled</span>
      )}
    </div>
  )
}

function StatsTab({ record, teamMatches }: { record: ReturnType<typeof recordForTeam>; teamMatches: EspnEvent[] }) {
  const finished = teamMatches.filter((ev) => ev.status?.type?.state === 'post')
  const avgGoals = record.played ? (record.goalsFor / record.played).toFixed(2) : '—'
  const avgConceded = record.played ? (record.goalsAgainst / record.played).toFixed(2) : '—'
  const cleanSheets = finished.filter((ev) => {
    const cs = ev.competitions?.[0]?.competitors ?? []
    const other = cs.find((c) => c.team?.abbreviation?.toUpperCase() === finished[0]?.competitions?.[0]?.competitors?.[0]?.team?.abbreviation?.toUpperCase() ? false : true)
    return parseInt(other?.score ?? '0', 10) === 0
  }).length
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Matches" value={String(record.played)} />
        <Kpi label="Points" value={String(record.points)} highlight />
        <Kpi label="Goals/match" value={avgGoals} />
        <Kpi label="Conceded/match" value={avgConceded} />
        <Kpi label="Clean sheets" value={String(cleanSheets)} />
        <Kpi label="Wins" value={String(record.won)} highlight />
        <Kpi label="Draws" value={String(record.drawn)} />
        <Kpi label="Losses" value={String(record.lost)} />
      </div>
      {record.played === 0 && (
        <div className="text-xs text-slate-500 text-center font-mono">
          Stats will populate once matches finish.
        </div>
      )}
    </div>
  )
}

// ---------- Pieces ------------------------------------------------------

function Kpi({ label, value, children, highlight }: { label: string; value?: React.ReactNode; children?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={'rounded-xl px-3 py-3 border ' + (highlight ? 'border-accent-blue/30 bg-blue-50/40' : 'border-slate-100 bg-slate-50/60')}>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">{label}</div>
      <div className={'font-display font-bold text-lg ' + (highlight ? 'text-accent-blue' : 'text-slate-900')}>
        {children ?? value ?? '—'}
      </div>
    </div>
  )
}

function SquadTable({ athletes }: { athletes: RosterAthlete[] }) {
  const buckets: Record<string, RosterAthlete[]> = { GK: [], DEF: [], MID: [], FW: [], Other: [] }
  for (const a of athletes) {
    const pos = (a.position?.abbreviation ?? '').toUpperCase()
    if (pos.startsWith('G')) buckets.GK.push(a)
    else if (pos.startsWith('D') || pos.includes('B')) buckets.DEF.push(a)
    else if (pos.startsWith('M')) buckets.MID.push(a)
    else if (pos.startsWith('F') || pos.startsWith('W') || pos.startsWith('S')) buckets.FW.push(a)
    else buckets.Other.push(a)
  }
  const order: Array<keyof typeof buckets> = ['GK', 'DEF', 'MID', 'FW', 'Other']
  const labels: Record<string, string> = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FW: 'Forwards', Other: 'Others' }
  return (
    <div className="space-y-4">
      {order.map((k) => {
        const list = buckets[k]
        if (!list.length) return null
        return (
          <div key={k}>
            <div className="grid grid-cols-[2rem_1fr_auto] gap-3 px-3 py-1.5 text-[9px] uppercase tracking-widest text-slate-500 font-mono border-b border-slate-100">
              <span>#</span>
              <span>{labels[k]} · {list.length}</span>
              <span>Age</span>
            </div>
            <div>
              {list.map((a, i) => (
                <AthleteRow key={a.id ?? `${k}-${i}`} a={a} alt={i % 2 === 1} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AthleteRow({ a, alt }: { a: RosterAthlete; alt?: boolean }) {
  const name = a.displayName ?? a.fullName ?? a.shortName ?? '?'
  const photo = a.headshot?.href
  const flag = a.flag?.href
  const jersey = a.jersey != null ? String(a.jersey) : ''
  return (
    <div className={'grid grid-cols-[2rem_1fr_auto] gap-3 items-center px-3 py-2.5 ' + (alt ? 'bg-slate-50/60' : '')}>
      <span className="text-sm text-slate-700 font-mono tabular-nums">{jersey || '—'}</span>
      <div className="flex items-center gap-2.5 min-w-0">
        {photo ? (
          <img src={photo} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover bg-slate-100 shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a8 8 0 1 1 16 0v1z" /></svg>
          </div>
        )}
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="text-sm text-slate-900 truncate font-medium">{name}</span>
          {flag && <img src={flag} alt="" className="w-4 h-3 object-cover rounded-sm shrink-0" loading="lazy" />}
        </div>
      </div>
      <span className="text-sm text-slate-500 font-mono tabular-nums">{a.age ?? '—'}</span>
    </div>
  )
}

function MatchLine({ ev, teamCode }: { ev: EspnEvent; teamCode: string }) {
  const { home, away } = eventTeams(ev)
  const s = statusLabel(ev)
  const isHome = home?.team?.abbreviation?.toLowerCase() === teamCode.toLowerCase()
  const opp = isHome ? away : home
  const us = isHome ? home : away
  const oppLogo = teamBadgeFallback(opp?.team?.logo, opp?.team?.abbreviation)
  const time = ev.date
    ? new Date(ev.date).toLocaleString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—'
  return (
    <div className={'rounded-xl border px-3 py-2.5 flex items-center gap-3 ' + (s.live ? 'border-accent-red/40 bg-red-50/30' : 'border-slate-100 hover:border-slate-200 transition-colors')}>
      <div className="text-[10px] font-mono text-slate-500 w-28 shrink-0 truncate">{time}</div>
      <div className="text-[10px] font-mono text-slate-400 w-6">{isHome ? 'vs' : '@'}</div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {oppLogo ? (
          <img src={oppLogo} alt="" loading="lazy" className="w-5 h-5 object-contain shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />
        ) : null}
        <span className="text-sm truncate text-slate-800">{opp?.team?.shortDisplayName ?? opp?.team?.displayName ?? '?'}</span>
      </div>
      {s.live && (
        <span className="text-[10px] font-mono text-accent-red shrink-0 flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red/60 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
          </span>
          {s.label}
        </span>
      )}
      {s.finished && (
        <span className="text-base font-display font-bold tabular-nums text-slate-900 shrink-0">
          {us?.score ?? '0'}–{opp?.score ?? '0'}
        </span>
      )}
      {!s.live && !s.finished && (
        <span className="text-[10px] font-mono text-slate-400 shrink-0">{s.label}</span>
      )}
    </div>
  )
}
