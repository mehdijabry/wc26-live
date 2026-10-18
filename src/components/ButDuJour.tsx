import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../lib/api'
import { useT } from '../lib/i18n'
import { videosRecentes, vignetteDe, type VideoMatch } from '../lib/videos'

/**
 * LE BUT DU JOUR, en tête de l'accueil.
 *
 * Mehdi, 18/10/2026 : « un aperçu comme celui de goals avec comme titre
 * but du jour, et la liste des buts de la journée ».
 *
 * ── POURQUOI UN CHOIX À LA MAIN ───────────────────────────────────────────
 * Le plus beau but d'une soirée ne se calcule pas. Il n'y a ni vote, ni
 * compteur de vues comparable d'une source à l'autre, et un classement
 * automatique mettrait en tête le premier arrivé. L'emplacement se remplit
 * donc depuis l'admin, et il reste VIDE tant que personne n'a choisi —
 * plutôt que d'afficher un but au hasard sous un titre qui promet le
 * meilleur.
 *
 * ── LA LISTE EN DESSOUS ───────────────────────────────────────────────────
 * Elle ne montre que les compétitions que Mehdi a nommées : les cinq
 * grands championnats, la Ligue des champions et les cinq coupes
 * nationales. Un but de deuxième division allemande n'a rien à faire en
 * tête de l'accueil, même un jour creux.
 *
 * ── TROIS ÉTATS ───────────────────────────────────────────────────────────
 * `undefined` = on ne sait pas encore ; `null` = il n'y a rien ; une
 * valeur = on affiche. Le bloc entier disparaît quand il n'y a ni but du
 * jour ni liste : une section vide sur l'accueil est pire que pas de
 * section (leçon du 17/10 sur la fiche de match).
 */

type ButVedette = {
  video_id: string
  titre: string
  buteur: string | null
  minute: string | null
  competition: string | null
  equipe_dom: string | null
  equipe_ext: string | null
  vignette: string | null
}

/** Les compétitions nommées par Mehdi, et elles seules. */
const RETENUES = /premier league|laliga|la liga|serie a|bundesliga|ligue 1|champions league|ligue des champions|دوري أبطال|fa cup|copa del rey|coppa italia|dfb[- ]?pokal|coupe de france/i

export function ButDuJour() {
  const t = useT()
  const [vedette, setVedette] = useState<ButVedette | null | undefined>(undefined)
  const [liste, setListe] = useState<VideoMatch[] | null>(null)

  useEffect(() => {
    let vivant = true
    fetch(`${API_BASE}/but-du-jour`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { but?: ButVedette | null } | null) => { if (vivant) setVedette(j?.but ?? null) })
      .catch(() => { if (vivant) setVedette(null) })
    void videosRecentes('but', 24).then((l) => {
      if (vivant && l) setListe(l.filter((v) => RETENUES.test(v.competition ?? '')))
    })
    return () => { vivant = false }
  }, [])

  // Rien à montrer : on ne pose pas un titre au-dessus du vide.
  if (vedette === null && (!liste || liste.length === 0)) return null

  const autres = (liste ?? []).filter((v) => v.video_id !== vedette?.video_id).slice(0, 4)
  const affiche = vedette
    ? [vedette.equipe_dom, vedette.equipe_ext].filter(Boolean).join(' — ')
    : ''

  return (
    <section className="mt-7">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-gold text-center">
        {t('Goal of the day')}
      </h2>

      {vedette === undefined ? (
        <div className="mt-3 mx-auto max-w-2xl aspect-video rounded-2xl glass animate-pulse" />
      ) : vedette ? (
        <Link
          to={`/v/${vedette.video_id}`}
          className="group mt-3 mx-auto max-w-2xl block rounded-2xl overflow-hidden border border-accent-gold/35 bg-ink-900 relative aspect-video"
        >
          {vedette.vignette && (
            <img src={vedette.vignette} alt="" className="w-full h-full object-cover" loading="lazy" />
          )}
          {/* Un voile en bas : le nom du buteur se pose dessus sans jamais
              tomber sur une zone claire de la vignette. */}
          <span className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ink-900/95 to-transparent" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-14 h-14 rounded-full bg-ink-900/80 ring-2 ring-accent-gold flex items-center justify-center
                             group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold ms-1">
                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
              </svg>
            </span>
          </span>
          <span className="absolute inset-x-0 bottom-0 p-4 text-start">
            <span className="block font-display text-lg sm:text-xl leading-tight text-cream">
              {vedette.buteur || affiche || vedette.titre}
            </span>
            <span className="block mt-0.5 text-[12px] text-slate-400">
              {[affiche && vedette.buteur ? affiche : '', vedette.competition, vedette.minute]
                .filter(Boolean).join(' · ')}
            </span>
          </span>
        </Link>
      ) : null}

      {autres.length > 0 && (
        <ul className="mt-3 mx-auto max-w-2xl divide-y divide-slate-100">
          {autres.map((v) => {
            const vign = vignetteDe(v)
            return (
              <li key={v.video_id}>
                <Link to={`/v/${v.video_id}`} className="group flex items-center gap-3 py-2.5">
                  <span className="relative w-16 h-10 rounded-lg overflow-hidden bg-ink-900 shrink-0">
                    {vign && <img src={vign} alt="" loading="lazy" className="w-full h-full object-cover" />}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-accent-gold/90 ms-0.5 drop-shadow">
                        <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                      </svg>
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate group-hover:text-accent-gold transition-colors">
                      {v.buteur ?? [v.equipe_dom, v.equipe_ext].filter(Boolean).join(' — ') ?? v.titre}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-wider text-slate-500 truncate">
                      {[v.competition, v.minute].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
