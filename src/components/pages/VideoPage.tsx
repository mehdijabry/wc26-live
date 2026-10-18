import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE } from '../../lib/api'
import { usePageHead } from '../../lib/head'
import { localeOf, useLang, useT } from '../../lib/i18n'
import { SectionHeader } from '../Groups'

/**
 * LA PAGE D'UNE VIDÉO — /v/<id>.
 *
 * Mehdi, 17/10/2026, sur deux points :
 *   1. « la vidéo publiée sur le site ne se joue pas dans le site, elle
 *      redirige vers X » — le lecteur est maintenant EMBARQUÉ ici. On
 *      n'héberge toujours rien : l'iframe est celle de l'ayant droit et
 *      les vues lui reviennent, c'est ce qui rend l'opération légitime.
 *   2. « je veux que chaque vidéo publiée sur le site ait sa propre page
 *      avec la description générée » — d'où le récit sous le lecteur, et
 *      les listes /buts et /resumes qui n'y mènent plus en sortant du
 *      site mais ICI.
 *
 * ── LES BALISES NE SONT PAS ÉCRITES ICI ───────────────────────────────────
 * Facebook ne lit pas le JavaScript. C'est `functions/v/[id].ts` qui pose
 * le titre et l'image de partage dans la coquille, avant que React
 * n'existe. `usePageHead` ne sert qu'à la navigation interne.
 *
 * ── TROIS ÉTATS, PAS DEUX ─────────────────────────────────────────────────
 * `null` = on ne sait pas encore ; `echec` = la lecture a échoué ; une
 * vidéo = on affiche. Dire « introuvable » parce que le réseau a toussé
 * serait un mensonge (règle du 12/10).
 */

type Charge = {
  video: {
    video_id: string; source: string; kind: string; titre: string
    competition: string | null; equipe_dom: string | null; equipe_ext: string | null
    score_dom: number | null; score_ext: number | null
    buteur: string | null; minute: string | null; publie_at: string
    vignette: string | null
  }
  titre: string
  recit: string
  source: string
  lecteur: string
  rapport: number
  lien: string
  /** false = l'ayant droit refuse la lecture hors de YouTube. */
  embarquable: boolean | null
  vignette: string | null
  lienSource: string
}

