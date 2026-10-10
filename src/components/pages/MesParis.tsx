import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { usePageHead } from '../../lib/head'
import { AuthModal } from '../AuthModal'
import { cn } from '../../lib/utils'
import { localeOf, useLang, useT } from '../../lib/i18n'
import { Jeton } from '../Jeton'
import {
  buteursDuMatch,
  mesBulletins,
  mesParisSimples,
  type Bulletin,
  type Jambe,
} from '../../lib/jeu'

/**
 * /my-bets — la liste de ses paris.
 *
 * POURQUOI CETTE PAGE EXISTE. Le moteur de bulletins est arrivé sans elle :
 * `mesBulletins()` n'était lu que pour poser un petit repère « déjà joué » sur
 * les cartes de match. Un joueur qui posait un combiné de neuf matchs voyait
 * donc ses crampons partir sans rien pouvoir relire — le pari était bien en
 * base, mais nulle part à l'écran (Mehdi, 2026-10-09). Un pari qu'on ne peut
 * pas relire n'est pas un pari, c'est une perte.
 *
 * CE QUE LA BASE NE STOCKE PAS. `bet_legs` ne garde que l'identifiant du match
 * et le choix brut ('home', '2-1', ou l'identifiant ESPN d'un joueur). Les noms
 * se résolvent donc ici : un appel par match pour les équipes et le score, et
 * la liste des buteurs seulement pour les matchs où l'on a parié sur un
 * buteur. Tout est mis en cache pour la session — un même match revient
 * souvent d'un bulletin à l'autre.
 */

type Fiche = { titre: string; dom: string; ext: string; date?: string; score?: string; fini: boolean }

const cacheMatch = new Map<string, Fiche | null>()
const cacheButeurs = new Map<string, Map<string, string>>()

/**
 * Attention au préfixe : en base un match s'appelle « e401877883 », alors que
 * l'API ESPN veut « 401877883 » et répond `invalid event id` sinon. Sans ce
 * retrait, chaque jambe s'afficherait avec son identifiant brut.
 */
const idEspn = (matchId: string) => matchId.replace(/^e/, '')

async function ficheDuMatch(id: string): Promise<Fiche | null> {
  if (cacheMatch.has(id)) return cacheMatch.get(id) ?? null
  try {
    const j = (await api.match(idEspn(id))) as {
      header?: {
        competitions?: Array<{
          date?: string
          status?: { type?: { completed?: boolean } }
          competitors?: Array<{ homeAway?: string; score?: string; team?: { displayName?: string; shortDisplayName?: string } }>
        }>
      }
    }
    const c = j.header?.competitions?.[0]
    const eq = c?.competitors ?? []
    const dom = eq.find((x) => x.homeAway === 'home')
    const ext = eq.find((x) => x.homeAway === 'away')
    const nom = (x?: typeof dom) => x?.team?.shortDisplayName || x?.team?.displayName || ''
    if (!dom && !ext) {
      cacheMatch.set(id, null)
      return null
    }
    const fini = c?.status?.type?.completed === true
    const f: Fiche = {
      titre: `${nom(dom)} — ${nom(ext)}`,
      dom: nom(dom),
      ext: nom(ext),
      date: c?.date,
      score: fini && dom?.score != null && ext?.score != null ? `${dom.score} – ${ext.score}` : undefined,
      fini,
    }
    cacheMatch.set(id, f)
    return f
  } catch {
    cacheMatch.set(id, null)
    return null
  }
}

async function nomsButeurs(id: string): Promise<Map<string, string>> {
  const dejaLa = cacheButeurs.get(id)
  if (dejaLa) return dejaLa
  const m = new Map<string, string>()
  try {
    for (const b of await buteursDuMatch(id)) m.set(b.id, b.nom)
  } catch {
    /* la liste des buteurs n'est pas indispensable : on retombe sur l'identifiant */
  }
  cacheButeurs.set(id, m)
  return m
}

