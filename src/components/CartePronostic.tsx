import { useEffect, useState } from 'react'
import { useT, useLang, localeOf, type Lang } from '../lib/i18n'
import { cn } from '../lib/utils'
import { Jeton } from './Jeton'
import TerrainChargement from './TerrainChargement'
import { Icone } from './Icone'
import TerrainCompositions from './TerrainCompositions'
import {
  carte as chargerCarte,
  debloquer,
  type Carte,
  motifLisible,
  type Prix,
} from '../lib/pronostic'

/**
 * La carte de pronostic d'un match.
 *
 * CE QUI VIENT DE CHEZ NOUS ET CE QUI VIENT D'AILLEURS. Les chances 1X2 sont
 * calculées ICI, à partir de la cote exacte à laquelle le joueur mise : on
 * retire la marge du bookmaker et on normalise. C'est la seule façon que la
 * barre affichée et le prix affiché racontent la même histoire.
 *
 * Le reste — buts attendus, plus/moins, les deux marquent, score probable,
 * onze probable, absents — vient du fournisseur. Et il est écarté EN BLOC
 * quand ses propres blocs se contredisent : le worker l'a déjà vérifié et
 * pose `incoherent`. Mesuré le 10 octobre 2026 : un match sur trois dans
 * l'échantillon donnait un favori au 1X2 et l'autre au xG.
 */

type Props = {
  match: string
  domicile: string
  exterieur: string
  /** Les cotes publiées par le serveur, pour nos propres chances. */
  cote: { home: number; draw: number; away: number } | null
  /** Déjà ouvert ? Sinon on affiche le prix avant toute chose. */
  ouvert: boolean
  prix: Prix | null
  solde: { crampons: number; pressings: number } | null
  onOuvert: () => void
  onFermer: () => void
}

/** Les chances implicites d'une cote 1X2, marge du bookmaker retirée. */
function chancesDeLaCote(c: { home: number; draw: number; away: number }) {
  const s = 1 / c.home + 1 / c.draw + 1 / c.away
  if (!isFinite(s) || s <= 0) return null
  return {
    dom: (100 / c.home) / s,
    nul: (100 / c.draw) / s,
    ext: (100 / c.away) / s,
  }
}

