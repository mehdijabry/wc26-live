import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { Jeton } from './Jeton'
import { aimerPost, supprimerPost, type Post } from '../lib/posts'
import { localeOf, useLang, useT } from '../lib/i18n'
import { useAuth } from '../store/auth'
import { API_BASE } from '../lib/api'
import { ouvrirFacebook, partagerImage, peutPartagerFichier } from '../lib/partageSocial'

/**
 * LE TICKET GAGNANT — un pari gagné, publié sur le profil.
 *
 * ── CE QU'ON MONTRE, ET POURQUOI ──────────────────────────────────────────
 * Un ticket de bookmaker affiche une cote et un gain. Ça ne raconte rien :
 * le lecteur ne sait pas si c'était osé ou évident. Trois chiffres de plus
 * le disent, et nous sommes les seuls à les avoir :
 *
 *   · LA CHANCE IMPLICITE (1 / cote) — « 19 % de chances ». C'est l'audace
 *     du pari, dite dans la seule unité que tout le monde comprend.
 *   · LA PART DES PARIEURS qui avaient fait le même choix sur ce match —
 *     « 12 % l'avaient vu ». Un bookmaker ne peut pas l'écrire : il ne
 *     connaît pas les autres joueurs. Nous, si.
 *   · LE SCORE RÉEL de chaque match, figé à la publication.
 *
 * ── LE J'AIME EST OPTIMISTE ───────────────────────────────────────────────
 * Le cœur bascule au clic sans attendre le serveur, et le compteur suit.
 * Si la base refuse, on revient en arrière. Une double requête pour un cœur
 * se verrait sur un téléphone.
 */
