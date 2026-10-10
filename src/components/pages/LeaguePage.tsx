import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { usePageHead } from '../../lib/head'
import { AuthModal } from '../AuthModal'
import {
  ligueParSlug,
  classementDeLigue,
  rejoindre,
  quitter,
  lienDInvitation,
  etatDuGroupe,
  podiumDuJour,
  bonusDuJour,
  reclamerBonus,
  type Ligue,
  type LigneDeLigue,
  type EtatDuGroupe,
} from '../../lib/leagues'
import BarreDeblocage from '../BarreDeblocage'
import { Icone } from '../Icone'
import { cn } from '../../lib/utils'
import { localeOf, useLang, useT } from '../../lib/i18n'

/**
 * /l/:slug — une ligue privée et son classement.
 *
 * Deux règles de conception, qui sont tout l'intérêt de la page :
 *
 *  1. On peut la LIRE sans compte. Un invité qui reçoit le lien voit le nom
 *     de la ligue et le classement avant de décider quoi que ce soit. Un mur
 *     d'inscription à cet endroit tuerait la seule mécanique qui fait venir
 *     des gens sans les acheter.
 *  2. Le classement part de l'adhésion de chacun, pas du total du compte —
 *     sinon une ligue créée aujourd'hui serait injouable face à quelqu'un qui
 *     pronostique depuis un an. C'est `league_table()` en base qui le calcule.
 *
 * La page est hors index : une ligue entre amis n'a rien à faire dans Google,
 * et son slug est précisément ce qui en garde l'accès.
 */
