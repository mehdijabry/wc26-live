import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useBalayage } from '../lib/geste'
import { useT } from '../lib/i18n'
import { videosRecentes, vignetteDe, type VideoMatch } from '../lib/videos'

/**
 * LES SIX DERNIERS RÉSUMÉS, UN À LA FOIS, EN TÊTE DE L'ACCUEIL.
 *
 * Mehdi, 18/10/2026 : « les six derniers highlights publiés, qui défilent
 * toutes les cinq secondes, un à la fois, avec la même navigation que le
 * tableau des scores ».
 *
 * ── CE CARROUSEL NE BOUCLE PAS, ET C'EST LE POINT ─────────────────────────
 * Arrivé au sixième, on ne peut plus avancer : un bouton apparaît et
 * invite à ouvrir la page des résumés. Revenir en arrière reste possible.
 * Une boucle infinie donnerait l'illusion d'un fonds sans fin et ne
 * mènerait nulle part ; la butée, elle, transforme la fin du carrousel en
 * porte de sortie. Le défilement automatique s'arrête donc aussi au
 * sixième — sinon il repasserait au premier et contredirait la butée.
 *
 * ── TROIS ÉTATS, ET UN ÉCHEC N'EST PAS UN CHARGEMENT ─────────────────────
 * `null` = on ne sait pas encore ; liste vide = il n'y a rien et le bloc
 * entier disparaît. Un titre posé sur du vide est pire que pas de titre
 * (leçon du 17/10 sur la fiche de match).
 *
 * LE BOGUE DU 18/10 ÉTAIT ICI AUSSI. `videosRecentes` rend `null` quand la
 * lecture échoue, et ce composant faisait `if (!l) return` : l'état restait
 * à `null`, c'est-à-dire « en cours de chargement », et le squelette pulsait
 * pour toujours. Mehdi : « on voit juste un genre d'animation chargement
 * mais rien ne se passe, il faut absolument actualiser ». Deux états pour
 * trois situations : l'échec portait le costume de l'attente.
 *
 * Maintenant : on retente deux fois, en espaçant, puis on renonce — et
 * renoncer veut dire faire DISPARAÎTRE le bloc, pas laisser un squelette.
 * L'accueil a d'autres choses à montrer, et /resumes reste à un geste.
 */
