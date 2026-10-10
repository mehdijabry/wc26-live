import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ymdLocal, type DailyComp } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { usePageHead } from '../../lib/head'
import { AuthModal } from '../AuthModal'
import { cn } from '../../lib/utils'
import { trLeague, useLang, useT } from '../../lib/i18n'
import { Icone } from '../Icone'
import BoutonPronostic from '../BoutonPronostic'
import CartePronostic from '../CartePronostic'
import { cotes as chargerCotes, type Cote } from '../../lib/jeu'
import { camps, etat, heure, idDePronostic } from '../../lib/matchEspn'
import {
  pronosticsDisponibles,
  mesPronostics,
  prixDuProchain,
  type Prix,
} from '../../lib/pronostic'

/**
 * L'analyse IA : une section à part, et c'est le sujet.
 *
 * ── POURQUOI UNE PAGE SÉPARÉE ─────────────────────────────────────────────
 * Parier et analyser sont deux outils distincts, même s'ils se complètent.
 * Tant que l'analyse vivait au fond d'une carte de pari, elle ressemblait à
 * un troisième marché à côté de « score exact » et « buteur » — alors qu'on
 * n'y mise rien. Et la page de paris s'appelait elle-même « Pronostics » en
 * français : deux choses portaient le même nom (Mehdi, 2026-10-10).
 *
 * Depuis, la page de paris s'appelle « Paris » et ceci « Analyse IA ».
 * Chacune garde sa page, et chacune renvoie vers l'autre — un lien
 * « analyser ce match » là-bas, un lien « parier » ici.
 *
 * ── CE QU'ELLE N'AFFICHE PAS ──────────────────────────────────────────────
 * Aucune cote cliquable, aucun bulletin. On lit, on ne mise pas. La cote
 * sert uniquement à calculer nos propres chances, qui sont affichées dans
 * la carte — c'est la seule chose que le fournisseur ne sait pas faire
 * cohéremment avec le prix réel.
 */

/** Sept jours : la même fenêtre que les cotes publiées par le worker. */
const JOURS = 7

