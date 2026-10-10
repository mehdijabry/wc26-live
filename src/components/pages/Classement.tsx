import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { usePageHead, useJsonLd } from '../../lib/head'
import { AuthModal } from '../AuthModal'
import { Icone } from '../Icone'
import { Jeton } from '../Jeton'
import Distinctions from '../Distinctions'
import PrixHebdomadaires from '../PrixHebdomadaires'
import { Leaderboard } from '../Leaderboard'
import { SectionHeader } from '../Groups'
import { cn } from '../../lib/utils'
import { JETON, POINT } from '../../lib/jeu'
import { localeOf, useLang, useT } from '../../lib/i18n'
import {
  bonusDuJour,
  classementDeLigue,
  creerLigue,
  etatDuGroupe,
  maSaison,
  mesDistinctions,
  mesLigues,
  mesPrix,
  reclamerBonus,
  reclamerPrix,
  type Distinctions as Compte,
  type EtatDuGroupe,
  type Ligue,
  type Prix,
  type Saison,
} from '../../lib/leagues'

/**
 * /board — LA section du jeu social.
 *
 * ── CE QUI N'ALLAIT PAS ───────────────────────────────────────────────────
 * Les trois morceaux existaient — le classement général, les groupes, les
 * prix — mais éparpillés sur trois adresses dont deux n'étaient atteignables
 * que par une phrase en bas de la page des paris, sous cent quatre-vingt-dix
 * matchs. « Je ne vois pas où je peux créer un groupe, aucun bouton, aucune
 * section leaderboard » (Mehdi, 2026-10-10). Poser deux liens de plus dans
 * le menu n'aurait rien réglé : il manquait une destination.
 *
 * ── L'ORDRE DE LECTURE, DU PLUS PERSONNEL AU PLUS GÉNÉRAL ─────────────────
 * 1. Ma saison      — mon rang, mes points, mes distinctions, ma semaine.
 * 2. Mes groupes    — où j'en suis chez mes amis, et ce qu'il reste à
 *                     débloquer. La création est le premier élément de la
 *                     liste, jamais un lien ailleurs.
 * 3. Mes prix       — ce que j'ai à encaisser, un seul par semaine.
 * 4. Le général     — tout le monde, pour situer.
 *
 * Un joueur sans compte voit 1 et 2 sous forme d'invitation, et le général
 * en entier : la page n'est jamais vide, et elle reste indexable.
 *
 * ── LES GROUPES RESTENT PRIVÉS ────────────────────────────────────────────
 * Cette page ne liste que MES groupes, par une lecture authentifiée. Rien de
 * ce qui est prérendu ne contient de nom de groupe.
 */
