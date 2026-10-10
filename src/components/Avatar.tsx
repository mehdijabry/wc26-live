import { cn } from '../lib/utils'

/**
 * La vignette d'un joueur : son avatar s'il en a choisi un, sinon
 * l'initiale de son pseudo.
 *
 * L'initiale reste le repli et le restera : un compte tout neuf n'a rien
 * choisi, et une vignette vide vaut moins qu'une lettre.
 */
export default function Avatar({
  alias,
  url,
  taille = 32,
  className,
}: {
  alias: string
  url?: string | null
  taille?: number
  className?: string
}) {
  const commun = 'rounded-full shrink-0 overflow-hidden'
  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        width={taille}
        height={taille}
        // Pas de `loading="lazy"` : ces vignettes sont au-dessus de la ligne
        // de flottaison dans l'en-tête et dans le classement, et le report
        // se voyait à l'œil (mesuré le 10/10/2026 sur les icônes d'en-tête).
        decoding="async"
        className={cn(commun, 'object-cover bg-accent-gold/10', className)}
        style={{ width: taille, height: taille }}
      />
    )
  }
  return (
    <span
      className={cn(
        commun,
        'bg-accent-gold/20 text-accent-gold flex items-center justify-center font-bold',
        className,
      )}
      style={{ width: taille, height: taille, fontSize: Math.max(10, Math.round(taille * 0.42)) }}
    >
      {(alias || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}