export default function Analyse() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const user = useAuth((s) => s.user)
  const profil = useAuth((s) => s.profile)

  usePageHead({
    titre: t('AI match analysis'),
    description: t(
      'Probable line-ups, form over ten matches, head-to-head and expected goals — the full read on every covered match.',
    ),
    chemin: '/analyse',
  })

  const dates = useMemo(() => {
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    return Array.from({ length: JOURS }, (_, i) => new Date(base.getTime() + i * 86_400_000))
  }, [])

  const [jour, setJour] = useState(0)
  // LE RÉSULTAT PORTE SON JOUR. Vider l'état avant de recharger imposait un
  // `setState` synchrone dans l'effet, donc un rendu en cascade — et laissait
  // un instant où les matchs de la veille s'affichaient sous l'onglet du
  // lendemain. Ici « en cours de chargement » se DÉDUIT du décalage.
  const [resultat, setResultat] = useState<
    { pour: number; comps: DailyComp[] } | { pour: number; echec: true } | null
  >(null)
  const [cotes, setCotes] = useState<Map<string, Cote>>(new Map())
  const [dispo, setDispo] = useState<Set<string>>(new Set())
  const [authOuvert, setAuthOuvert] = useState(false)
  const [ouvertId, setOuvertId] = useState<string | null>(null)

  useEffect(() => {
    let vivant = true
    void pronosticsDisponibles().then((d) => { if (vivant) setDispo(d) })
    void chargerCotes().then((c) => { if (vivant) setCotes(c) }).catch(() => {})
    return () => { vivant = false }
  }, [])

  useEffect(() => {
    let vivant = true
    api
      .today(ymdLocal(dates[jour]!))
      .then((d) => { if (vivant) setResultat({ pour: jour, comps: d.competitions ?? [] }) })
      .catch(() => { if (vivant) setResultat({ pour: jour, echec: true }) })
    return () => { vivant = false }
  }, [jour, dates])

  const pourCeJour = resultat?.pour === jour ? resultat : null
  const comps = pourCeJour && 'comps' in pourCeJour ? pourCeJour.comps : null
  const echec = !!(pourCeJour && 'echec' in pourCeJour)

  // Ce qui appartient au joueur porte son identifiant : à la déconnexion on
  // cesse de le reconnaître plutôt que de le vider depuis un effet.
  const [duJoueur, setDuJoueur] = useState<{ qui: string; ouverts: Set<string>; prix: Prix | null } | null>(null)
  const [tour, setTour] = useState(0)
  useEffect(() => {
    const qui = user?.id
    if (!qui) return
    let vivant = true
    void Promise.all([mesPronostics().catch(() => new Set<string>()), prixDuProchain().catch(() => null)]).then(
      ([o, x]) => { if (vivant) setDuJoueur({ qui, ouverts: o, prix: x }) },
    )
    return () => { vivant = false }
  }, [user?.id, tour])

  const aJour = user?.id && duJoueur?.qui === user.id ? duJoueur : null
  const ouverts = aJour?.ouverts ?? null
  const prix = aJour?.prix ?? null

  /** Les matchs couverts par le fournisseur, et seulement eux. */
  const couverts = useMemo(() => {
    if (!comps) return []
    return comps
      .map((c) => ({ ...c, events: c.events.filter((ev) => dispo.has(idDePronostic(ev)) && etat(ev) !== 'fini') }))
      .filter((c) => c.events.length > 0)
  }, [comps, dispo])

  const total = couverts.reduce((n, c) => n + c.events.length, 0)

  return (
    <div className="container max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="font-mono text-[11px] uppercase tracking-wider text-accent-gold/80">
        {t('AI analysis')}
      </div>
      <h1 className="font-display text-4xl sm:text-5xl tracking-tight mt-1">
        {t('What the model sees, match by match')}
      </h1>
      <p className="mt-2 text-slate-600 text-[15px] leading-relaxed">
        {t(
          'Probable line-ups, ten-match form, head-to-head and expected goals. Nothing is staked here — to back a result, go to the bets page.',
        )}
      </p>

      {/* Le renvoi vers l'autre outil, dit explicitement. */}
      <Link
        to="/predict"
        className="mt-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-500 hover:text-accent-gold transition-colors"
      >
        <Icone nom="football-club-flag" taille={24} />
        {t('Place a bet instead')} →
      </Link>

      {!user && (
        <div className="mt-6 glass rounded-sm p-6">
          <Icone nom="referee" taille={56} className="mb-3 opacity-90" />
          <p className="text-sm text-slate-700">{t('Sign in to open an analysis.')}</p>
          <button
            onClick={() => setAuthOuvert(true)}
            className="mt-4 px-4 py-2 rounded-sm bg-accent-gold text-paper text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t('Sign in')}
          </button>
        </div>
      )}

      {/* Les jours. Même fenêtre que les cotes : sept. */}
      <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar">
        {dates.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setJour(i); setOuvertId(null) }}
            className={cn(
              'px-3 py-1.5 rounded-lg font-mono text-[11px] whitespace-nowrap border transition-colors',
              i === jour
                ? 'bg-accent-gold text-ink-900 border-accent-gold font-semibold'
                : 'border-slate-200 text-slate-600 hover:border-accent-gold/50',
            )}
          >
            {i === 0
              ? t('Today')
              : i === 1
                ? t('Tomorrow')
                : d.toLocaleDateString(lang === 'ar' ? 'ar' : lang, { weekday: 'short', day: 'numeric' })}
          </button>
        ))}
      </div>

      {user && (
        <p className="mt-3 font-mono text-[11px] text-slate-500">
          {total > 0
            ? avec(t('{n} matches analysed'), total)
            : comps
              ? t('No match covered on that day.')
              : ''}
          {prix && prix.crampons === 0 && total > 0 && (
            <span className="ms-2 text-accent-gold">{t('your first one today is free')}</span>
          )}
        </p>
      )}

      {echec && (
        <p className="mt-8 text-sm text-slate-600">{t('The day could not be loaded.')}</p>
      )}
      {!echec && !comps && <p className="mt-8 text-sm text-slate-500">{t('Loading…')}</p>}

      {!echec && comps && total === 0 && (
        <div className="mt-10 text-center">
          <Icone nom="ground" taille={64} className="mx-auto mb-3 opacity-90" />
          <p className="text-sm text-slate-500">{t('No match covered on that day.')}</p>
        </div>
      )}

      {couverts.map((c) => (
        <section key={c.slug} className="mt-7">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-accent-gold/80 whitespace-nowrap">
              {trLeague(c.label, lang)}
            </h2>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <ul className="mt-3 grid gap-2.5">
            {c.events.map((ev) => {
              const id = idDePronostic(ev)
              const eq = camps(ev)
              if (!eq) return null
              const cote = cotes.get(id)
              return (
                <li key={ev.id} className="glass rounded-2xl p-3">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                    <span>{heure(ev, lang)}</span>
                    {etat(ev) === 'direct' && <span className="text-accent-red">{t('LIVE')}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate text-[15px] font-medium">{eq.dom.nom}</span>
                    <span className="font-mono text-[11px] text-slate-500 shrink-0">vs</span>
                    <span className="flex-1 min-w-0 truncate text-[15px] font-medium text-end">{eq.ext.nom}</span>
                  </div>

                  <div className="mt-2">
                    <BoutonPronostic
                      ouvert={ouvertId === id}
                      dejaDebloque={!!ouverts?.has(id)}
                      offert={prix?.crampons === 0}
                      onBascule={() => setOuvertId(ouvertId === id ? null : id)}
                    />
                  </div>

                  {ouvertId === id && (
                    <>
                      <CartePronostic
                        match={id}
                        domicile={eq.dom.nom}
                        exterieur={eq.ext.nom}
                        cote={cote ? { home: cote.home, draw: cote.draw, away: cote.away } : null}
                        ouvert={!!ouverts?.has(id)}
                        prix={prix}
                        solde={profil ? { crampons: profil.crampons, pressings: Number(profil.pressings), offertes: Number(profil.analyses_offertes ?? 0) } : null}
                        onOuvert={() => {
                          setDuJoueur((d) => (d ? { ...d, ouverts: new Set(d.ouverts).add(id) } : d))
                          setTour((n) => n + 1)
                        }}
                        onFermer={() => setOuvertId(null)}
                      />
                      {/* Le renvoi par match : on vient de lire, on peut jouer. */}
                      {cote && (
                        <Link
                          to={`/predict?match=${encodeURIComponent(id)}`}
                          className="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-accent-gold hover:underline"
                        >
                          {t('Bet on this match')} →
                        </Link>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <AuthModal open={authOuvert} onClose={() => setAuthOuvert(false)} />
    </div>
  )
}

function avec(gabarit: string, n: number): string {
  return gabarit.replace('{n}', String(n))
}
