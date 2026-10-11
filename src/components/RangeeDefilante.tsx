import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * Une rangée qui défile horizontalement, et qui le DIT.
 *
 * ── LE PROBLÈME ───────────────────────────────────────────────────────────
 * Un ami de Mehdi n'a pas compris que la rangée des compétitions défilait :
 * il voyait « Serie A » coupée au bord de l'écran, appuyait dessus, et rien
 * ne bougeait (11/10/2026). Rien dans l'image ne disait qu'il y avait une
 * suite.
 *
 * Deux réponses, et il faut les deux :
 *
 * 1. APPUYER SUR UN ÉLÉMENT COUPÉ LE RAMÈNE EN ENTIER. C'est le geste que
 *    tout le monde fait d'instinct, et le mouvement qui s'ensuit enseigne
 *    que la rangée bouge. On laisse en plus dépasser un bout du voisin :
 *    un élément calé pile contre le bord redonne l'impression d'une fin.
 *
 * 2. UN FONDU AU BORD, et seulement du côté où il reste quelque chose. Un
 *    dégradé permanent mentirait une fois la rangée au bout.
 */
export default function RangeeDefilante({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const piste = useRef<HTMLDivElement>(null)
  const [reste, setReste] = useState({ gauche: false, droite: false })

  const mesurer = useCallback(() => {
    const p = piste.current
    if (!p) return
    // Une marge d'un pixel : les navigateurs rendent parfois un
    // scrollLeft fractionnaire et le fondu clignoterait en fin de course.
    setReste({
      gauche: p.scrollLeft > 1,
      droite: p.scrollLeft + p.clientWidth < p.scrollWidth - 1,
    })
  }, [])

  useEffect(() => {
    const p = piste.current
    if (!p) return
    mesurer()
    p.addEventListener('scroll', mesurer, { passive: true })
    // Le contenu change (un autre jour, d'autres compétitions) sans que la
    // rangée ne défile : sans observateur, le fondu resterait sur l'état
    // d'avant.
    const ro = new ResizeObserver(mesurer)
    ro.observe(p)
    for (const e of Array.from(p.children)) ro.observe(e)
    return () => {
      p.removeEventListener('scroll', mesurer)
      ro.disconnect()
    }
  }, [mesurer, children])

  return (
    <div className="relative">
      <div
        ref={piste}
        onClick={(e) => revelerEnEntier(e.target as HTMLElement, piste.current)}
        className={cn('flex overflow-x-auto no-scrollbar', className)}
      >
        {children}
      </div>
      {/* `pointer-events-none` : le fondu ne doit jamais avaler un clic sur
          l'élément qu'il recouvre à moitié. */}
      <Fondu cote="start" visible={reste.gauche} />
      <Fondu cote="end" visible={reste.droite} />
    </div>
  )
}

function Fondu({ cote, visible }: { cote: 'start' | 'end'; visible: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-y-0 w-7 transition-opacity duration-200',
        cote === 'start' ? 'start-0' : 'end-0',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        // Le sol de la page. Ces rangées y sont toutes posées ; si l'une
        // passait un jour sur une carte (#121916), il faudrait le passer en
        // paramètre plutôt que de laisser un fondu vers la mauvaise couleur.
        //
        // TROIS ARRÊTS, PAS DEUX. Un dégradé linéaire de l'opaque au
        // transparent sur toute la largeur assombrit la pastille qu'il
        // recouvre — « Serie A · 5 » arrivait avec son chiffre grisé, et ça
        // se lisait comme une tache (Mehdi, 2026-10-11). Ici l'opacité
        // s'effondre dans le premier tiers : le bord est net, le reste est
        // déjà presque transparent.
        background:
          `linear-gradient(to ${cote === 'start' ? 'right' : 'left'},` +
          ' #0B0F0D 0%, rgba(11,15,13,0.72) 34%, rgba(11,15,13,0) 100%)',
      }}
    />
  )
}

/**
 * Ramène l'élément touché entièrement dans la vue.
 *
 * On calcule au lieu d'appeler `scrollIntoView` : celui-ci fait aussi
 * défiler la PAGE quand l'élément n'est pas verticalement visible, et une
 * rangée collante sous l'en-tête ferait sauter tout l'écran.
 */
function revelerEnEntier(cible: HTMLElement | null, piste: HTMLDivElement | null) {
  if (!cible || !piste) return
  // On remonte jusqu'à l'enfant direct de la piste : le clic peut atterrir
  // sur un <span> à l'intérieur du bouton.
  let el: HTMLElement | null = cible
  while (el && el.parentElement !== piste) el = el.parentElement
  if (!el) return

  // ON MESURE EN COORDONNÉES ÉCRAN, pas avec `offsetLeft`. Ces rangées
  // portent un `px-4` qui déborde sous le bord (`-mx-4`) : `offsetLeft` et
  // `clientWidth` comptent ce rembourrage, et une marge demandée à 36 px
  // arrivait à 20 à l'écran — l'élément révélé finissait sous le fondu.
  // `getBoundingClientRect` ignore tout ça.
  //
  // La marge est volontairement PLUS LARGE que le fondu (28 px), sinon le
  // dernier caractère de l'élément révélé reste grisé. Elle laisse en plus
  // dépasser un bout du voisin — c'est ça qui dit « il y a une suite ».
  const MARGE = 36
  const vue = piste.getBoundingClientRect()
  const boite = el.getBoundingClientRect()
  let delta = 0
  if (boite.left - MARGE < vue.left) delta = boite.left - MARGE - vue.left
  else if (boite.right + MARGE > vue.right) delta = boite.right + MARGE - vue.right
  if (Math.abs(delta) < 1) return

  const doux = !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  piste.scrollTo({ left: Math.max(0, piste.scrollLeft + delta), behavior: doux ? 'smooth' : 'auto' })
}