export function ResumesALaUne() {
  const t = useT()
  const [liste, setListe] = useState<VideoMatch[] | null>(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    let vivant = true
    let horloge: number | undefined
    let essais = 0

    const charger = () => {
      void videosRecentes(null, 30).then((l) => {
        if (!vivant) return
        if (!l) {
          // ÉCHEC — et il faut le dire à l'écran, pas l'attendre. Deux
          // reprises : la première requête d'une page qui s'ouvre part
          // souvent avant que la connexion ne soit prête.
          if (++essais <= 2) { horloge = window.setTimeout(charger, 3000 * essais); return }
          setListe([])   // le bloc s'efface, aucun squelette ne survit
          return
        }
        // UN MATCH NE PASSE QU'UNE FOIS. Les diffuseurs publient souvent
        // deux versions du même match — le résumé court puis l'EXTENDED —
        // et sans ce tri l'accueil montrait Lorient - Monaco deux fois
        // d'affilée sur six vignettes (relevé le 18/10). On garde la
        // première, qui est la plus récente.
        const vus = new Set<string>()
        const retenus: VideoMatch[] = []
        for (const v of l) {
          if (v.kind === 'but') continue
          const cle = v.match_id ?? `${v.equipe_dom ?? ''}|${v.equipe_ext ?? ''}`
          if (vus.has(cle)) continue
          vus.add(cle); retenus.push(v)
          if (retenus.length === 6) break
        }
        setListe(retenus)
      })
    }
    charger()

    // L'APPAREIL QUI SE RÉVEILLE REDEMANDE. Un téléphone rouvert sur
    // l'onglet d'hier gardait l'écran de la veille ; et si le premier
    // chargement a renoncé, c'est ici qu'il repart.
    const auRetour = () => {
      if (document.hidden || !vivant) return
      essais = 0
      charger()
    }
    document.addEventListener('visibilitychange', auRetour)

    return () => {
      vivant = false
      if (horloge) clearTimeout(horloge)
      document.removeEventListener('visibilitychange', auRetour)
    }
  }, [])

  const n = liste?.length ?? 0
  const fin = n > 0 && i >= n - 1

  // ── LE DÉFILEMENT AUTOMATIQUE CÈDE LA MAIN ──────────────────────────
  // Il s'arrête net sur le dernier — sinon il repasserait au premier et
  // contredirait la butée — et il s'arrête DÉFINITIVEMENT dès que le
  // lecteur a navigué lui-même : revenir en arrière pour se faire
  // repousser en avant trois secondes plus tard rend le geste inutile.
  const iRef = useRef(i); iRef.current = i
  const nRef = useRef(n); nRef.current = n
  const [mainPrise, setMainPrise] = useState(false)
  useEffect(() => {
    if (n < 2 || mainPrise) return
    const id = window.setInterval(() => {
      if (iRef.current < nRef.current - 1) setI(iRef.current + 1)
    }, 5000)
    return () => clearInterval(id)
  }, [n, mainPrise])

  const auToucher = useBalayage((pas) => {
    setMainPrise(true)
    // On n'avance pas au-delà du dernier : c'est le bouton qui prend le
    // relais. Reculer reste permis jusqu'au premier.
    setI((v) => Math.min(Math.max(v + pas, 0), Math.max(nRef.current - 1, 0)))
  })

  if (liste === null) {
    return (
      <section className="mt-7">
        <div className="mx-auto max-w-2xl aspect-video rounded-2xl glass animate-pulse" />
      </section>
    )
  }
  if (n === 0) return null

  const v = liste[Math.min(i, n - 1)]
  const vign = vignetteDe(v)
  const affiche = [v.equipe_dom, v.equipe_ext].filter(Boolean).join(' — ')
  const score = v.score_dom !== null && v.score_ext !== null ? `${v.score_dom} – ${v.score_ext}` : ''

  return (
    <section className="mt-6" {...auToucher}>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-gold text-center">
        {t('Today’s highlights')}
      </h2>

      {/* `touch-pan-y` laisse la page défiler verticalement pendant qu'on
          balaie : sans elle le navigateur arbitre, et le geste horizontal
          passe une fois sur deux. */}
      <div className="mt-3 mx-auto max-w-2xl touch-pan-y select-none">
        <div className="relative rounded-2xl overflow-hidden border border-accent-gold/30 bg-ink-900 aspect-video">
          {/* FONDU CROISÉ, ET SURTOUT PAS `mode="wait"`. Avec lui, la
              nouvelle carte attend la SORTIE de l'ancienne — et une
              sortie qui ne s'achève jamais bloque le carrousel sur place.
              C'est exactement ce qui arrive quand l'onglet n'est pas
              rendu : framer-motion s'appuie sur requestAnimationFrame,
              qui ne tourne pas en arrière-plan (le même piège a fait
              croire le 17/10 que le tiroir du menu ne se fermait plus).
              Les deux cartes se superposent une fraction de seconde, et
              la vue est juste quoi qu'il arrive. */}
          <AnimatePresence>
            <motion.div
              key={v.video_id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
              className="absolute inset-0"
            >
              <Link to={`/v/${v.video_id}`} className="group absolute inset-0 block">
                {vign && <img src={vign} alt="" loading="lazy" className="w-full h-full object-cover" />}
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
                    {affiche || v.titre}
                  </span>
                  <span className="block mt-0.5 text-[12px] text-slate-400">
                    {[v.competition, score].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Où l'on en est. Six traits, pas de compteur ni de flèches : le
            bandeau des scores en avait quarante-huit et son « 5 / 48 »
            n'apprenait rien ; ici six repères disent d'un coup d'œil
            combien il en reste. */}
        <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden>
          {liste.map((x, k) => (
            <span
              key={x.video_id}
              className={'h-0.5 w-6 rounded-full transition-colors ' + (k === i ? 'bg-accent-gold' : 'bg-slate-300')}
            />
          ))}
        </div>

        {/* ── LA PORTE DE SORTIE ────────────────────────────────────────
            Elle n'apparaît qu'au bout : tant qu'il reste des résumés à
            voir, un bouton vers la page entière détournerait du carrousel.
            Au sixième, le geste vers l'avant ne mène plus nulle part — ce
            bouton devient la suite naturelle. */}
        <AnimatePresence>
          {fin && (
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22 }}
              className="mt-4 flex justify-center"
            >
              <Link
                to="/resumes"
                className="group relative inline-flex items-center gap-2.5 ps-5 pe-4 py-2.5 rounded-full
                           bg-accent-gold text-ink-900 font-semibold text-sm
                           shadow-[0_0_0_0_rgba(217,181,74,0.45)] active:scale-[0.98] transition-transform"
              >
                {/* L'anneau qui respire : il attire l'œil sans clignoter,
                    et s'arrête net au survol pour ne pas gêner la lecture. */}
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full ring-2 ring-accent-gold/60 animate-ping group-hover:animate-none"
                />
                <span className="relative">{t('See all highlights')}</span>
                <span className="relative transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
