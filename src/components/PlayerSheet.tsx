import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * PlayerSheet — modal opened when any player row is tapped (Squad tab in
 * TeamSheet for now, extensible to anywhere we list athletes).
 *
 * Fetches TWO ESPN endpoints in parallel:
 *   - /athletes/{id}             → bio + statsSummary (headline season stats)
 *   - /athletes/{id}/overview    → gameLog (recent fixtures with per-match
 *                                  stats: minutes, goals, saves, etc.) +
 *                                  next game
 *
 * ESPN's public free API only exposes the statsSummary (4-8 stats keyed
 * to the player's position — Saves/Clean Sheets for GKs, Goals/Assists/
 * Shots for outfielders, etc.). The full multi-season tables visible on
 * espn.com/soccer/player/_/id/X are server-rendered and not available
 * over their public API. The 'Full profile on ESPN ↗' link stays so
 * fans can deep-dive there.
 *
 * Renders through a React portal so it sits above any motion stacking
 * context.
 */

type ESPNStat = {
  name?: string
  abbreviation?: string
  displayName?: string
  shortDisplayName?: string
  displayValue?: string
  value?: number
  description?: string
}

type AthletePayload = {
  athlete?: {
    id?: number | string
    displayName?: string
    fullName?: string
    jersey?: string
    age?: number
    displayHeight?: string
    displayWeight?: string
    displayDOB?: string
    displayBirthPlace?: string
    position?: { displayName?: string; abbreviation?: string }
    team?: { displayName?: string; logo?: string }
    headshot?: { href?: string }
    flag?: { href?: string }
    statsSummary?: { displayName?: string; statistics?: ESPNStat[] }
  }
}

type OverviewPayload = {
  gameLog?: {
    displayName?: string
    statistics?: Array<{ name?: string; shortDisplayName?: string; displayName?: string }>
    events?: Record<
      string,
      {
        gameDate?: string
        atVs?: string
        opponent?: { displayName?: string; logo?: string; abbreviation?: string }
        gameResult?: string
        score?: string
        stats?: string[] // values in the same order as gameLog.statistics
      }
    >
  }
  nextGame?: {
    event?: {
      date?: string
      shortName?: string
      competitions?: Array<{
        competitors?: Array<{ team?: { displayName?: string; logo?: string; abbreviation?: string } }>
      }>
    }
  }
}