export function Classement() {
  const user = useAuth((s) => s.user)
  const initialized = useAuth((s) => s.initialized)
  const navigate = useNavigate()
  const t = useT()
  const lang = useLang((s) => s.lang)

  const [saison, setSaison] = useState<Saison | null>(null)
  const [compte, setCompte] = useState<Compte | null>(null)
  const [ligues, setLigues] = useState<Ligue[] | null>(null)
  const [etats, setEtats] = useState<Record<string, EtatDuGroupe>>({})
  const [rangs, setRangs] = useState<Record<string, { rang: number; sur: number; points: number }>>({})
  const [prix, setPrix] = useState<Prix[]>([])
  const [bonus, setBonus] = useState<{ groupe: string; crampons: number } | null>(null)

  const [nom, setNom] = useState('')
  const [ouvrirCreation, setOuvrirCreation] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [modale, setModale] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  usePageHead({
    titre: 'Football prediction leaderboard — who calls it best',
    description:
      'The best callers on Pressing 90, ranked on points won across every competition. Start a private group with your mates, track the podium prizes, and see where you sit.',
    chemin: '/board',
  })

  useJsonLd('classement', {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Football prediction leaderboard',
    url: 'https://pressing90.live/board',
  })

  // Aucun setState synchrone ici : le cas « pas de compte » se LIT au rendu
  // (`user` est faux) au lieu d'être écrit dans l'état. Un setState dans le
  // corps d'un effet déclenche une cascade de rendus, et l'écrire pour une
  // information qu'on a déjà sous la main n'apporte rien.
  const charger = useCallback(async () => {
    if (!user) return
    // Tout ce qui ne dépend pas de la liste des groupes part ensemble : les
    // enchaîner ferait apparaître la section par morceaux.
    const [s, d, g, p, b] = await Promise.all([
      maSaison(),
      mesDistinctions(user.id),
      mesLigues(user.id),
      mesPrix(),
      bonusDuJour(),
    ])
    setSaison(s)
    setCompte(d)
    setLigues(g)
    setPrix(p)
    setBonus(b)

    // Puis l'état et ma place dans chacun. Deux lectures par groupe, mais un
    // joueur en a un ou deux : les paralléliser suffit.
    const details = await Promise.all(
      g.map(async (l) => {
        const [e, table] = await Promise.all([etatDuGroupe(l.slug), classementDeLigue(l.slug)])
        const i = table.findIndex((r) => r.user_id === user.id)
        return { slug: l.slug, etat: e, rang: i < 0 ? null : { rang: i + 1, sur: table.length, points: table[i].points } }
      }),
    )
    setEtats(Object.fromEntries(details.filter((d2) => d2.etat).map((d2) => [d2.slug, d2.etat as EtatDuGroupe])))
    setRangs(Object.fromEntries(details.filter((d2) => d2.rang).map((d2) => [d2.slug, d2.rang as { rang: number; sur: number; points: number }])))
  }, [user])

  useEffect(() => {
    if (initialized) void charger()
  }, [initialized, charger])

  const onCreer = async () => {
    if (!user) {
      setModale(true)
      return
    }
    const propre = nom.trim()
    if (!propre) return
    setOccupe(true)
    setMessage(null)
    const l = await creerLigue(propre)
    setOccupe(false)
    if (!l) {
      setMessage(t('The league could not be created. Try again in a moment.'))
      return
    }
    navigate(`/l/${l.slug}`)
  }

  const onReclamer = (slug: string) => {
    setOccupe(true)
    setMessage(null)
    void reclamerBonus(slug).then(async (r) => {
      setOccupe(false)
      if ('erreur' in r) {
        setMessage(t('Could not claim the bonus right now.'))
        return
      }
      setMessage(
        r.deja
          ? t('Claimed today in {g} — one group per day.').replace('{g}', r.groupe)
          : avecN(t('{n} crampons claimed.'), r.crampons),
      )
      await charger()
      await useAuth.getState().refreshProfile()
    })
  }

  return (
    <div className="container max-w-3xl mx-auto px-6 pt-10">
      <SectionHeader
        niveau={1}
        eyebrow="the game"
        title="Standings"
        sub={`You stake ${JETON.plusieurs}, you win ${POINT.plusieurs} at the real odds, and every win writes points that never come back off. Groups turn that into a season between mates.`}
      />

      {/* ── 1. MA SAISON ─────────────────────────────────────────────────── */}
      {user && saison && (
        <section className="mt-8">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="shrink-0 text-center">
                <div className="font-display text-3xl font-bold tabular-nums leading-none text-accent-gold">
                  #{saison.rang}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {avecN(t('of {n}'), saison.joueurs)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl tabular-nums">
                  {saison.points.toLocaleString(localeOf(lang))}{' '}
                  <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
                    {POINT.plusieurs}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 tabular-nums">
                  {saison.gagnes}/{saison.parisTotal} {t('bets won')}
                </div>
                {compte && (compte.goat > 0 || compte.or > 0 || compte.argent > 0 || compte.bronze > 0) && (
                  <Distinctions compte={compte} taille={20} className="mt-2" />
                )}
              </div>
            </div>

            {/* Les cinq paris de la semaine. C'est le seul compteur qui dit au
                joueur ce qu'il lui reste à FAIRE — les autres ne font que
                constater. */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {t('This week')}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-slate-800">
                  {saison.parisSemaine}/5
                </span>
                <span className="ms-auto flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        'w-4 h-1.5 rounded-full',
                        i < saison.parisSemaine ? 'bg-accent-gold' : 'bg-slate-100',
                      )}
                    />
                  ))}
                </span>
              </div>
              <p className="mt-1.5 font-mono text-[10px] text-slate-500">
                {t('five bets a week unlock the full podium prizes in your groups')}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/predictions"
                className="px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm active:scale-[0.98] transition-transform"
              >
                {t('Place a bet')}
              </Link>
              <Link
                to="/my-bets"
                className="px-4 py-2 rounded-xl glass glass-hover text-sm text-slate-800"
              >
                {t('My bets')}
              </Link>
            </div>
          </div>
        </section>
      )}

      {!user && initialized && (
        <section className="mt-8 glass rounded-2xl p-5">
          <p className="text-sm text-slate-700">
            {t('Sign in to see your rank, your badges and your groups. Everything below is the public table.')}
          </p>
          <button
            type="button"
            onClick={() => setModale(true)}
            className="mt-3 px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm active:scale-[0.98] transition-transform"
          >
            {t('Sign in')}
          </button>
        </section>
      )}

      {/* ── 2. MES GROUPES ───────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="flex items-center gap-2">
          <Icone nom="football-club-flag" taille={24} />
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            {t('Your groups')}
          </h2>
          {user && ligues && ligues.length > 0 && (
            <button
              type="button"
              onClick={() => setOuvrirCreation((v) => !v)}
              className="ms-auto font-mono text-[10px] uppercase tracking-wider text-accent-gold"
            >
              {t('New group')}
            </button>
          )}
        </div>

        {/* La création n'est jamais cachée derrière un autre écran : sans
            groupe, le formulaire est ouvert et c'est la première chose
            visible de la section. */}
        {(ouvrirCreation || !user || (ligues !== null && ligues.length === 0)) && (
          <div className="mt-3 glass rounded-2xl p-4">
            <p className="text-sm text-slate-700">
              {t('Name it, send the link, and the table starts from the day each of you joins.')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onCreer()
                }}
                maxLength={60}
                placeholder={t('Group name')}
                className="flex-1 min-w-[12rem] px-4 py-2 rounded-xl bg-slate-100 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-accent-gold/50"
              />
              <button
                type="button"
                onClick={() => void onCreer()}
                disabled={occupe || !nom.trim()}
                className="px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
              >
                {user ? t('Create') : t('Sign in and create')}
              </button>
            </div>
          </div>
        )}

        {user && ligues === null && (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-slate-400">{t('Loading…')}</p>
        )}

        {user && ligues !== null && ligues.length > 0 && (
          <>
            {/* L'avertissement est au-dessus de la liste, pas sur chaque
                bouton : la règle porte sur l'ensemble des groupes. */}
            {!bonus && (
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {t('one group per day — claiming here closes the others until tomorrow')}
              </p>
            )}
            <ul className="mt-3 grid gap-2.5">
              {ligues.map((l) => (
                <CarteGroupe
                  key={l.id}
                  ligue={l}
                  etat={etats[l.slug] ?? null}
                  place={rangs[l.slug] ?? null}
                  bonus={bonus}
                  occupe={occupe}
                  onReclamer={() => onReclamer(l.slug)}
                />
              ))}
            </ul>
          </>
        )}

        {message && <p className="mt-2.5 text-sm text-slate-600">{message}</p>}
      </section>

      {/* ── 3. MES PRIX ──────────────────────────────────────────────────── */}
      <PrixHebdomadaires
        prix={prix}
        occupe={occupe}
        onReclamer={(id, monnaie) => {
          setOccupe(true)
          setMessage(null)
          void reclamerPrix(id, monnaie).then(async (r) => {
            setOccupe(false)
            if ('erreur' in r) {
              setMessage(t('Could not claim this prize.'))
              return
            }
            setMessage(t('Prize taken from {g}.').replace('{g}', r.groupe))
            await charger()
            await useAuth.getState().refreshProfile()
          })
        }}
      />

      {/* ── 4. LE CLASSEMENT GÉNÉRAL ─────────────────────────────────────── */}
      <Leaderboard niveau={2} titre="Global table" />

      <AuthModal
        open={modale}
        onClose={() => {
          setModale(false)
          void charger()
        }}
      />
    </div>
  )
}