export default function MesParis() {
  const { user } = useAuth()
  const t = useT()
  const { lang } = useLang()
  const [bulletins, setBulletins] = useState<Bulletin[] | null>(null)
  const [erreur, setErreur] = useState(false)
  const [fiches, setFiches] = useState<Map<string, Fiche>>(new Map())
  const [buteurs, setButeurs] = useState<Map<string, Map<string, string>>>(new Map())
  const [authOuvert, setAuthOuvert] = useState(false)

  usePageHead({
    titre: 'My bets — Pressing 90′',
    brut: true,
    description: 'Every slip you have placed: selections, odds, stake and outcome.',
    chemin: '/my-bets',
    horsIndex: true,
  })

  // Tout se charge ici, et pas dans un effet qui réagirait à `bulletins` :
  // la liste d'abord, puis les noms qui la rendent lisible. L'écran affiche la
  // liste dès qu'elle arrive, les noms se posent dessus ensuite.
  const charger = useCallback(async () => {
    if (!user) {
      setBulletins(null)
      return
    }
    setErreur(false)
    setBulletins(null)
    // Les deux historiques, fusionnés et remis dans l'ordre : les bulletins du
    // moteur actuel, et les paris simples de l'ancien système, qui sont encore
    // réglés et peuvent donc encore créditer des pressings.
    let b: Bulletin[]
    try {
      const [bulletins, simples] = await Promise.all([
        mesBulletins(),
        mesParisSimples().catch(() => [] as Bulletin[]),
      ])
      b = [...bulletins, ...simples].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))
    } catch {
      setErreur(true)
      return
    }
    setBulletins(b)
    if (!b.length) return

    const ids = [...new Set(b.flatMap((x) => (x.legs ?? []).map((j) => j.match_id)))]
    const resultats = await Promise.all(ids.map(async (id) => [id, await ficheDuMatch(id)] as const))
    const m = new Map<string, Fiche>()
    for (const [id, f] of resultats) if (f) m.set(id, f)
    setFiches(m)

    // Les buteurs seulement là où l'on en a choisi un : c'est une requête de plus par match.
    const avecButeur = [...new Set(
      b.flatMap((x) => (x.legs ?? []).filter((j) => j.market === 'scorer').map((j) => j.match_id)),
    )]
    if (!avecButeur.length) return
    const noms = await Promise.all(avecButeur.map(async (id) => [id, await nomsButeurs(id)] as const))
    setButeurs(new Map(noms))
  }, [user])

  useEffect(() => {
    void charger()
  }, [charger])

  const libelle = useCallback(
    (j: Jambe) => {
      const f = fiches.get(j.match_id)
      if (j.market === 'exact') return j.pick
      if (j.market === 'scorer') return buteurs.get(j.match_id)?.get(j.pick) ?? t('Goalscorer')
      if (j.pick === 'draw') return t('Draw')
      if (j.pick === 'home') return f?.dom || t('Home')
      return f?.ext || t('Away')
    },
    [fiches, buteurs, t],
  )

  const nomDuMarche = useCallback(
    (m: Jambe['market']) => (m === 'exact' ? t('Exact score') : m === 'scorer' ? t('Goalscorer') : t('Winner')),
    [t],
  )

  const compte = useMemo(() => {
    const b = bulletins ?? []
    return {
      ouverts: b.filter((x) => x.status === 'open').length,
      gagnes: b.filter((x) => x.status === 'won').length,
      perdus: b.filter((x) => x.status === 'lost').length,
    }
  }, [bulletins])

  const dateCourte = (iso: string) =>
    new Date(iso).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <p className="text-[11px] uppercase tracking-[0.2em] text-accent-gold font-mono">{t('My bets')}</p>
      <h1 className="font-display text-4xl sm:text-5xl text-slate-900 mt-1">{t('Every slip you have placed')}</h1>

      {!user && (
        <div className="mt-8 glass rounded-sm p-6">
          <p className="text-sm text-slate-700">{t('Sign in to see your bets.')}</p>
          <button
            onClick={() => setAuthOuvert(true)}
            className="mt-4 px-4 py-2 rounded-sm bg-accent-gold text-paper text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t('Sign in')}
          </button>
        </div>
      )}

      {user && erreur && (
        <div className="mt-8 glass rounded-sm p-6 border-accent-red/40">
          <p className="text-sm text-slate-800">{t('Your bets could not be loaded. They are safe — this is a display problem.')}</p>
          <button
            onClick={() => void charger()}
            className="mt-4 px-4 py-2 rounded-sm border border-slate-300 text-sm text-slate-800 hover:bg-slate-100 transition-colors"
          >
            {t('Try again')}
          </button>
        </div>
      )}

      {user && !erreur && bulletins === null && (
        <div className="mt-8 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="glass rounded-sm p-5 animate-pulse">
              <div className="h-3 w-28 bg-slate-200 rounded-sm" />
              <div className="h-3 w-52 bg-slate-200 rounded-sm mt-3" />
            </div>
          ))}
        </div>
      )}

      {user && !erreur && bulletins?.length === 0 && (
        <div className="mt-8 glass rounded-sm p-6">
          <p className="text-sm text-slate-700">{t('You have not placed a bet yet.')}</p>
          <Link
            to="/predictions"
            className="inline-block mt-4 px-4 py-2 rounded-sm bg-accent-gold text-paper text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t('Place your first bet')}
          </Link>
        </div>
      )}

      {user && !erreur && !!bulletins?.length && (
        <>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono text-slate-600">
            <span>{compte.ouverts} {t('open')}</span>
            <span className="text-accent-green">{compte.gagnes} {t('won')}</span>
            <span className="text-accent-red">{compte.perdus} {t('lost')}</span>
          </div>

          <div className="mt-4 space-y-4">
            {bulletins.map((b) => {
              const jambes = b.legs ?? []
              const gainPossible = Math.round(b.stake * b.odds)
              return (
                <article key={b.id} className="glass rounded-sm overflow-hidden">
                  <header className="px-5 py-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-slate-200">
                    <div>
                      <h2 className="font-display text-xl text-slate-900">
                        {jambes.length > 1 ? `${t('Accumulator')} · ${jambes.length} ${t('selections')}` : t('Single')}
                      </h2>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {dateCourte(b.created_at)} · #{b.id}
                      </p>
                    </div>
                    <Etat statut={b.status} t={t} />
                  </header>

                  <ul className="divide-y divide-slate-200">
                    {jambes.map((j, i) => {
                      const f = fiches.get(j.match_id)
                      return (
                        <li key={`${j.match_id}-${j.market}-${i}`} className="px-5 py-3 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm text-slate-800 truncate">
                              {f?.titre ?? <span className="font-mono text-slate-500">{j.match_id}</span>}
                              {f?.score && <span className="ml-2 font-mono text-slate-500">{f.score}</span>}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {nomDuMarche(j.market)} · <span className="text-slate-700">{libelle(j)}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-sm text-slate-700 tabular-nums">{j.odds.toFixed(2)}</span>
                            <Pastille statut={j.status} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>

                  <footer className="px-5 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-slate-200 bg-slate-100/40">
                    <div className="flex items-center gap-1.5 text-sm text-slate-700">
                      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">{t('Stake')}</span>
                      <Jeton type="crampon" taille={14} />
                      <span className="font-mono tabular-nums">{b.stake}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-700">
                      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">{t('Odds')}</span>
                      <span className="font-mono tabular-nums text-accent-gold">{b.odds.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">
                        {b.status === 'won' ? t('Paid') : t('To win')}
                      </span>
                      <Jeton type="pressing" taille={14} />
                      <span
                        className={cn(
                          'font-mono tabular-nums',
                          b.status === 'won' ? 'text-accent-green' : b.status === 'lost' ? 'text-slate-500 line-through' : 'text-slate-800',
                        )}
                      >
                        {b.status === 'won' ? (b.payout ?? gainPossible) : gainPossible}
                      </span>
                      {/* La perte de palier, dite explicitement : sans elle, le
                          joueur voit son solde baisser sans savoir pourquoi. */}
                      {b.status === 'lost' && !!b.penalty && (
                        <span className="font-mono tabular-nums text-accent-red">−{b.penalty}</span>
                      )}
                    </div>
                  </footer>
                </article>
              )
            })}
          </div>
        </>
      )}

      <AuthModal open={authOuvert} onClose={() => setAuthOuvert(false)} />
    </div>
  )
}

function Etat({ statut, t }: { statut: Bulletin['status']; t: (s: string) => string }) {
  const style =
    statut === 'won'
      ? 'bg-accent-green/15 text-accent-green'
      : statut === 'lost'
        ? 'bg-accent-red/15 text-accent-red'
        : statut === 'void'
          ? 'bg-slate-200 text-slate-600'
          : 'bg-accent-gold/15 text-accent-gold'
  const mot = statut === 'won' ? t('Won') : statut === 'lost' ? t('Lost') : statut === 'void' ? t('Void') : t('Open')
  return <span className={cn('px-2.5 py-1 rounded-sm text-[11px] font-mono uppercase tracking-wider', style)}>{mot}</span>
}

/** L'état d'une jambe, en un point : il faut pouvoir lire d'un coup d'œil laquelle a fait tomber le combiné. */
function Pastille({ statut }: { statut: Jambe['status'] }) {
  const couleur =
    statut === 'won' ? 'bg-accent-green' : statut === 'lost' ? 'bg-accent-red' : statut === 'void' ? 'bg-slate-400' : 'bg-slate-300'
  return <span className={cn('block w-2 h-2 rounded-full shrink-0', couleur)} aria-hidden />
}
