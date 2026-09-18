import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { loadMatchPool, type MatchSlide } from '../../lib/matchPool'
import { drawMatchStory, MATCHES_PER_STORY } from '../../lib/newsCards'

/**
 * MatchStoryComposer — voiceless story IMAGES for today's fixtures.
 * Pick matches (or whole competitions), get one 1080×1920 image per
 * MATCHES_PER_STORY fixtures (2–3 pages on a busy day), download each,
 * copy the tracked link for the story's link sticker. Published by hand
 * from the Meta Business app (music there), like the article stories.
 */
export function MatchStoryComposer({ onClose }: { onClose: () => void }) {
  const [lang, setLang] = useState<'ar' | 'en' | 'fr'>('ar')
  const [pool, setPool] = useState<MatchSlide[]>([])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [status, setStatus] = useState('')
  const [rendering, setRendering] = useState(false)
  const [copied, setCopied] = useState(false)
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])

  const chosen = useMemo(() => pool.filter((_, i) => sel.has(i)), [pool, sel])
  const pages = useMemo(() => {
    const out: MatchSlide[][] = []
    for (let i = 0; i < chosen.length; i += MATCHES_PER_STORY) out.push(chosen.slice(i, i + MATCHES_PER_STORY))
    return out
  }, [chosen])
  const trackedUrl = `https://pressing90.live/today?ref=fb-story${lang === 'ar' ? '&lang=ar' : lang === 'fr' ? '&lang=fr' : ''}`

  useEffect(() => {
    let on = true
    void (async () => {
      setStatus('Chargement des matchs du jour…')
      try {
        const slides = await loadMatchPool(lang)
        if (!on) return
        setPool(slides)
        setSel(new Set(slides.slice(0, MATCHES_PER_STORY * 2).map((_, i) => i)))
        setStatus(slides.length ? `${slides.length} matchs disponibles — coche ceux à afficher` : 'Aucun match majeur trouvé aujourd’hui')
      } catch (e) {
        if (on) setStatus('Erreur de chargement : ' + String(e))
      }
    })()
    return () => { on = false }
  }, [lang])

  // Re-render every page when the selection or language changes.
  useEffect(() => {
    if (pages.length === 0) return
    let on = true
    setRendering(true)
    void (async () => {
      for (let p = 0; p < pages.length; p++) {
        const c = canvasRefs.current[p]
        if (!c) continue
        await drawMatchStory(c, pages[p], lang, p + 1, pages.length)
        if (!on) return
      }
      if (on) setRendering(false)
    })()
    return () => { on = false }
  }, [pages, lang])

  function toggleMatch(i: number) {
    setSel((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n })
  }
  function toggleLeague(league: string, on: boolean) {
    setSel((prev) => {
      const n = new Set(prev)
      pool.forEach((s, i) => { if (s.league === league) { if (on) n.add(i); else n.delete(i) } })
      return n
    })
  }
  function download(p: number) {
    canvasRefs.current[p]?.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `story-matchs-${lang}-${p + 1}of${pages.length}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    }, 'image/png')
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(trackedUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* tooltip shows it */ }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={onClose}>
      <div className="bg-white rounded-2xl p-4 sm:p-5 max-h-[92vh] overflow-y-auto w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="font-display font-bold text-slate-900">📸 Story · Matchs du jour</div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-full p-0.5">
              {(['ar', 'en', 'fr'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={'px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors ' + (lang === l ? 'bg-accent-gold text-ink-900 font-semibold' : 'text-slate-500')}
                >
                  {l === 'ar' ? 'عربي' : l.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600">×</button>
          </div>
        </div>

        {pool.length > 0 && (
          <div className="mb-3 max-h-52 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
            {[...new Set(pool.map((s) => s.league))].map((league) => {
              const idxs = pool.map((s, i) => ({ s, i })).filter(({ s }) => s.league === league)
              const allOn = idxs.every(({ i }) => sel.has(i))
              return (
                <div key={league}>
                  <label className="flex items-center gap-2 px-1.5 py-1 rounded-lg bg-slate-100 cursor-pointer">
                    <input type="checkbox" checked={allOn} onChange={(e) => toggleLeague(league, e.target.checked)} />
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wide text-slate-700 truncate">{league}</span>
                  </label>
                  {idxs.map(({ s, i }) => (
                    <label key={i} className="flex items-center gap-2 px-1.5 py-1 ml-4 cursor-pointer hover:bg-slate-50 rounded-lg">
                      <input type="checkbox" checked={sel.has(i)} onChange={() => toggleMatch(i)} />
                      <span className="text-xs text-slate-800 truncate">
                        {s.home} – {s.away}
                        <span className="text-slate-400 font-mono text-[10px]"> · {s.live ? `LIVE${s.score ? ' ' + s.score : ''}` : s.time}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <div className="text-[11px] font-mono text-slate-600 mb-2">
          {status}{chosen.length > 0 ? ` · ${chosen.length} matchs → ${pages.length} image${pages.length > 1 ? 's' : ''}` : ''}
          {rendering ? ' · rendu…' : ''}
        </div>

        <div className="space-y-3">
          {pages.map((_, p) => (
            <div key={p}>
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <canvas ref={(el) => { canvasRefs.current[p] = el }} className="w-full h-auto block" />
              </div>
              <button
                onClick={() => download(p)}
                className="mt-2 w-full px-4 py-2 rounded-full bg-accent-gold text-ink-900 text-sm font-bold hover:bg-yellow-300"
              >
                ⬇️ Télécharger l’image {p + 1}{pages.length > 1 ? ` / ${pages.length}` : ''}
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={copyLink}
          title={trackedUrl}
          className={'mt-3 w-full px-4 py-2.5 rounded-full text-sm font-bold border transition-colors ' + (copied ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-500')}
        >
          {copied ? '✓ Copié !' : '🔗 Copier le lien (sticker)'}
        </button>

        <div className="mt-3 text-[11px] font-mono text-slate-600 bg-amber-50 border border-amber-200/70 rounded-lg px-3 py-2 leading-relaxed">
          Publie chaque image en story depuis l’app <strong>Meta Business</strong> :<br />
          🎵 musique tendance · 🔗 sticker lien = le lien copié<br />
          📊 scans du QR + clics du sticker → <strong>fb-story</strong> dans Visitors
        </div>
      </div>
    </div>,
    document.body
  )
}
