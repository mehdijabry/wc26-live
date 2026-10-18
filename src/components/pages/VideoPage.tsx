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
  }
  titre: string
  recit: string
  source: string
  lecteur: string
  carte: boolean
  lien: string
}

export default function VideoPage() {
  const { id } = useParams<{ id: string }>()
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [d, setD] = useState<Charge | null>(null)
  const [echec, setEchec] = useState(false)

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

          {/* ── LE LECTEUR DE L'AYANT DROIT ───────────────────────────
              La carte de X est haute et porte le texte du post au-dessus
              de la vidéo ; YouTube est en 16:9 franc. Deux hauteurs, donc,
              sinon l'une des deux sort rognée ou flottant dans du vide. */}
          <div
            className={`mt-5 rounded-2xl overflow-hidden border border-accent-gold/35 bg-ink-900 ${
              d.carte ? 'h-[660px] sm:h-[720px]' : 'aspect-video'
            }`}
          >
            <iframe
              src={d.lecteur}
              title={d.titre}
              className="w-full h-full"
              style={{ border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
              loading="eager"
            />
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
