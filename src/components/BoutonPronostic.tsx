import { useT } from '../lib/i18n'
import { cn } from '../lib/utils'
import IconeMasque from './IconeMasque'

/**
 * L'entrée vers le pronostic IA.
 *
 * IL NE DOIT PAS RESSEMBLER AUX MARCHÉS DE PARI. « Score exact » et
 * « Buteur » sont deux marchés sur lesquels on MISE ; ceci est une ANALYSE
 * qu'on CONSULTE. Tant que les trois partageaient la même ligne grise et le
 * même « + », on ne comprenait ni ce que c'était, ni que l'IA y était pour
 * quelque chose (Mehdi, 2026-10-10).
 *
 * D'où quatre différences assumées : un filet qui le sépare des marchés,
 * un cadre doré plutôt qu'une ligne nue, l'icône du tableau tactique, et
 * surtout DEUX LIGNES DE TEXTE — le nom de la chose, puis ce qu'on obtient.
 * Un libellé d'un mot ne pouvait pas porter ça.
 *
 * Extrait de `CarteMatch` pour pouvoir être regardé sans session : le
 * bouton n'apparaît qu'aux joueurs connectés, et il n'etait donc visible
 * nulle part avant la production.
 */
export default function BoutonPronostic({
  ouvert,
  dejaDebloque,
  offert,
  onBascule,
}: {
  /** Le volet est-il déplié ? */
  ouvert: boolean
  /** Le joueur a-t-il déjà payé ce match ? */
  dejaDebloque: boolean
  /** Le prochain pronostic du jour est-il gratuit ? */
  offert: boolean
  onBascule: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onBascule}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-start transition-colors',
        ouvert
          ? 'border-accent-gold bg-accent-gold/10'
          : 'border-accent-gold/40 bg-accent-gold/[0.04] hover:border-accent-gold/70',
      )}
    >
      <IconeMasque nom="growth-analysis" taille={26} className="shrink-0 text-accent-gold" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-[15px] leading-none text-slate-900">{t('AI prediction')}</span>
          {!dejaDebloque && offert && (
            <span className="font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-gold text-ink-900">
              {t('free today')}
            </span>
          )}
          {dejaDebloque && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent-gold">{t('unlocked')}</span>
          )}
        </span>
        <span className="block mt-0.5 font-mono text-[10px] leading-snug text-slate-500">
          {t('probable line-ups, form, head-to-head and expected goals')}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[13px] text-accent-gold">{ouvert ? '−' : '+'}</span>
    </button>
  )
}
