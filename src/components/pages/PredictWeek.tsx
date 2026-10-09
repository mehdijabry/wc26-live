import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ymdLocal, type DailyComp, type EspnEvent } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { usePageHead, useJsonLd } from '../../lib/head'
import { AuthModal } from '../AuthModal'
import { teamBadgeFallback, cn } from '../../lib/utils'
import { localeOf, trLeague, useLang, useT, type Lang } from '../../lib/i18n'
import { Jeton } from '../Jeton'
import {
  JETON,
  JETONS_PAR_JOUR,
  POINT,
  MISE_MINIMUM,
  PALIER,
  JAMBES_MAX,
  coteCombinee,
  cotes as chargerCotes,
  buteursDuMatch,
  grilleDuMatch,
  jambesParMatch,
  mesBulletins,
  poserBulletin,
  portefeuille as chargerPortefeuille,
  reclamableAujourdhui,
  reclamerDuJour,
  type Choix,
  type Buteur,
  type Cote,
  type Bulletin,
  type Jambe,
  type Portefeuille,
  type Selection,
} from '../../lib/jeu'

/**
 * /predictions — parier sur les vraies cotes.
 *
 * PARTI PRIS D'INTERFACE. La première version empilait, sur CHAQUE ligne de
 * match, trois pastilles de cote, un sélecteur de mise et un bouton « Miser »
 * grisé — soit cinq commandes par match, répétées quarante fois, avant même
 * d'avoir choisi quoi que ce soit. Illisible, et faussement cassé puisque le
 * bouton restait éteint.
 *
 * Ici une carte de match ne montre QUE trois choses : l'heure, les deux
 * équipes, et trois cotes en gros. Un seul geste. Tout le reste — la mise, le
 * gain, la confirmation — apparaît dans un bulletin collé en bas de l'écran,
 * à portée du pouce, et seulement une fois un camp choisi. C'est la
 * disposition de toutes les applications de paris, pour une bonne raison :
 * elle réduit l'acte à deux gestes et ne montre jamais une commande inutile.
 */

/** Même convention que le worker : surtout ne pas diverger. */
export function idDePronostic(ev: EspnEvent): string {
  return `e${ev.id}`
}

const JOURS = 7
/** Les mises proposées d'un geste. Un pas-à-pas demandait sept appuis.
 *  Le 1 ouvre la série depuis que le plancher est tombé à un crampon : avec
 *  cinq crampons par jour, c'est la mise qui permet de jouer cinq matchs. */
const MISES = [1, 3, 5, 10]

/**
 * Les chaînes de ce fichier sont EN ANGLAIS, parce que c'est la langue source
 * du dictionnaire (`src/lib/i18n.ts` est indexé par la phrase anglaise).
 * Écrire en français en dur, comme je l'avais fait, affiche du français à un
 * visiteur anglophone ou arabophone.
 *
 * `avec()` injecte les valeurs APRÈS traduction : la clé reste une phrase
 * anglaise stable avec des marqueurs `{x}`, et chaque langue place ses
 * variables où sa grammaire l'exige.
 */
function avec(phrase: string, valeurs: Record<string, string | number>): string {
  return Object.entries(valeurs).reduce(
    (acc, [cle, v]) => acc.split(`{${cle}}`).join(String(v)),
    phrase,
  )
}

function libelleJour(d: Date, i: number, lang: Lang, t: (s: string) => string): string {
  if (i === 0) return t('Today')
  if (i === 1) return t('Tomorrow')
  return d.toLocaleDateString(localeOf(lang), { weekday: 'short', day: 'numeric' })
}

type Camp = { nom: string; logo?: string; score?: string }

function camps(ev: EspnEvent): { dom: Camp; ext: Camp } | null {
  const c = ev.competitions?.[0]?.competitors ?? []
  const d = c.find((x) => x.homeAway === 'home')
  const e = c.find((x) => x.homeAway === 'away')
  if (!d?.team || !e?.team) return null
  const vers = (x: NonNullable<typeof d>): Camp => ({
    nom: x.team!.shortDisplayName ?? x.team!.displayName ?? x.team!.abbreviation ?? '?',
    logo: x.team!.logo ?? teamBadgeFallback(x.team!.logo, x.team!.abbreviation, x.team!.displayName),
    score: x.score,
  })
  return { dom: vers(d), ext: vers(e) }
}

function etat(ev: EspnEvent): 'avant' | 'direct' | 'fini' {
  const s = ev.status?.type?.state ?? ev.competitions?.[0]?.status?.type?.state
  if (s === 'post') return 'fini'
  if (s === 'in') return 'direct'
  return 'avant'
}

function heure(ev: EspnEvent, lang: Lang): string {
  return ev.date
    ? new Date(ev.date).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })
    : ''
}

const LIBELLE: Record<Choix, string> = { home: '1', draw: 'X', away: '2' }


