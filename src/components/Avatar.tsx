import { cn } from '../lib/utils'
import { avatarDeSecours } from '../lib/avatars'

/**
 * La vignette d'un joueur.
 *
 * ── PLUS D'INITIALE ───────────────────────────────────────────────────────
 * Elle a disparu le 10/10/2026 (Mehdi) : tout le monde a une figure. Les
 * nouvelles inscriptions en reçoivent une au hasard à la création du compte
 * (migration 024), et un profil qui n'en aurait pas malgré tout en obtient
 * une par `avatarDeSecours` — DÉTERMINISTE, pour qu'elle ne change pas d'un
 * rechargement à l'autre ni d'un visiteur à l'autre.
 *
 * Conséquence : cette vignette ne rend jamais de vide. C'est voulu — une
 * case grise dans un classement se lit comme un bogue.
 */
export default function Avatar({
  alias,
  url,
  graine,
  taille = 32,
  className,
}: {
  alias: string
  url?: string | null
  /** Pour la figure de secours. L'identifiant du compte si on l'a, sinon le
   *  pseudo — n'importe quoi de stable fait l'affaire. */
  graine?: string | null
  taille?: number
  className?: string
}) {
  const src = url || avatarDeSecours(graine ?? alias)
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={taille}
      height={taille}
      // Pas de `loading="lazy"` : ces vignettes sont au-dessus de la ligne de
      // flottaison dans l'en-tête et dans le classement, et le report se
      // voyait à l'œil (mesuré le 10/10/2026 sur les icônes d'en-tête).
      decoding="async"
      className={cn('rounded-full shrink-0 overflow-hidden object-cover bg-accent-gold/10', className)}
      style={{ width: taille, height: taille }}
    />
  )
}
