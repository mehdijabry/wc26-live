import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { localeOf, useLang, useT } from '../lib/i18n'
import { Jeton } from './Jeton'
import Avatar from './Avatar'
import {
  marquerLues,
  mesNotifications,
  nonLues,
  repondreAmi,
  type Notif,
} from '../lib/notifications'

/**
 * LA CLOCHE — le point d'arrivée de tout ce que le jeu fait au joueur.
 *
 * ── POURQUOI ELLE EST DANS L'EN-TÊTE ──────────────────────────────────────
 * Mehdi, 17/10/2026 : « le bouton ne doit pas être juste dans profil, il
 * doit être général au site comme le bouton avatar ». Une demande d'ami
 * envoyée n'arrivait nulle part : il fallait, par hasard, ouvrir le profil
 * du demandeur pour la découvrir. Une notification qui vit dans une page
 * qu'on ne visite pas n'est pas une notification.
 *
 * ── LES DEMANDES D'AMI SONT À PART ────────────────────────────────────────
 * Elles ne se lisent pas, elles se RÉPONDENT. Elles montent donc en haut du
 * panneau, dans leur propre bloc, avec les deux boutons — et elles ne sont
 * pas effacées par « tout marquer lu » : tant qu'on n'a pas répondu, la
 * demande reste.
 *
 * ── LE COMPTEUR NE MENT PAS ───────────────────────────────────────────────
 * `nonLues()` rend `null` quand la lecture échoue. On n'affiche alors AUCUNE
 * pastille — ni zéro, ni l'ancien chiffre : une erreur réseau ne doit pas
 * dire « rien de nouveau ».
 */

const SONDAGE_MS = 60_000

function Cloche({ n }: { n: number }) {
  return (
    <span className="relative inline-flex">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 3.2-.7 5-1.4 6.1-.4.6 0 1.4.8 1.4h12.2c.8 0 1.2-.8.8-1.4-.7-1.1-1.4-2.9-1.4-6.1A5.5 5.5 0 0 0 12 3Z"
          stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"
        />
        <path d="M10 19.2a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      {n > 0 && (
        <span
          className="absolute -top-1.5 -end-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-accent-gold text-ink-900
                     text-[10px] font-bold leading-[17px] text-center tabular-nums"
          aria-hidden
        >
          {n > 9 ? '9+' : n}
        </span>
      )}
    </span>
  )
}

