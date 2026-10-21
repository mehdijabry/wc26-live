import { useEffect, useRef } from 'react'
import { useGain } from '../store/gain'
import { Jeton } from './Jeton'

/**
 * LA SCÈNE D'UN GAIN DE JETONS — montée une fois, pour tout le site.
 *
 * ── POURQUOI ELLE N'EST PAS LA FÊTE D'UN PARI GAGNÉ ───────────────────
 * Un pari gagné est un événement : il arrive rarement, il mérite deux
 * secondes et demie et un écran qu'on arrête de lire. Une réclamation est
 * un geste QUOTIDIEN — le bonus de groupe se prend tous les jours. Lui
 * donner la même cérémonie la viderait de son sens en une semaine, et
 * rendrait le bonus pénible à prendre.
 *
 * D'où trois différences, et elles sont délibérées :
 *   · 1,3 s au lieu de 2,4 ;
 *   · AUCUN VOILE : la page reste lisible et cliquable derrière
 *     (`pointer-events: none`). Une récompense ne doit jamais bloquer ce
 *     qu'on était en train de faire ;
 *   · la couleur suit le jeton — l'or du pressing, la terre du crampon —
 *     pour qu'on sache ce qu'on vient de gagner sans lire.
 *
 * ── MOUVEMENT RÉDUIT ──────────────────────────────────────────────────
 * Rien ne s'affiche, et le gain reste visible dans le solde de l'en-tête.
 */

const PALETTES: Record<string, string[]> = {
  pressing: ['#D9B54A', '#F2E6C2', '#FFFFFF', '#C9A227'],
  crampon: ['#C08A4E', '#E3C9A8', '#FFFFFF', '#8E6235'],
}

type Grain = { x: number; y: number; vx: number; vy: number; r: number; couleur: string }
const GRAVITE = 0.3

export function GainJetons() {
  const annonce = useGain((s) => s.annonce)
  const fini = useGain((s) => s.fini)
  const toile = useRef<HTMLCanvasElement | null>(null)

  const calme = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (!annonce) return
    if (calme) { fini(annonce.cle); return }
    const c = toile.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) { fini(annonce.cle); return }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const L = window.innerWidth, H = window.innerHeight
    c.width = L * dpr; c.height = H * dpr
    c.style.width = `${L}px`; c.style.height = `${H}px`
    ctx.scale(dpr, dpr)

    // UNE SEULE BOUFFÉE, depuis le chiffre. Les deux gerbes de la fête
    // viennent des coins et prennent tout l'écran : ici la récompense est
    // petite, et la scène doit l'être aussi.
    const couleurs = PALETTES[annonce.type] ?? PALETTES.pressing
    const cx = L / 2, cy = H / 2
    const grains: Grain[] = []
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1
      // Même calcul que la fête : la vitesse se déduit de la hauteur
      // visée — ici un quart d'écran, pas les trois quarts.
      const v = Math.sqrt(2 * GRAVITE * H * (0.12 + Math.random() * 0.14))
      grains.push({
        x: cx, y: cy,
        vx: Math.cos(a) * v * 0.65, vy: Math.sin(a) * v,
        r: 2 + Math.random() * 3.4,
        couleur: couleurs[(Math.random() * couleurs.length) | 0],
      })
    }

    let brut = 0, depart = 0
    const DUREE = 1300
    const pas = (maintenant: number) => {
      if (!depart) depart = maintenant
      const ecoule = maintenant - depart
      const alpha = ecoule > DUREE - 450 ? Math.max(0, (DUREE - ecoule) / 450) : 1
      ctx.clearRect(0, 0, L, H)
      for (const g of grains) {
        g.vy += GRAVITE
        g.x += g.vx; g.y += g.vy
        ctx.globalAlpha = alpha
        ctx.fillStyle = g.couleur
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      if (ecoule < DUREE) brut = requestAnimationFrame(pas)
      else fini(annonce.cle)
    }
    brut = requestAnimationFrame(pas)
    const minuteur = window.setTimeout(() => fini(annonce.cle), DUREE + 150)
    return () => { cancelAnimationFrame(brut); clearTimeout(minuteur) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annonce?.cle])

  if (!annonce || calme) return null

  return (
    // `pointer-events-none` SUR TOUT : on ne vole pas le clic suivant.
    <div key={annonce.cle} className="fixed inset-0 z-[75] pointer-events-none flex items-center justify-center">
      <canvas ref={toile} className="absolute inset-0" />
      <div className="p90-gain-monte relative flex items-center gap-2 font-display text-5xl font-bold
                      text-white tabular-nums [text-shadow:0_2px_18px_rgba(0,0,0,.6)]">
        +{annonce.montant}
        <Jeton type={annonce.type} taille={30} />
      </div>
    </div>
  )
}

export default GainJetons
