import { useEffect, useState } from 'react'
import { usePageHead } from '../../lib/head'
import { SectionHeader } from '../Groups'
import { localeOf, useLang, useT } from '../../lib/i18n'
import { lienVideo, videosRecentes, vignetteDe, type VideoMatch } from '../../lib/videos'

/**
 * LES BUTS DU JOUR et LES RÉSUMÉS DU JOUR.
 *
 * Une seule page pour les deux : elles ne diffèrent que par ce qu'elles
 * filtrent et par leur titre. En faire deux fichiers aurait garanti qu'ils
 * divergent à la première retouche.
 *
 * ── ON N'HÉBERGE RIEN ─────────────────────────────────────────────────────
 * La vignette et le lecteur viennent de la source. Cliquer ouvre la vidéo
 * chez l'ayant droit, qui garde ses vues — c'est ce qui rend l'opération
 * légitime, et c'est la même règle que sur la page Facebook, où l'on ne
 * reverse jamais le fichier.
 *
 * ── TROIS ÉTATS, PAS DEUX ─────────────────────────────────────────────────
 * `null` = on ne sait pas encore (ou la lecture a échoué) ; liste vide =
 * il n'y a vraiment rien. Afficher « aucun but aujourd'hui » parce que le
 * réseau a toussé serait un mensonge (règle posée le 12/10).
 */
export default function Videos({ kind }: { kind: 'but' | 'resume' }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [liste, setListe] = useState<VideoMatch[] | null>(null)
  const [echec, setEchec] = useState(false)

  const buts = kind === 'but'

  usePageHead({
    titre: buts ? 'Today’s goals in video' : 'Today’s highlights',
    description: buts
      ? 'Every goal of the day in video — the big five leagues, the cups and the Champions League, with the scorer and the minute.'
      : 'Match highlights of the day — the big five leagues, the cups and the Champions League.',
    chemin: buts ? '/buts' : '/resumes',
  })

  useEffect(() => {
    let vivant = true
    setListe(null); setEchec(false)
    void videosRecentes(buts ? 'but' : null, 40).then((l) => {
      if (!vivant) return
      if (l === null) { setEchec(true); return }
      setListe(buts ? l : l.filter((v) => v.kind !== 'but'))
    })
    return () => { vivant = false }
  }, [buts])

  const quand = (iso: string) =>
    new Date(iso).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="container max-w-5xl mx-auto px-6 pt-10 pb-16">
      <SectionHeader
        niveau={1}
        eyebrow={t('football today')}
        title={buts ? t('Today’s goals') : t('Today’s highlights')}
      />

      {echec ? (
        <p className="mt-10 text-center text-sm text-slate-500">{t('Could not load. Try again in a moment.')}</p>
      ) : liste === null ? (
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="aspect-video rounded-2xl glass animate-pulse" />)}
        </div>
      ) : liste.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-500">
          {buts ? t('No goal published yet today.') : t('No highlights published yet today.')}
        </p>
      ) : (
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {liste.map((v) => {
            const vign = vignetteDe(v)
            return (
              <a
                key={v.video_id}
                href={lienVideo(v)}
                target="_blank"
                rel="noopener noreferrer"
                className="group glass rounded-2xl overflow-hidden block"
              >
                <div className="relative aspect-video bg-ink-900">
                  {vign && <img src={vign} alt="" loading="lazy" className="w-full h-full object-cover" />}
                  {/* Le bouton de lecture : dessiné, centré sur le CADRE et
                      non sur l'image, dont les proportions varient. */}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-14 h-14 rounded-full bg-ink-900/80 ring-2 ring-accent-gold flex items-center justify-center
                                     group-hover:scale-105 transition-transform">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold ms-0.5">
                        <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                      </svg>
                    </span>
                  </span>
                  {v.minute && (
                    <span className="absolute bottom-2 end-2 font-display text-lg text-cream drop-shadow">{v.minute}</span>
                  )}
                </div>
                <div className="p-3.5">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    {v.competition && <span className="text-accent-gold truncate">{v.competition}</span>}
                    <span className="ms-auto tabular-nums shrink-0">{quand(v.publie_at)}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold truncate">
                    {v.buteur ?? (v.equipe_dom && v.equipe_ext ? `${v.equipe_dom} — ${v.equipe_ext}` : v.titre)}
                  </div>
                  {v.buteur && v.equipe_dom && (
                    <div className="text-[12px] text-slate-500 truncate">
                      {v.equipe_dom}{v.equipe_ext ? ` — ${v.equipe_ext}` : ''}
                    </div>
                  )}
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
