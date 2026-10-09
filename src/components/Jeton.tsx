import { useId } from 'react'
import { JETON, POINT } from '../lib/jeu'

/**
 * Les deux jetons du jeu, dessinés.
 *
 * Avant, le portefeuille affichait « ⚽ 1 » puis un chiffre doré : l'emoji
 * disait « football », pas « ce que je mise », et les pressings n'avaient
 * aucun signe à eux. Deux pastilles distinctes se reconnaissent d'un coup
 * d'œil, même à 14 pixels dans l'en-tête, et sans lire l'étiquette.
 *
 *   crampon  → noir   : ce qu'on mise
 *   pressing → mauve  : ce qu'on gagne
 *
 * POURQUOI DU SVG ET PAS UNE IMAGE. Deux fichiers PNG, c'est deux requêtes,
 * un flou sur les écrans à forte densité et un contour à refaire à chaque
 * changement de fond. Ici tout est vectoriel, inséré dans le document, et
 * la bordure claire est pensée pour que le jeton NOIR reste visible sur le
 * marine sombre du site — un disque noir sans cerne y disparaîtrait.
 *
 * Les dégradés portent un identifiant unique par instance (`useId`) : sans
 * ça, deux jetons sur la même page partagent la première définition
 * rencontrée, et l'un des deux prend la couleur de l'autre.
 */

type Type = 'crampon' | 'pressing'

const PALETTE: Record<Type, {
  clair: string; sombre: string; cerne: string; cerneOpacite: number; eclat: number
}> = {
  // Noir profond, légèrement bleuté pour ne pas faire tache sur le marine.
  // Le cerne est plus marqué que celui du mauve, et c'est volontaire : à
  // 14 pixels dans l'en-tête, un disque noir sans contour franc n'est plus
  // qu'une tache. C'est le contour qui porte la forme, pas le remplissage.
  crampon: { clair: '#5C636F', sombre: '#07080A', cerne: '#B4C4D4', cerneOpacite: 0.64, eclat: 0.26 },
  // Mauve franc : il doit se distinguer du doré de la marque au premier regard.
  pressing: { clair: '#C3AEFF', sombre: '#6A46E0', cerne: '#D9CCFF', cerneOpacite: 0.55, eclat: 0.32 },
}

export function Jeton({
  type,
  taille = 14,
  className = '',
}: {
  type: Type
  /** Côté du jeton en pixels. 14 dans l'en-tête, 18 dans le portefeuille. */
  taille?: number
  className?: string
}) {
  const id = useId()
  const c = PALETTE[type]
  const nom = type === 'crampon' ? JETON.plusieurs : POINT.plusieurs

  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      className={'inline-block shrink-0 align-[-0.12em] ' + className}
      role="img"
      aria-label={nom}
    >
      <title>{nom}</title>
      <defs>
        {/* Lumière en haut à gauche : ce qui donne le relief de pastille. */}
        <radialGradient id={`${id}-f`} cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor={c.clair} />
          <stop offset="100%" stopColor={c.sombre} />
        </radialGradient>
      </defs>

      <circle cx="12" cy="12" r="10.4" fill={`url(#${id}-f)`} />
      {/* Le cerne. C'est lui qui détache le jeton noir du fond marine. */}
      <circle
        cx="12" cy="12" r="10.4"
        fill="none" stroke={c.cerne} strokeOpacity={c.cerneOpacite} strokeWidth="1.5"
      />
      {/* Anneau intérieur — le détail qui fait « jeton » plutôt que « point ». */}
      <circle
        cx="12" cy="12" r="6.6"
        fill="none" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="1.1"
      />
      {/* Reflet. Une ellipse inclinée vaut mieux qu'un rond : ça lit comme
          une surface bombée et non comme une bulle collée dessus. */}
      <ellipse
        cx="9" cy="7.6" rx="4.1" ry="2.5"
        fill="#FFFFFF" fillOpacity={c.eclat}
        transform="rotate(-28 9 7.6)"
      />
    </svg>
  )
}
