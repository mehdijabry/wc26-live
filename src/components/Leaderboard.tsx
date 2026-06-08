import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type LeaderboardRow } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { SectionHeader } from './Groups'

type PublishedBracket = {
  user_id: string
  alias: string
  share_slug: string
  final_winner: string | null
  third_place_winner: string | null
  updated_at?: string
}

const TIER_COLORS: Record<string, string> = {
  Rookie: 'text-slate-600',
  Amateur: 'text-blue-400',
  Pro: 'text-accent-green',
  Elite: 'text-accent-gold',
  Legend: 'text-yellow-300',
}

export function Leaderboard() {
  const { user } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [brackets, setBrackets] = useState<PublishedBracket[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'brackets' | 'points' | 'accuracy'>('brackets')

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    ;(async () => {
      // Pull both data sources in parallel — points/accuracy leaderboard
      // for match-by-match predictions, AND the public_brackets view for
      // anyone who hit "Publish" on their full-tournament bracket. Was
      // only querying `leaderboard` before, so the user's published
      // bracket had no surface to appear on.
      const [lbRes, brRes] = await Promise.all([
        supabase.from('leaderboard').select('*').limit(50),
        supabase.from('public_brackets').select('user_id,alias,share_slug,final_winner,third_place_winner,updated_at').limit(100),
      ])
      setRows((lbRes.data as LeaderboardRow[]) ?? [])
      setBrackets((brRes.data as PublishedBracket[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const sorted = [...rows].sort((a, b) =>
    tab === 'points' ? b.total_points - a.total_points : b.accuracy_pct - a.accuracy_pct
  )

  return (
    <section id="leaderboard" className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="all bracketers"
          title="Leaderboard"
          sub="Live ranking of everyone who locked their picks. Scoring: 100 exact · 60 winner+gap · 30 winner · 20 total goals · 0 otherwise."
        />

        <div className="flex flex-wrap gap-2 mt-8 mb-6">
          {(['brackets', 'points', 'accuracy'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'px-4 py-1.5 rounded-full text-sm transition-all ' +
                (tab === t
                  ? 'bg-accent-gold text-ink-900 font-semibold'
                  : 'glass glass-hover text-slate-700')
              }
            >
              {t === 'brackets' ? `Published brackets (${brackets.length})` : t === 'points' ? 'Total points' : 'Accuracy %'}
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

        {/* Brackets tab — list every public bracket someone has published */}
        {supabase && !loading && tab === 'brackets' && (
          brackets.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-slate-500">
              {user ? (
                <>
                  No published brackets yet. <Link to="/bracket" className="text-accent-gold underline">Publish yours</Link> to be first.
                </>
              ) : (
                <>
                  No published brackets yet. <span className="text-accent-gold">Sign in</span> to be first.
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {brackets.map((b, idx) => {
                const isMine = user?.id === b.user_id
                return (
                  <Link
                    key={b.user_id}
                    to={`/u/${b.share_slug}`}
                    className={
                      'glass glass-hover rounded-xl p-4 block transition-transform hover:-translate-y-0.5 ' +
                      (isMine ? 'ring-1 ring-accent-gold/50' : '')
                    }
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono text-[10px] text-slate-500">#{idx + 1}</span>
                      <span className="w-8 h-8 rounded-full bg-accent-gold/15 text-accent-gold flex items-center justify-center font-bold text-sm">
                        {b.alias.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-display font-bold truncate flex items-center gap-2">
                          {b.alias}
                          {isMine && <span className="text-[10px] font-mono text-accent-gold">you</span>}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          /u/{b.share_slug}
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-accent-gold font-mono mt-3">Their champion</div>
                    <div className="font-display font-bold text-base">
                      {b.final_winner ?? '—'}
                    </div>
                    {b.third_place_winner && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        3rd: {b.third_place_winner}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        )}

        {/* Points / Accuracy tabs — match-by-match predictions */}
        {supabase && !loading && tab !== 'brackets' && sorted.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-slate-500">
            {user ? (
              <>
                No predictions scored yet. <Link to="/predict" className="text-accent-gold underline">Make picks on individual matches</Link> to climb the rankings once results come in.
              </>
            ) : (
              <>
                No predictions yet. <span className="text-accent-gold">Sign in</span> to start.
              </>
            )}
          </div>
        )}

        {tab !== 'brackets' && sorted.length > 0 && (
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
                  <span className="w-8 h-8 rounded-full bg-accent-gold/15 text-accent-gold flex items-center justify-center font-bold text-sm">
                    {row.alias.slice(0, 1).toUpperCase()}
                  </span>
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
                      {tab === 'points' ? row.total_points : `${row.accuracy_pct}%`}
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