export function LeaguePage() {
  const { slug = '' } = useParams()
  const user = useAuth((s) => s.user)
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [ligue, setLigue] = useState<Ligue | null | 'introuvable'>(null)
  const [lignes, setLignes] = useState<LigneDeLigue[]>([])
  const [occupe, setOccupe] = useState(false)
  const [copie, setCopie] = useState(false)
  const [modale, setModale] = useState(false)
  const [etat, setEtat] = useState<EtatDuGroupe | null>(null)
  const [podium, setPodium] = useState<Map<string, number>>(new Map())
  const [reclame, setReclame] = useState<{ groupe: string; crampons: number } | null>(null)
  const [messageBonus, setMessageBonus] = useState<string | null>(null)

  usePageHead({
    titre: ligue && ligue !== 'introuvable' ? `${ligue.name} — private league` : 'Private league',
    description: 'A private prediction league on Pressing 90. Invite-only, free, no stake.',
    chemin: `/l/${slug}`,
    horsIndex: true,
  })

  const charger = useCallback(async () => {
    const l = await ligueParSlug(slug)
    if (!l) {
      setLigue('introuvable')
      return
    }
    setLigue(l)
    // Quatre lectures en parallèle : le classement, l'état de déblocage, le
    // podium du jour et le bonus déjà pris. Les enchaîner ferait clignoter
    // la page quatre fois.
    const [table, e, pod, bonus] = await Promise.all([
      classementDeLigue(slug),
      etatDuGroupe(slug),
      podiumDuJour(slug),
      bonusDuJour(),
    ])
    setLignes(table)
    setEtat(e)
    setPodium(pod)
    setReclame(bonus)
  }, [slug])

  const onReclamer = async () => {
    setOccupe(true)
    setMessageBonus(null)
    const r = await reclamerBonus(slug)
    setOccupe(false)
    if ('erreur' in r) {
      setMessageBonus(t('Could not claim right now.'))
      return
    }
    if (r.deja) {
      setMessageBonus(t('Claimed today in {g} — one group per day.').replace('{g}', r.groupe))
    }
    await charger()
    // Le solde a bougé : le menu du compte doit le refléter sans rechargement.
    await useAuth.getState().refreshProfile()
  }

  useEffect(() => {
    void charger()
  }, [charger])

  if (ligue === null) {
    return <div className="container max-w-3xl mx-auto px-6 py-16 text-sm text-slate-400">{t('Loading…')}</div>
  }

  if (ligue === 'introuvable') {
    return (
      <div className="container max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold">{t('League not found')}</h1>
        <p className="mt-3 text-muted-foreground">
          {t('That invite link is wrong, or the league was deleted.')}
        </p>
        <Link to="/leagues" className="mt-4 inline-block underline">
          {t('Your leagues')}
        </Link>
      </div>
    )
  }

  const membre = !!user && lignes.some((r) => r.user_id === user.id)
  const lien = lienDInvitation(slug)

  const onRejoindre = async () => {
    if (!user) {
      setModale(true)
      return
    }
    setOccupe(true)
    // Un joueur peut appartenir à plusieurs groupes : rejoindre ne fait plus
    // quitter. Ce qui est limité, c'est la RÉCLAMATION du bonus — une seule
    // par jour, et c'est lui qui choisit laquelle.
    await rejoindre(ligue.slug)
    await charger()
    setOccupe(false)
  }

  const onQuitter = async () => {
    if (!user) return
    setOccupe(true)
    await quitter(ligue.id, user.id)
    await charger()
    setOccupe(false)
  }

  return (
    <div className="container max-w-3xl mx-auto px-6 py-10">
      <Link to="/leagues" className="text-sm text-muted-foreground hover:underline">
        ← {t('Your leagues')}
      </Link>

      <h1 className="mt-3 text-3xl font-bold tracking-tight">{ligue.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {lignes.length} {lignes.length === 1 ? t('member') : t('members')} ·{' '}
        {t('points counted from the day each member joined, so everyone starts level.')}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!membre && (
          <button
            type="button"
            onClick={() => void onRejoindre()}
            disabled={occupe}
            className="px-4 py-2 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-50"
          >
            {user ? t('Join this league') : t('Sign in and join')}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(lien)
            setCopie(true)
            setTimeout(() => setCopie(false), 2000)
          }}
          className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm transition-colors"
        >
          {copie ? t('Link copied') : t('Copy invite link')}
        </button>
        {membre && (
          <button
            type="button"
            onClick={() => void onQuitter()}
            disabled={occupe}
            className="text-xs text-slate-400 hover:text-slate-600 underline disabled:opacity-50"
          >
            {t('Leave')}
          </button>
        )}
      </div>

      {/* L'état de déblocage, et le bouton pour encaisser. Posé APRÈS
          l'invitation : un groupe trop petit doit d'abord recruter, et c'est
          le lien qui sert à ça. */}
      {membre && etat && (
        <>
          <BarreDeblocage
            etat={etat}
            dejaReclame={reclame}
            occupe={occupe}
            onReclamer={() => void onReclamer()}
          />
          {messageBonus && <p className="mt-2 text-sm text-slate-600">{messageBonus}</p>}
        </>
      )}

      <p className="mt-3 text-xs font-mono text-slate-400 break-all">{lien}</p>

      {lignes.length === 0 ? (
        <p className="mt-10 text-sm text-slate-500">
          {t('Nobody has joined yet. Share the link above — anyone who opens it can see the league before signing up.')}
        </p>
      ) : (
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="text-start text-xs font-mono uppercase tracking-wider text-slate-400 border-b border-slate-200/60">
              <th className="py-2 pr-3 font-medium text-start">#</th>
              <th className="py-2 pr-3 font-medium text-start">{t('Player')}</th>
              <th className="py-2 pr-3 font-medium text-end">{t('Won / played')}</th>
              <th className="py-2 font-medium text-end">{t('Points')}</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((r, i) => (
              <tr
                key={r.user_id}
                className={cn(
                  'border-b border-slate-200/40 last:border-0',
                  user && r.user_id === user.id && 'bg-accent-gold/10',
                )}
              >
                <td className="py-2 pr-3 font-mono tabular-nums text-slate-400">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      {r.alias || t('anonymous')}
                      {/* La médaille du JOUR, pas du classement affiché : le
                          tableau compte les points depuis l'adhésion, le
                          podium se rejoue chaque jour. */}
                      {podium.get(r.user_id) === 1 && <Icone nom="medaille-or" taille={16} />}
                      {podium.get(r.user_id) === 2 && <Icone nom="medaille-argent" taille={16} />}
                      {podium.get(r.user_id) === 3 && <Icone nom="medaille-bronze" taille={16} />}
                    </span>
                  </td>
                <td className="py-2 pr-3 text-end font-mono tabular-nums text-slate-500">
                    {r.gagnes}<span className="text-slate-400">/{r.paris}</span>
                  </td>
                <td className="py-2 text-end font-mono tabular-nums font-semibold">
                  {r.points.toLocaleString(localeOf(lang))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-10 text-sm text-muted-foreground">
        {t('Points come from your bets on the')}{' '}
        <Link to="/predictions" className="underline">
          {t('predictions page')}
        </Link>
        .
      </p>

      <AuthModal open={modale} onClose={() => { setModale(false); void charger() }} />
    </div>
  )
}
