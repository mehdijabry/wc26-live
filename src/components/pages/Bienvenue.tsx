import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../store/auth'
import { usePageHead } from '../../lib/head'
import { AuthModal } from '../AuthModal'
import { Icone } from '../Icone'
import { Jeton } from '../Jeton'
import { useT } from '../../lib/i18n'

/**
 * /bienvenue/:code — l'atterrissage d'un lien d'inscription.
 *
 * ── CE QUE LE LIEN DOIT FAIRE ─────────────────────────────────────────────
 * Quelqu'un arrive d'une publication Facebook. Il ne connaît pas le site. La
 * page doit lui dire en une ligne ce qu'il gagne À L'INSCRIPTION, pas après
 * l'avoir faite — sinon il repart. D'où la lecture publique du code avant
 * toute connexion : `code_inscription()` rend le montant sans exiger de
 * compte, et sans permettre d'énumérer les autres codes (migration 019).
 *
 * ── LA RÉCLAMATION EST AUTOMATIQUE ────────────────────────────────────────
 * Dès que la session existe, le code part tout seul. Lui demander de
 * cliquer une seconde fois après s'être inscrit perdrait du monde pour
 * rien, et le refus éventuel (« un seul code par compte ») s'affiche de
 * toute façon.
 */
type Offre = { crampons: number; analyses: number; libelle: string | null; valide: boolean }

export function Bienvenue() {
  const { code = '' } = useParams<{ code: string }>()
  const user = useAuth((s) => s.user)
  const initialized = useAuth((s) => s.initialized)
  const t = useT()

  const [offre, setOffre] = useState<Offre | null>(null)
  const [chargee, setChargee] = useState(false)
  const [modale, setModale] = useState(false)
  const [recu, setRecu] = useState<{ crampons: number; analyses: number } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  usePageHead({
    titre: 'Your welcome bonus — Pressing 90',
    description: 'Open an account and start with free crampons and free AI match analyses.',
    chemin: `/bienvenue/${code}`,
    // Un lien de promotion n'a rien à faire dans Google : il est fait pour
    // être partagé, pas trouvé, et chaque code indexé serait réclamable par
    // n'importe qui.
    horsIndex: true,
  })

  useEffect(() => {
    if (!supabase || !code) { setChargee(true); return }
    void supabase.rpc('code_inscription', { p_code: code }).then(({ data }) => {
      const o = Array.isArray(data) ? data[0] : data
      setOffre((o as Offre) ?? null)
      setChargee(true)
    })
  }, [code])

  const reclamer = useCallback(async () => {
    if (!supabase || !user || !code) return
    setOccupe(true)
    setErreur(null)
    const { data, error } = await supabase.rpc('reclamer_code_inscription', { p_code: code })
    setOccupe(false)
    if (error) {
      setErreur(error.message)
      return
    }
    const r = (Array.isArray(data) ? data[0] : data) as { crampons: number; analyses: number } | null
    if (r) {
      setRecu({ crampons: Number(r.crampons ?? 0), analyses: Number(r.analyses ?? 0) })
      await useAuth.getState().refreshProfile()
    }
  }, [user, code])

  // La réclamation part d'elle-même dès qu'il y a une session, et une seule
  // fois : `recu` et `erreur` ferment la porte derrière eux.
  useEffect(() => {
    if (initialized && user && !recu && !erreur && !occupe && offre?.valide) void reclamer()
  }, [initialized, user, recu, erreur, occupe, offre, reclamer])

  return (
    <div className="container max-w-xl mx-auto px-6 py-14">
      <div className="flex items-center gap-3">
        <Icone nom="football-strike" taille={40} />
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-accent-gold">
            {t('welcome to Pressing 90')}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t('Your welcome bonus')}</h1>
        </div>
      </div>

      {!chargee && (
        <p className="mt-6 font-mono text-[11px] uppercase tracking-wider text-slate-400">{t('Loading…')}</p>
      )}

      {chargee && !offre && (
        <p className="mt-6 text-slate-600">
          {t('This link is not valid. Ask for a fresh one, or just sign up — the game is free either way.')}
        </p>
      )}

      {chargee && offre && !offre.valide && !recu && (
        <p className="mt-6 text-slate-600">
          {t('This link has expired or reached its limit. You can still sign up — the game is free.')}
        </p>
      )}

      {offre && (offre.valide || recu) && (
        <div className="mt-6 glass rounded-2xl p-5">
          <div className="flex flex-wrap gap-5">
            {offre.crampons > 0 && (
              <div>
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  <Jeton type="crampon" taille={12} /> {t('crampons')}
                </div>
                <div className="font-display text-3xl font-bold tabular-nums text-accent-gold">
                  {offre.crampons}
                </div>
              </div>
            )}
            {offre.analyses > 0 && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  {t('free AI analyses')}
                </div>
                <div className="font-display text-3xl font-bold tabular-nums text-accent-violet">
                  {offre.analyses}
                </div>
              </div>
            )}
          </div>

          {!user && (
            <>
              <p className="mt-4 text-sm text-slate-700">
                {t('Create your account and it lands in your balance straight away. No deposit, no bookmaker.')}
              </p>
              <button
                type="button"
                onClick={() => setModale(true)}
                className="mt-4 px-5 py-2.5 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm active:scale-[0.98] transition-transform"
              >
                {t('Create my account')}
              </button>
            </>
          )}

          {user && occupe && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-slate-400">
              {t('Adding it to your balance…')}
            </p>
          )}

          {recu && (
            <>
              <p className="mt-4 text-sm text-accent-green">
                {t('It is in your balance. Enjoy.')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/predictions"
                  className="px-5 py-2.5 rounded-xl bg-accent-gold text-ink-900 font-semibold text-sm active:scale-[0.98] transition-transform"
                >
                  {t('Place a bet')}
                </Link>
                <Link to="/analyse" className="px-5 py-2.5 rounded-xl glass glass-hover text-sm text-slate-800">
                  {t('Try the AI analysis')}
                </Link>
              </div>
            </>
          )}

          {erreur && (
            <p className="mt-4 text-sm text-slate-600">
              {/* Le cas de loin le plus fréquent, et il n'a rien d'une panne :
                  un compte ne réclame qu'un seul lien dans sa vie. */}
              {erreur.includes('seul code')
                ? t('This account has already used a welcome link.')
                : erreur}
            </p>
          )}
        </div>
      )}

      <p className="mt-8 text-sm text-slate-500">
        {t('Pressing 90 is free. You stake crampons on real odds — there is no money in, and no bookmaker.')}
      </p>

      <AuthModal open={modale} onClose={() => setModale(false)} />
    </div>
  )
}

export default Bienvenue
