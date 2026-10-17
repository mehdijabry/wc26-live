/**
 * LE PROFIL PUBLIC D'UN JOUEUR.
 *
 * Cette page montrait le TABLEAU DE LA COUPE DU MONDE 2026, et son
 * identifiant venait de la table `brackets` : rien n'y parlait du jeu, et le
 * lien « voir mon profil public » du menu y menait quand meme (Mehdi,
 * 17/10/2026).
 *
 * Elle est maintenant adressee par ALIAS — deja unique, et lisible dans une
 * URL. Les anciens liens en slug de tableau continuent de fonctionner : on
 * essaie l'alias, puis on retombe sur l'ancienne page.
 */
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useT, useLang, localeOf } from '../lib/i18n'
import Avatar from './Avatar'
import { Jeton } from './Jeton'
import { Ad } from './AdSlot'

type Profil = {
  id: string
  alias: string
  avatar_url: string | null
  tier: string
  points: number
  rang: number
  joueurs: number
  paris_total: number
  gagnes: number
  serie: number
  meilleure_serie: number
  groupe: string | null
  membre_depuis: string
}

type Ami = { id: string; alias: string; avatar_url: string | null; tier: string; points: number; etat: string; sens: string }

export function PublicProfile({ slug: slugProp }: { slug?: string } = {}) {
  const { slug: slugUrl = '' } = useParams()
  const slug = slugProp ?? slugUrl
  const t = useT()
  const navigate = useNavigate()
  const lang = useLang((s) => s.lang)
  const moi = useAuth((s) => s.user)
  const rafraichirProfil = useAuth((s) => s.refreshProfile)

  const [p, setP] = useState<Profil | null>(null)
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable'>('chargement')
  const [amis, setAmis] = useState<Ami[]>([])
  const [occupe, setOccupe] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [montant, setMontant] = useState(50)

  const estMoi = !!moi && !!p && moi.id === p.id

  useEffect(() => {
    if (!supabase || !slug) return
    let vivant = true
    ;(async () => {
      const { data } = await supabase.rpc('profil_public', { p_alias: slug })
      if (!vivant) return
      const ligne = Array.isArray(data) ? data[0] : data
      if (!ligne) {
        // ── LES ANCIENS LIENS CONTINUENT DE MARCHER ────────────────────
        // Avant le 17/10, l'adresse publique d'un joueur etait le slug de son
        // TABLEAU de Coupe du monde — /u/fan_7afaf2. Ces liens ont ete
        // partages. On retrouve donc le joueur par ce slug et on renvoie vers
        // son alias, plutot que d'afficher « introuvable » a quelqu'un qui
        // suit un lien parfaitement valide.
        const { data: vieux } = await supabase!
          .from('public_brackets').select('alias').eq('share_slug', slug).maybeSingle()
        const ancien = (vieux as { alias?: string } | null)?.alias
        if (!vivant) return
        if (ancien) { navigate(`/u/${ancien}`, { replace: true }); return }
        setEtat('introuvable'); return
      }
      setP(ligne as Profil)
      setEtat('pret')
    })()
    return () => { vivant = false }
  }, [slug])

  // La liste d'amis n'est lisible que par soi : elle ne sert donc qu'au
  // proprietaire de la page, et sur le profil d'autrui a savoir ou on en est
  // avec cette personne.
  const chargerAmis = async () => {
    if (!supabase || !moi) return
    const { data } = await supabase.rpc('mes_amis')
    setAmis((data ?? []) as Ami[])
  }
  useEffect(() => { void chargerAmis() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [moi?.id])

  const lien = p ? amis.find((a) => a.id === p.id) : undefined

  async function agir(fn: () => Promise<{ error: { message: string } | null }>, ok: string) {
    setOccupe(true); setMessage(null)
    const { error } = await fn()
    setOccupe(false)
    if (error) { setMessage(error.message); return }
    setMessage(ok)
    await chargerAmis()
  }

  const demander = () => agir(
    async () => await supabase!.from('amities').insert({ demandeur: moi!.id, destinataire: p!.id }),
    t('Request sent'))

  const repondre = (accepter: boolean) => agir(
    async () => await supabase!.rpc('repondre_ami', { p_demandeur: p!.id, p_accepter: accepter }),
    accepter ? t('Friend added') : t('Request declined'))

  const envoyer = () => agir(async () => {
    const r = await supabase!.rpc('envoyer_crampons', { p_destinataire: p!.id, p_montant: montant })
    if (!r.error) await rafraichirProfil()
    return r
  }, t('Crampons sent'))

  if (etat === 'chargement') {
    return <div className="max-w-3xl mx-auto px-5 py-16"><div className="h-40 rounded-3xl glass animate-pulse" /></div>
  }
  if (etat === 'introuvable' || !p) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">{t('Player not found')}</h1>
        <Link to="/leaderboard" className="mt-4 inline-block text-accent-gold underline">{t('Standings')}</Link>
      </div>
    )
  }

  const nb = (v: number) => Number(v ?? 0).toLocaleString(localeOf(lang))
  const taux = p.paris_total > 0 ? Math.round((p.gagnes / p.paris_total) * 100) : 0

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto px-5 py-10">
      {/* ── L'IDENTITE ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Avatar alias={p.alias} url={p.avatar_url} graine={p.id} taille={72} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold truncate">{p.alias}</h1>
          <div className="text-sm text-slate-500">
            {p.tier} · {t('member since')} {new Date(p.membre_depuis).toLocaleDateString(localeOf(lang), { month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* ── LES STATISTIQUES DE PRONOSTIQUEUR ──────────────────────────── */}
      <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          [t('Points'), nb(p.points)],
          [t('Rank'), `${nb(p.rang)} / ${nb(p.joueurs)}`],
          [t('Bets'), nb(p.paris_total)],
          [t('Won'), `${nb(p.gagnes)} · ${taux}%`],
        ] as const).map(([k, v]) => (
          <div key={k} className="glass rounded-2xl px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
            <div className="font-display text-xl leading-none tabular-nums mt-1.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="glass rounded-2xl px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{t('Streak')}</div>
          <div className="font-display text-xl leading-none tabular-nums mt-1.5">
            🔥 {nb(p.serie)} <span className="text-xs text-slate-500">· {t('best')} {nb(p.meilleure_serie)}</span>
          </div>
        </div>
        {/* ── LE GROUPE ───────────────────────────────────────────────────
            Un joueur n'en a qu'un : la regle a ete posee le 10/10 pour qu'il
            ne soit pas compte dans le taux de participation de quinze. */}
        <div className="glass rounded-2xl px-4 py-3 sm:col-span-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{t('Group')}</div>
          <div className="font-display text-xl leading-none mt-1.5 truncate">
            {p.groupe ?? <span className="text-slate-500 text-base">{t('No group yet')}</span>}
          </div>
        </div>
      </div>

      {/* ── CE QU'ON PEUT FAIRE AVEC CE JOUEUR ─────────────────────────── */}
      {moi && !estMoi && (
        <div className="mt-7 glass rounded-2xl p-4">
          {!lien && (
            <button onClick={demander} disabled={occupe}
              className="w-full px-4 py-2.5 rounded-xl bg-accent-gold text-ink-900 font-semibold disabled:opacity-40">
              {t('Add friend')}
            </button>
          )}
          {lien?.etat === 'en_attente' && lien.sens === 'envoyee' && (
            <div className="text-sm text-slate-500">{t('Friend request pending')}</div>
          )}
          {lien?.etat === 'en_attente' && lien.sens === 'recue' && (
            <div className="flex gap-2">
              <button onClick={() => repondre(true)} disabled={occupe}
                className="flex-1 px-4 py-2.5 rounded-xl bg-accent-gold text-ink-900 font-semibold disabled:opacity-40">
                {t('Accept')}
              </button>
              <button onClick={() => repondre(false)} disabled={occupe}
                className="px-4 py-2.5 rounded-xl glass glass-hover disabled:opacity-40">{t('Decline')}</button>
            </div>
          )}
          {lien?.etat === 'acceptee' && (
            <>
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                {t('Send crampons')}
              </div>
              <div className="flex items-center gap-2">
                <Jeton type="crampon" taille={16} />
                {/* Les bornes sont celles de la fonction serveur : 10 au
                    minimum, 500 par envoi. L'ecran ne fait que les rappeler —
                    c'est la base qui tranche, pas le navigateur. */}
                <input
                  type="number" min={10} max={500} step={10} value={montant}
                  onChange={(e) => setMontant(Math.max(10, Math.min(500, Number(e.target.value) || 10)))}
                  className="w-24 px-2 py-2 rounded-lg border border-slate-300/50 bg-transparent tabular-nums"
                />
                <button onClick={envoyer} disabled={occupe}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-accent-gold text-ink-900 font-semibold disabled:opacity-40">
                  {t('Send')}
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">{t('10 to 500 per transfer, 1000 per day.')}</div>
            </>
          )}
          {message && <div className="mt-3 text-sm text-accent-gold">{message}</div>}
        </div>
      )}

      {/* ── MES AMIS, sur ma propre page ───────────────────────────────── */}
      {estMoi && (
        <div className="mt-7">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-3">{t('Friends')}</h2>
          {amis.length === 0 ? (
            <div className="glass rounded-2xl px-4 py-5 text-sm text-slate-500">{t('No friends yet')}</div>
          ) : (
            <div className="space-y-2">
              {amis.map((a) => (
                <div key={a.id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                  <Avatar alias={a.alias} url={a.avatar_url} graine={a.id} taille={34} />
                  <Link to={`/u/${a.alias}`} className="font-semibold truncate flex-1 hover:text-accent-gold">{a.alias}</Link>
                  <span className="font-mono text-xs tabular-nums text-slate-500">{nb(a.points)}</span>
                  {a.etat === 'en_attente' && (
                    <span className="text-[10px] font-mono uppercase text-accent-gold">
                      {a.sens === 'recue' ? t('to accept') : t('pending')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-10"><Ad slot="profile-footer" /></div>
    </motion.div>
  )
}

export default PublicProfile