/** Un camp : écusson + nom, aligné vers l'extérieur de la carte. */
function Equipe({ camp, cote }: { camp: Camp; cote: boolean }) {
  return (
    <div className={cn('flex-1 min-w-0 flex items-center gap-2.5', cote && 'flex-row-reverse text-end')}>
      {camp.logo ? (
        <img src={camp.logo} alt="" className="w-7 h-7 object-contain shrink-0" loading="lazy" />
      ) : (
        <span className="w-7 h-7 shrink-0" />
      )}
      <span className="truncate text-[15px] font-medium leading-tight">{camp.nom}</span>
    </div>
  )
}

function CarteMatch({
  ev,
  cote,
  jambes,
  selection,
  onChoisir,
  lang,
  t,
}: {
  ev: EspnEvent
  cote: Cote
  /** Ce que le joueur a DÉJÀ joué sur ce match, tous bulletins confondus. */
  jambes: Jambe[] | undefined
  /** Ce qu'il est en train d'y mettre, dans le bulletin en cours. */
  selection: Selection | undefined
  onChoisir: (matchId: string, s: Selection | null) => void
  lang: Lang
  t: (s: string) => string
}) {
  const [scoresOuverts, setScoresOuverts] = useState(false)
  const [buteursOuverts, setButeursOuverts] = useState(false)
  // `null` tant qu'on n'a rien demandé, [] quand le match n'a pas de marché.
  const [buteurs, setButeurs] = useState<Buteur[] | null>(null)
  const [grille, setGrille] = useState<Array<[string, number]> | null>(null)
  const id0 = idDePronostic(ev)

  // La grille des scores et la liste des buteurs se chargent AU DÉPLIAGE,
  // match par match. Elles voyageaient avec les cotes 1X2 de tous les
  // matchs, et faisaient passer ce chargement — celui qui commande
  // l'affichage même des cartes — de 47 Ko à 223 Ko. Sur un réseau lent, la
  // page restait vide le temps que ça descende, et affichait « aucun match ».
  //
  // Ces hooks restent AVANT le `return null` plus bas : React exige le même
  // ordre d'appel à chaque rendu, et un match mal formé sort par ce retour.
  useEffect(() => {
    if (!scoresOuverts || grille !== null) return
    let vivant = true
    void grilleDuMatch(id0).then((g) => {
      if (vivant) setGrille(Object.entries(g).sort((a, b) => a[1] - b[1]))
    })
    return () => { vivant = false }
  }, [scoresOuverts, grille, id0])

  useEffect(() => {
    if (!buteursOuverts || buteurs !== null) return
    let vivant = true
    void buteursDuMatch(id0).then((l) => { if (vivant) setButeurs(l) })
    return () => { vivant = false }
  }, [buteursOuverts, buteurs, id0])

  const c = camps(ev)
  if (!c) return null

  const id = idDePronostic(ev)
  const e = etat(ev)
  const ouvert = e === 'avant'
  const valeur = (ch: Choix) => (ch === 'home' ? cote.home : ch === 'draw' ? cote.draw : cote.away)
  const titre = `${c.dom.nom} — ${c.ext.nom}`
  const nomDuChoix = (ch: Choix) => (ch === 'home' ? c.dom.nom : ch === 'away' ? c.ext.nom : t('Draw'))

  const choisir = (marche: Selection['marche'], pick: string, valeurCote: number, libelle: string) => {
    const actif = selection?.marche === marche && selection.pick === pick
    onChoisir(id, actif ? null : { matchId: id, marche, pick, cote: valeurCote, titre, libelle })
  }

  return (
    <li
      id={`m-${id}`}
      className={cn(
        'glass rounded-2xl p-3.5 transition-all',
        selection && 'ring-glow border-accent-gold/50',
      )}
    >
      {/* Bandeau : l'heure, ou l'état du match */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className="font-mono text-[11px] tabular-nums text-slate-500">
          {e === 'direct' ? (
            <span className="inline-flex items-center gap-1.5 text-accent-red font-semibold">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
              </span>
              {t('LIVE')}
            </span>
          ) : (
            heure(ev, lang)
          )}
        </span>

        {/* Ce qui est déjà joué sur ce match. Un même match peut être dans
            plusieurs bulletins — un simple et un combiné — donc on compte. */}
        {jambes && jambes.length > 0 && (
          <span className="font-mono text-[11px] flex items-center gap-1.5">
            {jambes.some((j) => j.status === 'won') && (
              <span className="px-2 py-0.5 rounded-full bg-accent-gold/15 text-accent-gold font-semibold">
                {t('won')}
              </span>
            )}
            <span className="text-slate-500">
              {jambes.length === 1
                ? avec(t('backed at {c}'), { c: Number(jambes[0]!.odds).toFixed(2) })
                : avec(t('in {n} slips'), { n: jambes.length })}
            </span>
          </span>
        )}
      </div>

      {/* Les deux équipes, et au centre l'heure ou le score */}
      <div className="flex items-center gap-2">
        <Equipe camp={c.dom} cote={false} />
        <span
          className={cn(
            'shrink-0 px-2 font-mono tabular-nums',
            e === 'avant' ? 'text-[11px] text-slate-400' : 'text-base font-bold text-slate-900',
          )}
        >
          {e === 'avant' ? t('vs') : `${c.dom.score ?? '-'} - ${c.ext.score ?? '-'}`}
        </span>
        <Equipe camp={c.ext} cote />
      </div>

      {/* Les trois cotes */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['home', 'draw', 'away'] as Choix[]).map((ch) => {
          const actif = selection?.marche === '1x2' && selection.pick === ch
          return (
            <button
              key={ch}
              type="button"
              disabled={!ouvert}
              aria-pressed={actif}
              onClick={() => choisir('1x2', ch, valeur(ch), nomDuChoix(ch))}
              className={cn(
                'rounded-xl py-2 flex flex-col items-center justify-center gap-0.5 transition-all border',
                actif
                  ? 'bg-accent-gold text-ink-900 border-accent-gold font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-accent-gold/50 hover:bg-slate-100',
                !ouvert && !actif && 'opacity-35',
                ouvert && 'active:scale-[0.97]',
              )}
            >
              <span className={cn('font-mono text-[10px] tracking-wider', actif ? 'text-ink-700' : 'text-slate-500')}>
                {LIBELLE[ch]}
              </span>
              <span className="font-display text-lg leading-none tabular-nums">{valeur(ch).toFixed(2)}</span>
            </button>
          )
        })}
      </div>

      {/* Le score exact, replié. Déplié d'office, vingt-cinq boutons par
          match rendraient la liste illisible — c'est le marché d'un joueur
          qui le cherche, pas celui qu'on met en travers du chemin. */}
      {ouvert && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setScoresOuverts((v) => !v)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-1.5 rounded-lg font-mono text-[11px] transition-colors',
              selection?.marche === 'exact'
                ? 'bg-accent-gold/15 text-accent-gold'
                : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <span className="uppercase tracking-wider">
              {t('Exact score')}
              {selection?.marche === 'exact' && (
                <span className="ms-2 font-semibold normal-case tracking-normal">
                  {selection.pick} @ {selection.cote.toFixed(2)}
                </span>
              )}
            </span>
            <span className="text-slate-400">{scoresOuverts ? '−' : '+'}</span>
          </button>

          {scoresOuverts && grille === null && (
            <p className="px-3 py-2 font-mono text-[11px] text-slate-500">{t('Loading…')}</p>
          )}
          {scoresOuverts && grille !== null && grille.length === 0 && (
            <p className="px-3 py-2 font-mono text-[11px] text-slate-500">
              {t('No exact-score market on this match.')}
            </p>
          )}
          {scoresOuverts && grille !== null && grille.length > 0 && (
            <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {grille.map(([score, c2]) => {
                const actif = selection?.marche === 'exact' && selection.pick === score
                return (
                  <button
                    key={score}
                    type="button"
                    aria-pressed={actif}
                    onClick={() => choisir('exact', score, c2, score)}
                    className={cn(
                      'rounded-lg py-1.5 flex flex-col items-center gap-0.5 border transition-all active:scale-[0.97]',
                      actif
                        ? 'bg-accent-gold text-ink-900 border-accent-gold font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-accent-gold/50',
                    )}
                  >
                    <span className="font-mono text-[12px] tabular-nums leading-none">{score}</span>
                    <span
                      className={cn(
                        'font-mono text-[10px] tabular-nums leading-none',
                        actif ? 'text-ink-700' : 'text-slate-500',
                      )}
                    >
                      ×{c2.toFixed(2)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Le buteur. Même repli que le score exact, même raison. */}
      {ouvert && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setButeursOuverts((v) => !v)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-1.5 rounded-lg font-mono text-[11px] transition-colors',
              selection?.marche === 'scorer'
                ? 'bg-accent-gold/15 text-accent-gold'
                : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <span className="uppercase tracking-wider">
              {t('Goalscorer')}
              {selection?.marche === 'scorer' && (
                <span className="ms-2 font-semibold normal-case tracking-normal">
                  {selection.libelle} @ {selection.cote.toFixed(2)}
                </span>
              )}
            </span>
            <span className="text-slate-400">{buteursOuverts ? '−' : '+'}</span>
          </button>

          {buteursOuverts && (
            <div className="mt-2">
              {buteurs === null ? (
                <p className="px-3 py-2 font-mono text-[11px] text-slate-500">{t('Loading…')}</p>
              ) : buteurs.length === 0 ? (
                // Pas une panne : ESPN ne publie les buteurs que sur une
                // partie des compétitions, et on n'ouvre le marché que là
                // où ils le sont vraiment.
                <p className="px-3 py-2 font-mono text-[11px] text-slate-500">
                  {t('No goalscorer market on this competition.')}
                </p>
              ) : (
                <ul className="max-h-60 overflow-y-auto no-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {buteurs.map((b) => {
                    const actif = selection?.marche === 'scorer' && selection.pick === b.id
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          aria-pressed={actif}
                          onClick={() => choisir('scorer', b.id, b.cote, b.nom)}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all active:scale-[0.98] text-start',
                            actif
                              ? 'bg-accent-gold text-ink-900 border-accent-gold font-semibold'
                              : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-accent-gold/50',
                          )}
                        >
                          {/* L'écusson dit pour quelle équipe il joue —
                              indispensable quand deux listes se mélangent. */}
                          {(b.equipe === 'dom' ? c.dom.logo : c.ext.logo) && (
                            <img
                              src={(b.equipe === 'dom' ? c.dom.logo : c.ext.logo)!}
                              alt=""
                              className="w-4 h-4 object-contain shrink-0"
                              loading="lazy"
                            />
                          )}
                          <span className="flex-1 min-w-0 truncate text-[12px] leading-tight">{b.nom}</span>
                          <span
                            className={cn(
                              'font-mono text-[11px] tabular-nums shrink-0',
                              actif ? 'text-ink-700' : 'text-accent-gold',
                            )}
                          >
                            {b.cote.toFixed(2)}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Le bulletin : tout ce qui concerne la mise, au même endroit, en bas.
 *
 * Il porte maintenant PLUSIEURS sélections. Un combiné, c'est un seul enjeu
 * réparti sur plusieurs matchs : la cote est le produit des cotes — trois
 * matchs à 2,00 paient 8,00 — et une seule erreur fait tout tomber. Les deux
 * moitiés de ce marché doivent se voir d'un coup d'œil, d'où la cote totale
 * en gros et l'avertissement « tout doit tomber » dès la deuxième sélection.
 */
function Bulletin({
  selections,
  solde,
  occupe,
  erreur,
  onMiser,
  onRetirer,
  onVider,
  lang,
  t,
}: {
  selections: Selection[]
  solde: number
  occupe: boolean
  erreur: string | null
  onMiser: (mise: number) => void
  onRetirer: (matchId: string) => void
  onVider: () => void
  lang: Lang
  t: (s: string) => string
}) {
  const [mise, setMise] = useState(MISE_MINIMUM)
  const max = Math.max(MISE_MINIMUM, solde)
  const utilisable = Math.min(mise, max)
  const cote = coteCombinee(selections)
  const gain = Math.round(utilisable * cote)
  const combine = selections.length > 1

  return (
    <div className="fixed inset-x-0 bottom-[4.5rem] md:bottom-4 z-40 px-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-lg glass ring-glow rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-display text-base">
              {combine ? t('Accumulator') : t('Single')}
            </span>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
              {avec(t('{n} selections'), { n: selections.length })}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-display text-xl leading-none tabular-nums text-accent-gold">
              ×{cote.toFixed(2)}
            </span>
            <button
              type="button"
              onClick={onVider}
              aria-label={t('Clear slip')}
              className="w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Les sélections. La liste défile au-delà de trois : le bulletin ne
            doit jamais manger l'écran sous lequel on choisit ses matchs. */}
        <ul
          className={cn(
            'mt-2.5 max-h-48 overflow-y-auto no-scrollbar divide-y divide-slate-200/50',
            // Quatre sélections tiennent en entier — c'est la taille d'un
            // combiné courant, et on ne veut pas faire défiler pour ça.
            // Au-delà, la liste défile, et un fondu dit qu'il y a une suite :
            // sans lui, la ligne du bas est tranchée net et se lit comme un
            // défaut d'affichage plutôt que comme « continuez à faire défiler ».
            selections.length > 4 && '[mask-image:linear-gradient(to_bottom,black_84%,transparent)]',
          )}
        >
          {selections.map((s) => (
            <li key={s.matchId} className="flex items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] leading-tight">{s.titre}</div>
                <div className="font-mono text-[10px] text-slate-500 truncate">
                  {s.marche === 'exact' ? t('Exact score') : s.marche === 'scorer' ? t('Goalscorer') : t('Winner')} · {s.libelle}
                </div>
              </div>
              <span className="font-mono text-[12px] tabular-nums text-accent-gold shrink-0">
                {s.cote.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => onRetirer(s.matchId)}
                aria-label={t('Remove')}
                className="shrink-0 w-5 h-5 rounded-full text-slate-400 hover:text-slate-900 hover:bg-slate-50 leading-none text-xs"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {combine && (
          <p className="mt-1.5 font-mono text-[10px] text-slate-500">
            {t('Every selection must land, or the slip is lost.')}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          {MISES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={m > solde}
              onClick={() => setMise(m)}
              className={cn(
                'flex-1 py-2 rounded-xl font-mono text-sm tabular-nums transition-colors border',
                utilisable === m
                  ? 'bg-accent-gold/15 border-accent-gold/60 text-accent-gold font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
                m > solde && 'opacity-30',
              )}
            >
              {m}
            </button>
          ))}
          <button
            type="button"
            disabled={solde < MISE_MINIMUM}
            onClick={() => setMise(solde)}
            className={cn(
              'flex-1 py-2 rounded-xl font-mono text-xs transition-colors border',
              utilisable === solde && solde >= MISE_MINIMUM
                ? 'bg-accent-gold/15 border-accent-gold/60 text-accent-gold font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
              solde < MISE_MINIMUM && 'opacity-30',
            )}
          >
            {t('all')}
          </button>
        </div>

        <button
          type="button"
          disabled={occupe || solde < MISE_MINIMUM}
          onClick={() => onMiser(utilisable)}
          className="mt-3 w-full py-3 rounded-xl bg-accent-gold text-ink-900 font-semibold disabled:opacity-40 active:scale-[0.99] transition-transform"
        >
          {solde < MISE_MINIMUM
            ? avec(t('You need {n} {jeton}'), { n: MISE_MINIMUM, jeton: JETON.plusieurs })
            : avec(t('Stake {n} · win {g}'), { n: utilisable, g: gain.toLocaleString(localeOf(lang)) })}
        </button>

        {erreur && <p className="mt-2 text-center text-xs text-accent-red">{erreur}</p>}
      </div>
    </div>
  )
}

export function PredictWeek() {
  const [jour, setJour] = useState(0)
  const [jourChoisi, setJourChoisi] = useState(false)
  const [comps, setComps] = useState<DailyComp[] | null>(null)
  const [erreurChargement, setErreurChargement] = useState(false)
  const [cotes, setCotes] = useState<Map<string, Cote>>(new Map())
  /** Sans les cotes, AUCUNE carte ne s'affiche : il faut savoir si elles
   *  manquent parce qu'il n'y en a pas, ou parce que le chargement a raté. */
  const [cotesEtat, setCotesEtat] = useState<'chargement' | 'ok' | 'erreur'>('chargement')
  const [jambes, setJambes] = useState<Map<string, Jambe[]>>(new Map())
  const [pf, setPf] = useState<Portefeuille | null>(null)
  const [modale, setModale] = useState(false)
  /** Le bulletin en cours de composition. Plusieurs matchs = un combiné. */
  const [selections, setSelections] = useState<Selection[]>([])
  // Arrivée depuis une cote cliquée sur l'accueil ou une carte du jour :
  // ?match=e123&pick=home. On ouvre le bon jour, on va à la carte, et on
  // pose le choix. Consommé une seule fois — un rechargement ne doit pas
  // re-remplir le bulletin tout seul.
  const [params, setParams] = useSearchParams()
  const [aRejoindre, setARejoindre] = useState<{ match: string; pick: string } | null>(() => {
    const m = params.get('match')
    const p = params.get('pick')
    return m ? { match: m, pick: p ?? '' } : null
  })
  /** `null` = toutes les compétitions. */
  const [filtreComp, setFiltreComp] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreurPari, setErreurPari] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const user = useAuth((s) => s.user)
  const t = useT()
  const lang = useLang((s) => s.lang)

  const dates = useMemo(
    () =>
      Array.from({ length: JOURS }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() + i)
        return d
      }),
    [],
  )

  usePageHead(
    comps
      ? {
          titre: 'Football predictions — back your call at real odds',
          description: `Back the winner on hundreds of matches a week, at the real odds — every league we have a price for. Free ${JETON.plusieurs} every day, nothing to deposit, no bookmaker.`,
          chemin: '/predictions',
        }
      : null,
  )

  useJsonLd(
    'predictions',
    comps
      ? {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Pressing 90 predictions',
          url: 'https://pressing90.live/predictions',
          applicationCategory: 'SportsApplication',
          operatingSystem: 'Web',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        }
      : null,
  )

  // Les cotes servent aussi à choisir le jour d'ouverture : sans ça la page
  // s'ouvre un jour creux et paraît vide alors qu'il y a des matchs demain.
  useEffect(() => {
    let vivant = true
    const charger = async () => {
      // Deux essais. Cette requête commande l'affichage de TOUTES les cartes :
      // si elle rate une fois, la page reste vide et rien ne la relance — le
      // visiteur lit « aucun match ce jour-là », ce qui est faux.
      for (let essai = 0; essai < 2; essai++) {
        try {
          const c = await chargerCotes()
          if (!vivant) return
          setCotes(c)
          setCotesEtat('ok')
          if (jourChoisi) return
          // Venu d'une cote cliquée ailleurs : on ouvre le jour de CE match,
          // pas la première journée garnie.
          const vouluId = aRejoindre?.match
          const voulu = vouluId ? c.get(vouluId) : undefined
          if (voulu?.kickoff) {
            const cible = ymdLocal(new Date(voulu.kickoff))
            for (let i = 0; i < JOURS; i++) {
              const d = new Date()
              d.setDate(d.getDate() + i)
              if (ymdLocal(d) === cible) {
                setJour(i)
                break
              }
            }
            setJourChoisi(true)
            return
          }
          const jours = new Set<string>()
          for (const x of c.values()) if (x.kickoff) jours.add(ymdLocal(new Date(x.kickoff)))
          for (let i = 0; i < JOURS; i++) {
            const d = new Date()
            d.setDate(d.getDate() + i)
            if (jours.has(ymdLocal(d))) {
              setJour(i)
              break
            }
          }
          setJourChoisi(true)
          return
        } catch {
          if (essai === 0) await new Promise((r) => setTimeout(r, 800))
        }
      }
      if (vivant) {
        setCotesEtat('erreur')
        setJourChoisi(true)
      }
    }
    void charger()
    return () => { vivant = false }
  }, [jourChoisi, aRejoindre])

  const rafraichirJoueur = useCallback(async () => {
    if (!user) {
      setPf(null)
      setJambes(new Map())
      return
    }
    // Les deux lectures sont indépendantes : si la liste des bulletins échoue,
    // le portefeuille doit quand même s'afficher. On perd seulement les repères
    // « déjà joué » sur les cartes, et la page Mes paris, elle, dira l'erreur.
    const [p, b] = await Promise.all([
      chargerPortefeuille(user.id),
      mesBulletins().catch(() => [] as Bulletin[]),
    ])
    setPf(p)
    setJambes(jambesParMatch(b))
  }, [user])

  useEffect(() => {
    void rafraichirJoueur()
  }, [rafraichirJoueur])

  useEffect(() => {
    let vivant = true
    setComps(null)
    setErreurChargement(false)
    // On ne vide PAS le bulletin en changeant de jour : un combiné se
    // compose justement sur plusieurs journées, et perdre ses sélections
    // en allant voir demain rendrait le marché inutilisable.
    // Une compétition choisie un jour n'existe pas forcément le lendemain :
    // garder le filtre afficherait une page vide sans raison apparente.
    setFiltreComp(null)
    api
      .today(ymdLocal(dates[jour]!))
      .then((d) => {
        if (vivant) setComps(d.competitions ?? [])
      })
      .catch(() => {
        if (vivant) setErreurChargement(true)
      })
    return () => {
      vivant = false
    }
  }, [jour, dates])

  /**
   * Ajoute, remplace ou retire une sélection. Un seul choix par match dans
   * un bulletin : reprendre le même match remplace, puisque deux paris
   * contradictoires sur un même match n'auraient aucun sens.
   */
  const onChoisir = (matchId: string, s: Selection | null) => {
    if (s && !user) {
      setModale(true)
      return
    }
    if (s && selections.length >= JAMBES_MAX && !selections.some((x) => x.matchId === matchId)) {
      setErreurPari(avec(t('Up to {n} selections in one slip.'), { n: JAMBES_MAX }))
      return
    }
    setErreurPari(null)
    // Forme fonctionnelle, et pas `[...selections, s]` : deux appels dans le
    // même tick liraient tous deux la valeur d'avant, et le second écraserait
    // le premier. Un humain ne tape pas deux fois assez vite, mais le script
    // de vérification y est arrivé du premier coup — et une liste qui perd
    // silencieusement une sélection dans un jeu d'argent, non.
    setSelections((prev) => {
      const autres = prev.filter((x) => x.matchId !== matchId)
      return s ? [...autres, s] : autres
    })
  }

  const onMiser = async (mise: number) => {
    if (!user || !selections.length) return
    setOccupe(true)
    const r = await poserBulletin(selections, mise)
    setOccupe(false)
    await rafraichirJoueur()
    if (r.ok) {
      const combine = selections.length > 1
      setSelections([])
      setMessage(combine ? t('Accumulator placed') : t('Bet placed'))
      setTimeout(() => setMessage(null), 3000)
    } else {
      setErreurPari(r.raison)
    }
  }

  const onReclamer = async () => {
    const r = await reclamerDuJour()
    await rafraichirJoueur()
    setMessage(
      !r
        ? t('Could not claim right now.')
        : r.dejaReclame
          ? t('Already claimed today — come back tomorrow.')
          : avec(t('+{d} {jeton} · balance {n}'), { d: JETONS_PAR_JOUR, jeton: JETON.plusieurs, n: r.solde }),
    )
    setTimeout(() => setMessage(null), 4000)
  }

  // Seuls les matchs dont le serveur a publié une cote sont pariables.
  const jouables = useMemo(() => {
    if (!comps) return []
    return comps
      .map((c) => ({ ...c, events: c.events.filter((ev) => cotes.has(idDePronostic(ev))) }))
      .filter((c) => c.events.length > 0)
  }, [comps, cotes])

  /**
   * L'atterrissage depuis une cote cliquée ailleurs.
   *
   * On attend que le jour soit chargé ET que la carte existe dans le DOM —
   * sans quoi on ferait défiler vers rien. Une fois posé, le paramètre est
   * retiré de l'adresse : recharger la page ne doit pas re-remplir le
   * bulletin tout seul, et l'adresse partagée doit rester propre.
   */
  useEffect(() => {
    if (!aRejoindre || !comps) return
    const noeud = document.getElementById(`m-${aRejoindre.match}`)
    if (!noeud) return

    noeud.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Le halo est posé SUR LE NŒUD, pas par un état : passer par un état
    // re-rendrait les cent quatre-vingts cartes de la journée pour un
    // anneau qui s'efface au bout de quatre secondes. Quand le visiteur est
    // connecté, la sélection qu'on pose juste après allume de toute façon
    // sa propre bordure.
    const halo = ['ring-2', 'ring-accent-gold']
    noeud.classList.add(...halo)
    const minuteur = setTimeout(() => noeud.classList.remove(...halo), 4000)

    const cote = cotes.get(aRejoindre.match)
    const pick = aRejoindre.pick
    if (user && cote && (pick === 'home' || pick === 'draw' || pick === 'away')) {
      const ev = jouables.flatMap((c) => c.events).find((e) => idDePronostic(e) === aRejoindre.match)
      const c2 = ev ? camps(ev) : null
      if (c2) {
        onChoisir(aRejoindre.match, {
          matchId: aRejoindre.match,
          marche: '1x2',
          pick,
          cote: pick === 'home' ? cote.home : pick === 'draw' ? cote.draw : cote.away,
          titre: `${c2.dom.nom} — ${c2.ext.nom}`,
          libelle: pick === 'home' ? c2.dom.nom : pick === 'away' ? c2.ext.nom : t('Draw'),
        })
      }
    }

    setARejoindre(null)
    const p = new URLSearchParams(params)
    p.delete('match')
    p.delete('pick')
    setParams(p, { replace: true })
    return () => clearTimeout(minuteur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aRejoindre, comps, cotes, user])

  const affichees = useMemo(
    () => (filtreComp ? jouables.filter((c) => c.slug === filtreComp) : jouables),
    [jouables, filtreComp],
  )
  const totalJouables = useMemo(
    () => jouables.reduce((a, c) => a + c.events.length, 0),
    [jouables],
  )

  const solde = pf?.crampons ?? 0
  const aReclamer = reclamableAujourdhui(pf)
  const progression = pf ? Math.min(100, (Number(pf.pressings) / PALIER.points) * 100) : 0

  return (
    <div className={cn('container max-w-2xl mx-auto px-4 sm:px-6 py-8', selections.length > 0 && 'pb-72')}>
      <h1 className="font-display text-4xl sm:text-5xl tracking-tight">{t('Predictions')}</h1>
      <p className="mt-2 text-slate-600 text-[15px]">
        {t('Pick a side, set your stake, the odds do the rest.')}
      </p>

      {/* Les règles sont là pour qui les cherche, pas en travers du chemin. */}
      <details className="mt-3 group">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-slate-500 hover:text-accent-gold transition-colors">
          {t('How it works')}
        </summary>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          {avec(
            t(
              'You get {d} {jeton} a day, claimed by signing in — unclaimed, they are lost. Stake at least {min} of them on a result, at the real match odds: the clearer the favourite, the less it pays. Winnings are {point}, and {palier} {point} unlock {prix}. Nothing to deposit, no bookmaker. Every match we have a price for is playable — leagues, cups and national teams, the biggest competitions first.',
            ),
            {
              d: JETONS_PAR_JOUR,
              jeton: JETON.plusieurs,
              min: MISE_MINIMUM,
              point: POINT.plusieurs,
              palier: PALIER.points.toLocaleString(localeOf(lang)),
              prix: PALIER.recompense,
            },
          )}
        </p>
      </details>

      {/* Le portefeuille, lisible d'un coup d'œil */}
      {user ? (
        <div className="mt-5 glass rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-5">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Jeton type="crampon" taille={11} />
                {JETON.plusieurs}
              </div>
              <div className="font-display text-2xl leading-none tabular-nums">{solde}</div>
            </div>
            <div className="w-px self-stretch bg-slate-200" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Jeton type="pressing" taille={11} />
                {POINT.plusieurs}
              </div>
              <div className="font-display text-2xl leading-none tabular-nums text-accent-violet">
                {Number(pf?.pressings ?? 0).toLocaleString(localeOf(lang))}
              </div>
            </div>
            <div className="ms-auto">
              {aReclamer ? (
                <button
                  type="button"
                  onClick={() => void onReclamer()}
                  className="px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  {avec(t('+{d} free'), { d: JETONS_PAR_JOUR })}
                </button>
              ) : (
                <span className="font-mono text-[11px] text-slate-500">{t('claimed')} ✓</span>
              )}
            </div>
          </div>
          <div className="mt-3">
            <div className="h-1 rounded-full bg-slate-50 overflow-hidden">
              <div className="h-full bg-accent-violet transition-all" style={{ width: `${progression}%` }} />
            </div>
            <div className="mt-1 font-mono text-[10px] text-slate-500 tabular-nums">
              {PALIER.points.toLocaleString(localeOf(lang))} {POINT.plusieurs} → {PALIER.recompense}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModale(true)}
          className="mt-5 w-full glass glass-hover rounded-2xl px-4 py-3.5 text-start"
        >
          <span className="font-semibold">{t('Sign in')}</span>
          <span className="text-slate-600">
            {' '}
            {avec(t('to get {d} free {jeton} every day.'), { d: JETONS_PAR_JOUR, jeton: JETON.plusieurs })}
          </span>
        </button>
      )}

      {message && (
        <p className="mt-3 text-center text-sm text-accent-gold font-medium">{message}</p>
      )}

      {/* Les jours */}
      <div className="mt-5 flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {dates.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setJour(i)}
            className={cn(
              'px-3.5 py-2 rounded-xl font-mono text-xs whitespace-nowrap transition-colors border',
              i === jour
                ? 'bg-accent-gold text-ink-900 border-accent-gold font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100',
            )}
          >
            {libelleJour(d, i, lang, t)}
          </button>
        ))}
      </div>

      {/* Filtre par compétition. Un samedi ramène plus de 180 matchs dans une
          quarantaine de compétitions : tout afficher d'un bloc est illisible.
          Les compétitions arrivent déjà triées par importance depuis
          `api.today()`, donc les grandes sortent en tête de cette rangée. */}
      {jouables.length > 1 && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setFiltreComp(null)}
            className={cn(
              'px-3 py-1.5 rounded-lg font-mono text-[11px] whitespace-nowrap transition-colors border',
              filtreComp === null
                ? 'bg-slate-100 border-accent-gold/50 text-slate-900 font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100',
            )}
          >
            {t('All')} · {totalJouables}
          </button>
          {jouables.map((c) => (
            <button
              key={c.slug}
              type="button"
              onClick={() => setFiltreComp(c.slug === filtreComp ? null : c.slug)}
              className={cn(
                'px-3 py-1.5 rounded-lg font-mono text-[11px] whitespace-nowrap transition-colors border',
                filtreComp === c.slug
                  ? 'bg-slate-100 border-accent-gold/50 text-slate-900 font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100',
              )}
            >
              {trLeague(c.label, lang)} · {c.events.length}
            </button>
          ))}
        </div>
      )}

      {erreurChargement && (
        <p className="mt-10 text-center text-sm text-slate-500">
          {t('Fixtures are not responding. Try again in a moment.')}
        </p>
      )}
      {!comps && !erreurChargement && (
        <p className="mt-10 text-center text-sm text-slate-500">{t('Loading…')}</p>
      )}
      {/* Les cotes n'ont pas pu être chargées : le dire, au lieu de laisser
          croire qu'aucun match ne se joue. */}
      {cotesEtat === 'erreur' && (
        <p className="mt-10 text-center text-sm text-slate-500">
          {t('Odds are not responding. Reload the page in a moment.')}
        </p>
      )}
      {comps && cotesEtat === 'chargement' && jouables.length === 0 && (
        <p className="mt-10 text-center text-sm text-slate-500">{t('Loading…')}</p>
      )}
      {comps && cotesEtat === 'ok' && jouables.length === 0 && (
        <p className="mt-10 text-center text-sm text-slate-500">
          {t('Nothing to back that day — no odds published. Try another day: the weekend has the most.')}
        </p>
      )}

      {affichees.map((c) => (
        <section key={c.slug} className="mt-7">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-accent-gold/80 whitespace-nowrap">
              {trLeague(c.label, lang)}
            </h2>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <ul className="mt-3 grid gap-2.5">
            {c.events.map((ev) => (
              <CarteMatch
                key={ev.id}
                ev={ev}
                cote={cotes.get(idDePronostic(ev))!}
                jambes={jambes.get(idDePronostic(ev))}
                selection={selections.find((x) => x.matchId === idDePronostic(ev))}
                onChoisir={onChoisir}
                lang={lang}
                t={t}
              />
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-12 text-sm text-slate-600">
        {t('Settle it with your mates in a')}{' '}
        <Link to="/leagues" className="text-accent-gold hover:underline">
          {t('private league')}
        </Link>
        {', '}
        {t('or see where you stand on')}{' '}
        <Link to="/board" className="text-accent-gold hover:underline">
          {t('the table')}
        </Link>
        {'. '}
        {t('The World Cup 2026 bracket is kept on the')}{' '}
        <Link to="/bracket" className="text-accent-gold hover:underline">
          {t('bracket page')}
        </Link>
        .
      </p>

      {selections.length > 0 && (
        <Bulletin
          selections={selections}
          solde={solde}
          occupe={occupe}
          erreur={erreurPari}
          onMiser={(m) => void onMiser(m)}
          onRetirer={(id) => onChoisir(id, null)}
          onVider={() => { setSelections([]); setErreurPari(null) }}
          lang={lang}
          t={t}
        />
      )}

      <AuthModal open={modale} onClose={() => { setModale(false); void rafraichirJoueur() }} />
    </div>
  )
}
