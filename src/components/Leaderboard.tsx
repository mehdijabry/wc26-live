import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { supabase, type LeaderboardRow } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { SectionHeader } from './Groups'

const TIER_COLORS: Record<string, string> = {
  Rookie: 'text-slate-400',
  Amateur: 'text-blue-400',
  Pro: 'text-accent-green',
  Elite: 'text-accent-gold',
  Legend: 'text-yellow-300',
}

export function Leaderboard() {
  const { user } = useAuth()
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
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

  const sorted = [...rows].sort((a, b) =>
    tab === 'points' ? b.total_points - a.total_points : b.accuracy_pct - a.accuracy_pct
  )

  return (
    <section id="leaderboard" className="py-20 sm:py-28 border-t border-white/5">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="all bracketers"
          title="Leaderboard"
          sub="Live ranking of everyone who locked their picks. Scoring: 100 exact · 60 winner+gap · 30 winner · 20 total goals · 0 otherwise."
        />

        <div className="flex flex-wrap gap-2 mt-8 mb-6">
          {(['points', 'accuracy'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'px-4 py-1.5 rounded-full text-sm transition-all ' +
                (tab === t
                  ? 'bg-accent-gold text-ink-900 font-semibold'
                  : 'glass glass-hover text-slate-300')
              }
            >
              {t === 'points' ? 'Total points' : 'Accuracy %'}
            </button>
          ))}
        </div>

        {!supabase && (
          <div className="glass rounded-2xl p-6 text-center text-slate-400">
            Leaderboard unlocks once Supabase is configured. Add{' '}
            <code className="text-accent-gold">VITE_SUPABASE_URL</code> +{' '}
            <code className="text-accent-gold">VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>.
          </div>
        )}

        {supabase && loading && (
          <div className="glass rounded-2xl p-6 text-center text-slate-500">Loading…</div>
        )}

        {supabase && !loading && sorted.length === 0 && (
          <div className="glass rounded-2xl p-6 text-center text-slate-500">
            No bracketers yet. <span className="text-accent-gold">Sign in</span> to be first on the board.
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
                    <div className="font-display font-bold text-lg text-white tabular-nums">
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
