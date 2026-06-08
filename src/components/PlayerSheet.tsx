import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * PlayerSheet — modal opened when any player row is tapped (Squad tab in
 * TeamSheet for now, extensible to anywhere we list athletes). Fetches
 * ESPN's per-athlete overview endpoint which returns:
 *   - bio (name, position, age, height, weight, jersey, DOB, birthplace)
 *   - statsSummary { displayName: "2025-26 Premier League Stats", statistics: [{...}] }
 *
 * CORS is open on site.web.api.espn.com so we call it directly.
 *
 * Rendered through a React portal so it sits above any motion stacking
 * context (TeamSheet already uses this pattern).
 */

type AthleteOverview = {
  athlete?: {
    id?: number | string
    displayName?: string
    fullName?: string
    firstName?: string
    lastName?: string
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
    statsSummary?: {
      displayName?: string
      statistics?: Array<{
        name?: string
        abbreviation?: string
        displayName?: string
        shortDisplayName?: string
        displayValue?: string
        value?: number
        description?: string
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
  const [data, setData] = useState<AthleteOverview['athlete'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !athleteId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    ;(async () => {
      try {
        const r = await fetch(
          `https://site.web.api.espn.com/apis/common/v3/sports/soccer/all/athletes/${athleteId}`
        )
        if (!r.ok) throw new Error(`ESPN ${r.status}`)
        const j = (await r.json()) as AthleteOverview
        if (!cancelled) setData(j.athlete ?? null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, athleteId])

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

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
            className="fixed inset-x-2 sm:inset-x-4 bottom-2 top-12 sm:top-16 z-[130] mx-auto max-w-2xl bg-paper rounded-2xl shadow-2xl overflow-hidden flex flex-col"
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

            {/* Body */}
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

                  {/* Season stats */}
                  {data.statsSummary?.statistics && data.statsSummary.statistics.length > 0 ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-accent-gold font-mono mb-3">
                        {data.statsSummary.displayName ?? 'Season stats'}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {data.statsSummary.statistics.slice(0, 12).map((s) => (
                          <div
                            key={s.name ?? s.abbreviation}
                            className="bg-white border border-slate-200/70 rounded-lg p-2.5"
                            title={s.description ?? s.displayName}
                          >
                            <div className="font-display font-bold text-xl tabular-nums">
                              {s.displayValue ?? s.value ?? '—'}
                            </div>
                            <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-0.5">
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

                  {/* Quick link */}
                  {typeof data.id !== 'undefined' && (
                    <div className="text-center">
                      <a
                        href={`https://www.espn.com/soccer/player/_/id/${data.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs text-accent-gold hover:underline font-mono"
                      >
                        Full profile on ESPN <span aria-hidden>→</span>
                      </a>
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
