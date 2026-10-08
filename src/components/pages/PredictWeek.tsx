import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ymdLocal, type DailyComp, type EspnEvent } from '../../lib/api'
import { usePredictions } from '../../store/predictions'
import { useAuth } from '../../store/auth'
import { usePageHead, useJsonLd } from '../../lib/head'
import { teamBadgeFallback, cn } from '../../lib/utils'

/**
 * /predictions — pronostiquer le calendrier de la semaine.
 *
 * Remplace le prédicteur de bracket du Mondial, qui invitait encore à
 * « revenir au fil du tournoi » trois mois après sa finale. Le principe est
 * le même, l'objet change : au lieu d'un tournoi tous les quatre ans, les
 * matchs des sept prochains jours, toutes compétitions confondues.
 *
 * Rien de neuf côté points : `match_id` vaut `e<id ESPN>`, le worker pousse
 * les scores finaux dans `match_results`, et le déclencheur SQL existant
 * calcule tout — score exact 100, bon vainqueur et bon écart 60, bon
 * vainqueur 30, bon total de buts 20. Voir supabase/migrations/001_init.sql.
 */

/** Même convention que la passe du worker : surtout ne pas diverger. */
export function idDePronostic(ev: EspnEvent): string {
  return `e${ev.id}`
}

const JOURS = 7