/**
 * Un groupe, vu depuis la section : ma place, ce qu'il reste à débloquer, et
 * le bonus du jour s'il est encaissable.
 *
 * La barre complète — les deux jauges, les noms de ceux qui bloquent — reste
 * sur la page du groupe. Ici on en garde ce qui tient sur une carte : deux
 * fractions et le bouton. Répéter la barre entière pour deux groupes
 * remplirait l'écran et on ne verrait plus le classement général.
 */
function CarteGroupe({
  ligue,
  etat,
  place,
  bonus,
  occupe,
  onReclamer,
}: {
  ligue: Ligue
  etat: EtatDuGroupe | null
  place: { rang: number; sur: number; points: number } | null
  bonus: { groupe: string; crampons: number } | null
  occupe: boolean
  onReclamer: () => void
}) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const tropPetit = etat !== null && etat.membres < 3

  return (
    <li className="glass rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link to={`/l/${ligue.slug}`} className="font-display text-[17px] truncate block hover:text-accent-gold transition-colors">
            {ligue.name}
          </Link>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 tabular-nums">
            {place
              ? `#${place.rang} / ${place.sur} · ${place.points.toLocaleString(localeOf(lang))} pts`
              : etat
                ? avecN(t('{n} members'), etat.membres)
                : '—'}
          </div>
        </div>
        <Link
          to={`/l/${ligue.slug}`}
          className="shrink-0 px-3 py-1.5 rounded-xl glass glass-hover font-mono text-[10px] uppercase tracking-wider text-slate-700"
        >
          {t('Open')}
        </Link>
      </div>

      {etat && !tropPetit && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Jauge titre={t('Today')} fait={etat.ontParieJour} total={etat.actifs} taux={etat.tauxJour} />
          <Jauge titre={t('This week')} fait={etat.ontCinqSemaine} total={etat.actifs} taux={etat.tauxSemaine} />
        </div>
      )}

      {tropPetit && (
        <p className="mt-2.5 text-[13px] text-slate-600">
          {t('A group starts paying rewards at three members. Share the invite link.')}
        </p>
      )}

      {etat && !tropPetit && (
        <div className="mt-3">
          {bonus ? (
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {bonus.groupe === ligue.name
                ? avecN(t('{n} crampons claimed today'), bonus.crampons)
                : t('Claimed today in {g} — one group per day.').replace('{g}', bonus.groupe || '—')}
            </p>
          ) : (
            <button
              type="button"
              disabled={occupe || etat.bonusJour === 0}
              onClick={onReclamer}
              className="px-3.5 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-40 inline-flex items-center gap-1.5 active:scale-[0.98] transition-transform"
            >
              <Jeton type="crampon" taille={13} />
              {etat.bonusJour === 0 ? t('Nobody has bet today') : avecN(t('Claim {n}'), etat.bonusJour)}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/** Une fraction et sa barre. La version bavarde est sur la page du groupe. */
function Jauge({ titre, fait, total, taux }: { titre: string; fait: number; total: number; taux: number }) {
  const plein = Math.round(taux * 100)
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-slate-500">{titre}</span>
        <span className="ms-auto font-mono text-[10px] tabular-nums text-slate-800">
          {fait}/{total}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn('h-full transition-[width] duration-500', plein === 100 ? 'bg-accent-green' : 'bg-accent-gold')}
          style={{ width: `${plein}%` }}
        />
      </div>
    </div>
  )
}

function avecN(gabarit: string, n: number): string {
  return gabarit.replace('{n}', String(n))
}
