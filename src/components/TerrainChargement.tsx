import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { cn } from '../lib/utils'

/**
 * L'étude du match, jouée pendant qu'elle se fait.
 *
 * ── POURQUOI ELLE DURE LONGTEMPS EXPRÈS ───────────────────────────────────
 * Le pronostic arrive en quelques centaines de millisecondes quand le cache
 * est chaud. Afficher la carte aussitôt donnerait l'impression qu'elle était
 * déjà là — or le joueur vient de payer pour une analyse, et une analyse
 * instantanée ne ressemble pas à une analyse.
 *
 * On déroule donc les HUIT ÉTAPES réellement effectuées en amont, dans leur
 * ordre logique : le marché d'abord, puis l'historique, puis le modèle, puis
 * les probabilités. Ce ne sont pas des libellés décoratifs — chacune
 * correspond à une donnée qui compose la carte (Mehdi, 2026-10-10).
 *
 * ── POURQUOI UNE DURÉE TIRÉE AU HASARD ────────────────────────────────────
 * Une durée fixe se repère au deuxième déblocage et sonne faux : on voit que
 * c'est une minuterie. Entre 7,5 et 10,3 secondes, chaque étude a son propre
 * rythme, comme un vrai calcul dont on ne connaît pas la durée d'avance.
 * Les ÉTAPES, elles, ne changent jamais : c'est la même méthode à chaque
 * fois, et c'est ce qui la rend crédible.
 *
 * ── CE QUI DÉCIDE DE LA FIN ───────────────────────────────────────────────
 * `onTermine` est appelé au bout. La carte attend DEUX choses : que la
 * donnée soit là ET que l'étude soit finie. Si le réseau traîne plus que
 * l'animation, c'est lui qui commande — on ne montre jamais une carte vide.
 */

/** Un 4-3-3, en pourcentage du terrain. L'axe x va de la défense à l'attaque. */
const POSTES: Array<[number, number]> = [
  [8, 50],
  [26, 18], [24, 39], [24, 61], [26, 82],
  [48, 28], [46, 50], [48, 72],
  [72, 20], [78, 50], [72, 80],
]

/**
 * Une passe toutes les 400 ms, vers un joueur tiré au sort.
 *
 * ── POURQUOI PLUS DE requestAnimationFrame ────────────────────────────────
 * La première version interpolait le ballon image par image. Elle avait un
 * défaut rédhibitoire : un onglet en arrière-plan ne reçoit PLUS AUCUNE
 * frame, donc le terrain se figeait net pendant que les étapes, portées par
 * des minuteries, continuaient de défiler. On voyait une étude avancer sur
 * un terrain mort.
 *
 * Ici le ballon saute d'un joueur à l'autre sur une minuterie, et c'est le
 * NAVIGATEUR qui interpole, par une transition CSS. Une minuterie est
 * ralentie en arrière-plan, jamais arrêtée, et au retour tout est à sa
 * place — alors qu'une boucle de frames, elle, ne reprend jamais seule.
 *
 * ── POURQUOI ALÉATOIRE ────────────────────────────────────────────────────
 * Une séquence fixe se reconnaît à la deuxième étude, exactement comme une
 * durée fixe (Mehdi, 2026-10-10). Le seul interdit est de se repasser le
 * ballon à soi-même.
 */
const PASSE = 400

/**
 * Les étapes, et le poids de chacune dans la durée totale.
 *
 * Les poids ne sont pas égaux : relever des cotes est rapide, ajuster un
 * modèle de buts l'est moins. Un défilement régulier trahirait la minuterie.
 */
const ETAPES: Array<{ cle: string; poids: number }> = [
  { cle: 'reading the odds', poids: 0.8 },
  { cle: 'collecting match history', poids: 1.4 },
  { cle: 'head-to-head', poids: 1.0 },
  { cle: 'both teams’ form', poids: 1.2 },
  { cle: 'injuries and suspensions', poids: 0.9 },
  { cle: 'goals model', poids: 1.5 },
  { cle: 'computing probabilities', poids: 1.3 },
  { cle: 'probable XI', poids: 0.9 },
]

const POIDS_TOTAL = ETAPES.reduce((s, e) => s + e.poids, 0)

