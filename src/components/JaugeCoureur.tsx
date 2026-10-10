import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { useLang } from '../lib/i18n'

/**
 * La jauge d'avancement : un joueur qui court avec son ballon.
 *
 * ── CE QUE MEHDI A DEMANDÉ (10/10/2026) ───────────────────────────────────
 * « Son parcours doit être l'état d'avancement : il doit être au bout de la
 * barre, et quand ça bouge la barre se remplit et le joueur avance avec. »
 * Les pastilles et les filets de 1,5 px qu'il y avait partout disaient le
 * chiffre sans jamais donner l'impression d'une progression.
 *
 * ── POURQUOI UN MASQUE CSS ET PAS UNE <img> ───────────────────────────────
 * `Icone` sert des fichiers depuis `/media/icones/` et interdit par
 * construction de les recolorer — c'est voulu pour le décoratif. Ici la
 * couleur PORTE un sens (doré tant qu'il reste du chemin, vert une fois le
 * seuil atteint), donc une image coloriée d'avance ne convient pas. Le
 * masque garde le fichier hors du bundle — 12 Ko que tout le monde
 * téléchargerait sinon — et le laisse prendre `currentColor`.
 *
 * ── LE SENS DE LA COURSE SUIT LA LANGUE ───────────────────────────────────
 * En arabe la page passe en RTL et la barre se remplit de droite à gauche :
 * un coureur qui foncerait toujours vers la droite tournerait le dos à son
 * propre remplissage.
 */
const MASQUE = {
  WebkitMaskImage: 'url(/media/icones/coureur.svg)',
  maskImage: 'url(/media/icones/coureur.svg)',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskSize: 'contain',
  maskSize: 'contain',
  WebkitMaskPosition: 'bottom center',
  maskPosition: 'bottom center',
} as const

export default function JaugeCoureur({
  taux,
  titre,
  fraction,
  detail,
  legende,
  taille = 24,
  teinte = 'or',
  teinteFin = 'vert',
  className,
}: {
  /** 0 à 1. Au-delà de 1 la barre est pleine — un joueur peut dépasser. */
  taux: number
  titre?: string
  /** « 3/5 », à gauche sous le titre. */
  fraction?: string
  /** Ce qui s'affiche à l'autre bout de la ligne de titre. */
  detail?: ReactNode
  legende?: string
  /** Hauteur du coureur. 24 par défaut, 18 sur une carte serrée. */
  taille?: number
  /** `violet` pour ce qui relève des pressings, `or` pour le reste du jeu. */
  teinte?: 'or' | 'violet'
  /**
   * La couleur une fois la jauge pleine. Vert par défaut — « c'est fait ».
   * `violet` quand ce qui est atteint VERSE des pressings : la règle du site
   * est qu'une couleur a un seul sens, et le mauve est celui des pressings.
   */
  teinteFin?: 'vert' | 'violet'
  className?: string
}) {
  const rtl = useLang((s) => s.lang) === 'ar'
  const plein = Math.max(0, Math.min(100, Math.round(taux * 100)))
  const fini = plein >= 100
  // Au départ comme à l'arrivée le coureur doit rester DANS la carte : il
  // parcourt la piste MOINS sa propre largeur, et non 0 → 100 %.
  //
  // L'arithmétique se fait ici, pas dans le `calc()`. Diviser par un
  // pourcentage (`22px / 100%`) n'est pas du CSS valide : Chrome le tolère,
  // les autres jettent la déclaration en silence et le coureur ne quitte
  // jamais la ligne de départ.
  const avance = `calc(${plein}% - ${((plein / 100) * taille).toFixed(2)}px)`

  // Classes LITTÉRALES : Tailwind lit le source et ne génère rien pour un
  // `bg-accent-${x}` construit à l'exécution.
  const couleurBarre = fini
    ? (teinteFin === 'violet' ? 'bg-accent-violet' : 'bg-accent-green')
    : (teinte === 'violet' ? 'bg-accent-violet' : 'bg-accent-gold')
  const couleurCoureur = fini
    ? (teinteFin === 'violet' ? 'text-accent-violet' : 'text-accent-green')
    : (teinte === 'violet' ? 'text-accent-violet' : 'text-accent-gold')

  return (
    <div className={className}>
      {(titre || fraction || detail) && (
        <div className="flex items-baseline gap-2 flex-wrap">
          {titre && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{titre}</span>
          )}
          {fraction && (
            <span className="font-mono text-[11px] tabular-nums text-slate-800">{fraction}</span>
          )}
          {detail && <span className="ms-auto font-mono text-[10px] uppercase tracking-wider">{detail}</span>}
        </div>
      )}

      <div className="relative mt-1" style={{ height: taille + 6 }}>
        {/* Le coureur, posé SUR la piste : la piste fait 6 px de haut et il
            s'arrête juste dessus, pour qu'il ait l'air d'y courir. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-[6px] transition-[inset-inline-start] duration-700 ease-out motion-reduce:transition-none',
            couleurCoureur,
          )}
          style={{
            insetInlineStart: avance,
            width: taille,
            height: taille,
            backgroundColor: 'currentColor',
            // En RTL la barre se remplit vers la gauche : le coureur se
            // retourne pour courir dans le sens du remplissage.
            transform: rtl ? 'scaleX(-1)' : undefined,
            ...MASQUE,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
              couleurBarre,
            )}
            style={{ width: `${plein}%` }}
          />
        </div>
      </div>

      {legende && <p className="mt-1 font-mono text-[10px] text-slate-500">{legende}</p>}
    </div>
  )
}