export default function CartePronostic(p: Props) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  // UN SEUL ÉTAT, ET IL PORTE SON MATCH. L'état de chargement n'est pas
  // stocké : il se DÉDUIT de l'absence de résultat pour le match courant.
  // Le poser dans l'effet obligeait à un `setState` synchrone, donc à un
  // rendu en cascade — et surtout il laissait un instant où la carte d'un
  // match s'affichait sous le titre d'un autre.
  const [resultat, setResultat] = useState<
    { match: string; carte: Carte } | { match: string; echec: string } | null
  >(null)
  const [paiementErreur, setPaiementErreur] = useState<string | null>(null)
  const [paiement, setPaiement] = useState(false)

  // L'ÉTUDE EST UNE CONDITION, PAS UNE DÉCORATION. On n'affiche la carte que
  // quand la donnée est là ET que les huit étapes sont passées. Le cache
  // rend souvent la donnée en moins d'une seconde : sans cette attente, le
  // joueur paierait pour une analyse qui aurait l'air d'avoir déjà existé.
  // Et si le réseau traîne au-delà, c'est LUI qui commande — on ne montre
  // jamais une carte vide parce que la minuterie est finie.
  const [etudeFinie, setEtudeFinie] = useState(false)
  const pourCeMatch = resultat?.match === p.match ? resultat : null
  const donnee = pourCeMatch && 'carte' in pourCeMatch ? pourCeMatch.carte : null
  const echec = pourCeMatch && 'echec' in pourCeMatch ? pourCeMatch.echec : null
  const carte = etudeFinie ? donnee : null
  const chargement = p.ouvert && !carte && !echec

  useEffect(() => {
    if (!p.ouvert) return
    let vivant = true
    chargerCarte(p.match)
      .then((c) => { if (vivant) setResultat({ match: p.match, carte: c }) })
      .catch((e) => { if (vivant) setResultat({ match: p.match, echec: String((e as Error).message) }) })
    return () => { vivant = false }
  }, [p.ouvert, p.match])

  const payer = async (monnaie: 'crampons' | 'pressings') => {
    setPaiement(true)
    setPaiementErreur(null)
    try {
      await debloquer(p.match, monnaie)
      p.onOuvert()
    } catch (e) {
      const m = String((e as Error).message)
      setPaiementErreur(
        /insuffisant/i.test(m)
          ? monnaie === 'crampons'
            ? t('Not enough crampons.')
            : t('Not enough pressings.')
          : t('Could not unlock right now.'),
      )
    } finally {
      setPaiement(false)
    }
  }

  const nos = p.cote ? chancesDeLaCote(p.cote) : null

  return (
    <div className="mt-3 glass rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
            {t('Prediction')}
          </div>
          <div className="font-display text-lg leading-tight truncate">
            {p.domicile} <span className="text-slate-500">—</span> {p.exterieur}
          </div>
        </div>
        <button
          type="button"
          onClick={p.onFermer}
          className="ms-auto font-mono text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-900"
        >
          {t('close')}
        </button>
      </div>

      {/* ── Pas encore ouvert : le prix, et rien d'autre ─────────────── */}
      {!p.ouvert && (
        <div className="mt-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            {p.prix && p.prix.crampons === 0
              ? t('Your first prediction today is free.')
              : t('Unlock the full read: probable XI, injuries, expected goals and more.')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.prix && p.prix.crampons === 0 ? (
              <button
                type="button"
                disabled={paiement}
                onClick={() => void payer('crampons')}
                className="px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {t('Open — free')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={paiement || !p.prix || (p.solde?.crampons ?? 0) < p.prix.crampons}
                  onClick={() => void payer('crampons')}
                  className="px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-40 inline-flex items-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <Jeton type="crampon" taille={13} />
                  {p.prix?.crampons}
                </button>
                <button
                  type="button"
                  disabled={paiement || !p.prix || (p.solde?.pressings ?? 0) < p.prix.pressings}
                  onClick={() => void payer('pressings')}
                  className="px-4 py-2 rounded-xl border border-accent-violet text-accent-violet font-semibold text-sm disabled:opacity-40 inline-flex items-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <Jeton type="pressing" taille={13} />
                  {p.prix?.pressings}
                </button>
              </>
            )}
          </div>
          {p.prix && p.prix.rang > 1 && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {avecN(t('{n}th of the day · the price doubles each time'), p.prix.rang, lang)}
            </p>
          )}
          {paiementErreur && <p className="mt-2 text-sm text-accent-red">{paiementErreur}</p>}
        </div>
      )}

      {chargement && <TerrainChargement onTermine={() => setEtudeFinie(true)} />}

      {echec && (
        <p className="mt-4 text-sm text-slate-600">
          {t('The prediction could not be loaded.')}{' '}
          <span className="text-slate-500">{echec}</span>
        </p>
      )}

      {carte && (
        <div className="mt-4 space-y-5">
          {/* ── Les chances, les nôtres ───────────────────────────────── */}
          {nos && (
            <section>
              <Titre>{t('Chances')}</Titre>
              <div className="mt-2 flex h-7 rounded-lg overflow-hidden font-mono text-[11px] tabular-nums">
                <Part valeur={nos.dom} classe="bg-accent-gold text-ink-900" />
                <Part valeur={nos.nul} classe="bg-slate-200 text-slate-900" />
                <Part valeur={nos.ext} classe="bg-slate-100 text-slate-900" />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-slate-500">
                <span className="truncate max-w-[40%]">{p.domicile}</span>
                <span>{t('draw')}</span>
                <span className="truncate max-w-[40%] text-end">{p.exterieur}</span>
              </div>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                {t('from the live odds, bookmaker margin removed')}
              </p>
            </section>
          )}

          {/* ── La lecture du modèle ──────────────────────────────────── */}
          {carte.leurs && !carte.leurs.incoherent && (
            <section>
              <Titre>{t('The model’s read')}</Titre>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {carte.leurs.xg && (
                  <Case
                    etiquette={t('expected goals')}
                    valeur={`${carte.leurs.xg.dom.toFixed(2)} – ${carte.leurs.xg.ext.toFixed(2)}`}
                  />
                )}
                {carte.leurs.scoreProbable && (
                  <Case etiquette={t('likeliest score')} valeur={carte.leurs.scoreProbable} />
                )}
                {carte.leurs.plusDe && (
                  <Case etiquette={t('over 2.5 goals')} valeur={`${Math.round(carte.leurs.plusDe.deux5)} %`} />
                )}
                {carte.leurs.lesDeuxMarquent !== null && (
                  <Case etiquette={t('both teams score')} valeur={`${Math.round(carte.leurs.lesDeuxMarquent)} %`} />
                )}
              </div>
            </section>
          )}

          {carte.leurs?.incoherent && (
            <p className="text-sm text-slate-600">
              {t('The model returned contradictory figures for this match, so we are not showing them.')}
            </p>
          )}

          {/* ── Le onze probable ──────────────────────────────────────── */}
          {carte.composition && (
            <section>
              <Titre>
                <Icone nom="substitution-board" taille={24} className="inline-block align-middle me-1.5 opacity-90" />
                {carte.statutComposition === 'confirmed' ? t('Confirmed line-ups') : t('Probable line-ups')}
              </Titre>
              <div className="mt-2">
                <TerrainCompositions
                  domicile={carte.composition.home}
                  exterieur={carte.composition.away}
                />
              </div>
            </section>
          )}

          {/* ── Les absents ───────────────────────────────────────────── */}
          {carte.absents && (carte.absents.home.length > 0 || carte.absents.away.length > 0) && (
            <section>
              <Titre>{t('Unavailable')}</Titre>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(['home', 'away'] as const).map((cote) => (
                  <ul key={cote} className="space-y-1">
                    {carte.absents![cote].map((a) => (
                      <li key={a.id} className="text-sm text-slate-600">
                        <span className="text-slate-800">{a.short_name}</span>
                        <span className="text-slate-500"> — {motifLisible(a, t)}</span>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </section>
          )}

          {carte.leurs?.modele && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {carte.leurs.modele}
              {carte.leurs.confiance !== null
                ? ` · ${t('confidence')} ${Math.round(carte.leurs.confiance * 100)} %`
                : ''}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Titre({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{children}</h3>
  )
}

/** Une part de la barre 1X2. Sous 9 %, le chiffre ne tiendrait pas : on le retire. */
function Part({ valeur, classe }: { valeur: number; classe: string }) {
  return (
    <div
      className={cn('flex items-center justify-center', classe)}
      style={{ width: `${Math.max(valeur, 2)}%` }}
    >
      {valeur >= 9 ? `${Math.round(valeur)}` : ''}
    </div>
  )
}

function Case({ etiquette, valeur }: { etiquette: string; valeur: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{etiquette}</div>
      <div className="font-display text-lg leading-tight tabular-nums">{valeur}</div>
    </div>
  )
}

/** Le rang du jour, avec son ordinal localisé quand la langue en a un. */
function avecN(gabarit: string, n: number, lang: Lang): string {
  return gabarit.replace('{n}', n.toLocaleString(localeOf(lang)))
}