export default function TerrainChargement({
  onTermine,
  compact = false,
}: {
  onTermine?: () => void
  compact?: boolean
}) {
  const t = useT()
  const [etape, setEtape] = useState(0)

  // Tirée UNE SEULE FOIS au montage, par l'initialiseur paresseux de
  // `useState` : écrite dans le corps du composant, elle serait retirée à
  // chaque rendu et l'étude changerait de durée en cours de route.
  const [dureeTotale] = useState(() => 7500 + Math.random() * 2800)

  // La dernière version du rappel, sans faire dépendre les minuteries de son
  // identité — sinon toute l'étude redémarrerait au moindre rendu du parent.
  const fini = useRef(onTermine)
  useEffect(() => {
    fini.current = onTermine
  }, [onTermine])

  // ── Le ballon ───────────────────────────────────────────────────────────
  // `porteur` est l'indice du joueur qui a la balle ; `precedent` sert à
  // tracer la passe qui vient d'être jouée.
  const [porteur, setPorteur] = useState(0)
  const [precedent, setPrecedent] = useState(0)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const m = window.setInterval(() => {
      setPorteur((actuel) => {
        setPrecedent(actuel)
        let suivant = actuel
        // Un joueur ne se fait pas une passe à lui-même.
        while (suivant === actuel) suivant = Math.floor(Math.random() * POSTES.length)
        return suivant
      })
    }, PASSE)
    return () => clearInterval(m)
  }, [])

  // ── Les étapes ──────────────────────────────────────────────────────────
  // Une minuterie par frontière plutôt qu'un intervalle : les étapes n'ont
  // pas la même durée, et un intervalle régulier les écraserait toutes à la
  // même longueur.
  useEffect(() => {
    const minuteries: number[] = []
    let cumul = 0
    ETAPES.forEach((e, i) => {
      cumul += (e.poids / POIDS_TOTAL) * dureeTotale
      if (i < ETAPES.length - 1) {
        minuteries.push(window.setTimeout(() => setEtape(i + 1), cumul))
      } else {
        minuteries.push(window.setTimeout(() => fini.current?.(), cumul))
      }
    })
    return () => minuteries.forEach(clearTimeout)
  }, [dureeTotale])

  const avancement = ((etape + 1) / ETAPES.length) * 100

  return (
    <div className={compact ? 'py-3' : 'py-6'}>
      <svg
        viewBox="0 0 100 100"
        className={compact ? 'w-full max-w-[200px] mx-auto block' : 'w-full max-w-[280px] mx-auto block'}
        role="img"
        aria-label={t('Loading the prediction')}
      >
        <rect x="2" y="2" width="96" height="96" fill="#0E1411" stroke="#212B26" strokeWidth="0.5" rx="1" />
        <line x1="50" y1="2" x2="50" y2="98" stroke="#212B26" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="12" fill="none" stroke="#212B26" strokeWidth="0.5" />
        <rect x="2" y="30" width="12" height="40" fill="none" stroke="#212B26" strokeWidth="0.5" />
        <rect x="86" y="30" width="12" height="40" fill="none" stroke="#212B26" strokeWidth="0.5" />

        {/* La passe qui vient d'être jouée. Elle se redessine à chaque
            changement de porteur, et s'efface d'elle-même. */}
        <line
          key={`${precedent}-${porteur}`}
          x1={POSTES[precedent][0]}
          y1={POSTES[precedent][1]}
          x2={POSTES[porteur][0]}
          y2={POSTES[porteur][1]}
          stroke="#D9B54A"
          strokeWidth="0.6"
          strokeLinecap="round"
          className="trace-passe"
        />
        {POSTES.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === porteur ? 3.2 : 1.7}
            fill="#D9B54A"
            opacity={i === porteur ? 1 : 0.45}
            style={{ transition: 'r .3s ease-out, opacity .3s ease-out' }}
          />
        ))}
        {/* Le ballon : c'est le NAVIGATEUR qui interpole le déplacement,
            d'où la transition sur la translation plutôt qu'un calcul par
            image. */}
        <g
          style={{
            transform: `translate(${POSTES[porteur][0]}px, ${POSTES[porteur][1]}px)`,
            transition: 'transform .34s cubic-bezier(.35,0,.25,1)',
          }}
        >
          <circle cx="0" cy="0" r="1.5" fill="#ECEFE8" />
        </g>
      </svg>

      {/* La progression. Une barre seule ne dirait pas CE QUI se fait ; la
          liste des étapes, si — et c'est elle qui rend l'attente acceptable. */}
      <div className="mt-4 mx-auto max-w-[300px]">
        <div className="h-0.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-accent-gold transition-[width] duration-500 ease-linear"
            style={{ width: `${avancement}%` }}
          />
        </div>

        <ul className="mt-3 space-y-1">
          {ETAPES.map((e, i) => {
            const faite = i < etape
            const courante = i === etape
            return (
              <li
                key={e.cle}
                className={cn(
                  'flex items-center gap-2 font-mono text-[11px] transition-colors duration-300',
                  faite ? 'text-slate-500' : courante ? 'text-accent-gold' : 'text-slate-300',
                )}
              >
                <span className="w-3 shrink-0 text-center" aria-hidden>
                  {faite ? '✓' : courante ? '›' : '·'}
                </span>
                <span className={cn(courante && 'animate-pulse')}>{t(e.cle)}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
