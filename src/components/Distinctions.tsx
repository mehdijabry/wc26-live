import { useT } from '../lib/i18n'
import { cn } from '../lib/utils'
import { Icone, type NomIcone } from './Icone'
import type { Distinctions as Compte } from '../lib/leagues'

/**
 * Les distinctions d'un joueur, posées sur sa vignette.
 *
 * ── ELLES SE CUMULENT, ET C'EST VOULU ─────────────────────────────────────
 * Un joueur peut être premier dans plusieurs groupes le même jour, ou GOAT
 * de plusieurs semaines. On n'en garde pas « la meilleure » : on affiche
 * « GOAT ×3 ». Ça ne verse rien — c'est un exploit, pas une faille
 * (Mehdi, 2026-10-10).
 *
 * ── ELLES NE SE STOCKENT PAS ──────────────────────────────────────────────
 * « La médaille reste 24 h, il faut être encore premier demain pour la
 * garder » décrit un état CALCULÉ, pas un objet remis. On la porte tant
 * qu'on est sur le podium du jour ; le GOAT est le vainqueur de la dernière
 * semaine close. Rien à faire expirer, aucune dérive possible.
 *
 * ── L'ORDRE ───────────────────────────────────────────────────────────────
 * Du plus rare au plus commun : GOAT, or, argent, bronze. Sur une vignette
 * étroite, `max` ne laisse passer que les premières — et ce sont les bonnes.
 */
const ORDRE: Array<{ cle: keyof Compte; icone: NomIcone; nom: string }> = [
  { cle: 'goat', icone: 'goat', nom: 'GOAT' },
  { cle: 'or', icone: 'medaille-or', nom: 'first today' },
  { cle: 'argent', icone: 'medaille-argent', nom: 'second today' },
  { cle: 'bronze', icone: 'medaille-bronze', nom: 'third today' },
]

export default function Distinctions({
  compte,
  taille = 18,
  max = 4,
  className,
}: {
  compte: Compte
  taille?: number
  /** Combien de sortes au plus. Les plus rares passent en premier. */
  max?: number
  className?: string
}) {
  const t = useT()
  const portees = ORDRE.filter((d) => compte[d.cle] > 0).slice(0, max)
  if (portees.length === 0) return null

  return (
    <span className={cn('inline-flex items-center gap-1.5 align-middle', className)}>
      {portees.map((d) => (
        <span
          key={d.cle}
          className="inline-flex items-center gap-0.5"
          title={compte[d.cle] > 1 ? `${t(d.nom)} ×${compte[d.cle]}` : t(d.nom)}
        >
          <Icone nom={d.icone} taille={taille} />
          {/* Le ×n n'apparaît qu'à partir de deux : « GOAT ×1 » serait du
              bruit, et sur une vignette chaque caractère coûte. */}
          {compte[d.cle] > 1 && (
            <span className="font-mono text-[10px] font-bold leading-none text-accent-gold">
              ×{compte[d.cle]}
            </span>
          )}
        </span>
      ))}
    </span>
  )
}
