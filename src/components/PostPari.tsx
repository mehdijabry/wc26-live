import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { Jeton } from './Jeton'
import { aimerPost, supprimerPost, type Post } from '../lib/posts'
import { localeOf, useLang, useT } from '../lib/i18n'
import { useAuth } from '../store/auth'
import { API_BASE } from '../lib/api'
import { ouvrirFacebook, partagerImage, peutPartagerFichier, telechargerImage } from '../lib/partageSocial'

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
  /**
   * L'IMAGE DU TICKET, celle-la meme qui part en story.
   *
   * `null` tant qu'on ne sait pas, `false` quand le rendu a echoue : on
   * garde alors la version HTML, qui dit exactement la meme chose. Une
   * carte vide parce que le studio dort serait pire que pas d'image du
   * tout — et le studio sur 0,1 CPU dort souvent.
   */
  const [image, setImage] = useState<string | null | false>(null)
  const [menu, setMenu] = useState(false)

  const d = post.donnees
  const jambes = d?.jambes ?? []
  const nb = (v: number) => Number(v ?? 0).toLocaleString(localeOf(lang))
  const estMoi = !!moi && moi.id === post.auteur

  // Le rendu est mis en cache par le worker sur (post, langue) : une visite
  // de profil ne relance pas un dessin, elle resservit une URL.
  useEffect(() => {
    let vivant = true
    void fetch(`${API_BASE}/ticket?post=${post.id}&lang=${lang}`)
      .then((r) => r.json())
      .then((j: { url?: string }) => { if (vivant) setImage(j.url || false) })
      .catch(() => { if (vivant) setImage(false) })
    return () => { vivant = false }
  }, [post.id, lang])

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
  /**
   * PARTAGER LE TICKET.
   *
   * Trois chemins, parce que le navigateur n'en offre pas trois partout :
   *
   *   · 'appareil' — `navigator.share({files})`. SEUL vrai chemin vers une
   *     story : la feuille de partage du systeme, d'ou Facebook et Instagram
   *     proposent « Story ». N'existe que sur telephone.
   *   · 'facebook' — le partage de LIEN. Facebook ne prend pas d'image par
   *     URL : il lit les balises Open Graph de la page pointee, d'ou
   *     /p/<id>, qui porte le ticket en `og:image`.
   *   · 'fichier'  — l'image dans les telechargements, a publier a la main.
   *
   * On ne promet jamais une story en un clic la ou le navigateur ne sait pas
   * la faire : la note dit ce qui a reellement eu lieu.
   */
  const lienPost = `https://pressing90.live/p/${post.id}`

  const urlTicket = async (): Promise<string | null> => {
    if (image) return image
    try {
      const r = await fetch(`${API_BASE}/ticket?post=${post.id}&lang=${lang}`)
      const j = await r.json() as { url?: string }
      if (j.url) { setImage(j.url); return j.url }
    } catch { /* on le dira plus bas */ }
    return null
  }

  const partagerTicket = async (ou: 'appareil' | 'facebook' | 'fichier') => {
    setMenu(false); setNote(null)
    if (ou === 'facebook') { ouvrirFacebook(lienPost); return }

    setPartage('rendu')
    const u = await urlTicket()
    setPartage('repos')
    if (!u) { setNote(t('Could not build the image.')); return }

    if (ou === 'fichier') {
      const ok = await telechargerImage(u, `pressing90-${post.id}.jpg`)
      setNote(ok ? t('Image saved — post it as a story from your phone or Facebook.')
                 : t('Could not build the image.'))
      return
    }
    const res = await partagerImage(u, `pressing90-${post.id}.jpg`, `×${Number(d?.cote ?? 0).toFixed(2)} — ${lienPost}`)
    setNote(res === 'telecharge' ? t('Image saved — post it as a story from your phone or Facebook.')
      : res === 'echec' ? t('Could not build the image.') : null)
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

      {/* ── LE TICKET ─────────────────────────────────────────────────
          L'image dessinee par le studio quand elle est prete — c'est la meme
          qui part en story, donc ce que le joueur voit ici est exactement ce
          qu'il partagera. Tant qu'elle n'est pas revenue, et pour toujours si
          le rendu echoue, la carte HTML ci-dessous dit la meme chose. */}
      {image ? (
        <a href={image} target="_blank" rel="noopener noreferrer" className="block mt-3">
          <img
            src={image}
            alt={`×${Number(d?.cote ?? 0).toFixed(2)}`}
            loading="lazy"
            className="w-full max-h-[560px] object-contain bg-ink-900"
          />
        </a>
      ) : image === null ? (
        <div className="mt-3 h-[320px] glass animate-pulse" />
      ) : (
        <>
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
        </>
      )}

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
          <div className="relative ms-auto">
            <button
              onClick={() => setMenu((v) => !v)}
              disabled={partage === 'rendu'}
              aria-expanded={menu}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl glass glass-hover text-slate-600 hover:text-slate-900 disabled:opacity-40"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                <path d="M12 3v12m0-12 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" strokeLinecap="round" />
              </svg>
              <span className="font-mono text-[11px] uppercase tracking-wider">
                {partage === 'rendu' ? t('Building…') : t('Share')}
              </span>
            </button>

            {menu && (
              <>
                <div className="fixed inset-0 z-[58]" onClick={() => setMenu(false)} />
                {/* Le menu dit QUOI chaque choix fait. « Partager » tout court
                    ne promet rien de verifiable : sur ordinateur il n'y a pas
                    de feuille de partage, et Facebook n'accepte pas d'image
                    par URL. */}
                <div className="absolute end-0 bottom-full mb-2 z-[59] w-60 glass rounded-2xl p-1.5 ring-glow">
                  <button
                    onClick={() => void partagerTicket('facebook')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass-hover text-start text-sm"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-accent-blue shrink-0" aria-hidden>
                      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.1H7.5v3h2.7V21h3.3Z" />
                    </svg>
                    Facebook
                  </button>
                  {peutPartagerFichier() && (
                    <button
                      onClick={() => void partagerTicket('appareil')}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass-hover text-start text-sm"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="shrink-0" aria-hidden>
                        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                        <path d="M11 18.5h2" strokeLinecap="round" />
                      </svg>
                      {t('Story — share from my phone')}
                    </button>
                  )}
                  <button
                    onClick={() => void partagerTicket('fichier')}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass-hover text-start text-sm"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="shrink-0" aria-hidden>
                      <path d="M12 3v11m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
                    </svg>
                    {t('Download the image')}
                  </button>
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(lienPost)
                      setMenu(false); setNote(t('Link copied'))
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl glass-hover text-start text-sm"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="shrink-0" aria-hidden>
                      <path d="M10 14a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.4 7" strokeLinecap="round" />
                      <path d="M14 10a4 4 0 0 0-5.7 0L5.5 12.8a4 4 0 0 0 5.7 5.7l1.4-1.4" strokeLinecap="round" />
                    </svg>
                    {t('Copy link')}
                  </button>
                </div>
              </>
            )}
          </div>
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
