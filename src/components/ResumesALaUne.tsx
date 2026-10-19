import { useCallback, useEffect, useRef, useState } from 'react'
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
/** Au-delà de ce tirage, le lien accepte le clic (Mehdi, 19/10/2026). */
const SEUIL_CLIC = 0.45
/** La bande de droite qui réagit au survol de la souris. */
const ZONE_SOURIS = 0.42
/** Le rebond de l'invite — voir `rebondir` pour le pourquoi de chaque valeur. */
const REBOND = { sommet: 0.42, rendu: 0.66, duree: 900, bonds: 4, pause: 4000 }

/** Les vols successifs : [durée, sommet]. Calculés une fois. */
const VOLS: Array<[number, number]> = Array.from({ length: REBOND.bonds }, (_, i) => [
  REBOND.duree * REBOND.rendu ** i,
  REBOND.sommet * REBOND.rendu ** i,
])
const VOL_TOTAL = VOLS.reduce((s, v) => s + v[0], 0)

/** La hauteur du ballon à l'instant `t` de la série (ms). */
function hauteurDuBallon(t: number): number {
  for (const [duree, sommet] of VOLS) {
    if (t < duree) { const u = t / duree; return sommet * 4 * u * (1 - u) }
    t -= duree
  }
  return 0
}

/**
 * LE VOILE DE SORTIE — la porte vers la page des résumés.
 *
 * Mehdi, 19/10/2026 : « ce bouton me dérange, je n'aime pas le mécanisme
 * ni l'animation ; je veux comme un voile qui se décolle du côté droit de
 * l'aperçu pour laisser apparaître un bouton — une flèche sans cadre, et
 * écrit à gauche de la flèche "see all highlights" ».
 *
 * Avant, un bouton doré apparaissait SOUS le cadre, avec un anneau qui
 * pulsait. Deux défauts : il sortait de l'image, et son anneau battait
 * sans rien dire. Ici la carte elle-même livre le lien.
 *
 * ── L'ÉTOFFE S'ÉPAISSIT VERS LA DROITE ───────────────────────────────
 * Elle laisse la gauche dégagée — l'action de la vidéo reste lisible — et
 * ne pèse que là où le lien va naître. Pas de flou : on devine l'image au
 * travers, c'est ce qui distingue un voile d'un cache. Elle se retire par
 * la droite, donc le lien se découvre exactement là où elle était la plus
 * épaisse.
 *
 * ── LE REBOND EST UNE PARABOLE, PAS UN VA-ET-VIENT ───────────────────
 * « Il faut que le mouvement simule un rebondissement de ballon. » Chaque
 * bond est donc une parabole — vite au décollage et à la retombée, lent au
 * sommet — et le suivant monte moins haut ET dure moins longtemps, dans le
 * MÊME rapport. C'est ce rapport unique qui fait reconnaître un ballon
 * plutôt qu'une animation : un ballon qui reprend les deux tiers de sa
 * hauteur reprend aussi les deux tiers de son temps de vol.
 *
 * ── RIEN NE PASSE PAR L'ÉTAT REACT ───────────────────────────────────
 * La progression vit dans une variable CSS posée à la main sur le nœud.
 * Soixante rendus React par seconde pendant la série de bonds feraient
 * repasser tout le carrousel — vignette, légende, points — pour déplacer
 * un dégradé. Et `framer-motion` est écarté ici : il s'appuie sur
 * `requestAnimationFrame`, qui ne tourne pas dans un onglet caché, et on
 * s'est déjà fait prendre sur ce carrousel le 17/10.
 */
