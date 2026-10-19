import { useId } from 'react'
import { JETON, POINT } from '../lib/jeu'

/**
 * Les deux jetons du jeu.
 *
 *   crampon  → ce qu'on mise
 *   pressing → ce qu'on gagne
 *
 * ── DEUX ÉTATS, ET ILS NE DISENT PAS LA MÊME CHOSE (19/10/2026) ──────────
 * Mehdi a fourni quatre visuels : une PILE et un JETON SEUL pour chaque
 * monnaie. « Les piles, mets-les partout dans le site ; les icônes jeton
 * seul dans les boutons de réclamation de récompenses. »
 *
 * La distinction porte du sens, et c'est ce qui la rend tenable : une pile
 * dit un AVOIR — un solde, un classement, un prix à gagner. Un jeton seul
 * dit un GESTE — on en prend un, là, maintenant. D'où `variante="seul"`
 * sur les boutons qui encaissent, et la pile partout ailleurs.
 *
 * ── POURQUOI DES IMAGES, ALORS QUE C'ÉTAIT DU SVG DESSINÉ ────────────────
 * Les fichiers livrés sont des rendus 3D vectorisés : 1 343 à 3 481
 * chemins, de 0,8 à 1,8 Mo pièce — cinq mégaoctets à eux quatre, pour un
 * site dont tout le JavaScript pèse 348 Ko. Un tracé automatique de photo
 * n'est pas un dessin vectoriel, c'est une photo dans un emballage coûteux.
 * Ils sont donc rendus une fois à 128 px de haut, rognés au plus juste sur
 * leur encre — aucune marge, l'image touche ses quatre bords : 100 Ko pour
 * les trois, nets jusqu'à 64 px d'affichage.
 *
 * ── LE JETON CRAMPON SEUL MANQUE ENCORE ──────────────────────────────────
 * Son fichier est le seul des quatre à n'avoir pas été détouré : le décor
 * (un tableau de bord, un socle) y est cuit, opaque sur toute la surface,
 * et il n'est pas isolable automatiquement — l'arrière-plan y est aussi
 * clair que le cerne du jeton. En attendant la version détourée, cette
 * case retombe sur le jeton DESSINÉ d'origine, conservé plus bas. Il est
 * lisible et à la bonne couleur ; il ne lui manque que la matière.
 *
 * ── CE QUE LA PILE PERD EN PETIT ─────────────────────────────────────────
 * Le dessin d'origine avait été fait pour rester lisible à 14 px dans
 * l'en-tête. Une pile de trente pièces à cette taille redevient une tache.
 * Deux mesures l'ont rattrapée — les proportions réelles au lieu du carré,
 * puis un facteur d'agrandissement — et les trois traitements ont été
 * comparés côte à côte aux tailles réelles du site avant de trancher.
 */

type Type = 'crampon' | 'pressing'
type Variante = 'pile' | 'seul'

/**
 * Les fichiers livrés, rendus dans `public/jetons/`.
 *
 * `rapport` est la largeur sur la hauteur, mesurée sur l'encre : une pile
 * de pièces est plus LARGE que haute. L'enfermer dans un carré lui faisait
 * perdre un tiers de sa hauteur à l'affichage, et Mehdi l'a vu tout de
 * suite — « jeton trop petit, on ne les voit presque pas » (19/10/2026).
 * Chaque visuel garde donc ses proportions : c'est la HAUTEUR qu'on
 * commande, et la largeur suit.
 *
 * `facteur` rattrape le reste. À 13 px de haut une pile de trente pièces
 * n'est qu'une bavure ; à dix-huit elle se lit. Le jeton seul, lui, tient
 * déjà à onze — il ne prend qu'un rattrapage de politesse pour ne pas
 * paraître chétif à côté d'une pile.
 */
const IMAGES: Partial<Record<`${Type}-${Variante}`, { src: string; rapport: number; facteur: number }>> = {
  'crampon-pile': { src: '/jetons/crampons-pile.png', rapport: 1.321, facteur: 1.4 },
  'pressing-pile': { src: '/jetons/pressings-pile.png', rapport: 1.247, facteur: 1.4 },
  'pressing-seul': { src: '/jetons/pressings-jeton.png', rapport: 0.944, facteur: 1.15 },
  // 'crampon-seul' : en attente du fichier détouré (voir l'en-tête).
}

export function Jeton({
  type,
  taille = 14,
  variante = 'pile',
  className = '',
}: {
  type: Type
  /** Côté du jeton en pixels. 14 dans l'en-tête, 18 dans le portefeuille. */
  taille?: number
  /** `pile` pour un avoir, `seul` pour le geste d'encaisser. */
  variante?: Variante
  className?: string
}) {
  const nom = type === 'crampon' ? JETON.plusieurs : POINT.plusieurs
  const img = IMAGES[`${type}-${variante}`]

  if (img) {
    const h = Math.round(taille * img.facteur)
    const w = Math.round(h * img.rapport)
    return (
      <img
        src={img.src}
        /* Les dimensions sont données AUSSI en attributs : sans elles le
           navigateur ne connaît pas la place à réserver et la ligne saute
           quand l'image arrive. */
        width={w}
        height={h}
        alt=""
        aria-hidden
        /* Ces icônes accompagnent un chiffre : elles ne doivent jamais
           retenir le rendu de la page, ni bloquer le fil principal. */
        decoding="async"
        loading="lazy"
        draggable={false}
        className={'inline-block shrink-0 align-[-0.25em] select-none ' + className}
        style={{ width: w, height: h }}
        title={nom}
      />
    )
  }
  return <JetonDessine type={type} taille={taille} className={className} nom={nom} />
}

/**
 * LE JETON DESSINÉ — le dessin d'origine, gardé comme secours.
 *
 * Il sert tant que le crampon seul n'a pas de fichier détouré, et il
 * resterait utile le jour où l'on voudrait une version lisible en très
 * petit : tout y est vectoriel, le cerne est pensé pour que le jeton
 * sombre reste visible sur le sol noir-vert du site, et rien ne pèse.
 *
 * Les dégradés portent un identifiant unique par instance (`useId`) : sans
 * ça, deux jetons sur la même page partagent la première définition
 * rencontrée, et l'un des deux prend la couleur de l'autre.
 */
const PALETTE: Record<Type, {
  clair: string; sombre: string; cerne: string; cerneOpacite: number; eclat: number
}> = {
  crampon: { clair: '#5C636F', sombre: '#07080A', cerne: '#B4C4D4', cerneOpacite: 0.64, eclat: 0.26 },
  pressing: { clair: '#C3AEFF', sombre: '#6A46E0', cerne: '#D9CCFF', cerneOpacite: 0.55, eclat: 0.32 },
}

function JetonDessine({ type, taille, className, nom }: {
  type: Type; taille: number; className: string; nom: string
}) {
  const id = useId()
  const c = PALETTE[type]
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
      {/* Le cerne. C'est lui qui détache le jeton sombre du fond. */}
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
