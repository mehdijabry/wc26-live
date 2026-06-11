import { useEffect, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { motion, AnimatePresence } from 'framer-motion'
import { POSTER_STYLES, predictionUrl, type PosterStyle } from './posterUtils'
import { FinalePoster } from './FinalePoster'
import { useAuth } from '../../store/auth'
import { useBracket } from '../../store/bracket'

/**
 * Share modal for a single bracket phase. Renders the user's prediction
 * as one of three posters (TICKET / PROGRAMME / STADIUM) and exposes a
 * download button that captures the rendered DOM as a PNG via
 * html-to-image. We render the live preview at its native pixel size
 * but visually scale it down so the modal fits any viewport — the
 * download captures the un-scaled version.
 *
 * Currently only the 'final' phase is wired. The other 5 phases will
 * land in follow-ups once the user validates this one. The phase prop
 * is here from day 1 so the wiring is forward-compatible.
 */
export interface SharePhaseModalProps {
  open: boolean
  onClose: () => void
  phase: 'groups' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'
}

export function SharePhaseModal({ open, onClose, phase }: SharePhaseModalProps) {
  const profile = useAuth((s) => s.profile)
  const bracket = useBracket()
  const [style, setStyle] = useState<PosterStyle>('programme')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const posterRef = useRef<HTMLDivElement>(null)

  // Reset state when closing.
  useEffect(() => {
    if (!open) {
      setMsg(null)
      setBusy(false)
    }
  }, [open])

  const alias = profile?.alias ?? 'fan'
  const qrUrl = predictionUrl({
    alias,
    shareSlug: bracket.shareSlug,
    phase,
  })

  // Pixel target widths per style — match the values inside each
  // poster component so the preview shrinks predictably.
  const STYLE_WIDTH: Record<PosterStyle, number> = {
    ticket: 540,
    programme: 1080,
    stadium: 1280,
  }
  const STYLE_HEIGHT: Record<PosterStyle, number> = {
    ticket: 960,
    programme: 1080,
    stadium: 720,
  }

  async function download() {
    if (!posterRef.current) return
    setBusy(true)
    setMsg(null)
    try {
      const png = await toPng(posterRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      })
      const a = document.createElement('a')
      a.href = png
      a.download = `wc26-${phase}-${style}-${alias}.png`
      a.click()
      setMsg('PNG downloaded ✓')
    } catch (e) {
      setMsg('Download failed: ' + String(e))
    } finally {
      setBusy(false)
    }
  }

  // For the MVP only the Final phase is wired. If the user opens the
  // modal on another phase we surface a friendly "coming soon" notice
  // so the button never appears broken.
  const isWired = phase === 'final'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* dialog */}
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
                  Share my prediction
                </div>
                <div className="text-lg font-display font-bold text-slate-900">
                  Phase · {phaseLabel(phase)}
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

            {/* style selector */}
            <div className="px-5 pt-4">
              <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">
                Format
              </div>
              <div className="grid grid-cols-3 gap-2">
                {POSTER_STYLES.map((s) => {
                  const active = style === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={
                        'p-3 rounded-xl text-left border-2 transition-all ' +
                        (active
                          ? 'border-accent-gold bg-accent-gold/10'
                          : 'border-slate-200 hover:border-slate-300 bg-white')
                      }
                    >
                      <div
                        className="rounded-md mb-2 border border-slate-200"
                        style={{
                          aspectRatio: s.aspect,
                          background:
                            s.id === 'ticket'
                              ? 'linear-gradient(135deg, #0f172a, #020617)'
                              : s.id === 'stadium'
                                ? 'linear-gradient(0deg, #052e16, #15803d)'
                                : '#fefbe9',
                        }}
                      />
                      <div
                        className={
                          'text-xs font-semibold ' + (active ? 'text-slate-900' : 'text-slate-700')
                        }
                      >
                        {s.label}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{s.sub}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* preview area */}
            <div className="p-5">
              <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">
                Preview
              </div>
              {isWired ? (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 overflow-hidden flex items-center justify-center">
                  {/* Scale wrapper: live render at native size but visually
                      shrink to fit. The captured PNG is the un-scaled
                      version so download stays sharp. */}
                  <ScaledPosterContainer
                    width={STYLE_WIDTH[style]}
                    height={STYLE_HEIGHT[style]}
                    maxWidth={560}
                  >
                    <FinalePoster
                      ref={posterRef}
                      style={style}
                      finalWinner={bracket.finalWinner ?? 'MAR'}
                      finalRunnerUp={runnerUpOf(bracket)}
                      thirdPlaceWinner={bracket.thirdPlaceWinner ?? 'BRA'}
                      alias={alias}
                      qrUrl={qrUrl}
                      topScorer={undefined}
                    />
                  </ScaledPosterContainer>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                  <div className="text-3xl mb-2">🚧</div>
                  <div className="font-semibold text-amber-900">
                    This phase is coming soon
                  </div>
                  <div className="text-sm text-amber-700 mt-1">
                    We've only wired the <strong>Final</strong>. Les autres phases
                    suivent dès que t'as validé ce design.
                  </div>
                </div>
              )}
            </div>

            {/* footer actions */}
            {isWired && (
              <div className="sticky bottom-0 bg-white/95 backdrop-blur-xl border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-3">
                <div className="text-[11px] font-mono text-slate-500 truncate flex-1">
                  → {qrUrl.replace(/^https?:\/\//, '')}
                </div>
                <button
                  onClick={download}
                  disabled={busy}
                  className="px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Generating…' : '⬇︎ Download PNG'}
                </button>
              </div>
            )}
            {msg && (
              <div
                className={
                  'px-5 py-2 text-xs font-mono ' +
                  (msg.startsWith('Error')
                    ? 'bg-rose-50 text-rose-800'
                    : 'bg-emerald-50 text-emerald-800')
                }
              >
                {msg}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────

function phaseLabel(p: SharePhaseModalProps['phase']): string {
  return {
    groups: 'Groups + best thirds',
    r32: 'Round of 32',
    r16: 'Round of 16',
    qf: 'Quarter-finals',
    sf: 'Semi-finals',
    final: 'Final + petite finale',
  }[p]
}

/**
 * Best-effort runner-up extraction: whichever team faced finalWinner
 * in the FINAL match. If the bracket isn't filled enough we fall back
 * to a placeholder.
 */
function runnerUpOf(bracket: ReturnType<typeof useBracket.getState>): string {
  const final = bracket.koWinners['FINAL']
  if (!final) return bracket.finalWinner ?? 'FRA'
  // The two SF winners feed FINAL; whichever ISN'T final is runner-up.
  const sf1 = bracket.koWinners['SF-1']
  const sf2 = bracket.koWinners['SF-2']
  if (sf1 && sf1 !== final) return sf1
  if (sf2 && sf2 !== final) return sf2
  return 'FRA'
}

/**
 * Wraps the native-size poster in a transform: scale() so it fits the
 * available width. The captured DOM (via posterRef → toPng) is the
 * original, un-scaled element — so the download stays full-res.
 */
function ScaledPosterContainer({
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
    <div
      style={{
        width: width * scale,
        height: height * scale,
        position: 'relative',
      }}
    >
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
