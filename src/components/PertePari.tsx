import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { Jeton } from './Jeton'

/**
 * LA SCÈNE D'UN PARI PERDU.
 *
 * ── CE QU'ELLE NE DOIT PAS ÊTRE ───────────────────────────────────────
 * Ni une fête inversée, ni une punition. Des confettis gris qui tombent
 * sont une moquerie ; un écran rouge qui claque est un reproche. Un joueur
 * qui perd sait déjà qu'il a perdu — l'écran n'a rien à lui apprendre là-
 * dessus. Ce qu'il peut faire, c'est le dire vite, le dire bien, et lui
 * rendre la main.
 *
 * ── D'OÙ LES TROIS CHOIX ──────────────────────────────────────────────
 *   · ELLE EST COURTE. 1,5 s contre 2,4 pour un gain. Une bonne nouvelle
 *     se savoure, une mauvaise s'expédie — la faire durer serait cruel.
 *   · ELLE NE TOMBE PAS, ELLE S'ÉTEINT. Des cendres qui descendent
 *     mimeraient la chute ; ici la lumière se retire et les grains
 *     s'évaporent sur place, en montant à peine. C'est la différence
 *     entre « tu as chuté » et « c'est passé ».
 *   · ELLE DIT CE QUI RESTE. La mise perdue, oui, mais aussi de combien
 *     on était loin — une jambe sur trois se rate autrement qu'un
 *     combiné entier.
 *
 * ── MOUVEMENT RÉDUIT ──────────────────────────────────────────────────
 * Elle ne s'affiche pas. Comme la fête, et pour la même raison.
 */

/** Cendre tiède, jamais de rouge vif : le rouge accuse. */
const COULEURS = ['#8A8176', '#6E655C', '#A8998A', '#5C544C']

type Grain = { x: number; y: number; vx: number; vy: number; r: number; vie: number; couleur: string }

export function PertePari({ mise, cote, jambes, gagnees, onFini, forcer }: {
  mise: number
  cote: number
  jambes: number
  /** Jambes gagnées malgré tout — « 2 sur 3 » console mieux que rien. */
  gagnees?: number
  onFini: () => void
  /** Aperçu seulement : joue malgré « réduire les animations ». */
  forcer?: boolean
}) {
  const t = useT()
  const toile = useRef<HTMLCanvasElement | null>(null)
  const [sortie, setSortie] = useState(false)

  const calme = !forcer && typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (calme) { onFini(); return }
    const c = toile.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) { onFini(); return }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const L = window.innerWidth, H = window.innerHeight
    c.width = L * dpr; c.height = H * dpr
    c.style.width = `${L}px`; c.style.height = `${H}px`
    ctx.scale(dpr, dpr)

    // Les grains naissent AUTOUR DU CHIFFRE, pas en haut de l'écran : ce
    // n'est pas une pluie qui tombe sur le joueur, c'est la mise qui se
    // disperse. Ils montent à peine et s'éteignent sur place.
    const grains: Grain[] = []
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * 90
      grains.push({
        x: L / 2 + Math.cos(a) * d,
        y: H / 2 + Math.sin(a) * d * 0.5,
        vx: (Math.random() - 0.5) * 0.7,
        vy: -0.25 - Math.random() * 0.5,
        r: 1.4 + Math.random() * 2.2,
        vie: 0.55 + Math.random() * 0.45,
        couleur: COULEURS[(Math.random() * COULEURS.length) | 0],
      })
    }

    let brut = 0, depart = 0
    const DUREE = 1500

    const pas = (maintenant: number) => {
      if (!depart) depart = maintenant
      const ecoule = maintenant - depart
      const reste = Math.max(0, 1 - ecoule / DUREE)
      ctx.clearRect(0, 0, L, H)
      for (const g of grains) {
        g.x += g.vx; g.y += g.vy
        g.vy -= 0.004                 // ils s'allègent en s'éteignant
        ctx.globalAlpha = g.vie * reste * 0.75
        ctx.fillStyle = g.couleur
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      if (ecoule < DUREE) brut = requestAnimationFrame(pas)
      else fermer()
    }
    brut = requestAnimationFrame(pas)

    const minuteur = window.setTimeout(() => fermer(), DUREE + 120)
    return () => { cancelAnimationFrame(brut); clearTimeout(minuteur) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fermer = () => {
    if (sortie) return
    setSortie(true)
    window.setTimeout(onFini, 300)
  }

  if (calme) return null

  return (
    <div
      role="presentation"
      onClick={fermer}
      className={'fixed inset-0 z-[80] flex items-center justify-center cursor-pointer transition-opacity duration-300 '
        + (sortie ? 'opacity-0' : 'opacity-100')}
    >
      <div className="absolute inset-0 bg-ink-900/85 backdrop-blur-[2px]" />
      {/* UNE SEULE LUEUR, FROIDE ET BASSE, qui se retire. Pas de halo qui
          respire : il y a un moment pour la lumière, et ce n'est pas
          celui-ci. */}
      <div className="p90-perte-lueur absolute inset-0 pointer-events-none" />

      <canvas ref={toile} className="absolute inset-0 pointer-events-none" />

      <div className="relative text-center px-6 p90-perte-entre">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-400">
          {t('Bet lost')}
        </p>
        <p className="mt-2 flex items-center justify-center gap-2 font-display text-5xl sm:text-6xl font-bold
                      text-slate-300 tabular-nums">
          −{mise}
          <Jeton type="crampon" taille={30} />
        </p>
        {/* CE QUI RESTE : de combien on était loin. « 2 sur 3 » n'est pas
            la même défaite que « 0 sur 3 », et le dire vaut mieux que de
            laisser le joueur l'ignorer. */}
        <p className="mt-3 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1
                      rounded-full bg-white/[0.07] px-4 py-1.5 font-mono text-[11.5px] text-slate-400 tabular-nums">
          {typeof gagnees === 'number' && jambes > 1 && (
            <>
              <span>{gagnees} {t('won of')} {jambes} {t('won')}</span>
              <span className="text-slate-600">·</span>
            </>
          )}
          <span>@ {cote.toFixed(2)}</span>
          <span className="text-slate-600">·</span>
          <span>{jambes} {jambes > 1 ? t('selections') : t('selection')}</span>
        </p>
        <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent-gold/70">
          {t('Next one is waiting')}
        </p>
      </div>
    </div>
  )
}

export default PertePari