function VoileDeSortie({ actif }: { actif: boolean }) {
  const t = useT()
  const cadre = useRef<HTMLDivElement | null>(null)
  const progression = useRef(0)
  const image = useRef(0)
  const minuteur = useRef<number | undefined>(undefined)
  const glisse = useRef<{ x0: number; p0: number } | null>(null)

  const poser = useCallback((v: number) => {
    const n = Math.max(0, Math.min(1, v))
    progression.current = n
    const el = cadre.current
    if (!el) return
    el.style.setProperty('--p', n.toFixed(4))
    // Le lien n'accepte le clic qu'une fois réellement découvert : sous ce
    // seuil il serait invisible et cliquable, ce qui vole le clic destiné
    // à la vidéo.
    el.dataset.ouvert = n >= SEUIL_CLIC ? '1' : '0'
  }, [])

  // ── L'invite, et son silence dès qu'une main s'en mêle ──────────────
  const taire = useCallback(() => {
    window.clearTimeout(minuteur.current)
    cancelAnimationFrame(image.current)
    minuteur.current = undefined
  }, [])

  const rebondir = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t0 = performance.now()
    const pas = (now: number) => {
      const dt = now - t0
      if (dt >= VOL_TOTAL) {
        poser(0)
        minuteur.current = window.setTimeout(rebondir, REBOND.pause)
        return
      }
      poser(hauteurDuBallon(dt))
      image.current = requestAnimationFrame(pas)
    }
    image.current = requestAnimationFrame(pas)
  }, [poser])

  const glisserVers = useCallback((vers: number, duree: number, fini?: () => void) => {
    const depart = progression.current, t0 = performance.now()
    cancelAnimationFrame(image.current)
    const pas = (now: number) => {
      const k = Math.min(1, (now - t0) / duree)
      poser(depart + (vers - depart) * (1 - (1 - k) ** 3))
      if (k < 1) image.current = requestAnimationFrame(pas)
      else fini?.()
    }
    image.current = requestAnimationFrame(pas)
  }, [poser])

  const rendreLaMain = useCallback(() => {
    taire()
    glisserVers(0, 300, () => { minuteur.current = window.setTimeout(rebondir, REBOND.pause) })
  }, [taire, glisserVers, rebondir])

  // Le rebond ne vit que pendant que le dernier résumé est à l'écran.
  useEffect(() => {
    if (!actif) { taire(); poser(0); return }
    minuteur.current = window.setTimeout(rebondir, 700)
    return () => { taire(); poser(0) }
  }, [actif, taire, poser, rebondir])

  // ── LES GESTES VIVENT SUR LA CARTE, PAS SUR LE VOILE ────────────────
  // Le voile recouvre tout le cadre. Lui laisser les événements du
  // pointeur lui ferait avaler le clic destiné à la VIDÉO — or seul le
  // lien « see all highlights » doit mener aux résumés (Mehdi, 19/10).
  // L'étoffe est donc transparente aux clics, et c'est la carte qui
  // écoute : les événements y remontent de toute façon.
  useEffect(() => {
    const carte = cadre.current?.parentElement
    if (!actif || !carte) return
    let aGlisse = false

    const survol = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || glisse.current) return
      taire()
      const r = carte.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const seuil = 1 - ZONE_SOURIS
      poser(x <= seuil ? 0 : Math.min(1, (x - seuil) / (ZONE_SOURIS * 0.78)))
    }
    const descendre = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      taire(); aGlisse = false
      glisse.current = { x0: e.clientX, p0: progression.current }
    }
    const bouger = (e: PointerEvent) => {
      const g = glisse.current
      if (!g) return survol(e)
      if (Math.abs(e.clientX - g.x0) > 8) aGlisse = true
      // Vers la GAUCHE on ouvre. La course utile vaut 60 % de la carte :
      // c'est un pouce, pas un curseur, le geste doit rester court. Tirer
      // vers la droite laisse le voile à zéro et `useBalayage` reprend la
      // main pour revenir au résumé précédent.
      poser(g.p0 + (g.x0 - e.clientX) / (carte.getBoundingClientRect().width * 0.6))
    }
    const lever = () => {
      if (!glisse.current) return
      glisse.current = null
      if (progression.current >= 0.5) glisserVers(1, 240)
      else rendreLaMain()
    }
    const sortir = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || glisse.current) return
      rendreLaMain()
    }
    // UN GLISSEMENT N'EST PAS UN CLIC. Sans ce garde, tirer le voile au
    // pouce ouvrait la vidéo en relâchant.
    const clic = (e: MouseEvent) => { if (aGlisse) { e.preventDefault(); e.stopPropagation(); aGlisse = false } }

    carte.addEventListener('pointermove', survol)
    carte.addEventListener('pointerdown', descendre)
    carte.addEventListener('pointermove', bouger)
    carte.addEventListener('pointerup', lever)
    carte.addEventListener('pointercancel', lever)
    carte.addEventListener('pointerleave', sortir)
    carte.addEventListener('click', clic, true)
    return () => {
      carte.removeEventListener('pointermove', survol)
      carte.removeEventListener('pointerdown', descendre)
      carte.removeEventListener('pointermove', bouger)
      carte.removeEventListener('pointerup', lever)
      carte.removeEventListener('pointercancel', lever)
      carte.removeEventListener('pointerleave', sortir)
      carte.removeEventListener('click', clic, true)
    }
  }, [actif, taire, poser, glisserVers, rendreLaMain])

  return (
    <div
      ref={cadre}
      style={{ ['--p' as string]: 0 }}
      data-ouvert="0"
      className="absolute inset-0 pointer-events-none group/voile"
    >
      {/* LE NŒUD RESTE MONTÉ, L'ÉTOFFE NON. Le conteneur doit exister pour
          que l'effet ci-dessus trouve la carte à écouter ; mais hors du
          dernier résumé il n'y a rien à voiler, et une étoffe à `--p: 0`
          assombrirait la droite de CHAQUE vignette. */}
      {actif && (<>
      {/* L'ÉTOFFE. Le masque efface son bord DROIT en premier : le lien se
          découvre là où elle était la plus épaisse. Les 64 px de dégradé
          donnent un bord souple, pas une coupe au ciseau. */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to right, rgba(11,15,13,0) 0%, rgba(11,15,13,0.096) 26%,'
            + ' rgba(11,15,13,0.33) 58%, rgba(11,15,13,0.6) 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, #000 calc(100% - var(--p) * 100% - 64px), transparent calc(100% - var(--p) * 100%))',
          maskImage:
            'linear-gradient(to right, #000 calc(100% - var(--p) * 100% - 64px), transparent calc(100% - var(--p) * 100%))',
        }}
      />

      {/* L'APPEL : la flèche nue, le texte à sa gauche, aucun cadre.
          Il ne prend le clic qu'une fois découvert — d'où `data-ouvert`. */}
      <Link
        to="/resumes"
        className="absolute end-[5%] top-1/2 inline-flex items-center gap-3 whitespace-nowrap
                   font-display font-bold text-cream tracking-wide text-lg sm:text-2xl
                   pointer-events-none group-data-[ouvert=1]/voile:pointer-events-auto"
        style={{
          opacity: 'calc((var(--p) - 0.14) * 2.3)',
          translate: 'calc((1 - var(--p)) * 26px) -50%',
          textShadow: '0 2px 18px rgba(11,15,13,0.95), 0 0 6px rgba(11,15,13,0.7)',
        }}
      >
        <span>{t('See all highlights')}</span>
        <svg width="32" height="19" viewBox="0 0 34 20" aria-hidden
             className="shrink-0 stroke-accent-gold fill-none" strokeWidth="2.1"
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 10h30M24 3l7 7-7 7" />
        </svg>
      </Link>
      </>)}
    </div>
  )
}

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

          {/* LA PORTE DE SORTIE EST DANS LE CADRE, plus en dessous.
              Elle ne s'arme qu'au dernier résumé : tant qu'il en reste à
              voir, un appel vers la page entière détournerait du
              carrousel. Au sixième, le geste vers l'avant ne mène nulle
              part — l'étoffe prend le relais. */}
          <VoileDeSortie actif={fin} />
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

      </div>
    </section>
  )
}
