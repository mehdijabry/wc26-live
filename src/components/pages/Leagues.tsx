import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/auth'
import { usePageHead, useJsonLd } from '../../lib/head'
import { AuthModal } from '../AuthModal'
import { creerLigue, mesLigues, type Ligue } from '../../lib/leagues'
import { useT } from '../../lib/i18n'

/**
 * /leagues — créer une ligue, retrouver les siennes.
 *
 * La page reste lisible sans compte : elle explique ce qu'est une ligue et
 * propose de se connecter. Elle est indexable, contrairement aux ligues
 * elles-mêmes (/l/:slug), qui sont privées par leur lien.
 */
export function Leagues() {
  const user = useAuth((s) => s.user)
  const initialized = useAuth((s) => s.initialized)
  const navigate = useNavigate()
  const t = useT()
  const [ligues, setLigues] = useState<Ligue[] | null>(null)
  const [nom, setNom] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [modale, setModale] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  usePageHead({
    titre: 'Private prediction leagues — settle it with your mates',
    description:
      'Create a private football prediction league in seconds, share one link, and see who really knows their football. Free, no stake, no bookmaker.',
    chemin: '/leagues',
  })

  useJsonLd('leagues', {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Private prediction leagues',
    url: 'https://pressing90.live/leagues',
  })

  const charger = useCallback(async () => {
    if (!user) {
      setLigues([])
      return
    }
    setLigues(await mesLigues(user.id))
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
    setErreur(null)
    const l = await creerLigue(propre)
    setOccupe(false)
    if (!l) {
      setErreur(t('The league could not be created. Try again in a moment.'))
      return
    }
    navigate(`/l/${l.slug}`)
  }

  return (
    <div className="container max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t('Private leagues')}</h1>
      <p className="mt-3 text-muted-foreground max-w-2xl">
        {t('Create a league, send one link, and settle the argument once and for all — who actually knows their football? Everyone starts level: points only count from the day each member joins.')}
      </p>

      <Link
        to="/board"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm active:scale-[0.98] transition-transform"
      >
        🏆 {t('Open the standings')}
      </Link>

      <div className="mt-8 flex flex-wrap gap-2">
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onCreer()
          }}
          maxLength={60}
          placeholder={t('League name')}
          className="flex-1 min-w-[16rem] px-4 py-2 rounded-full bg-slate-100 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-accent-gold/50"
        />
        <button
          type="button"
          onClick={() => void onCreer()}
          disabled={occupe || !nom.trim()}
          className="px-5 py-2 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm disabled:opacity-40"
        >
          {user ? t('Create') : t('Sign in and create')}
        </button>
      </div>
      {erreur && <p className="mt-2 text-sm text-red-500">{erreur}</p>}

      {user && ligues && ligues.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">{t('Your leagues')}</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {ligues.map((l) => (
              <li key={l.id}>
                <Link
                  to={`/l/${l.slug}`}
                  className="block rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{l.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user && ligues && ligues.length === 0 && (
        <p className="mt-8 text-sm text-slate-500">
          {t('You are not in any league yet. Create one above, or open an invite link a friend sent you.')}
        </p>
      )}

      <p className="mt-12 text-sm text-muted-foreground">
        {t('Points come from your bets on the')}{' '}
        <Link to="/predictions" className="underline">
          {t('predictions page')}
        </Link>
        {', '}
        {t('and the global table lives on')}{' '}
        <Link to="/board" className="underline">
          {t('the leaderboard')}
        </Link>
        .
      </p>


      <AuthModal open={modale} onClose={() => { setModale(false); void charger() }} />
    </div>
  )
}
