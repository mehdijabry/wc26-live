import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { JETON, POINT, PALIER } from '../lib/jeu'
import { Jeton } from './Jeton'
import Avatar from './Avatar'
import { localeOf, useLang, useT } from '../lib/i18n'
import { supabase, type LeaderboardRow } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { SectionHeader } from './Groups'

const TIER_COLORS: Record<string, string> = {
  Rookie: 'text-slate-600',
  Amateur: 'text-blue-400',
  Pro: 'text-accent-green',
  Elite: 'text-accent-gold',
  Legend: 'text-yellow-300',
}

/**
 * Le classement général.
 *
 * `niveau` et `titre` existent parce que ce bloc sert à deux endroits : seul
 * sur son ancienne page, et comme dernière section du hub /board, où le h1
 * est déjà pris. Deux h1 sur une page, c'est une page sans titre.
 */
export function Leaderboard({
  niveau = 1,
  titre = 'Leaderboard',
}: {
  niveau?: 1 | 2
  titre?: string
} = {}) {
  const { user } = useAuth()
  // Les nombres suivent la langue affichée. Ils étaient figés en « fr-FR »,
  // ce qui écrivait « 7 500 » au milieu d'une phrase anglaise.
  const lang = useLang((s) => s.lang)
  const t = useT()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  // Les brackets du Mondial ont quitté cette page — ils étaient l'onglet
  // PAR DÉFAUT, donc la première chose qu'on voyait en cliquant « Table »
  // était un pronostic de Coupe du monde, trois mois après la finale. Ils
  // sont désormais sur /bracket, avec le reste de l'archive, via le
  // composant BracketsPublies. Rien n'est supprimé.
  const [tab, setTab] = useState<'points' | 'accuracy'>('points')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    ;(async () => {
      const { data } = await supabase.from('leaderboard').select('*').limit(50)
      setRows((data as LeaderboardRow[]) ?? [])
      setLoading(false)
    })()
  }, [])

    // LE CLASSEMENT SE JOUE SUR LES POINTS, PAS SUR LE SOLDE.
    //
    // Il triait sur les pressings, c'est-à-dire un solde — qui monte, qui
    // descend avec les pénalités de palier, et qu'on gonfle en réclamant
    // chaque jour sans jamais parier. Un solde n'est pas un mérite.
    //
    // Un point se gagne en GAGNANT un pari — mise × 10 × min(cote, 5) — et
    // ne se reperd jamais. `total_points` reste pour l'archive du Mondial,
    // les pressings restent la monnaie. Voir la migration 012.
    const sorted = [...rows].sort((a, b) =>
      tab === 'points'
        ? Number(b.ranking_points ?? 0) - Number(a.ranking_points ?? 0)
        : b.accuracy_pct - a.accuracy_pct
    )

  return (
    <section
      id="leaderboard"
      className={
        niveau === 1
          ? 'py-20 sm:py-28 border-t border-slate-200/70'
          : 'mt-12 pt-8 border-t border-slate-200/70 pb-16'
      }
    >
      <div className={niveau === 1 ? 'container max-w-6xl mx-auto px-6' : ''}>
        <SectionHeader
          niveau={niveau}
          eyebrow={t('every player')}
          title={titre}
          sub={t('Live ranking of everyone backing their calls. You stake {jeton}, you win {point} at the real odds — {palier} {point} unlock {prix}.')
            .replace('{jeton}', t(JETON.plusieurs))
            .replace('{palier}', PALIER.points.toLocaleString(localeOf(lang)))
            .replace('{prix}', PALIER.recompense)
            .replaceAll('{point}', t(POINT.plusieurs))}
        />

        <div className="flex flex-wrap gap-2 mt-8 mb-6">
          {(['points', 'accuracy'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'px-4 py-1.5 rounded-sm text-sm transition-all ' +
                (tab === t
                  ? 'bg-accent-gold text-ink-900 font-semibold'
                  : 'glass glass-hover text-slate-700')
              }
            >
              {t === 'points' ? (
                <span className="flex items-center gap-1.5">
                  <Jeton type="pressing" taille={12} />
                  {POINT.plusieurs}
                </span>
              ) : (
                'Accuracy %'
              )}
            </button>
          ))}
        </div>

        {!supabase && (
          <div className="glass rounded-2xl p-6 text-center text-slate-600">
            Leaderboard unlocks once Supabase is configured. Add{' '}
            <code className="text-accent-gold">VITE_SUPABASE_URL</code> +{' '}
            <code className="text-accent-gold">VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.
          </div>
        )}

        {supabase && loading && (
          <div className="glass rounded-2xl p-6 text-center text-slate-500">Loading…</div>
        )}


        {/* Points / Accuracy tabs — match-by-match predictions */}
        {supabase && !loading && sorted.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-slate-500">
            {/* Le classement est vide tant que personne n'a gagné de
                pressings — c'est le cas au lancement. Une page vide sans
                explication ressemble à une panne : on dit ce qui manque et
                où aller le chercher. */}
            {user ? (
              <>
                Nobody has won any {POINT.plusieurs} yet.{' '}
                <Link to="/predictions" className="text-accent-gold underline">
                  Back a result
                </Link>{' '}
                and you could be first on this table.
              </>
            ) : (
              <>
                Nobody has won any {POINT.plusieurs} yet.{' '}
                <Link to="/predictions" className="text-accent-gold underline">
                  Sign in and back a result
                </Link>{' '}
                to be first.
              </>
            )}
          </div>
        )}

        {sorted.length > 0 && (
          <div className="space-y-1.5">
            {sorted.map((row, idx) => {
              const isMe = user?.id === row.id
              return (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.02 }}
                  className={
                    'glass glass-hover rounded-xl px-4 py-3 flex items-center gap-4 ' +
                    (isMe ? 'ring-1 ring-accent-gold/40' : '')
                  }
                >
                  <span className="font-mono text-xs text-slate-500 w-8 tabular-nums">
                    #{idx + 1}
                  </span>
                  <Avatar alias={row.alias} url={row.avatar_url} graine={row.id} taille={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-2">
                      {row.alias}
                      {isMe && <span className="text-[10px] font-mono text-accent-gold">you</span>}
                    </div>
                    <div className={`text-[10px] font-mono mt-0.5 ${TIER_COLORS[row.tier]}`}>
                      {row.tier} · {row.resolved_predictions} picks
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-lg text-slate-900 tabular-nums">
                      {tab === 'points' ? Number(row.ranking_points ?? 0).toLocaleString(localeOf(lang)) : `${row.accuracy_pct}%`}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {tab === 'points' ? 'pts' : 'accuracy'}
                    </div>
                  </div>
                  <div className="hidden sm:flex flex-col items-end text-[10px] font-mono text-slate-500">
                    <span>🔥 {row.current_streak}</span>
                    <span>★ {row.best_streak}</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
