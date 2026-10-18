import { useRef } from 'react'
import type { TouchEvent, WheelEvent } from 'react'

/**
 * BALAYER OU MOLETTER POUR PASSER AU SUIVANT.
 *
 * Extrait du bandeau des scores le 18/10/2026, quand le carrousel des
 * résumés a demandé exactement le même geste. Deux occurrences : c'est le
 * moment de mettre la règle en commun plutôt que de la recopier.
 *
 * Les deux garde-fous sont la raison d'être de ce fichier, et ils ne se
 * devinent pas :
 *
 *   · LE VERROU de 350 ms. Une molette inertielle — le trackpad d'un Mac,
 *     le défilement par élan d'un téléphone — envoie une centaine
 *     d'événements pour un seul coup de doigt. Sans verrou, l'utilisateur
 *     traverse vingt vues d'un geste et ne voit rien.
 *   · LE SEUIL D'HORIZONTALITÉ. Un balayage n'est retenu que s'il dépasse
 *     40 px ET s'il est deux fois plus large que haut. Sans cette seconde
 *     condition, défiler la page du pouce ferait sauter la vue à chaque
 *     fois qu'on passe le doigt sur le bandeau.
 *
 * `aller(+1)` avance, `aller(-1)` recule. À l'appelant de décider ce qu'il
 * fait d'un pas qu'il refuse — boucler, s'arrêter, proposer autre chose.
 */
export function useBalayage(aller: (pas: number) => void) {
  const feuille = useRef(0)
  const depart = useRef<{ x: number; y: number } | null>(null)

  const pas = (n: number) => {
    const t = Date.now()
    if (t - feuille.current < 350) return
    feuille.current = t
    aller(n)
  }

  return {
    onTouchStart: (e: TouchEvent) => {
      depart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    },
    onTouchEnd: (e: TouchEvent) => {
      const d = depart.current; depart.current = null
      if (!d) return
      const dx = e.changedTouches[0].clientX - d.x
      const dy = e.changedTouches[0].clientY - d.y
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 2) return
      pas(dx < 0 ? 1 : -1)
    },
    onWheel: (e: WheelEvent) => {
      // La molette VERTICALE compte aussi : c'est elle qu'on a sous le
      // doigt sur une souris, et ces carrousels n'ont rien d'autre à
      // faire défiler. On ne retient que le mouvement dominant.
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (Math.abs(d) < 8) return
      pas(d > 0 ? 1 : -1)
    },
  }
}
