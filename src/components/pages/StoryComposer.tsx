import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { drawPostCard, drawStoryCard, type CardArticle } from '../../lib/newsCards'

/**
 * StoryComposer — previews/downloads the branded article cards, drawn
 * in-browser (canvas, see src/lib/newsCards.ts):
 *
 *  - Story 1080×1920: QR + "visit our profile". Posted MANUALLY from
 *    the Meta Business app (music + link sticker aren't available via
 *    the API, and Mehdi wants trending music on every story).
 *  - Post 1080×1350: split layout (original photo on top, generated
 *    branded panel + QR below). This same card is auto-generated and
 *    attached to the Facebook posts at Approve / Publier-sur-FB time.
 */

export function StoryComposer({
  article,
  onClose,
  onTranslate,
}: {
  article: CardArticle
  onClose: () => void
  /** Generates the Arabic version then refreshes `article` (parent). */
  onTranslate?: () => Promise<void>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [lang, setLang] = useState<'en' | 'ar'>('en')
  const [format, setFormat] = useState<'story' | 'post'>('story')
  const [rendering, setRendering] = useState(true)
  const [copied, setCopied] = useState(false)
  const [translating, setTranslating] = useState(false)

  // Tracked link matching the current format — for the story's manual
  // link sticker (fb-story) so sticker clicks land in the same Visitors
  // bucket as QR scans; post format copies the post link (fb).
  const trackedUrl =
    `https://pressing90.live/news/${article.slug}` +
    `?ref=${format === 'story' ? 'fb-story' : 'fb'}` +
    (lang === 'ar' ? '&lang=ar' : '')

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(trackedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the URL is visible in the tooltip */ }
  }

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    setRendering(true)
    const draw = format === 'story' ? drawStoryCard : drawPostCard
    void draw(c, article, lang).finally(() => setRendering(false))
  }, [article, lang, format])

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${format}-${article.slug}-${lang}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    }, 'image/png')
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-4 sm:p-5 max-h-[92vh] overflow-y-auto w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex bg-slate-100 rounded-full p-0.5">
            {(['story', 'post'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={
                  'px-3 py-1 rounded-full text-[11px] font-mono transition-colors ' +
                  (format === f ? 'bg-ink-900 text-white font-semibold' : 'text-slate-500')
                }
                style={format === f ? { color: '#fff' } : undefined}
              >
                {f === 'story' ? '📱 Story' : '🖼 Post'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {article.title_ar ? (
              <div className="flex bg-slate-100 rounded-full p-0.5">
                {(['en', 'ar'] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    className={
                      'px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors ' +
                      (lang === l ? 'bg-accent-gold text-ink-900 font-semibold' : 'text-slate-500')
                    }
                  >
                    {l === 'en' ? 'EN' : 'عربي'}
                  </button>
                ))}
              </div>
            ) : onTranslate ? (
              // No Arabic yet — generate it without leaving the modal;
              // the parent refreshes `article` and the toggle appears.
              <button
                onClick={async () => {
                  setTranslating(true)
                  try { await onTranslate() } finally { setTranslating(false) }
                }}
                disabled={translating}
                className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                title="Génère la version arabe de l'article pour débloquer la carte عربي"
              >
                {translating ? '⏳ Traduction…' : '🌐 Traduire → عربي'}
              </button>
            ) : null}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600">×</button>
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          <canvas ref={canvasRef} className="w-full h-auto block" />
          {rendering && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-xs font-mono text-slate-600">
              Génération…
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={download}
            className="flex-1 px-4 py-2.5 rounded-full bg-accent-gold text-ink-900 text-sm font-bold hover:bg-yellow-300"
          >
            ⬇️ Télécharger
          </button>
          <button
            onClick={copyLink}
            title={trackedUrl}
            className={
              'flex-1 px-4 py-2.5 rounded-full text-sm font-bold border transition-colors ' +
              (copied
                ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                : 'bg-white border-slate-300 text-slate-700 hover:border-slate-500')
            }
          >
            {copied ? '✓ Copié !' : '🔗 Copier le lien'}
          </button>
        </div>

        {format === 'story' ? (
          <div className="mt-3 text-[11px] font-mono text-slate-600 bg-amber-50 border border-amber-200/70 rounded-lg px-3 py-2 leading-relaxed">
            Publie depuis l’app <strong>Meta Business</strong> :<br />
            🎵 ajoute la <strong>musique tendance</strong> du moment<br />
            🔗 sticker lien : colle le <strong>lien copié</strong> (il porte le tracking)<br />
            📊 scans du QR + clics du sticker → <strong>fb-story</strong> dans Visitors
          </div>
        ) : (
          <div className="mt-3 text-[11px] font-mono text-slate-600 bg-emerald-50 border border-emerald-200/70 rounded-lg px-3 py-2 leading-relaxed">
            Cette carte est <strong>générée et attachée automatiquement</strong> aux
            posts FB à l’Approve / « Publier sur FB ».<br />
            📊 scans du QR → <strong>fb-post</strong> · clics du lien → <strong>facebook</strong>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
