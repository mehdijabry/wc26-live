import { useNavigate } from 'react-router-dom'
import type { OddsView } from '../lib/useMatchOdds'
import { cn } from '../lib/utils'

/**
 * Les trois cotes d'un match, cliquables vers la page des pronostics.
 *
 * Elles s'affichaient partout en lecture seule — accueil, cartes du jour —
 * alors que c'est exactement le moment où l'envie de parier arrive. Un appui
 * sur « 1 », « X » ou « 2 » emmène donc au même match sur /predictions, avec
 * ce choix déjà posé dans le bulletin.
 *
 * TROIS CONTRAINTES ONT DICTÉ CETTE FORME.
 *
 * 1. Ces cotes vivent À L'INTÉRIEUR du bouton de la carte, qui mène aux
 *    statistiques du match. Un bouton dans un bouton n'est pas du HTML
 *    valide : ce sont donc des `span` qui arrêtent la propagation du clic,
 *    sinon on partirait vers les statistiques au lieu du pari.
 * 2. SEULES LES COTES D'AVANT-MATCH mènent quelque part. En direct ou après
 *    coup, le pari est fermé — un lien qui aboutit à une page où le match
 *    n'est plus pariable est pire que pas de lien.
 * 3. Le `dir="ltr"` est conservé : l'ordre 1·X·2 ne doit jamais s'inverser
 *    en arabe.
 */

const CHOIX = [
  ['1', 'home'],
  ['X', 'draw'],
  ['2', 'away'],
] as const

export function Cotes1X2({
  vue,
  eventId,
  variante,
  t,
}: {
  vue: OddsView
  /** L'identifiant ESPN brut du match, sans le préfixe « e ». */
  eventId: string | undefined
  /** `hero` : centré et aéré. `carte` : compact, chaque cote prend sa part. */
  variante: 'hero' | 'carte'
  t: (s: string) => string
}) {
  const navigate = useNavigate()
  const pariable = vue.mode === 'pre' && !!eventId
  const hero = variante === 'hero'

  const aller = (pick: string) => {
    if (!pariable) return
    navigate(`/predictions?match=e${eventId}&pick=${pick}`)
  }

  return (
    <div
      dir="ltr"
      className={cn(
        'flex items-center font-mono',
        hero ? 'mt-2.5 justify-center gap-1.5 text-[11px]' : 'mt-2 gap-1 text-[10px]',
        vue.mode === 'closing' && 'opacity-50',
      )}
      title={vue.odds.provider ? `Odds · ${vue.odds.provider}` : 'Odds'}
    >
      {vue.mode === 'live' && (
        <span className={cn('relative flex h-1.5 w-1.5', !hero && 'mx-0.5')} aria-label="Live odds">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
        </span>
      )}

      {CHOIX.map(([libelle, pick]) => {
        const valeur = vue.odds[pick]
        return (
          <span
            key={libelle}
            {...(pariable
              ? {
                  role: 'link',
                  tabIndex: 0,
                  'aria-label': `${t('Back')} ${libelle} @ ${valeur}`,
                  onClick: (e: React.MouseEvent) => {
                    // La carte entière est un bouton vers les statistiques :
                    // sans ça, le clic sur la cote y partirait aussi.
                    e.stopPropagation()
                    e.preventDefault()
                    aller(pick)
                  },
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.stopPropagation()
                    e.preventDefault()
                    aller(pick)
                  },
                }
              : {})}
            className={cn(
              'inline-flex items-center rounded-md border border-slate-200/60',
              hero ? 'gap-1.5 bg-white/5 px-2 py-1' : 'flex-1 justify-center gap-1 bg-slate-50 px-1.5 py-1',
              pariable &&
                'cursor-pointer transition-colors hover:border-accent-gold/70 hover:bg-accent-gold/10 active:scale-[0.97]',
            )}
          >
            <span className="text-slate-500">{libelle}</span>
            <span className="text-slate-900 font-semibold tabular-nums">{valeur}</span>
          </span>
        )
      })}

      <span className={cn('text-slate-500', hero ? 'text-[9px]' : 'text-[8px]')}>
        {vue.mode === 'closing' ? t('pre-match') : '18+'}
      </span>
    </div>
  )
}
