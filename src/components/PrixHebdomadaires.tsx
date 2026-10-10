import { useT, useLang, localeOf } from '../lib/i18n'
import { cn } from '../lib/utils'
import { Icone, type NomIcone } from './Icone'
import { Jeton } from './Jeton'
import type { Prix } from '../lib/leagues'

/**
 * Les prix du podium de la semaine, et le double choix qu'ils imposent.
 *
 * ── DEUX CHOIX, PAS UN ────────────────────────────────────────────────────
 * Un joueur peut être sur le podium de plusieurs groupes la même semaine. Il
 * choisit d'abord LEQUEL — il n'en réclame qu'un — puis DANS QUELLE MONNAIE,
 * crampons ou pressings (Mehdi, 2026-10-10). Les deux doivent être posés
 * côte à côte : s'il fallait d'abord choisir un groupe pour découvrir
 * ensuite les montants, on choisirait à l'aveugle.
 *
 * ── CE QUE LE MONTANT DIT DÉJÀ ────────────────────────────────────────────
 * Le barème est 50/30/20 crampons selon la place, multiplié par le taux
 * d'assiduité de la semaine. Un prix de 40 au lieu de 50 raconte donc que le
 * groupe n'était pas au complet — d'où le taux affiché à côté, sinon le
 * joueur croirait à une erreur.
 *
 * ── LES AUTRES RESTENT VISIBLES ───────────────────────────────────────────
 * Une fois un prix pris, les autres de la même semaine s'affichent barrés
 * plutôt que de disparaître : voir ce qu'on a laissé est ce qui donne envie
 * de mieux choisir la semaine suivante.
 */
const MEDAILLE: Record<number, NomIcone> = {
  1: 'medaille-or',
  2: 'medaille-argent',
  3: 'medaille-bronze',
}

export default function PrixHebdomadaires({
  prix,
  occupe,
  onReclamer,
}: {
  prix: Prix[]
  occupe: boolean
  onReclamer: (id: number, monnaie: 'crampons' | 'pressings') => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  if (prix.length === 0) return null

  // Une semaine est « close » dès qu'un de ses prix a été pris : les autres
  // deviennent alors inaccessibles, et doivent le montrer.
  const semainesPrises = new Set(prix.filter((p) => p.reclame).map((p) => p.semaine))

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Icone nom="ranking" taille={24} />
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
          {t('Podium prizes')}
        </h2>
      </div>

      <ul className="mt-3 grid gap-2.5">
        {prix.map((p) => {
          const bloque = !p.reclame && semainesPrises.has(p.semaine)
          return (
            <li
              key={p.id}
              className={cn(
                'glass rounded-2xl p-3.5',
                bloque && 'opacity-50',
                p.reclame && 'border border-accent-gold/40',
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icone nom={MEDAILLE[p.rang] ?? 'medaille-bronze'} taille={28} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[15px] truncate">{p.groupe}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {new Date(p.semaine).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}
                    {' · '}
                    {t('group turnout')} {Math.round(p.taux * 100)} %
                  </div>
                </div>
              </div>

              <div className="mt-2.5">
                {p.reclame ? (
                  <p className="font-mono text-[11px] uppercase tracking-wider text-accent-gold">
                    {t('claimed')} ✓
                  </p>
                ) : bloque ? (
                  <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {t('one prize per week — already claimed another')}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={occupe}
                        onClick={() => onReclamer(p.id, 'crampons')}
                        className="px-3.5 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-40 inline-flex items-center gap-1.5 active:scale-[0.98] transition-transform"
                      >
                        <Jeton type="crampon" taille={13} />
                        {p.crampons}
                      </button>
                      <button
                        type="button"
                        disabled={occupe}
                        onClick={() => onReclamer(p.id, 'pressings')}
                        className="px-3.5 py-2 rounded-xl border border-accent-violet text-accent-violet font-semibold text-sm disabled:opacity-40 inline-flex items-center gap-1.5 active:scale-[0.98] transition-transform"
                      >
                        <Jeton type="pressing" taille={13} />
                        {p.pressings}
                      </button>
                    </div>
                    <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      {t('pick a currency — one prize per week')}
                    </p>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
