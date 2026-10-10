import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useT } from '../lib/i18n'

/**
 * Les brackets du Mondial 2026 publiés par les joueurs.
 *
 * Cette liste vivait sur /board, et c'était son ONGLET PAR DÉFAUT : la
 * première chose qu'on voyait en cliquant « Table » dans la navigation
 * était donc un pronostic de Coupe du monde, trois mois après la finale.
 * Elle a sa place ici, avec le reste de l'archive — pas en tête du
 * classement du jeu vivant.
 *
 * Rien n'est supprimé : les brackets restent publiés, leurs adresses
 * /u/:slug restent valides et indexées. Ils changent seulement de page.
 */

type BracketPublie = {
  user_id: string
  alias: string
  share_slug: string
  final_winner: string | null
  third_place_winner: string | null
  updated_at?: string
}

export function BracketsPublies() {
  const { user } = useAuth()
  const t = useT()
  const [brackets, setBrackets] = useState<BracketPublie[] | null>(null)

  useEffect(() => {
    if (!supabase) {
      setBrackets([])
      return
    }
    void supabase
      .from('public_brackets')
      .select('user_id,alias,share_slug,final_winner,third_place_winner,updated_at')
      .limit(100)
      .then(({ data }) => setBrackets((data as BracketPublie[]) ?? []))
  }, [])

  // Rien à montrer : on n'affiche pas une section vide sur une page
  // d'archive, ça ne ferait qu'allonger le défilement.
  if (!brackets || brackets.length === 0) return null

  return (
    <section className="container max-w-6xl mx-auto px-6 py-12 border-t border-slate-200/70">
      <div className="text-xs uppercase tracking-widest text-accent-gold font-mono mb-2">
        {t('World Cup 2026 archive')}
      </div>
      <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
        {t('Published brackets')}
      </h2>
      <p className="mt-2 text-slate-600 max-w-2xl">
        {t('Who called the 2026 World Cup, and how it actually went. Open one to read the full bracket.')}
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {brackets.map((b, i) => {
          const amoi = user?.id === b.user_id
          return (
            <Link
              key={b.user_id}
              to={`/u/${b.share_slug}`}
              className={
                'glass glass-hover rounded-xl p-4 block transition-transform hover:-translate-y-0.5 ' +
                (amoi ? 'ring-1 ring-accent-gold/50' : '')
              }
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-[10px] text-slate-500">#{i + 1}</span>
                <Avatar alias={b.alias} url={(b as { avatar_url?: string | null }).avatar_url} taille={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-display font-bold truncate flex items-center gap-2">
                    {b.alias}
                    {amoi && <span className="text-[10px] font-mono text-accent-gold">{t('you')}</span>}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">/u/{b.share_slug}</div>
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-widest text-accent-gold font-mono mt-3">
                {t('Their champion')}
              </div>
              <div className="font-display font-bold text-base">{b.final_winner ?? '—'}</div>
              {b.third_place_winner && (
                <div className="text-[11px] text-slate-500 mt-1">
                  {t('3rd')}: {b.third_place_winner}
                </div>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