export function PostPari({ post, onSupprime }: { post: Post; onSupprime?: (id: number) => void }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const moi = useAuth((s) => s.user)
  const [jaime, setJaime] = useState(post.jaime)
  const [compte, setCompte] = useState(post.jaimes)
  const [occupe, setOccupe] = useState(false)
  const [partage, setPartage] = useState<'repos' | 'rendu' | 'pret'>('repos')
  const [note, setNote] = useState<string | null>(null)

  const d = post.donnees
  const jambes = d?.jambes ?? []
  const nb = (v: number) => Number(v ?? 0).toLocaleString(localeOf(lang))
  const estMoi = !!moi && moi.id === post.auteur

  const basculer = async () => {
    if (!moi || occupe) return
    const vise = !jaime
    setJaime(vise); setCompte((n) => n + (vise ? 1 : -1)); setOccupe(true)
    const n = await aimerPost(post.id, vise)
    setOccupe(false)
    if (n === null) { setJaime(!vise); setCompte((v) => v + (vise ? -1 : 1)); return }
    setCompte(n)
  }

  /**
   * PARTAGER LE TICKET EN IMAGE.
   *
   * Le studio dessine une story 1080x1920 ; le worker la met en cache par
   * (post, langue) puisqu'un post ne change plus. Ensuite l'appareil décide :
   * feuille de partage native sur téléphone — d'où Facebook propose « Story »
   * — téléchargement sur ordinateur. On dit ce qui a vraiment eu lieu plutôt
   * que de promettre une story en un clic là où le navigateur n'en est pas
   * capable.
   */
  const partagerTicket = async () => {
    setPartage('rendu'); setNote(null)
    try {
      const r = await fetch(`${API_BASE}/ticket?post=${post.id}&lang=${lang}`)
      const j = await r.json() as { url?: string; error?: string }
      if (!j.url) { setPartage('repos'); setNote(t('Could not build the image.')); return }
      setPartage('pret')
      const res = await partagerImage(j.url, `pressing90-${post.id}.jpg`,
        `×${Number(d?.cote ?? 0).toFixed(2)} — pressing90.live/u/${post.alias}`)
      setNote(res === 'partage' ? null
        : res === 'telecharge' ? t('Image saved — post it as a story from your phone or Facebook.')
        : res === 'echec' ? t('Could not build the image.') : null)
    } catch {
      setPartage('repos'); setNote(t('Could not build the image.'))
    }
  }

  const supprimer = async () => {
    if (!estMoi) return
    setOccupe(true)
    const ok = await supprimerPost(post.id)
    setOccupe(false)
    if (ok) onSupprime?.(post.id)
  }

  return (
    <article className="glass rounded-2xl overflow-hidden">
      {/* ── L'EN-TÊTE : qui, et quand ──────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <Avatar alias={post.alias} url={post.avatar_url} graine={post.auteur} taille={30} />
        <Link to={`/u/${post.alias}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-accent-gold transition-colors">
          {post.alias}
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
          {new Date(post.created_at).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}
        </span>
        {estMoi && (
          <button onClick={() => void supprimer()} disabled={occupe}
            aria-label={t('Delete')}
            className="text-slate-500 hover:text-accent-red transition-colors text-xs px-1">×</button>
        )}
      </div>

      {/* ── LE VERDICT ET L'AUDACE ─────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-1 flex items-end gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-accent-green">{t('Bet won')}</div>
          <div className="font-display text-5xl leading-[0.9] tabular-nums text-accent-gold mt-1">
            ×{Number(d?.cote ?? 0).toFixed(2)}
          </div>
        </div>
        {d?.chance != null && (
          <div className="pb-1.5">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{t('odds said')}</div>
            <div className="font-display text-xl leading-none tabular-nums">{d.chance}%</div>
          </div>
        )}
      </div>

      {/* ── LES JAMBES, AVEC LEUR SCORE ET LEUR RARETÉ ─────────────────── */}
      <ul className="px-4 pt-2 space-y-2">
        {jambes.map((j, i) => (
          <li key={`${j.match_id}-${i}`} className="border-s-2 border-accent-green/40 ps-2.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="text-slate-500">{j.titre || j.match_id}</span>
                {j.score && <span className="ms-1.5 font-semibold tabular-nums">{j.score}</span>}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">
                {Number(j.cote).toFixed(2)}
              </span>
            </div>
            <div className="text-[12px] text-slate-500">
              {j.pick === 'draw' ? t('Draw') : j.pick}
              {j.part != null && (
                <span className="ms-1.5 text-accent-gold">
                  · {t('{n}% of bettors called it').replace('{n}', String(j.part))}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {post.legende && <p className="px-4 pt-3 text-sm">{post.legende}</p>}

      {/* ── L'ENGAGEMENT ET LE GAIN ────────────────────────────────────── */}
      <div className="mt-3 px-4 py-3 border-t border-slate-300/20 flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-slate-500">
          <Jeton type="crampon" taille={12} /> {nb(d?.mise ?? 0)}
        </span>
        <span className="text-slate-400">→</span>
        <span className="inline-flex items-center gap-1.5 font-display text-lg tabular-nums text-accent-violet">
          <Jeton type="pressing" taille={14} /> {nb(d?.gain ?? 0)}
        </span>

        {estMoi && (
          <>
            <button
              onClick={() => void partagerTicket()}
              disabled={partage === 'rendu'}
              className="ms-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass glass-hover text-slate-600 hover:text-slate-900 disabled:opacity-40"
              title={peutPartagerFichier() ? t('Share') : t('Download the image')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                <path d="M12 3v12m0-12 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" strokeLinecap="round" />
              </svg>
              <span className="font-mono text-[11px] uppercase tracking-wider">
                {partage === 'rendu' ? t('Building…') : t('Share')}
              </span>
            </button>
            <button
              onClick={() => ouvrirFacebook(`https://pressing90.live/u/${post.alias}`)}
              aria-label="Facebook"
              title="Facebook"
              className="inline-flex items-center justify-center w-8 h-8 rounded-xl glass glass-hover text-slate-600 hover:text-accent-blue"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.1H7.5v3h2.7V21h3.3Z" />
              </svg>
            </button>
          </>
        )}

        <button
          onClick={() => void basculer()}
          disabled={!moi}
          aria-pressed={jaime}
          aria-label={t('Like')}
          className={'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors ' +
            (estMoi ? '' : 'ms-auto ') +
            (jaime ? 'text-accent-red' : 'text-slate-500 hover:text-slate-800') +
            (moi ? ' glass-hover' : ' opacity-60 cursor-default')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={jaime ? 'currentColor' : 'none'}
               stroke="currentColor" strokeWidth="1.9" aria-hidden>
            <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8.3a3.8 3.8 0 0 1 7-1.5c0 4.8-7 13.2-7 13.2Z" strokeLinejoin="round" />
          </svg>
          <span className="font-mono text-xs tabular-nums">{nb(compte)}</span>
        </button>
      </div>

      {note && <p className="px-4 pb-3 text-[12px] text-slate-500">{note}</p>}
    </article>
  )
}

export default PostPari
