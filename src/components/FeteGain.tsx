import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n'
import { Jeton } from './Jeton'

/**
 * LA FÊTE D'UN PARI GAGNÉ.
 *
 * Mehdi, 21/10/2026 : « quand un utilisateur appuie pour la première fois
 * sur une notification de pari gagné, une animation s'affiche avec
 * confettis et jeux de lumière avant de le ramener directement sur ce pari
 * précisément ».
 *
 * ── CE QU'ELLE CHERCHE ────────────────────────────────────────────────
 * Que la RÉCOMPENSE arrive avant l'information. Un gain annoncé par une
 * ligne de liste se lit comme un relevé bancaire ; la même somme précédée
 * de deux secondes de lumière se retient. C'est aussi le seul moment où
 * l'envie de partager existe — d'où le bouton qui s'anime juste après.
 *
 * ── CE QU'ELLE N'EST PAS ──────────────────────────────────────────────
 * Un obstacle. Elle dure 2,4 secondes, un appui l'interrompt, et elle ne
 * revient JAMAIS sur le même bulletin : ce qui enchante une fois agace la
 * deuxième. Le témoin est posé par l'appelant, pas ici.
 *
 * ── MOUVEMENT RÉDUIT ──────────────────────────────────────────────────
 * Elle ne s'affiche pas du tout. Une préférence système qui dit « pas
 * d'animation » ne se négocie pas, et le pari reste accessible dessous —
 * c'est lui qui compte.
 */

/** Les couleurs du site, et elles seules : une fête aux couleurs d'ailleurs n'est pas la nôtre. */
const COULEURS = ['#D9B54A', '#F2E6C2', '#4ADE80', '#FFFFFF', '#C9A227']

/** Pixels par image au carré. Tout le reste s'en déduit. */
const GRAVITE = 0.26

type Grain = {
  x: number; y: number; vx: number; vy: number
  taille: number; angle: number; vitesseAngle: number; couleur: string; forme: 0 | 1
}

export function FeteGain({ gain, mise, cote, jambes, onFini, forcer }: {
  gain: number
  mise: number
  cote: number
  jambes: number
  onFini: () => void
  /** APERÇU SEULEMENT : joue malgré « réduire les animations ».
   *  Chez un joueur, la préférence système ne se discute pas — mais pour
   *  JUGER l'animation il faut pouvoir la voir, et la machine qui la règle
   *  peut très bien avoir le mouvement réduit activé. C'est exactement ce
   *  qui s'est passé le 21/10 : rien ne s'affichait, et rien ne disait
   *  pourquoi. */
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

    // ÉCHELLE DE L'ÉCRAN. Sans elle, les confettis sont flous sur tout
    // téléphone moderne — et un confetti flou se lit comme un défaut.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const L = window.innerWidth, H = window.innerHeight
    c.width = L * dpr; c.height = H * dpr
    c.style.width = `${L}px`; c.style.height = `${H}px`
    ctx.scale(dpr, dpr)

    // Deux gerbes partant des coins bas, comme deux canons : une pluie
    // qui tombe du haut ressemble à de la neige, pas à une victoire.
    const grains: Grain[] = []
    const gerbe = (ox: number, sens: number) => {
      for (let i = 0; i < 55; i++) {
        const a = (-Math.PI / 2) + sens * (Math.random() * 0.75 + 0.12)
        // LA VITESSE SE CALCULE, ELLE NE SE DEVINE PAS. Une valeur en dur
        // montait au tiers d'un écran de téléphone et au dixième d'un
        // écran d'ordinateur. Pour qu'un grain culmine à la hauteur `h`
        // sous une gravité `g`, il part à racine de 2gh : on vise entre
        // 45 % et 80 % de l'écran, quelle que soit sa taille.
        const v = Math.sqrt(2 * GRAVITE * H * (0.45 + Math.random() * 0.35))
        grains.push({
          x: ox, y: H + 10,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          taille: 5 + Math.random() * 6,
          angle: Math.random() * Math.PI,
          vitesseAngle: (Math.random() - 0.5) * 0.3,
          couleur: COULEURS[(Math.random() * COULEURS.length) | 0],
          forme: Math.random() < 0.5 ? 0 : 1,
        })
      }
    }
    gerbe(L * 0.12, 1)
    gerbe(L * 0.88, -1)

    let brut = 0
    let depart = 0
    const DUREE = 2400

    const pas = (maintenant: number) => {
      if (!depart) depart = maintenant
      const ecoule = maintenant - depart
      ctx.clearRect(0, 0, L, H)
      for (const g of grains) {
        g.vy += GRAVITE
        g.vx *= 0.995                // l'air freine, un peu
        g.x += g.vx; g.y += g.vy
        g.angle += g.vitesseAngle
        // Les derniers 600 ms s'effacent : couper net ferait disparaître
        // les confettis en plein vol.
        const alpha = ecoule > DUREE - 600 ? Math.max(0, (DUREE - ecoule) / 600) : 1
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(g.x, g.y)
        ctx.rotate(g.angle)
        ctx.fillStyle = g.couleur
        if (g.forme === 0) ctx.fillRect(-g.taille / 2, -g.taille / 4, g.taille, g.taille / 2)
        else { ctx.beginPath(); ctx.arc(0, 0, g.taille / 2.6, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
      }
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
    // On laisse le fondu se jouer avant de démonter.
    window.setTimeout(onFini, 320)
  }

  if (calme) return null

  return (
    <div
      role="presentation"
      onClick={fermer}
      className={'fixed inset-0 z-[80] flex items-center justify-center cursor-pointer transition-opacity duration-300 '
        + (sortie ? 'opacity-0' : 'opacity-100')}
    >
      {/* LE JEU DE LUMIÈRE — sous les confettis, au-dessus de la page.
          Un voile sombre pour que l'or ressorte, et deux halos qui
          respirent : c'est la lumière qui fait l'événement, les confettis
          ne font que le ponctuer. */}
      <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-[2px]" />
      <div className="p90-fete-halo absolute inset-0 pointer-events-none" />

      <canvas ref={toile} className="absolute inset-0 pointer-events-none" />

      {/* LE GAIN D'ABORD, LE CALCUL ENSUITE.
          Mehdi, 21/10 : « on affiche le montant gagné et sa mise de base ».
          Le grand chiffre est la récompense ; la ligne du dessous est la
          preuve — mise, cote, nombre de sélections. Sans elle, le gain
          tombe du ciel ; avec elle, il est mérité.
          Et les chiffres viennent du BULLETIN, pas de l'adresse : une fête
          qui annoncerait autre chose que le ticket juste en dessous serait
          pire que pas de fête du tout. */}
      <div className="relative text-center px-6 p90-fete-entre">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-accent-gold/90">
          {t('Bet won')}
        </p>
        <p className="mt-2 flex items-center justify-center gap-2 font-display text-6xl sm:text-7xl font-bold text-white tabular-nums
                      [text-shadow:0_0_40px_rgba(217,181,74,.55)]">
          +{gain}
          <Jeton type="pressing" taille={36} />
        </p>
        <p className="mt-3 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1
                      rounded-full bg-white/10 px-4 py-1.5 font-mono text-[11.5px] text-white/85 tabular-nums">
          <span className="inline-flex items-center gap-1">
            {t('Stake')} {mise} <Jeton type="crampon" taille={11} />
          </span>
          <span className="text-white/35">·</span>
          <span>@ {cote.toFixed(2)}</span>
          <span className="text-white/35">·</span>
          <span>{jambes} {jambes > 1 ? t('selections') : t('selection')}</span>
        </p>
      </div>
    </div>
  )
}

export default FeteGain
