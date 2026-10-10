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
  libelleStat,
  STATS_EN_TETE,
  type Prix,
  type Forme,
  type FaceAFace,
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
  solde: { crampons: number; pressings: number; offertes: number } | null
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

  // Un crédit ne sert QUE là où il y aurait eu quelque chose à payer : la
  // première lecture du jour est déjà gratuite pour tout le monde, et la
  // consommer gâcherait le cadeau.
  const offerte = !!p.prix && p.prix.crampons > 0 && (p.solde?.offertes ?? 0) > 0

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
              : offerte
                ? t('This one is on us — one of your free analyses covers it.')
                : t('Unlock the full read: probable XI, injuries, expected goals and more.')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* UN SEUL BOUTON quand un crédit couvre la lecture : proposer
                « crampons ou pressings » laisserait croire qu'il va payer,
                alors que la base consomme le crédit avant de toucher au
                solde (migration 019). */}
            {p.prix && (p.prix.crampons === 0 || offerte) ? (
              <button
                type="button"
                disabled={paiement}
                onClick={() => void payer('crampons')}
                className="px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {p.prix && p.prix.crampons === 0 ? t('Open — free') : t('Open — free analysis')}
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
          {offerte && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-accent-violet">
              {avecN(t('{n} free analyses left'), p.solde?.offertes ?? 0, lang)}
            </p>
          )}
          {p.prix && p.prix.rang > 1 && !offerte && (
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
              </div>

              {/* Les marchés, TOUS. On n'en montrait qu'un sur six. */}
              {carte.leurs.plusDe && (
                <Rangee
                  titre={t('over N goals')}
                  valeurs={[
                    ['1.5', carte.leurs.plusDe.un5],
                    ['2.5', carte.leurs.plusDe.deux5],
                    ['3.5', carte.leurs.plusDe.trois5],
                  ]}
                />
              )}
              {carte.leurs.corners && (
                <Rangee
                  titre={t('over N corners')}
                  valeurs={[
                    ['8.5', carte.leurs.corners.huit5],
                    ['9.5', carte.leurs.corners.neuf5],
                    ['10.5', carte.leurs.corners.dix5],
                  ]}
                />
              )}
              {carte.leurs.lesDeuxMarquent !== null && (
                <Rangee
                  titre={t('both teams score')}
                  valeurs={[[t('yes'), carte.leurs.lesDeuxMarquent]]}
                />
              )}
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

          {/* ── La forme, et l'histoire commune ───────────────────────── */}
          {carte.forme && (carte.forme.dom || carte.forme.ext) && (
            <section>
              <Titre>{t('Form over the last matches')}</Titre>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <BlocForme forme={carte.forme.dom} nom={p.domicile} couleur="#D9B54A" />
                <BlocForme forme={carte.forme.ext} nom={p.exterieur} couleur="#ECEFE8" />
              </div>
              {carte.forme.dom && carte.forme.ext && (
                <Comparaison dom={carte.forme.dom} ext={carte.forme.ext} />
              )}
            </section>
          )}

          {carte.faceAFace && <BlocFaceAFace h2h={carte.faceAFace} />}

          {/* ── Les absents ───────────────────────────────────────────── */}
          {carte.absents && (carte.absents.home.length > 0 || carte.absents.away.length > 0) && (
            <section>
              <Titre>{t('Unavailable')}</Titre>
              {/* CHAQUE COLONNE PORTE SON ÉQUIPE. Sans l'étiquette, rien ne
                  disait laquelle des deux listes appartenait à qui : il
                  fallait reconnaître les joueurs. */}
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {(['home', 'away'] as const).map((cote) => (
                  <div key={cote}>
                    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: cote === 'home' ? '#D9B54A' : '#ECEFE8' }}
                      />
                      {cote === 'home' ? p.domicile : p.exterieur}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {carte.absents![cote].length === 0 && (
                        <li className="text-sm text-slate-500">{t('nobody missing')}</li>
                      )}
                      {carte.absents![cote].map((a) => (
                        <li key={a.id} className="text-sm text-slate-600">
                          <span className="text-slate-800">{a.short_name}</span>
                          <span className="text-slate-500"> — {motifLisible(a, t)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PAS DE « CONFIANCE » ICI. Le chiffre que le fournisseur appelle
              ainsi est, à la décimale près, la plus forte de ses trois
              probabilités — vérifié sur quatre matchs. Ce n'est pas une
              seconde information, et l'afficher à côté de notre barre, qui
              dit autre chose parce qu'elle part de la cote réelle, ne fait
              que semer le doute. Il ne reste que la provenance. */}
          {carte.leurs?.modele && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {t('model')} {carte.leurs.modele}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Une rangée de seuils : « plus de 1,5 / 2,5 / 3,5 », tous d'un coup. */
function Rangee({ titre, valeurs }: { titre: string; valeurs: Array<[string, number]> }) {
  return (
    <div className="mt-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{titre}</div>
      <div className="mt-1 flex gap-2">
        {valeurs.map(([seuil, v]) => (
          <div key={seuil} className="flex-1 rounded-lg bg-slate-50 px-2 py-1.5 text-center">
            <div className="font-mono text-[10px] text-slate-500">{seuil}</div>
            <div className="font-display text-base leading-tight tabular-nums">{Math.round(v)} %</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Les cinq derniers résultats, du plus récent au plus ancien. */
function Serie({ serie }: { serie: string }) {
  // La chaîne va du plus ANCIEN au plus récent : on prend la fin, puis on
  // renverse, pour que le match le plus récent soit lu en premier.
  const cinq = serie.slice(-5).split('').reverse()
  const ton = (r: string) =>
    r === 'W' ? 'bg-accent-green text-ink-900' : r === 'D' ? 'bg-slate-300 text-ink-900' : 'bg-accent-red text-ink-900'
  return (
    <div className="flex gap-1" dir="ltr">
      {cinq.map((r, i) => (
        <span
          key={i}
          className={cn('h-4 w-4 rounded-sm grid place-items-center font-mono text-[9px] font-bold', ton(r))}
        >
          {r}
        </span>
      ))}
    </div>
  )
}

function BlocForme({ forme, nom, couleur }: { forme: Forme | null; nom: string; couleur: string }) {
  const t = useT()
  if (!forme) return <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{t('No form data.')}</div>
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: couleur }} />
        <span className="font-display text-sm truncate">{nom}</span>
      </div>
      <div className="mt-2">
        <Serie serie={forme.serie} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-slate-600">
        <Ligne cle={t('played')} valeur={`${forme.joues}`} />
        <Ligne cle={t('W / D / L')} valeur={`${forme.gagnes}/${forme.nuls}/${forme.perdus}`} />
        <Ligne cle={t('goals')} valeur={`${forme.butsPour}–${forme.butsContre}`} />
        <Ligne cle={t('points per match')} valeur={forme.pointsParMatch.toFixed(2)} />
      </dl>
    </div>
  )
}

function Ligne({ cle, valeur }: { cle: string; valeur: string }) {
  return (
    <>
      <dt className="text-slate-500 truncate">{cle}</dt>
      <dd className="text-end tabular-nums text-slate-800">{valeur}</dd>
    </>
  )
}

/**
 * Les soixante statistiques, côte à côte.
 *
 * Huit en vue, le reste replié. Et « meilleur » n'est pas toujours « plus
 * grand » : commettre plus de fautes ou perdre plus de ballons n'est pas un
 * avantage, d'où la liste ci-dessous.
 */
const MOINS_C_EST_MIEUX = new Set([
  'fouls', 'yellow_cards', 'red_cards', 'offsides', 'dispossessed',
  'big_chances_missed', 'errors_lead_to_a_goal', 'errors_lead_to_a_shot',
])

function Comparaison({ dom, ext }: { dom: Forme; ext: Forme }) {
  const t = useT()
  const cles = [...new Set([...Object.keys(dom.stats), ...Object.keys(ext.stats)])]
  const enTete = cles.filter((k) => (STATS_EN_TETE as readonly string[]).includes(k))
  const reste = cles.filter((k) => !(STATS_EN_TETE as readonly string[]).includes(k)).sort()

  // La colonne du milieu est à largeur fixe. En « auto » elle suivait la
  // longueur de chaque libellé, et les chiffres des deux équipes dansaient
  // d'une ligne à l'autre au lieu de former deux colonnes lisibles.
  const rendre = (k: string) => {
    const a = dom.stats[k]
    const b = ext.stats[k]
    const connu = typeof a === 'number' && typeof b === 'number'
    const moins = MOINS_C_EST_MIEUX.has(k)
    const domMieux = connu && (moins ? a < b : a > b)
    const extMieux = connu && (moins ? b < a : b > a)
    const nb = (v: number | undefined) => (typeof v === 'number' ? (Math.round(v * 100) / 100).toString() : '—')
    return (
      <div key={k} className="grid grid-cols-[1fr_minmax(0,9rem)_1fr] items-center gap-2 py-0.5">
        <span className={cn('text-end tabular-nums', domMieux ? 'text-accent-gold font-semibold' : 'text-slate-600')}>
          {nb(a)}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500 text-center px-1">
          {t(libelleStat(k))}
        </span>
        <span className={cn('tabular-nums', extMieux ? 'text-slate-900 font-semibold' : 'text-slate-600')}>
          {nb(b)}
        </span>
      </div>
    )
  }

  return (
    <div className="mt-3 font-mono text-[11px]">
      {enTete.map(rendre)}
      {reste.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-500 hover:text-accent-gold transition-colors">
            {avecN(t('{n} more statistics'), reste.length, 'en')}
          </summary>
          <div className="mt-1">{reste.map(rendre)}</div>
        </details>
      )}
    </div>
  )
}

function BlocFaceAFace({ h2h }: { h2h: FaceAFace }) {
  const t = useT()
  return (
    <section>
      <Titre>{t('Head-to-head')}</Titre>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Case etiquette={t('meetings')} valeur={`${h2h.total}`} />
        <Case etiquette={t('W / D / L')} valeur={`${h2h.domGagne}/${h2h.nuls}/${h2h.extGagne}`} />
        <Case etiquette={t('goals per match')} valeur={h2h.butsParMatch.toFixed(2)} />
      </div>
      {h2h.derniers.length > 0 && (
        <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-600">
          {h2h.derniers.map((m, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-slate-500 shrink-0">{m.date.slice(0, 10)}</span>
              <span className="truncate">{m.dom}</span>
              <span className="text-slate-900 font-semibold shrink-0" dir="ltr">{m.score}</span>
              <span className="truncate">{m.ext}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