export default function VideoPage() {
  const { id } = useParams<{ id: string }>()
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [d, setD] = useState<Charge | null>(null)
  const [echec, setEchec] = useState(false)
  /**
   * LE FORMAT RÉEL DE LA VIDÉO, MESURÉ SUR SON AFFICHE.
   *
   * Les deux lecteurs — celui de X comme celui de YouTube — REMPLISSENT
   * leur cadre en recadrant : un cadre 16:9 autour d'un clip vertical lui
   * mange les deux tiers. Le serveur donne une valeur de départ d'après la
   * source, et on la corrige ici : l'affiche d'une vidéo a ses
   * proportions, et la charger ne coûte rien puisque le navigateur l'a
   * déjà en cache depuis la liste.
   */
  const [rapport, setRapport] = useState<number | null>(null)

  useEffect(() => {
    let vivant = true
    setD(null); setEchec(false)
    if (!id) { setEchec(true); return }
    fetch(`${API_BASE}/video-public?v=${encodeURIComponent(id)}&lang=${lang}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Charge) => { if (vivant) setD(j) })
      .catch(() => { if (vivant) setEchec(true) })
    return () => { vivant = false }
  }, [id, lang])

  // SEULEMENT POUR X. Là, l'affiche rangée EST une image de la vidéo, donc
  // ses proportions sont les siennes. Ailleurs c'est une image choisie à la
  // main dans l'admin : la mesurer réglerait le cadre sur l'illustration et
  // non sur le clip — et `hqdefault` de YouTube est en 4:3, ce qui aurait
  // tassé tous les résumés.
  const affichePoster = d?.video?.source?.startsWith('x') ? (d.video.vignette ?? null) : null
  useEffect(() => {
    setRapport(null)
    if (!affichePoster) return
    let vivant = true
    const im = new Image()
    im.onload = () => {
      // Une affiche carrée de 120×90 est le placeholder d'une vignette
      // absente : on ne règle pas le cadre sur une image d'erreur.
      if (vivant && im.naturalWidth > 200 && im.naturalHeight > 200) {
        setRapport(im.naturalWidth / im.naturalHeight)
      }
    }
    im.src = affichePoster
    return () => { vivant = false }
  }, [affichePoster])

  usePageHead({
    titre: d?.titre ?? 'Pressing 90’',
    description: d?.recit ?? '',
    chemin: `/v/${id ?? ''}`,
  })

  const v = d?.video
  const score = v && v.score_dom !== null && v.score_ext !== null ? `${v.score_dom} – ${v.score_ext}` : ''
  const affiche = v ? [v.equipe_dom, v.equipe_ext].filter(Boolean).join(' — ') : ''

  return (
    <div className="container max-w-3xl mx-auto px-6 pt-8 pb-16">
      {echec ? (
        <p className="mt-10 text-center text-sm text-slate-500">{t('Could not load. Try again in a moment.')}</p>
      ) : !d || !v ? (
        <div className="space-y-4">
          <div className="h-5 w-40 rounded glass animate-pulse" />
          <div className="h-9 w-3/4 rounded glass animate-pulse" />
          <div className="aspect-video rounded-2xl glass animate-pulse" />
        </div>
      ) : (
        <article>
          <SectionHeader
            niveau={1}
            eyebrow={v.competition ?? t('football today')}
            title={d.titre}
          />

          {(affiche || v.minute) && (
            <p className="mt-1 text-sm text-slate-500">
              {affiche}{score ? ` · ${score}` : ''}{v.minute ? ` · ${v.minute}` : ''}
            </p>
          )}

          {/* ── LE LECTEUR DE L'AYANT DROIT, ET RIEN D'AUTRE ──────────
              Sur X c'est `i/videos/tweet/<id>` : la vidéo seule, sans
              l'avatar, le texte du post ni la barre d'actions. C'est le
              lecteur de X qui joue, donc la vue lui est comptée — on ne
              sert jamais le fichier nous-mêmes.

              Le cadre prend les proportions de la vidéo, bornées en
              hauteur : un clip vertical pleine largeur ferait trois écrans
              sur un téléphone, et il faudrait défiler pour voir le but. */}
          <div className="mt-5 flex justify-center">
            <div
              className="w-full rounded-2xl overflow-hidden border border-accent-gold/35 bg-ink-900 relative"
              style={{
                aspectRatio: String(rapport ?? d.rapport),
                maxWidth: `calc(72vh * ${rapport ?? d.rapport})`,
              }}
            >
              {d.embarquable === false ? (
                /* ── L'AYANT DROIT REFUSE LA LECTURE HORS DE YOUTUBE ──
                   LaLiga bloque ses propres résumés : le cadre rendait le
                   message d'erreur de YouTube, avec sa balise <a>
                   recrachée en texte brut (Mehdi, 18/10/2026). On ne
                   contourne pas la décision d'un ayant droit.

                   « On va laisser l'aperçu, mais en cliquant sur l'aperçu
                   on redirige vers YouTube » : la vignette reste, pleine,
                   avec le bouton de lecture — rien ne signale un défaut —
                   et c'est TOUT le cadre qui est le lien. La promesse de
                   l'image est tenue, simplement ailleurs.

                   Le drapeau est MESURÉ (status.embeddable), pas deviné
                   sur une liste de diffuseurs à tenir à jour. */
                <a
                  href={d.lienSource}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('Watch on YouTube')}
                  className="absolute inset-0 group block"
                >
                  {d.vignette && (
                    <img src={d.vignette} alt="" className="w-full h-full object-cover" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="w-16 h-16 rounded-full bg-ink-900/80 ring-2 ring-accent-gold flex items-center justify-center
                                     group-hover:scale-105 transition-transform">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold ms-1">
                        <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                      </svg>
                    </span>
                  </span>
                </a>
              ) : (
                <iframe
                  src={d.lecteur}
                  title={d.titre}
                  className="w-full h-full"
                  style={{ border: 0 }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                  allowFullScreen
                  loading="eager"
                />
              )}
            </div>
          </div>

          {d.recit && <p className="mt-6 text-[15px] leading-relaxed">{d.recit}</p>}

          {/* La description d'origine, telle quelle et créditée : on ne
              réécrit pas le texte de quelqu'un d'autre. */}
          {d.source && (
            <blockquote className="mt-5 ps-4 border-s-2 border-accent-gold/40 text-[14px] leading-relaxed text-slate-400 whitespace-pre-line">
              {d.source}
            </blockquote>
          )}

          <p className="mt-6 font-mono text-[11px] uppercase tracking-wider text-slate-500">
            {new Date(v.publie_at).toLocaleString(localeOf(lang), {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>

          <nav className="mt-8 flex flex-wrap gap-3">
            <a href="/buts" className="flex-1 min-w-[160px] text-center px-4 py-3 rounded-xl bg-accent-gold text-ink-900 text-sm font-bold">
              {t('Today’s goals')}
            </a>
            <a href="/resumes" className="flex-1 min-w-[160px] text-center px-4 py-3 rounded-xl border border-accent-green/50 text-accent-green text-sm font-bold">
              {t('Today’s highlights')}
            </a>
          </nav>
        </article>
      )}
    </div>
  )
}
