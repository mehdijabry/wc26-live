import { useState } from 'react'
import { useT } from '../lib/i18n'
import { publierPari } from '../lib/posts'

/**
 * PUBLIER UN PARI GAGNÉ SUR SON PROFIL.
 *
 * Le bouton n'apparaît que sur un bulletin GAGNÉ et pas encore publié — la
 * base refuse les deux autres cas (P0022, P0023), et proposer une action qui
 * ne peut qu'échouer se lit comme une panne.
 *
 * La légende est facultative et courte : 140 caractères, la base coupe au
 * même endroit. Ce n'est pas un billet de blog, c'est un mot sur un ticket.
 */
export function PartagerPari({
  slipId, matchIds, dejaPublie, onPublie, invite,
}: {
  slipId: number
  matchIds: string[]
  dejaPublie?: boolean
  onPublie?: (postId: number) => void
  /** Au retour d'une notification de gain : le bouton bat trois secondes,
   *  puis se tait. C'est le seul instant où l'envie de partager existe. */
  invite?: boolean
}) {
  const t = useT()
  const [ouvert, setOuvert] = useState(false)
  const [legende, setLegende] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [fait, setFait] = useState(false)

  if (dejaPublie || fait) {
    return (
      <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
        {t('Shared')} ✓
      </span>
    )
  }

  const publier = async () => {
    setOccupe(true); setMessage(null)
    const r = await publierPari(slipId, legende.trim(), matchIds)
    setOccupe(false)
    if ('erreur' in r) {
      setMessage(
        r.code === 'P0023' ? t('Already shared.')
        : r.code === 'P0022' ? t('Only a winning bet can be shared.')
        : t('Could not share right now.'),
      )
      return
    }
    setFait(true); setOuvert(false)
    onPublie?.(r.id)
  }

  return (
    <>
      {/* L'INVITATION — trois battements, puis le repos.
          Un bouton qui pulse sans fin devient un clignotant qu'on cesse
          de voir, et il fait douter : « est-ce que ça charge ? ». La
          bulle dit pourquoi il s'agite ; sans phrase, on devine. */}
      {invite && !ouvert && (
        <span className="p90-partage-bulle mb-1 inline-flex w-full items-center gap-1 font-mono text-[10.5px]
                         uppercase tracking-wider text-accent-gold">
          {t('Share your win')}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className={'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-gold text-ink-900 text-xs font-semibold active:scale-[0.98] transition-transform'
          + (invite ? ' p90-partage-invite' : '')}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 16V4m0 0L8 8m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
        </svg>
        {t('Share on my profile')}
      </button>

      {ouvert && (
        <div className="mt-2 w-full glass rounded-2xl p-3">
          <textarea
            value={legende}
            onChange={(e) => setLegende(e.target.value.slice(0, 140))}
            rows={2}
            placeholder={t('Say something about it (optional)')}
            className="w-full px-3 py-2 rounded-xl border border-slate-300/50 bg-transparent text-sm resize-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-[10px] text-slate-500 tabular-nums">{legende.length}/140</span>
            <button
              type="button" onClick={() => void publier()} disabled={occupe}
              className="ms-auto px-3.5 py-1.5 rounded-xl bg-accent-gold text-ink-900 text-xs font-semibold disabled:opacity-40"
            >
              {t('Publish')}
            </button>
            <button
              type="button" onClick={() => setOuvert(false)}
              className="px-3 py-1.5 rounded-xl glass glass-hover text-xs"
            >
              {t('Cancel')}
            </button>
          </div>
          {message && <p className="mt-2 text-xs text-accent-red">{message}</p>}
        </div>
      )}
    </>
  )
}

export default PartagerPari
