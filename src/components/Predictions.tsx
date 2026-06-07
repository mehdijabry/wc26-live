import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { matches } from '../data/matches'
import { teamByCode } from '../data/teams'
import { fmtDate, cn } from '../lib/utils'
import { usePredictions, shareLink } from '../store/predictions'
import { SectionHeader } from './Groups'

export function Predictions() {
  const [tab, setTab] = useState<'scores' | 'goalscorers' | 'lineups'>('scores')
  const groupMatches = useMemo(() => matches.filter((m) => m.stage === 'group').slice(0, 12), [])
  const { alias, setAlias, picks, setPick, clear } = usePredictions()
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  function onShare() {
    const url = shareLink(picks, alias || 'anonymous')
    setShareUrl(url)
    navigator.clipboard?.writeText(url)
  }

  const filled = Object.keys(picks).length
  const total = groupMatches.length

  return (
    <section id="predict" className="py-20 sm:py-28 border-t border-white/5">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="your bracket"
          title="Predict everything"
          sub="Scores, goalscorers, starting elevens, even yellow and red cards. Your picks save locally and you get a shareable link. v2 unlocks the global leaderboard via Supabase."
        />

        {/* Header */}
        <div className="mt-8 glass rounded-2xl p-5 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-[220px]">
            <label className="text-xs uppercase tracking-widest text-slate-500 font-mono">
              Your alias
            </label>
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="el10"
              className="bg-ink-900/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-gold/50 flex-1 max-w-[180px]"
            />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              <span className="text-white font-mono">{filled}</span> / {total} filled
            </span>
            <button
              onClick={onShare}
              disabled={filled === 0}
              className="px-4 py-1.5 rounded-full bg-accent-gold text-ink-900 text-sm font-semibold hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Share my bracket
            </button>
            <button
              onClick={clear}
              className="px-3 py-1.5 rounded-full glass glass-hover text-xs"
            >
              Reset
            </button>
          </div>
        </div>

        {shareUrl && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 glass rounded-xl px-4 py-3 text-xs text-slate-400 break-all"
          >
            <span className="text-accent-green font-mono">✓ Copied to clipboard:</span>{' '}
            {shareUrl}
          </motion.div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mt-8 mb-6">
          {(['scores', 'goalscorers', 'lineups'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 rounded-full text-sm transition-all',
                tab === t
                  ? 'bg-white text-ink-900 font-semibold'
                  : 'glass glass-hover text-slate-300'
              )}
            >
              {t === 'scores' ? '⚽️ Scores' : t === 'goalscorers' ? '🎯 Goalscorers' : '👕 Starting XI'}
            </button>
          ))}
        </div>

        {tab === 'scores' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groupMatches.map((m) => {
              const home = teamByCode(m.home)
              const away = teamByCode(m.away)
              const pick = picks[m.id]
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="glass glass-hover rounded-xl p-4"
                >
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
                    Group {m.group} · {fmtDate(m.kickoffUTC, { hour: undefined, minute: undefined, weekday: undefined })}
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                    <div className="text-right">
                      <div className="text-xs text-slate-500">{home?.name ?? m.home}</div>
                      <div className="text-2xl mt-1">{home?.flag ?? '🏳️'}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Stepper
                        value={pick?.homeScore ?? 0}
                        onChange={(v) => setPick({ matchId: m.id, homeScore: v, awayScore: pick?.awayScore ?? 0, ts: Date.now() })}
                      />
                      <span className="text-slate-600">:</span>
                      <Stepper
                        value={pick?.awayScore ?? 0}
                        onChange={(v) => setPick({ matchId: m.id, homeScore: pick?.homeScore ?? 0, awayScore: v, ts: Date.now() })}
                      />
                    </div>
                    <div className="text-left">
                      <div className="text-xs text-slate-500">{away?.name ?? m.away}</div>
                      <div className="text-2xl mt-1">{away?.flag ?? '🏳️'}</div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {tab === 'goalscorers' && (
          <div className="glass rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">🎯</div>
            <div className="font-display text-xl mb-1">Goalscorer predictions</div>
            <div className="text-slate-500 text-sm max-w-md mx-auto">
              Pick which players will score in each match. Worth 25 points per correct pick.
              Coming with Supabase player rosters in Phase 2.
            </div>
          </div>
        )}

        {tab === 'lineups' && (
          <div className="glass rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">👕</div>
            <div className="font-display text-xl mb-1">Starting XI</div>
            <div className="text-slate-500 text-sm max-w-md mx-auto">
              Predict the 11 starters per match. 5 pts per correct name (up to 55 / match).
              Lineups confirmed ~1h before kickoff via Sofascore.
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { v: '50', l: 'exact score' },
            { v: '25', l: 'scorer' },
            { v: '10', l: 'card pick' },
            { v: '5', l: 'starter' },
          ].map((p) => (
            <div key={p.l} className="glass rounded-xl p-4">
              <div className="font-display font-bold text-2xl text-accent-gold">{p.v}</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">
                pts {p.l}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 bg-ink-900/60 rounded-lg px-2 py-1">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-6 h-6 rounded-md text-slate-400 hover:bg-white/10 transition-colors"
      >
        −
      </button>
      <span className="font-display font-bold text-2xl text-white w-6 text-center tabular-nums">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(9, value + 1))}
        className="w-6 h-6 rounded-md text-slate-400 hover:bg-white/10 transition-colors"
      >
        +
      </button>
    </div>
  )
}
