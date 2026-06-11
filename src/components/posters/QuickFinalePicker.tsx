import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { teams } from '../../data/teams'
import { useBracket } from '../../store/bracket'
import { useAuth } from '../../store/auth'
import { predictionUrl, type PosterStyle } from './posterUtils'
import { FinalePoster } from './FinalePoster'
import { toPng } from 'html-to-image'
import { useRef } from 'react'

/**
 * Lightweight 3-pick form: champion, runner-up, third place.
 *
 * Pre-loads from the existing bracket store if the user has already
 * predicted a champion in the full wizard. Otherwise everything starts
 * empty — picking from a flat list of all 48 teams.
 *
 * On 'Generate poster' we briefly populate the bracket store's final
 * fields so the FinalePoster reads them, then show the style toggle
 * + download flow inline (no second modal hop).
 */

interface Props {
  open: boolean
  onClose: () => void
}

// 48 WC26 teams — sorted alphabetically by name for the picker.
const ALL_TEAMS = [...teams].sort((a, b) => a.name.localeCompare(b.name))

export function QuickFinalePicker({ open, onClose }: Props) {
  const profile = useAuth((s) => s.profile)
  const bracketState = useBracket()

  const [champion, setChampion] = useState<string>('')
  const [runnerUp, setRunnerUp] = useState<string>('')
  const [third, setThird] = useState<string>('')
  const [style, setStyle] = useState<PosterStyle>('programme')
  const [phase, setPhase] = useState<'pick' | 'poster'>('pick')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const posterRef = useRef<HTMLDivElement>(null)

  // Hydrate from existing bracket on open (if the user already
  // committed picks via the full wizard).
  useEffect(() => {
    if (!open) return
    if (bracketState.finalWinner) setChampion(bracketState.finalWinner)
    if (bracketState.thirdPlaceWinner) setThird(bracketState.thirdPlaceWinner)
    // Runner-up: the SF winner that ISN'T the champion
    const finalCode = bracketState.koWinners['FINAL'] ?? bracketState.finalWinner
    if (finalCode) {
      const sf1 = bracketState.koWinners['SF-1']
      const sf2 = bracketState.koWinners['SF-2']
      if (sf1 && sf1 !== finalCode) setRunnerUp(sf1)
      else if (sf2 && sf2 !== finalCode) setRunnerUp(sf2)
    }
  }, [open, bracketState])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPhase('pick')
      setBusy(false)
      setMsg(null)
    }
  }, [open])

  const alias = profile?.alias ?? 'fan'
  const qrUrl = predictionUrl({
    alias,
    shareSlug: bracketState.shareSlug,
    phase: 'final',
  })

  const canGenerate = champion && runnerUp && third && champion !== runnerUp && champion !== third && runnerUp !== third

  async function download() {
    if (!posterRef.current) return
    setBusy(true)
    setMsg(null)
    try {
      const png = await toPng(posterRef.current, { cacheBust: true, pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = png
      a.download = `wc26-finale-${style}-${alias}.png`
      a.click()
      setMsg('PNG téléchargé ✓')
    } catch (e) {
      setMsg('Erreur: ' + String(e))
    } finally {
      setBusy(false)
    }
  }

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
                  Pronostique la
                </div>
                <div className="text-lg font-display font-bold text-slate-900">
                  🏆 Finale + 3ᵉ place
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

            {phase === 'pick' && (
              <div className="p-5 space-y-4">
                <TeamPicker
                  label="🥇 Champion"
                  value={champion}
                  onChange={setChampion}
                  exclude={[runnerUp, third]}
                />
                <TeamPicker
                  label="🥈 Finaliste"
                  value={runnerUp}
                  onChange={setRunnerUp}
                  exclude={[champion, third]}
                />
                <TeamPicker
                  label="🥉 3ᵉ place"
                  value={third}
                  onChange={setThird}
                  exclude={[champion, runnerUp]}
                />

                <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 px-5 py-3 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 font-mono">
                    {canGenerate ? '✓ Tu peux générer le poster' : 'Pick les 3 équipes pour continuer'}
                  </div>
                  <button
                    onClick={() => setPhase('poster')}
                    disabled={!canGenerate}
                    className="px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40 transition-colors"
                  >
                    Générer mon poster →
                  </button>
                </div>
              </div>
            )}

            {phase === 'poster' && (
              <div className="p-5">
                {/* style toggle */}
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
                        {s === 'stadium' && '⚽ Pelouse'}
                      </button>
                    )
                  })}
                </div>

                {/* preview */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 overflow-hidden flex items-center justify-center">
                  <ScaledPoster width={STYLE_DIM[style].w} height={STYLE_DIM[style].h} maxWidth={520}>
                    <FinalePoster
                      ref={posterRef}
                      style={style}
                      finalWinner={champion}
                      finalRunnerUp={runnerUp}
                      thirdPlaceWinner={third}
                      alias={alias}
                      qrUrl={qrUrl}
                    />
                  </ScaledPoster>
                </div>

                {/* actions */}
                <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 px-5 py-3 bg-white/95 backdrop-blur-xl border-t border-slate-200 flex items-center justify-between gap-3">
                  <button
                    onClick={() => setPhase('pick')}
                    className="text-sm font-mono text-slate-500 hover:text-slate-900"
                  >
                    ← Modifier les picks
                  </button>
                  <button
                    onClick={download}
                    disabled={busy}
                    className="px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'Génération…' : '⬇︎ Télécharger PNG'}
                  </button>
                </div>
                {msg && (
                  <div
                    className={
                      'mt-3 px-3 py-2 rounded text-xs font-mono ' +
                      (msg.startsWith('Erreur')
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

function TeamPicker({
  label,
  value,
  onChange,
  exclude,
}: {
  label: string
  value: string
  onChange: (code: string) => void
  exclude: string[]
}) {
  const filtered = ALL_TEAMS.filter((t) => !exclude.includes(t.code))
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest font-mono text-slate-500 block mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-display font-bold focus:outline-none focus:ring-2 focus:ring-accent-gold/40"
      >
        <option value="">— Choisis une équipe —</option>
        {filtered.map((t) => (
          <option key={t.code} value={t.code}>
            {t.flag} {t.name} ({t.code})
          </option>
        ))}
      </select>
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
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}