export function PlayerSheet({
  open,
  onClose,
  athleteId,
  fallbackName,
  fallbackPhoto,
}: {
  open: boolean
  onClose: () => void
  athleteId: string | number | undefined
  fallbackName?: string
  fallbackPhoto?: string
}) {
  const [data, setData] = useState<AthletePayload['athlete'] | null>(null)
  const [overview, setOverview] = useState<OverviewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !athleteId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    setOverview(null)

    const baseUrl = `https://site.web.api.espn.com/apis/common/v3/sports/soccer/all/athletes/${athleteId}`
    Promise.all([
      fetch(baseUrl).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      // Overview is allowed to fail silently — not every athlete has it.
      fetch(`${baseUrl}/overview`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([athResp, ovResp]: [AthletePayload, OverviewPayload | null]) => {
        if (cancelled) return
        setData(athResp.athlete ?? null)
        setOverview(ovResp ?? null)
      })
      .catch((e) => {
        if (!cancelled) setError(typeof e === 'number' ? `ESPN ${e}` : 'Failed to load')
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [open, athleteId])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Sorted: numeric stats with a real value first, then text-only.
  const allStats: ESPNStat[] = data?.statsSummary?.statistics ?? []

  const gameLogStats = overview?.gameLog?.statistics ?? []
  const gameLogEvents = overview?.gameLog?.events
    ? Object.entries(overview.gameLog.events)
        .map(([id, ev]) => ({ id, ...ev }))
        .sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''))
        .slice(0, 5)
    : []

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
            className="fixed inset-x-2 sm:inset-x-4 z-[130] mx-auto max-w-2xl bg-paper rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            // top/bottom adapt to PWA standalone (notch + home indicator).
            // The original top-12 (48px) sat right at the notch edge on
            // iPhone 14+ — now we add the safe-area to keep it clear.
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
            }}
          >
            {/* Header */}
            <div className="relative px-5 py-4 border-b border-slate-200 flex items-center gap-4">
              {(data?.headshot?.href ?? fallbackPhoto) && (
                <img
                  src={data?.headshot?.href ?? fallbackPhoto}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover bg-slate-100 shrink-0"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold text-xl truncate">
                  {data?.displayName ?? fallbackName ?? 'Player'}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-0.5 truncate">
                  {[data?.position?.displayName, data?.team?.displayName].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 w-9 h-9 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-xl leading-none"
              >×</button>
            </div>

            {/* Body — scrollable */}
            <div className="overflow-y-auto flex-1">
              {loading && (
                <div className="p-8 text-center text-sm text-slate-500">Loading player profile…</div>
              )}
              {error && !loading && (
                <div className="p-8 text-center text-sm text-slate-500">
                  Couldn&apos;t load this player. ESPN may not have a public profile for them yet.
                </div>
              )}
              {data && !loading && (
                <div className="p-5 space-y-6">
                  {/* Bio strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <Stat label="Jersey" value={data.jersey ? `#${data.jersey}` : '—'} />
                    <Stat label="Age" value={data.age != null ? String(data.age) : '—'} />
                    <Stat label="Height" value={data.displayHeight ?? '—'} />
                    <Stat label="Weight" value={data.displayWeight ?? '—'} />
                  </div>
                  {(data.displayDOB || data.displayBirthPlace) && (
                    <div className="text-[11px] text-slate-500 font-mono text-center -mt-2">
                      {data.displayDOB ? `Born ${data.displayDOB}` : ''}
                      {data.displayBirthPlace ? ` · ${data.displayBirthPlace}` : ''}
                    </div>
                  )}

                  {/* Season stats — show ALL stats ESPN exposes, no truncation. */}
                  {allStats.length > 0 ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-accent-gold font-mono mb-3 flex items-center justify-between">
                        <span>{data.statsSummary?.displayName ?? 'Season stats'}</span>
                        <span className="text-slate-400">{allStats.length} stats</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {allStats.map((s, i) => (
                          <div
                            key={(s.name ?? s.abbreviation ?? '') + i}
                            className="bg-white border border-slate-200/70 rounded-lg p-2.5"
                            title={s.description ?? s.displayName}
                          >
                            <div className="font-display font-bold text-xl tabular-nums leading-tight">
                              {s.displayValue ?? s.value ?? '—'}
                            </div>
                            <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-1 leading-tight">
                              {s.shortDisplayName ?? s.abbreviation ?? s.displayName}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-100 px-3 py-4 text-xs text-slate-500 text-center">
                      ESPN doesn&apos;t have season stats published for this player yet.
                    </div>
                  )}

                  {/* Recent matches — gameLog (per-match stats). */}
                  {gameLogEvents.length > 0 && gameLogStats.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-accent-gold font-mono mb-3">
                        Recent matches · {gameLogEvents.length}
                      </div>
                      <div className="bg-white border border-slate-200/70 rounded-xl overflow-hidden overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead className="bg-slate-50 border-b border-slate-100">
                            <tr className="text-[9px] uppercase tracking-widest text-slate-500 font-mono">
                              <th className="text-left px-2 py-2 whitespace-nowrap">Date</th>
                              <th className="text-left px-2 py-2 whitespace-nowrap">Opp</th>
                              {gameLogStats.slice(0, 8).map((h, i) => (
                                <th key={i} className="text-right px-2 py-2 whitespace-nowrap">
                                  {h.shortDisplayName ?? h.displayName ?? h.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {gameLogEvents.map((ev) => (
                              <tr key={ev.id} className="border-b border-slate-50 last:border-0">
                                <td className="px-2 py-2 text-slate-600 font-mono whitespace-nowrap">
                                  {ev.gameDate ? new Date(ev.gameDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                                </td>
                                <td className="px-2 py-2 whitespace-nowrap">
                                  <span className="text-slate-400 mr-1">{ev.atVs}</span>
                                  <span className="text-slate-900 font-semibold">
                                    {ev.opponent?.abbreviation ?? ev.opponent?.displayName ?? '?'}
                                  </span>
                                  {ev.score && (
                                    <span className={'ml-1.5 font-mono ' + (
                                      ev.gameResult === 'W' ? 'text-accent-green' :
                                      ev.gameResult === 'L' ? 'text-accent-red' : 'text-slate-500'
                                    )}>
                                      {ev.gameResult} {ev.score}
                                    </span>
                                  )}
                                </td>
                                {(ev.stats ?? []).slice(0, 8).map((v, i) => (
                                  <td key={i} className="px-2 py-2 text-right text-slate-900 font-mono tabular-nums">
                                    {v || '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Quick link to ESPN — multi-season tables and deeper data
                      live on the web page (server-rendered, not on the API). */}
                  {typeof data.id !== 'undefined' && (
                    <div className="text-center pt-2">
                      <a
                        href={`https://www.espn.com/soccer/player/_/id/${data.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                      >
                        Full profile on ESPN <span aria-hidden>↗</span>
                      </a>
                      <div className="text-[10px] text-slate-500 mt-2 font-mono">
                        Multi-season history & deeper splits available there
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(node, document.body)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-slate-200/70 rounded-lg p-2">
      <div className="font-display font-bold text-base tabular-nums">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