/** « il y a 3 h » — sans bibliothèque de dates, et dans les trois langues. */
function depuis(iso: string, t: (s: string) => string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60_000)
  if (min < 1) return t('just now')
  if (min < 60) return `${min} ${t('min')}`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ${t('h')}`
  const j = Math.round(h / 24)
  return `${j} ${t('d')}`
}

export function Notifications({ compact = false }: { compact?: boolean } = {}) {
  const user = useAuth((s) => s.user)
  const t = useT()
  const lang = useLang((s) => s.lang)

  const [ouvert, setOuvert] = useState(false)
  const [compteur, setCompteur] = useState<number | null>(null)
  const [liste, setListe] = useState<Notif[] | null>(null)
  const [occupe, setOccupe] = useState(false)
  const boite = useRef<HTMLDivElement | null>(null)

  const relireCompteur = useCallback(async () => {
    const n = await nonLues()
    if (n !== null) setCompteur(n)
  }, [])

  // Le compteur se sonde, la liste non : charger quarante lignes toutes les
  // minutes pour une pastille qui tient dans un entier serait du gaspillage
  // sur un téléphone.
  useEffect(() => {
    if (!user) { setCompteur(null); setListe(null); return }
    void relireCompteur()
    const id = setInterval(() => { void relireCompteur() }, SONDAGE_MS)
    const auRetour = () => { if (document.visibilityState === 'visible') void relireCompteur() }
    document.addEventListener('visibilitychange', auRetour)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', auRetour) }
  }, [user, relireCompteur])

  const ouvrir = async () => {
    const vaOuvrir = !ouvert
    setOuvert(vaOuvrir)
    if (!vaOuvrir) return
    setListe(null)
    const l = await mesNotifications(40)
    setListe(l)
    // Lues à l'ouverture : le joueur les a sous les yeux. Les demandes
    // d'ami, elles, restent en haut tant qu'on n'y a pas répondu.
    if (l.some((n) => !n.lu)) {
      await marquerLues()
      setCompteur(0)
    }
  }

  // Fermer au clic dehors et à la touche Échap : un panneau ouvert par-dessus
  // la page doit se refermer comme tous les autres.
  useEffect(() => {
    if (!ouvert) return
    const auClic = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false)
    }
    const auClavier = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [ouvert])

  if (!user) return null

  const repondre = async (n: Notif, accepter: boolean) => {
    const id = String(n.donnees.id ?? '')
    if (!id) return
    setOccupe(true)
    const ok = await repondreAmi(id, accepter)
    setOccupe(false)
    if (!ok) return
    // La demande traitée quitte la liste : elle n'a plus rien à proposer.
    setListe((avant) => (avant ?? []).filter((x) => x.id !== n.id))
  }

  const demandes = (liste ?? []).filter((n) => n.kind === 'ami_demande')
  const reste = (liste ?? []).filter((n) => n.kind !== 'ami_demande')

  return (
    <div className="relative" ref={boite}>
      <button
        type="button"
        onClick={() => void ouvrir()}
        aria-label={t('Notifications')}
        aria-expanded={ouvert}
        className={
          (compact ? 'w-9 h-9' : 'w-10 h-10') +
          ' rounded-full glass glass-hover flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors'
        }
      >
        <Cloche n={compteur ?? 0} />
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-[58]" onClick={() => setOuvert(false)} />
          <div
            className="fixed end-3 z-[59] w-[min(94vw,380px)] max-h-[70vh] overflow-y-auto
                       glass rounded-2xl p-3 ring-glow"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 68px)' }}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                {t('Notifications')}
              </span>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                aria-label={t('Close')}
                className="w-7 h-7 rounded-full glass glass-hover flex items-center justify-center text-sm"
              >
                ×
              </button>
            </div>

            {liste === null ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl glass animate-pulse" />)}
              </div>
            ) : liste.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-slate-500">{t('Nothing new')}</p>
            ) : (
              <div className="space-y-3">
                {/* ── LES INVITATIONS, À PART ET EN PREMIER ──────────────── */}
                {demandes.length > 0 && (
                  <div>
                    <div className="px-1 pb-1.5 font-mono text-[10px] uppercase tracking-widest text-accent-gold">
                      {t('Friend requests')}
                    </div>
                    <ul className="space-y-1.5">
                      {demandes.map((n) => (
                        <li key={n.id} className="rounded-xl glass px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              alias={String(n.donnees.alias ?? 'fan')}
                              url={(n.donnees.avatar as string) ?? null}
                              graine={String(n.donnees.id ?? '')}
                              taille={28}
                            />
                            <Link
                              to={n.lien || '#'}
                              onClick={() => setOuvert(false)}
                              className="min-w-0 flex-1 truncate text-sm hover:text-accent-gold transition-colors"
                            >
                              <span className="font-semibold">{String(n.donnees.alias ?? '—')}</span>
                              <span className="text-slate-500"> · {t('wants to be your friend')}</span>
                            </Link>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button" disabled={occupe}
                              onClick={() => void repondre(n, true)}
                              className="px-3 py-1.5 rounded-lg bg-accent-gold text-ink-900 text-xs font-semibold disabled:opacity-40"
                            >
                              {t('Accept')}
                            </button>
                            <button
                              type="button" disabled={occupe}
                              onClick={() => void repondre(n, false)}
                              className="px-3 py-1.5 rounded-lg glass glass-hover text-xs disabled:opacity-40"
                            >
                              {t('Decline')}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {reste.length > 0 && (
                  <ul className="space-y-1">
                    {reste.map((n) => (
                      <li key={n.id}>
                        <Ligne n={n} onNaviguer={() => setOuvert(false)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )

  /** Une ligne ordinaire. Le texte se compose ICI, jamais en base. */
  function Ligne({ n, onNaviguer }: { n: Notif; onNaviguer: () => void }) {
    const d = n.donnees
    const nb = (v: unknown) => Number(v ?? 0).toLocaleString(localeOf(lang))
    const alias = String(d.alias ?? '—')

    const contenu =
      n.kind === 'post_abonne' ? (
        <>
          <span className="font-semibold">{alias}</span>{' '}
          <span className="text-slate-500">{t('shared a winning bet')}</span>
          {d.cote != null && (
            <span className="ms-1 font-semibold tabular-nums text-accent-gold">
              ×{Number(d.cote).toFixed(2)}
            </span>
          )}
        </>
      ) : n.kind === 'post_aime' ? (
        <>
          <span className="font-semibold">{alias}</span>{' '}
          <span className="text-slate-500">{t('liked your win')}</span>
        </>
      ) : n.kind === 'nouvel_abonne' ? (
        <>
          <span className="font-semibold">{alias}</span>{' '}
          <span className="text-slate-500">{t('follows you')}</span>
        </>
      ) : n.kind === 'ami_acceptee' ? (
        <>
          <span className="font-semibold">{alias}</span>{' '}
          <span className="text-slate-500">{t('accepted your friend request')}</span>
        </>
      ) : n.kind === 'crampons_recus' ? (
        <>
          <span className="font-semibold">{alias}</span>{' '}
          <span className="text-slate-500">{t('sent you')}</span>{' '}
          <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
            {nb(d.montant)} <Jeton type="crampon" taille={11} />
          </span>
        </>
      ) : n.kind === 'pari_copie' ? (
        <>
          <span className="font-semibold">{alias}</span>{' '}
          <span className="text-slate-500">{t('copied your bet')}</span>
        </>
      ) : n.kind === 'pari_pose' ? (
        <span className="text-slate-500">
          {t('Bet placed')} · <span className="tabular-nums">{nb(d.mise)}</span>{' '}
          <span className="text-slate-500">@ {Number(d.cote ?? 0).toFixed(2)}</span>
        </span>
      ) : n.kind === 'pari_gagne' ? (
        <>
          <span className="text-accent-green font-semibold">{t('Bet won')}</span>{' '}
          <span className="inline-flex items-center gap-1 tabular-nums">
            +{nb(d.gain)} <Jeton type="pressing" taille={11} />
          </span>
        </>
      ) : n.kind === 'pari_perdu' ? (
        <span className="text-slate-500">
          {t('Bet lost')} · <span className="tabular-nums">{nb(d.mise)}</span>{' '}
          <Jeton type="crampon" taille={11} />
        </span>
      ) : n.kind === 'pari_annule' ? (
        <span className="text-slate-500">{t('Bet void — stake returned')}</span>
      ) : (
        // Un évènement d'un club suivi. Le serveur n'envoie que des données —
        // club, adversaire, score — et la phrase se compose ici, comme pour
        // tout le reste : une notification française chez un lecteur arabe
        // serait illisible.
        <>
          <span className="font-semibold">{String(d.club ?? '')}</span>{' '}
          {d.etat === 'ft' ? (
            <>
              <span className="font-semibold tabular-nums">{String(d.score ?? '')}</span>{' '}
              <span className="text-slate-500">{String(d.adv ?? '')}</span>
            </>
          ) : (
            <span className="text-slate-500">
              {t('kick off against')} {String(d.adv ?? '')}
            </span>
          )}
        </>
      )

    const corps = (
      <div className={'rounded-xl px-3 py-2.5 text-sm ' + (n.lu ? '' : 'bg-accent-gold/5')}>
        <div className="flex items-baseline gap-2">
          <div className="min-w-0 flex-1">{contenu}</div>
          <span className="shrink-0 font-mono text-[10px] text-slate-500 tabular-nums">
            {depuis(n.created_at, t)}
          </span>
        </div>
      </div>
    )

    return n.lien ? (
      <Link to={n.lien} onClick={onNaviguer} className="block hover:bg-slate-100/40 rounded-xl transition-colors">
        {corps}
      </Link>
    ) : corps
  }
}

export default Notifications
