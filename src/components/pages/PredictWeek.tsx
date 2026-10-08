import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ymdLocal, type DailyComp, type EspnEvent } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { usePageHead, useJsonLd } from '../../lib/head'
import { AuthModal } from '../AuthModal'
import { teamBadgeFallback, cn } from '../../lib/utils'
import {
  JETON,
  POINT,
  MISE_MINIMUM,
  PALIER,
  cotes as chargerCotes,
  mesParis,
  parier,
  portefeuille as chargerPortefeuille,
  reclamableAujourdhui,
  reclamerDuJour,
  type Choix,
  type Cote,
  type Pari,
  type Portefeuille,
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
/** Les mises proposées d'un geste. Un pas-à-pas demandait sept appuis. */
const MISES = [3, 5, 10]

function libelleJour(d: Date, i: number): string {
  if (i === 0) return "Auj."
  if (i === 1) return 'Demain'
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
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

function heure(ev: EspnEvent): string {
  return ev.date ? new Date(ev.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''
}

const LIBELLE: Record<Choix, string> = { home: '1', draw: 'X', away: '2' }

type Selection = { matchId: string; choix: Choix; cote: number; titre: string }

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
  pari,
  selection,
  onChoisir,
}: {
  ev: EspnEvent
  cote: Cote
  pari: Pari | undefined
  selection: Selection | null
  onChoisir: (s: Selection | null) => void
}) {
  const c = camps(ev)
  if (!c) return null

  const id = idDePronostic(ev)
  const e = etat(ev)
  const ouvert = e === 'avant' && !pari
  const valeur = (ch: Choix) => (ch === 'home' ? cote.home : ch === 'draw' ? cote.draw : cote.away)
  const titre = `${c.dom.nom} — ${c.ext.nom}`

  return (
    <li
      className={cn(
        'glass rounded-2xl p-3.5 transition-all',
        selection?.matchId === id && 'ring-glow border-accent-gold/50',
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
              EN DIRECT
            </span>
          ) : (
            heure(ev)
          )}
        </span>

        {pari && (
          <span className="font-mono text-[11px]">
            {pari.status === 'open' && (
              <span className="text-slate-500">
                {pari.stake} engagés · {Math.round(pari.stake * pari.odds).toLocaleString('fr-FR')} possible
              </span>
            )}
            {pari.status === 'won' && (
              <span className="px-2 py-0.5 rounded-full bg-accent-gold/15 text-accent-gold font-semibold">
                +{(pari.payout ?? 0).toLocaleString('fr-FR')}
              </span>
            )}
            {pari.status === 'lost' && <span className="text-slate-500">perdu</span>}
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
          {e === 'avant' ? 'vs' : `${c.dom.score ?? '-'} - ${c.ext.score ?? '-'}`}
        </span>
        <Equipe camp={c.ext} cote />
      </div>

      {/* Les trois cotes — la seule commande de la carte */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['home', 'draw', 'away'] as Choix[]).map((ch) => {
          const actif = pari ? pari.pick === ch : selection?.matchId === id && selection.choix === ch
          const eteint = !ouvert && !actif
          return (
            <button
              key={ch}
              type="button"
              disabled={!ouvert}
              aria-pressed={actif}
              onClick={() => onChoisir(actif ? null : { matchId: id, choix: ch, cote: valeur(ch), titre })}
              className={cn(
                'rounded-xl py-2 flex flex-col items-center justify-center gap-0.5 transition-all',
                'border',
                actif
                  ? 'bg-accent-gold text-ink-900 border-accent-gold font-semibold'
                  : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-accent-gold/50 hover:bg-slate-100',
                eteint && 'opacity-35',
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
    </li>
  )
}

/** Le bulletin : tout ce qui concerne la mise, au même endroit, en bas. */
function Bulletin({
  selection,
  solde,
  occupe,
  erreur,
  onMiser,
  onFermer,
}: {
  selection: Selection
  solde: number
  occupe: boolean
  erreur: string | null
  onMiser: (mise: number) => void
  onFermer: () => void
}) {
  const [mise, setMise] = useState(MISE_MINIMUM)
  const max = Math.max(MISE_MINIMUM, solde)
  const utilisable = Math.min(mise, max)
  const gain = Math.round(utilisable * selection.cote)

  return (
    <div className="fixed inset-x-0 bottom-[4.5rem] md:bottom-4 z-40 px-4 pointer-events-none">
      <div className="pointer-events-auto mx-auto max-w-lg glass ring-glow rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{selection.titre}</div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-500">
              Ton choix : <span className="text-accent-gold font-semibold">{LIBELLE[selection.choix]}</span> à{' '}
              {selection.cote.toFixed(2)}
            </div>
          </div>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="shrink-0 w-7 h-7 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 leading-none"
          >
            ×
          </button>
        </div>

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
            tout
          </button>
        </div>

        <button
          type="button"
          disabled={occupe || solde < MISE_MINIMUM}
          onClick={() => onMiser(utilisable)}
          className="mt-3 w-full py-3 rounded-xl bg-accent-gold text-ink-900 font-semibold disabled:opacity-40 active:scale-[0.99] transition-transform"
        >
          {solde < MISE_MINIMUM
            ? `Il te faut ${MISE_MINIMUM} ${JETON.plusieurs}`
            : `Miser ${utilisable} · gagner ${gain.toLocaleString('fr-FR')}`}
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
  const [paris, setParis] = useState<Map<string, Pari>>(new Map())
  const [pf, setPf] = useState<Portefeuille | null>(null)
  const [modale, setModale] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  /** `null` = toutes les compétitions. */
  const [filtreComp, setFiltreComp] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [erreurPari, setErreurPari] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const user = useAuth((s) => s.user)

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
    void chargerCotes().then((c) => {
      setCotes(c)
      if (jourChoisi) return
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
    })
  }, [jourChoisi])

  const rafraichirJoueur = useCallback(async () => {
    if (!user) {
      setPf(null)
      setParis(new Map())
      return
    }
    const [p, b] = await Promise.all([chargerPortefeuille(user.id), mesParis(user.id)])
    setPf(p)
    setParis(b)
  }, [user])

  useEffect(() => {
    void rafraichirJoueur()
  }, [rafraichirJoueur])

  useEffect(() => {
    let vivant = true
    setComps(null)
    setErreurChargement(false)
    setSelection(null)
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

  const onChoisir = (s: Selection | null) => {
    if (s && !user) {
      setModale(true)
      return
    }
    setErreurPari(null)
    setSelection(s)
  }

  const onMiser = async (mise: number) => {
    if (!user || !selection) return
    setOccupe(true)
    const r = await parier(user.id, selection.matchId, selection.choix, mise)
    setOccupe(false)
    await rafraichirJoueur()
    if (r.ok) {
      setSelection(null)
      setMessage('Pari enregistré')
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
        ? 'Impossible de réclamer pour le moment.'
        : r.dejaReclame
          ? 'Déjà réclamés aujourd’hui — reviens demain.'
          : `+5 ${JETON.plusieurs} · solde ${r.solde}`,
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
    <div className={cn('container max-w-2xl mx-auto px-4 sm:px-6 py-8', selection && 'pb-56')}>
      <h1 className="font-display text-4xl sm:text-5xl tracking-tight">Pronostics</h1>
      <p className="mt-2 text-slate-600 text-[15px]">
        Choisis un camp, décide ta mise, la cote fait le reste.
      </p>

      {/* Les règles sont là pour qui les cherche, pas en travers du chemin. */}
      <details className="mt-3 group">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-slate-500 hover:text-accent-gold transition-colors">
          Comment ça marche
        </summary>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Tu reçois 5 {JETON.plusieurs} par jour, à réclamer en te connectant — non réclamés, ils
          sont perdus. Tu en mises au moins {MISE_MINIMUM} sur un résultat, à la cote réelle du
          match : plus le favori est net, moins ça rapporte. Tes gains sont des {POINT.plusieurs},
          et {PALIER.points.toLocaleString('fr-FR')} {POINT.plusieurs} débloquent{' '}
          {PALIER.recompense}. Rien à déposer, aucun bookmaker. Tous les matchs pour lesquels une
          cote existe sont jouables — championnats, coupes et sélections, les plus grandes
          compétitions en tête.
        </p>
      </details>

      {/* Le portefeuille, lisible d'un coup d'œil */}
      {user ? (
        <div className="mt-5 glass rounded-2xl px-4 py-3.5">
          <div className="flex items-center gap-5">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {JETON.plusieurs}
              </div>
              <div className="font-display text-2xl leading-none tabular-nums">{solde}</div>
            </div>
            <div className="w-px self-stretch bg-slate-200" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {POINT.plusieurs}
              </div>
              <div className="font-display text-2xl leading-none tabular-nums text-accent-gold">
                {Number(pf?.pressings ?? 0).toLocaleString('fr-FR')}
              </div>
            </div>
            <div className="ms-auto">
              {aReclamer ? (
                <button
                  type="button"
                  onClick={() => void onReclamer()}
                  className="px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  +5 gratuits
                </button>
              ) : (
                <span className="font-mono text-[11px] text-slate-500">réclamés ✓</span>
              )}
            </div>
          </div>
          <div className="mt-3">
            <div className="h-1 rounded-full bg-slate-50 overflow-hidden">
              <div className="h-full bg-accent-gold transition-all" style={{ width: `${progression}%` }} />
            </div>
            <div className="mt-1 font-mono text-[10px] text-slate-500 tabular-nums">
              {PALIER.points.toLocaleString('fr-FR')} {POINT.plusieurs} → {PALIER.recompense}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setModale(true)}
          className="mt-5 w-full glass glass-hover rounded-2xl px-4 py-3.5 text-start"
        >
          <span className="font-semibold">Connecte-toi</span>
          <span className="text-slate-600"> pour recevoir 5 {JETON.plusieurs} gratuits chaque jour.</span>
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
            {libelleJour(d, i)}
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
            Tout · {totalJouables}
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
              {c.label} · {c.events.length}
            </button>
          ))}
        </div>
      )}

      {erreurChargement && (
        <p className="mt-10 text-center text-sm text-slate-500">
          Les matchs ne répondent pas. Réessaie dans un instant.
        </p>
      )}
      {!comps && !erreurChargement && (
        <p className="mt-10 text-center text-sm text-slate-500">Chargement…</p>
      )}
      {comps && jouables.length === 0 && (
        <p className="mt-10 text-center text-sm text-slate-500">
          Rien à parier ce jour-là — aucune cote publiée. Essaie un autre jour : le week-end
          en concentre le plus.
        </p>
      )}

      {affichees.map((c) => (
        <section key={c.slug} className="mt-7">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-accent-gold/80 whitespace-nowrap">
              {c.label}
            </h2>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <ul className="mt-3 grid gap-2.5">
            {c.events.map((ev) => (
              <CarteMatch
                key={ev.id}
                ev={ev}
                cote={cotes.get(idDePronostic(ev))!}
                pari={paris.get(idDePronostic(ev))}
                selection={selection}
                onChoisir={onChoisir}
              />
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-12 text-sm text-slate-600">
        Règle le débat avec tes potes dans une{' '}
        <Link to="/leagues" className="text-accent-gold hover:underline">
          ligue privée
        </Link>
        , ou vois où tu en es au{' '}
        <Link to="/board" className="text-accent-gold hover:underline">
          classement
        </Link>
        . Le tableau du Mondial 2026 reste consultable sur la{' '}
        <Link to="/bracket" className="text-accent-gold hover:underline">
          page bracket
        </Link>
        .
      </p>

      {selection && (
        <Bulletin
          selection={selection}
          solde={solde}
          occupe={occupe}
          erreur={erreurPari}
          onMiser={(m) => void onMiser(m)}
          onFermer={() => { setSelection(null); setErreurPari(null) }}
        />
      )}

      <AuthModal open={modale} onClose={() => { setModale(false); void rafraichirJoueur() }} />
    </div>
  )
}
