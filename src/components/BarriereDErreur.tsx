import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { estChunkManquant, recupererChunkPerime } from '../lib/chunks'

/**
 * La barrière d'erreur. Le site n'en avait AUCUNE.
 *
 * ── POURQUOI ÇA COMPTE ────────────────────────────────────────────────────
 * Sans barrière, React n'a qu'un seul comportement face à une exception de
 * rendu : il démonte l'arbre entier. Pas de message, pas de bouton, pas de
 * journal visible — un écran blanc, quelle que soit la cause, et sur toutes
 * les pages à la fois. Une seule ligne de code fautive dans un recoin du
 * site suffisait donc à éteindre le site entier (constaté le 2026-10-10 :
 * un morceau de code injoignable pendant un déploiement).
 *
 * ── CE QU'ELLE FAIT ───────────────────────────────────────────────────────
 * 1. Si c'est un morceau de code manquant, elle recharge — c'est la seule
 *    issue, et elle marche (voir lib/chunks).
 * 2. Sinon elle affiche un écran lisible, sur le fond du site, avec un
 *    bouton de rechargement et le message d'erreur en petit. Un visiteur
 *    doit pouvoir repartir, et Mehdi doit pouvoir me dire CE QUI s'affiche.
 */
type Props = { children: ReactNode }
type State = { erreur: Error | null }

export class BarriereDErreur extends Component<Props, State> {
  state: State = { erreur: null }

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur }
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    // Un morceau manquant n'est pas un bogue : on recharge et on n'affiche
    // rien d'alarmant entre-temps.
    if (recupererChunkPerime(erreur)) return
    console.error('[p90] rendu interrompu :', erreur, info.componentStack)
  }

  render() {
    const { erreur } = this.state
    if (!erreur) return this.props.children
    if (estChunkManquant(erreur)) return <EcranDeRechargement />
    return <EcranDErreur erreur={erreur} />
  }
}

/** Le temps que le rechargement parte : surtout pas d'écran d'alarme. */
function EcranDeRechargement() {
  const t = useT()
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
        {t('Updating…')}
      </p>
    </div>
  )
}

function EcranDErreur({ erreur }: { erreur: Error }) {
  const t = useT()
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="glass rounded-2xl p-6 max-w-md w-full text-center">
        <div className="font-display text-2xl">{t('This page could not load')}</div>
        <p className="mt-2 text-sm text-slate-600">
          {t('Something went wrong on our side. Reloading usually fixes it.')}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm active:scale-[0.98] transition-transform"
        >
          {t('Reload')}
        </button>
        {/* Le message brut, en petit : c'est lui qui permet de dire ce qui
            s'est passé sans avoir à ouvrir la console. */}
        <p className="mt-4 font-mono text-[10px] text-slate-500 break-words">
          {String(erreur?.message ?? erreur)}
        </p>
      </div>
    </div>
  )
}
