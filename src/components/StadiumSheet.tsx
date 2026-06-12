import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { stadiumMeta } from '../data/stadium-meta'
import type { Stadium } from '../data/stadiums'
import { api } from '../lib/api'

// Stadium detail modal. Opens on click of a stadium card. Pulls a
// photo + history blurb from Wikipedia's REST page-summary API at
// runtime (cached by the browser + CF), and the live match list from
// our /tournament endpoint by matching ESPN venue names. All other
// details (climate, year, roof, surface) come from stadium-meta.ts.

type WikiSummary = {
  thumbnail?: { source: string; width: number; height: number }
  originalimage?: { source: string }
  extract?: string
  content_urls?: { desktop?: { page: string } }
}

type MatchEvent = {
  id?: string
  date?: string
  status?: { type?: { shortDetail?: string; state?: string } }
  competitions?: Array<{
    venue?: { fullName?: string }
    competitors?: Array<{
      team?: { displayName?: string; shortDisplayName?: string; abbreviation?: string; logo?: string }
      homeAway?: 'home' | 'away'
      score?: string
    }>
    notes?: Array<{ type?: string; headline?: string }>
  }>
}

type Props = {
  stadium: Stadium | null
  onClose: () => void
}

export function StadiumSheet({ stadium, onClose }: Props) {
  const [wiki, setWiki] = useState<WikiSummary | null>(null)
  const [wikiLoading, setWikiLoading] = useState(false)
  const [allEvents, setAllEvents] = useState<MatchEvent[]>([])

  const meta = stadium ? stadiumMeta[stadium.id] : undefined

  // Fetch Wikipedia summary (photo + history) when sheet opens.
  // 5-min in-memory cache so reopening doesn't re-fetch.
  useEffect(() => {
    if (!stadium || !meta) return
    setWikiLoading(true)
    setWiki(null)
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${meta.wikiTitle}`
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setWiki(data))
      .catch(() => setWiki(null))
      .finally(() => setWikiLoading(false))
  }, [stadium, meta])

  // Fetch tournament events once and reuse for venue filtering.
  useEffect(() => {
    if (!stadium) return
    if (allEvents.length > 0) return
    void api.tournament().then((data) => {
      const events = ((data as { events?: MatchEvent[] }).events) ?? []
      setAllEvents(events)
    }).catch(() => {})
  }, [stadium, allEvents.length])

  // Filter the live event list to matches at this venue. Match by
  // any name in meta.espnNames (ESPN uses the current sponsor names
  // e.g. 'Estadio Banorte' for what we still label 'Estadio Azteca').
  const stadiumMatches = useMemo(() => {
    if (!stadium || !meta) return []
    const venueNames = new Set(meta.espnNames.map((s) => s.toLowerCase()))
    return allEvents
      .filter((ev) => {
        const v = ev.competitions?.[0]?.venue?.fullName?.toLowerCase() ?? ''
        return venueNames.has(v)
      })
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  }, [stadium, meta, allEvents])

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!stadium) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [stadium])

  return (
    <AnimatePresence>
      {stadium && meta && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-3xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            {/* Hero image — Wikipedia thumbnail or fallback gradient */}
            <div className="relative h-56 sm:h-72 bg-gradient-to-br from-slate-200 to-slate-300 rounded-t-3xl sm:rounded-t-2xl overflow-hidden">
              {wiki?.thumbnail?.source && (
                <img
                  src={wiki.thumbnail.source}
                  alt={stadium.name}
                  className="w-full h-full object-cover"
                  loading="eager"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent" />
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/95 hover:bg-white text-slate-800 flex items-center justify-center text-sm shadow-md"
              >
                ✕
              </button>
              <div className="absolute bottom-3 left-4 right-12 text-white">
                <div className="text-[10px] uppercase tracking-widest font-mono opacity-80">
                  {stadium.country === 'USA' ? 'United States' : stadium.country === 'MEX' ? 'Mexico' : 'Canada'} · {stadium.city}
                </div>
                <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight mt-0.5">
                  {stadium.name}
                </h2>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-6">
              {/* Core stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Capacity" value={stadium.capacity.toLocaleString()} suffix="seats" />
                <Stat label="WC26 matches" value={String(stadium.matches)} suffix="games" />
                <Stat label="Opened" value={String(meta.opened)} suffix={`${new Date().getFullYear() - meta.opened} yrs`} />
                <Stat
                  label="Roof"
                  value={meta.roof === 'fixed' ? 'Fixed' : meta.roof === 'retractable' ? 'Retractable' : 'Open'}
                  suffix={meta.surface}
                />
              </div>

              {/* History from Wikipedia */}
              <Section title="History">
                {wikiLoading && <div className="text-sm text-slate-500">Loading from Wikipedia…</div>}
                {!wikiLoading && wiki?.extract && (
                  <>
                    <p className="text-sm text-slate-700 leading-relaxed">{wiki.extract}</p>
                    {wiki.content_urls?.desktop?.page && (
                      <a
                        href={wiki.content_urls.desktop.page}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs font-mono text-accent-gold hover:text-yellow-600 mt-2"
                      >
                        Read more on Wikipedia →
                      </a>
                    )}
                  </>
                )}
                {!wikiLoading && !wiki?.extract && (
                  <div className="text-sm text-slate-500">No Wikipedia summary available.</div>
                )}
              </Section>

              {/* Climate panel */}
              <Section title={`Climate · June–July averages`}>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <ClimateCard label="High" value={`${meta.climate.avgHighC}°C`} sub={`${Math.round(meta.climate.avgHighC * 9 / 5 + 32)}°F`} accent="amber" />
                  <ClimateCard label="Low" value={`${meta.climate.avgLowC}°C`} sub={`${Math.round(meta.climate.avgLowC * 9 / 5 + 32)}°F`} />
                  <ClimateCard label="Humidity" value={meta.climate.humidity} />
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200/70 p-3 text-xs text-amber-900 leading-relaxed">
                  ⚠️ {meta.climate.risk}
                </div>
              </Section>

              {/* Matches scheduled at this stadium */}
              <Section title={`Matches at ${stadium.name}`}>
                {stadiumMatches.length === 0 && (
                  <div className="text-sm text-slate-500">No fixtures found for this venue yet.</div>
                )}
                {stadiumMatches.length > 0 && (
                  <ul className="space-y-2">
                    {stadiumMatches.map((m) => (
                      <MatchRow key={m.id} match={m} />
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-widest font-mono text-slate-500">{label}</div>
      <div className="font-display font-bold text-base text-slate-900 mt-0.5">{value}</div>
      {suffix && <div className="text-[10px] font-mono text-slate-500 mt-0.5 capitalize">{suffix}</div>}
    </div>
  )
}

function ClimateCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'amber' }) {
  return (
    <div className={
      'rounded-lg border px-3 py-2.5 ' +
      (accent === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')
    }>
      <div className="text-[9px] uppercase tracking-widest font-mono text-slate-500">{label}</div>
      <div className="font-display font-bold text-lg text-slate-900 mt-0.5 capitalize">{value}</div>
      {sub && <div className="text-[10px] font-mono text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function MatchRow({ match }: { match: MatchEvent }) {
  const comp = match.competitions?.[0]
  const home = comp?.competitors?.find((c) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c) => c.homeAway === 'away')
  const homeName = home?.team?.shortDisplayName ?? home?.team?.abbreviation ?? '—'
  const awayName = away?.team?.shortDisplayName ?? away?.team?.abbreviation ?? '—'
  const state = match.status?.type?.state
  const date = match.date ? new Date(match.date) : null
  const dateStr = date
    ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '—'
  const timeStr = date
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''
  const note = comp?.notes?.[0]?.headline ?? ''
  return (
    <li className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {homeName} <span className="text-slate-400">vs</span> {awayName}
          </div>
          {note && (
            <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-0.5">
              {note}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-mono text-slate-700">{dateStr}</div>
          <div className="text-[10px] font-mono text-slate-500">
            {state === 'post' && home?.score !== undefined && away?.score !== undefined
              ? `${home.score} – ${away.score}`
              : timeStr}
          </div>
        </div>
      </div>
    </li>
  )
}
