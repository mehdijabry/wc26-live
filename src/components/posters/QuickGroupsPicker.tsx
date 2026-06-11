import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toPng } from 'html-to-image'
import { teams } from '../../data/teams'
import { useBracket } from '../../store/bracket'
import { useAuth } from '../../store/auth'
import { predictionUrl, type PosterStyle } from './posterUtils'
import { GroupsPoster, defaultGroupStandings, defaultBestThirds } from './GroupsPoster'

/**
 * Quick groups picker — rank each of the 12 groups + pick the 8 best
 * 3rd-placed teams in a two-step flow:
 *   1. 'rank'  : for each of the 12 groups, the user drags / clicks
 *                their preferred ordering of the 4 teams.
 *   2. 'thirds': from the 12 third-placed teams (one per group), the
 *                user picks the 8 that they think advance.
 *   3. 'poster': preview & download in any of the 3 styles.
 *
 * Pre-fill: if the user has already used the full bracket wizard, we
 * read groupStandings + bestThirds from useBracket. Otherwise we seed
 * with default FIFA-rank ordering so the user can either accept those
 * or tweak them — much less friction than an empty form.
 */

interface Props {
  open: boolean
  onClose: () => void
}

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const

export function QuickGroupsPicker({ open, onClose }: Props) {
  const profile = useAuth((s) => s.profile)
  const bracket = useBracket()

  const [standings, setStandings] = useState<Record<string, [string, string, string, string]>>({})
  const [bestThirds, setBestThirds] = useState<string[]>([])
  const [style, setStyle] = useState<PosterStyle>('programme')
  const [phase, setPhase] = useState<'rank' | 'thirds' | 'poster'>('rank')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const posterRef = useRef<HTMLDivElement>(null)

  // Seed the state on open. Source priority:
  //   1. user's existing bracket store — but ONLY if it's the same 4
  //      team codes as the canonical group from teams.ts. We're guarding
  //      against stale local state with wrong codes (e.g. BIH/QAT/CUW)
  //      that don't exist in the current data file — those used to leave
  //      '—' placeholders in the rendered poster.
  //   2. FIFA-rank default (canonical teams.ts grouping).
  useEffect(() => {
    if (!open) return
    const def = defaultGroupStandings()
    const merged: Record<string, [string, string, string, string]> = { ...def }
    for (const g of GROUP_LETTERS) {
      const fromStore = bracket.groupStandings[g]
      if (!fromStore || fromStore.length !== 4) continue
      // Sanity check: every code must (a) be a real team and (b) belong
      // to this exact group letter. If any fail, fall back to defaults
      // so the poster never shows '—'.
      const valid = fromStore.every((code) => {
        const t = teams.find((x) => x.code === code)
        return t && t.group === g
      })
      if (valid) {
        merged[g] = [fromStore[0], fromStore[1], fromStore[2], fromStore[3]] as [string, string, string, string]
      }
    }
    setStandings(merged)
    setBestThirds(defaultBestThirds(merged))
  }, [open, bracket.groupStandings])

  useEffect(() => {
    if (!open) {
      setPhase('rank')
      setBusy(false)
      setMsg(null)
    }
  }, [open])

  const alias = profile?.alias ?? 'fan'
  const qrUrl = predictionUrl({ alias, shareSlug: bracket.shareSlug, phase: 'groups' })

  function moveTeam(group: string, fromIdx: number, toIdx: number) {
    setStandings((prev) => {
      const arr = [...(prev[group] ?? [])]
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return { ...prev, [group]: arr as [string, string, string, string] }
    })
  }

  function toggleThird(code: string) {
    setBestThirds((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code)
      if (prev.length >= 8) return prev
      return [...prev, code]
    })
  }

  async function download() {
    if (!posterRef.current) return
    setBusy(true)
    setMsg(null)
    try {
      const png = await toPng(posterRef.current, { cacheBust: true, pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = png
      a.download = `wc26-groups-${style}-${alias}.png`
      a.click()
      setMsg('PNG downloaded ✓')
    } catch (e) {
      setMsg('Error: ' + String(e))
    } finally {
      setBusy(false)
    }
  }

  // 12 third-placed teams (one per group) — the candidate pool for the
  // 'thirds' step. Sorted by FIFA rank ascending so the strongest
  // candidates appear first.
  const thirdsPool = GROUP_LETTERS
    .map((g) => standings[g]?.[2])
    .filter((c): c is string => !!c)
    .map((code) => ({ code, rank: teams.find((t) => t.code === code)?.fifaRank ?? 999 }))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.code)

  const STYLE_DIM: Record<PosterStyle, { w: number; h: number }> = {
    ticket: { w: 540, h: 960 },
    programme: { w: 1080, h: 1080 },
    stadium: { w: 1280, h: 720 },
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-3xl mx-4 max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
            initial={{ y: 20, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 20, scale: 0.97 }}
          >
            {/* header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500">
                  Predict the
                </div>
                <div className="text-lg font-display font-bold text-slate-900">
                  🌍 Groups + best thirds
                </div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  Step {phase === 'rank' ? 1 : phase === 'thirds' ? 2 : 3} / 3 ·{' '}
                  {phase === 'rank' && 'Rank the 12 groups'}
                  {phase === 'thirds' && `Pick 8 best thirds (${bestThirds.length}/8)`}
                  {phase === 'poster' && 'Pick a poster style'}
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-lg text-slate-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {phase === 'rank' && (
              <div className="p-5">
                <div className="text-[11px] font-mono text-slate-500 mb-3">
                  Default = FIFA rank. Tap a team to reorder it (up = better position).
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {GROUP_LETTERS.map((g) => (
                    <GroupRanker
                      key={g}
                      group={g}
                      standings={standings[g]}
                      onMove={(from, to) => moveTeam(g, from, to)}
                    />
                  ))}
                </div>
                <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 px-5 py-3 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 font-mono">
                    Top 2 of each group will advance · 3rd places picked next step
                  </div>
                  <button
                    onClick={() => {
                      // refresh thirds pool whenever rankings changed
                      setBestThirds(defaultBestThirds(standings))
                      setPhase('thirds')
                    }}
                    className="px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
                  >
                    Next: pick 8 best thirds →
                  </button>
                </div>
              </div>
            )}

            {phase === 'thirds' && (
              <div className="p-5">
                <div className="text-[11px] font-mono text-slate-500 mb-3">
                  12 third-placed teams. Pick the 8 you think will advance to the Round of 32.
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {thirdsPool.map((code) => {
                    const team = teams.find((t) => t.code === code)
                    const picked = bestThirds.includes(code)
                    const groupLetter = team?.group ?? '?'
                    return (
                      <button
                        key={code}
                        onClick={() => toggleThird(code)}
                        className={
                          'p-3 rounded-xl border-2 transition-all flex items-center gap-2 text-left ' +
                          (picked
                            ? 'border-accent-gold bg-amber-50'
                            : 'border-slate-200 bg-white hover:border-slate-300')
                        }
                      >
                        <span className="text-2xl">{team?.flag}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-slate-900 truncate">
                            {team?.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            3{groupLetter} · {team?.code}
                          </div>
                        </div>
                        {picked && (
                          <span className="text-accent-gold font-bold text-lg">✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 px-5 py-3 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setPhase('rank')}
                    className="text-sm font-mono text-slate-500 hover:text-slate-900"
                  >
                    ← Back to ranking
                  </button>
                  <button
                    onClick={() => setPhase('poster')}
                    disabled={bestThirds.length !== 8}
                    className="px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40 transition-colors"
                  >
                    {bestThirds.length === 8
                      ? 'Generate poster →'
                      : `Pick ${8 - bestThirds.length} more`}
                  </button>
                </div>
              </div>
            )}

            {phase === 'poster' && (
              <div className="p-5">
                <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">
                  Format
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {(['ticket', 'programme', 'stadium'] as PosterStyle[]).map((s) => {
                    const active = style === s
                    return (
                      <button
                        key={s}
                        onClick={() => setStyle(s)}
                        className={
                          'px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ' +
                          (active
                            ? 'border-accent-gold bg-accent-gold/10 text-slate-900'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300')
                        }
                      >
                        {s === 'ticket' && '🎟️ Ticket'}
                        {s === 'programme' && '📋 Programme'}
                        {s === 'stadium' && '⚽ Pitch'}
                      </button>
                    )
                  })}
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 overflow-hidden flex items-center justify-center">
                  <ScaledPoster width={STYLE_DIM[style].w} height={STYLE_DIM[style].h} maxWidth={520}>
                    <GroupsPoster
                      ref={posterRef}
                      style={style}
                      standings={standings}
                      bestThirds={bestThirds}
                      alias={alias}
                      qrUrl={qrUrl}
                    />
                  </ScaledPoster>
                </div>

                <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 px-5 py-3 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setPhase('thirds')}
                    className="text-sm font-mono text-slate-500 hover:text-slate-900"
                  >
                    ← Edit picks
                  </button>
                  <button
                    onClick={download}
                    disabled={busy}
                    className="px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'Generating…' : '⬇︎ Download PNG'}
                  </button>
                </div>
                {msg && (
                  <div
                    className={
                      'mt-3 px-3 py-2 rounded text-xs font-mono ' +
                      (msg.startsWith('Error')
                        ? 'bg-rose-50 text-rose-800'
                        : 'bg-emerald-50 text-emerald-800')
                    }
                  >
                    {msg}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────

function GroupRanker({
  group,
  standings,
  onMove,
}: {
  group: string
  standings: [string, string, string, string] | undefined
  onMove: (from: number, to: number) => void
}) {
  if (!standings) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="bg-slate-900 text-amber-300 px-3 py-1.5 text-xs font-bold tracking-widest">
        GROUP {group}
      </div>
      <div>
        {standings.map((code, idx) => {
          const t = teams.find((x) => x.code === code)
          const isAdvancing = idx <= 1
          const isThird = idx === 2
          return (
            <div
              key={code}
              className={
                'flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0 ' +
                (isAdvancing ? 'bg-amber-50' : isThird ? 'bg-amber-50/40' : 'bg-white')
              }
            >
              <span
                className={
                  'w-5 text-xs font-mono font-bold ' +
                  (isAdvancing ? 'text-accent-gold' : isThird ? 'text-amber-600' : 'text-slate-400')
                }
              >
                {idx + 1}
              </span>
              <span className="text-lg">{t?.flag}</span>
              <span className={'flex-1 text-sm ' + (isAdvancing ? 'font-bold text-slate-900' : 'text-slate-700')}>
                {t?.name}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => onMove(idx, Math.max(0, idx - 1))}
                  disabled={idx === 0}
                  className="w-6 h-6 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 text-xs"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => onMove(idx, Math.min(3, idx + 1))}
                  disabled={idx === 3}
                  className="w-6 h-6 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 text-xs"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScaledPoster({
  width,
  height,
  maxWidth,
  children,
}: {
  width: number
  height: number
  maxWidth: number
  children: React.ReactNode
}) {
  const scale = Math.min(1, maxWidth / width)
  return (
    <div style={{ width: width * scale, height: height * scale, position: 'relative' }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}