function libelleJour(d: Date, i: number): string {
  if (i === 0) return "Aujourd'hui"
  if (i === 1) return 'Demain'
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

type Camp = { nom: string; abbr: string; logo?: string; score?: string }

function camps(ev: EspnEvent): { dom: Camp; ext: Camp } | null {
  const c = ev.competitions?.[0]?.competitors ?? []
  const d = c.find((x) => x.homeAway === 'home')
  const e = c.find((x) => x.homeAway === 'away')
  if (!d?.team || !e?.team) return null
  const vers = (x: typeof d): Camp => ({
    nom: x!.team!.shortDisplayName ?? x!.team!.displayName ?? x!.team!.abbreviation ?? '?',
    abbr: x!.team!.abbreviation ?? '',
    logo: x!.team!.logo ?? teamBadgeFallback(x!.team!.logo, x!.team!.abbreviation, x!.team!.displayName),
    score: x!.score,
  })
  return { dom: vers(d), ext: vers(e) }
}

/** Les trois états qui changent l'affichage d'une rangée. */
function etat(ev: EspnEvent): 'avant' | 'direct' | 'fini' {
  const s = ev.status?.type?.state ?? ev.competitions?.[0]?.status?.type?.state
  if (s === 'post') return 'fini'
  if (s === 'in') return 'direct'
  return 'avant'
}

function heure(ev: EspnEvent): string {
  if (!ev.date) return ''
  return new Date(ev.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Le même barème que `compute_points` en base — affiché, jamais recalculé. */
function pointsObtenus(
  pick: { homeScore: number; awayScore: number } | undefined,
  ev: EspnEvent,
): { pts: number; libelle: string } | null {
  if (!pick || etat(ev) !== 'fini') return null
  const c = camps(ev)
  if (!c) return null
  const rd = Number(c.dom.score ?? NaN)
  const re = Number(c.ext.score ?? NaN)
  if (Number.isNaN(rd) || Number.isNaN(re)) return null

  const sgn = (a: number, b: number) => (a > b ? 1 : a < b ? -1 : 0)
  if (pick.homeScore === rd && pick.awayScore === re) return { pts: 100, libelle: 'score exact' }
  if (sgn(pick.homeScore, pick.awayScore) === sgn(rd, re) && sgn(rd, re) !== 0 && pick.homeScore - pick.awayScore === rd - re)
    return { pts: 60, libelle: 'vainqueur + écart' }
  if (sgn(pick.homeScore, pick.awayScore) === sgn(rd, re)) return { pts: 30, libelle: 'bon vainqueur' }
  if (pick.homeScore + pick.awayScore === rd + re) return { pts: 20, libelle: 'bon total' }
  return { pts: 0, libelle: 'raté' }
}

function Compteur({
  valeur,
  onChange,
  verrouille,
}: {
  valeur: number | null
  onChange: (n: number) => void
  verrouille: boolean
}) {
  if (verrouille) {
    return <span className="w-10 text-center font-mono tabular-nums text-slate-500">{valeur ?? '–'}</span>
  }
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="moins"
        onClick={() => onChange(Math.max(0, (valeur ?? 0) - 1))}
        className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm leading-none transition-colors"
      >
        −
      </button>
      <span className="w-6 text-center font-mono tabular-nums font-semibold">{valeur ?? '–'}</span>
      <button
        type="button"
        aria-label="plus"
        onClick={() => onChange(Math.min(20, (valeur ?? -1) + 1))}
        className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm leading-none transition-colors"
      >
        +
      </button>
    </div>
  )
}

function Rangee({ ev }: { ev: EspnEvent }) {
  const picks = usePredictions((s) => s.picks)
  const setPick = usePredictions((s) => s.setPick)
  const c = camps(ev)
  if (!c) return null

  const id = idDePronostic(ev)
  const pick = picks[id]
  const e = etat(ev)
  const verrouille = e !== 'avant'
  const gain = pointsObtenus(pick, ev)

  const poser = (dom: number, ext: number) => {
    void setPick({ matchId: id, homeScore: dom, awayScore: ext, ts: Date.now() })
  }

  return (
    <li className="flex items-center gap-3 py-3 border-b border-slate-200/60 last:border-0">
      <span className="w-12 shrink-0 text-xs font-mono text-slate-400 tabular-nums">
        {e === 'direct' ? <span className="text-red-500 font-semibold">LIVE</span> : heure(ev)}
      </span>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {c.dom.logo && <img src={c.dom.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
        <span className="truncate text-sm">{c.dom.nom}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Compteur valeur={pick?.homeScore ?? null} verrouille={verrouille} onChange={(n) => poser(n, pick?.awayScore ?? 0)} />
        <span className="text-slate-300">–</span>
        <Compteur valeur={pick?.awayScore ?? null} verrouille={verrouille} onChange={(n) => poser(pick?.homeScore ?? 0, n)} />
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2 justify-end text-end">
        <span className="truncate text-sm">{c.ext.nom}</span>
        {c.ext.logo && <img src={c.ext.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
      </div>

      <span className="w-24 shrink-0 text-end text-xs font-mono">
        {verrouille && (
          <span className="text-slate-500 tabular-nums">
            {c.dom.score ?? '–'}–{c.ext.score ?? '–'}
          </span>
        )}
        {gain && (
          <span
            className={cn(
              'ms-2 px-1.5 py-0.5 rounded-full',
              gain.pts >= 60
                ? 'bg-accent-gold/20 text-accent-gold'
                : gain.pts > 0
                  ? 'bg-slate-100 text-slate-600'
                  : 'text-slate-400',
            )}
            title={gain.libelle}
          >
            +{gain.pts}
          </span>
        )}
      </span>
    </li>
  )
}

export function PredictWeek() {
  const [jour, setJour] = useState(0)
  const [comps, setComps] = useState<DailyComp[] | null>(null)
  const [erreur, setErreur] = useState(false)
  const user = useAuth((s) => s.user)
  const picks = usePredictions((s) => s.picks)

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
          titre: 'Football predictions — pick this week fixtures and climb the table',
          description:
            'Predict scores for every match of the week, across every major competition. Free, no stake, no bookmaker — exact score 100 points, right winner 30. Sign in to keep your streak.',
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

  // Le nombre de pronostics posés sur le jour affiché — un repère de
  // progression, pas un score.
  const posesCeJour = useMemo(() => {
    if (!comps) return 0
    let n = 0
    for (const c of comps) for (const ev of c.events) if (picks[idDePronostic(ev)]) n++
    return n
  }, [comps, picks])

  const totalCeJour = comps?.reduce((a, c) => a + c.events.length, 0) ?? 0

  return (
    <div className="container max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Predictions</h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        Pick a score on any match of the week. No stake, no bookmaker, nothing to deposit — just
        your call against everyone else&apos;s. Exact score 100 points, right winner and right goal
        difference 60, right winner 30, right total goals 20.
      </p>

      {!user && (
        <p className="mt-4 text-sm rounded-lg border border-accent-gold/40 bg-accent-gold/10 px-4 py-3">
          Your picks are saved on this device. <strong>Sign in</strong> to keep them, score points
          and appear in the <Link to="/board" className="underline">table</Link>.
        </p>
      )}

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

      {comps && totalCeJour > 0 && (
        <p className="mt-3 text-xs font-mono text-slate-400 tabular-nums">
          {posesCeJour}/{totalCeJour} picked
        </p>
      )}

      {erreur && <p className="mt-8 text-sm text-slate-500">Fixtures are unavailable right now. Try again in a moment.</p>}
      {!comps && !erreur && <p className="mt-8 text-sm text-slate-400">Loading fixtures…</p>}
      {comps && comps.length === 0 && <p className="mt-8 text-sm text-slate-500">No match that day.</p>}

      {comps?.map((c) => (
        <section key={c.slug} className="mt-8">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">{c.label}</h2>
          <ul className="mt-2">
            {c.events.map((ev) => (
              <Rangee key={ev.id} ev={ev} />
            ))}
          </ul>
        </section>
      ))}

      <p className="mt-12 text-sm text-muted-foreground">
        Looking for the World Cup 2026 bracket? It is kept as an archive on the{' '}
        <Link to="/bracket" className="underline">
          bracket page
        </Link>
        .
      </p>
    </div>
  )
}
