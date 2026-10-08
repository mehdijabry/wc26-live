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
  nombreDe,
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
 * Le jeu ne demande plus un score exact noté par un bareme fixe : on choisit
 * un camp, on decide combien on engage, et la cote du match fixe le gain. Un
 * favori rapporte peu, une surprise rapporte gros.
 *
 * Seuls les matchs pour lesquels le SERVEUR a publie une cote sont pariables
 * — les cinq grands championnats et les selections nationales. La liste n'est
 * pas ecrite ici : elle decoule de `match_odds`, que le worker alimente. Une
 * page qui proposerait un match non pariable mentirait au joueur ; ici, pas
 * de cote, pas de bouton.
 */

/** Meme convention que le worker : surtout ne pas diverger. */
export function idDePronostic(ev: EspnEvent): string {
  return `e${ev.id}`
}

const JOURS = 7

function libelleJour(d: Date, i: number): string {
  if (i === 0) return "Aujourd'hui"
  if (i === 1) return 'Demain'
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
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

function Match({
  ev,
  cote,
  pari,
  solde,
  onParier,
}: {
  ev: EspnEvent
  cote: Cote
  pari: Pari | undefined
  solde: number
  onParier: (matchId: string, choix: Choix, mise: number) => Promise<string | null>
}) {
  const [choix, setChoix] = useState<Choix | null>(null)
  const [mise, setMise] = useState(MISE_MINIMUM)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const c = camps(ev)
  if (!c) return null

  const e = etat(ev)
  const verrouille = e !== 'avant' || !!pari
  const valeur = (ch: Choix) => (ch === 'home' ? cote.home : ch === 'draw' ? cote.draw : cote.away)

  const envoyer = async () => {
    if (!choix) return
    setOccupe(true)
    const r = await onParier(idDePronostic(ev), choix, mise)
    setOccupe(false)
    setErreur(r)
    if (!r) setChoix(null)
  }

  return (
    <li className="py-4 border-b border-slate-200/60 last:border-0">
      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-xs font-mono text-slate-400 tabular-nums">
          {e === 'direct' ? <span className="text-red-500 font-semibold">LIVE</span> : heure(ev)}
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {c.dom.logo && <img src={c.dom.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
          <span className="truncate text-sm">{c.dom.nom}</span>
        </div>
        <span className="shrink-0 text-xs font-mono text-slate-400 tabular-nums">
          {e === 'avant' ? 'vs' : `${c.dom.score ?? '-'}-${c.ext.score ?? '-'}`}
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-2 justify-end text-end">
          <span className="truncate text-sm">{c.ext.nom}</span>
          {c.ext.logo && <img src={c.ext.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
        </div>
      </div>

      <div className="mt-3 ps-12 flex flex-wrap items-center gap-2">
        {(['home', 'draw', 'away'] as Choix[]).map((ch) => {
          const choisi = pari ? pari.pick === ch : choix === ch
          return (
            <button
              key={ch}
              type="button"
              disabled={verrouille}
              onClick={() => { setChoix(ch); setErreur(null) }}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-mono tabular-nums transition-colors',
                choisi ? 'bg-accent-gold text-ink-900 font-semibold' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                verrouille && !choisi && 'opacity-40',
              )}
            >
              {LIBELLE[ch]} {valeur(ch).toFixed(2)}
            </button>
          )
        })}

        {pari ? (
          <span className="text-xs font-mono ms-1">
            {pari.status === 'open' && (
              <span className="text-slate-500">
                {nombreDe(pari.stake, JETON)} engages · gain possible{' '}
                {Math.round(pari.stake * pari.odds).toLocaleString('fr-FR')}
              </span>
            )}
            {pari.status === 'won' && (
              <span className="px-2 py-0.5 rounded-full bg-accent-gold/20 text-accent-gold font-semibold">
                +{(pari.payout ?? 0).toLocaleString('fr-FR')} {POINT.plusieurs}
              </span>
            )}
            {pari.status === 'lost' && <span className="text-slate-400">perdu</span>}
          </span>
        ) : (
          e === 'avant' && (
            <>
              <span className="ms-1 flex items-center gap-1">
                <button
                  type="button"
                  aria-label="miser moins"
                  onClick={() => setMise((m) => Math.max(MISE_MINIMUM, m - 1))}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm leading-none"
                >
                  -
                </button>
                <span className="w-7 text-center font-mono tabular-nums text-sm font-semibold">{mise}</span>
                <button
                  type="button"
                  aria-label="miser plus"
                  onClick={() => setMise((m) => Math.min(Math.max(MISE_MINIMUM, solde), m + 1))}
                  className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm leading-none"
                >
                  +
                </button>
              </span>
              <button
                type="button"
                disabled={!choix || occupe || solde < mise}
                onClick={() => void envoyer()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white disabled:opacity-30"
              >
                {choix ? `Miser ${mise} · gain ${Math.round(mise * valeur(choix)).toLocaleString('fr-FR')}` : 'Miser'}
              </button>
            </>
          )
        )}
        {erreur && <span className="text-xs text-red-500">{erreur}</span>}
      </div>
    </li>
  )
}

export function PredictWeek() {
  const [jour, setJour] = useState(0)
  const [comps, setComps] = useState<DailyComp[] | null>(null)
  const [erreur, setErreur] = useState(false)
  const [cotes, setCotes] = useState<Map<string, Cote>>(new Map())
  const [paris, setParis] = useState<Map<string, Pari>>(new Map())
  const [pf, setPf] = useState<Portefeuille | null>(null)
  const [modale, setModale] = useState(false)
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
          description: `Back the winner across the five big leagues and the national teams, at real odds. Free ${JETON.plusieurs} every day, nothing to deposit, no bookmaker. Climb the table.`,
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

  // Les cotes ne dependent pas du jour affiche : une seule lecture.
  //
  // Elles servent aussi a CHOISIR le jour d'ouverture. Sans ca la page
  // s'ouvre sur aujourd'hui, et un jour creux — une treve internationale,
  // un lundi — l'affiche vide alors qu'il y a des matchs a parier demain.
  // Les coups d'envoi etant deja dans `match_odds`, le bon jour se deduit
  // sans la moindre requete supplementaire.
  const [jourChoisi, setJourChoisi] = useState(false)
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
    // `jourChoisi` garde le saut a la premiere lecture : si le visiteur
    // choisit ensuite un jour vide, on respecte son choix.
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
    setErreur(false)
    api
      .today(ymdLocal(dates[jour]!))
      .then((d) => {
        if (vivant) setComps(d.competitions ?? [])
      })
      .catch(() => {
        if (vivant) setErreur(true)
      })
    return () => {
      vivant = false
    }
  }, [jour, dates])

  const onParier = async (matchId: string, choix: Choix, mise: number): Promise<string | null> => {
    if (!user) {
      setModale(true)
      return null
    }
    const r = await parier(user.id, matchId, choix, mise)
    await rafraichirJoueur()
    return r.ok ? null : r.raison
  }

  const onReclamer = async () => {
    const r = await reclamerDuJour()
    await rafraichirJoueur()
    setMessage(
      !r
        ? 'Impossible de reclamer pour le moment.'
        : r.dejaReclame
          ? 'Deja reclames aujourd&rsquo;hui - reviens demain.'
          : `+5 ${JETON.plusieurs} · solde ${r.solde}`,
    )
    setTimeout(() => setMessage(null), 4000)
  }

  // Seuls les matchs dont le serveur a publie une cote sont pariables.
  const jouables = useMemo(() => {
    if (!comps) return []
    return comps
      .map((c) => ({ ...c, events: c.events.filter((ev) => cotes.has(idDePronostic(ev))) }))
      .filter((c) => c.events.length > 0)
  }, [comps, cotes])

  const solde = pf?.crampons ?? 0
  const aReclamer = reclamableAujourdhui(pf)
  const progression = pf ? Math.min(100, (Number(pf.pressings) / PALIER.points) * 100) : 0

  return (
    <div className="container max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Predictions</h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        Back a result at the real odds. You stake {JETON.plusieurs}, you win {POINT.plusieurs} - the
        shorter the favourite, the less it pays. Five big leagues and the national teams. Nothing to
        deposit, no bookmaker, minimum stake {MISE_MINIMUM}.
      </p>

      {/* Le portefeuille en haut, toujours visible : un score qu'il faut
          aller chercher dans un menu n'existe pas pour le joueur. */}
      {user ? (
        <div className="mt-6 rounded-xl border px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400">{JETON.plusieurs}</div>
            <div className="text-2xl font-bold tabular-nums">{solde}</div>
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400">{POINT.plusieurs}</div>
            <div className="text-2xl font-bold tabular-nums text-accent-gold">
              {Number(pf?.pressings ?? 0).toLocaleString('fr-FR')}
            </div>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <div className="text-xs font-mono text-slate-400">
              {PALIER.points.toLocaleString('fr-FR')} {POINT.plusieurs} &rarr; {PALIER.recompense}
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-accent-gold" style={{ width: `${progression}%` }} />
            </div>
          </div>
          {aReclamer ? (
            <button
              type="button"
              onClick={() => void onReclamer()}
              className="px-4 py-2 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm"
            >
              Claim your 5 {JETON.plusieurs}
            </button>
          ) : (
            <span className="text-xs font-mono text-slate-400">Claimed today</span>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm rounded-lg border border-accent-gold/40 bg-accent-gold/10 px-4 py-3">
          <strong>Sign in</strong> to claim 5 free {JETON.plusieurs} every day and start backing your
          calls. Unclaimed {JETON.plusieurs} are lost - they do not stack up.
        </p>
      )}
      {message && <p className="mt-2 text-sm text-accent-gold">{message}</p>}

      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {dates.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setJour(i)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap transition-colors',
              i === jour ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {libelleJour(d, i)}
          </button>
        ))}
      </div>

      {erreur && <p className="mt-8 text-sm text-slate-500">Fixtures are unavailable right now. Try again in a moment.</p>}
      {!comps && !erreur && <p className="mt-8 text-sm text-slate-400">Loading fixtures&hellip;</p>}
      {comps && jouables.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">
          Nothing to back that day. Only the five big leagues and the national teams are playable,
          and national sides only play during international windows.
        </p>
      )}

      {jouables.map((c) => (
        <section key={c.slug} className="mt-8">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">{c.label}</h2>
          <ul className="mt-2">
            {c.events.map((ev) => (
              <Match
                key={ev.id}
                ev={ev}
                cote={cotes.get(idDePronostic(ev))!}
                pari={paris.get(idDePronostic(ev))}
                solde={solde}
                onParier={onParier}
              />
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-12 text-sm text-muted-foreground">
        Settle it with your mates in a{' '}
        <Link to="/leagues" className="underline">
          private league
        </Link>
        , or see where you stand on{' '}
        <Link to="/board" className="underline">
          the table
        </Link>
        . The World Cup 2026 bracket is kept as an archive on the{' '}
        <Link to="/bracket" className="underline">
          bracket page
        </Link>
        .
      </p>

      <AuthModal open={modale} onClose={() => { setModale(false); void rafraichirJoueur() }} />
    </div>
  )
}
