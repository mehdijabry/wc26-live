import { motion, AnimatePresence } from 'framer-motion'
import { useMemo, useState } from 'react'
import { players, computeRating, type Player, type Position } from '../data/players'
import { teamByCode } from '../data/teams'
import { getClubLogo } from '../data/clubLogos'
import { cn } from '../lib/utils'
import { SectionHeader } from './Groups'

const POSITIONS: Position[] = ['ATT', 'MID', 'DEF', 'GK']

export function Players() {
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL')
  const [selected, setSelected] = useState<Player | null>(null)

  const filtered = useMemo(() => {
    const list = filter === 'ALL' ? players : players.filter((p) => p.position === filter)
    return list
      .map((p) => ({ p, rating: computeRating(p) }))
      .sort((a, b) => b.rating.score - a.rating.score)
  }, [filter])

  return (
    <section id="players" className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="every starter"
          title="Player Lab"
          sub="Each player, club, minutes, goals, season form — plus a WC26 Live Score (0-100) that weighs consistency, position-weighted output, recent form, and availability. Updates daily."
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mt-8 mb-6">
          {(['ALL', ...POSITIONS] as const).map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm transition-all',
                filter === p
                  ? 'bg-accent-gold text-ink-900 font-semibold'
                  : 'glass glass-hover text-slate-700'
              )}
            >
              {p === 'ALL' ? 'All players' : p}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(({ p, rating }, idx) => {
            const team = teamByCode(p.teamCode)
            return (
              <motion.button
                key={p.id}
                onClick={() => setSelected(p)}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: idx * 0.03 }}
                className="glass glass-hover rounded-2xl p-5 text-left group relative overflow-hidden"
              >
                {/* Rating badge */}
                <div className="absolute top-3 right-3 text-right">
                  <div className={cn('font-display font-bold text-3xl', rating.tierColor)}>
                    {rating.score}
                  </div>
                  <div className={cn('text-[10px] font-mono mt-0.5', rating.tierColor)}>
                    {rating.tier}
                  </div>
                </div>

                {/* Subtle confederation accent on player card */}
                {p.teamCode === 'MAR' && (
                  <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-red-600 via-yellow-500 to-green-700 rounded-l-2xl opacity-80" />
                )}

                {/* Header */}
                <div className="flex items-start gap-3 mb-4 pr-16">
                  <div className="text-4xl">{team?.flag ?? '🏳️'}</div>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-lg leading-tight truncate">
                      {p.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      #{p.shirtNumber} · {p.position} · {p.age}y
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-600 mb-3 flex items-center gap-2 truncate">
                  {getClubLogo(p.clubName) ? (
                    <img
                      src={getClubLogo(p.clubName)!}
                      alt=""
                      loading="lazy"
                      className="w-5 h-5 object-contain"
                      onError={(e) => ((e.currentTarget.style.display = 'none'))}
                    />
                  ) : (
                    <span>⚽️</span>
                  )}
                  <span className="truncate">
                    {p.clubName} <span className="text-slate-600">·</span> {p.clubLeague}
                  </span>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-4 gap-2">
                  <Kpi label="MP" value={p.season.matches} />
                  <Kpi label="G" value={p.season.goals} hl={p.position === 'ATT'} />
                  <Kpi label="A" value={p.season.assists} hl={p.position === 'MID' || p.position === 'ATT'} />
                  <Kpi label="⭐" value={p.season.avgRating.toFixed(1)} />
                </div>

                {/* Form sparkline */}
                <div className="mt-4 flex items-end gap-0.5 h-6">
                  {p.formLast5.map((r, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${Math.max(10, (r / 10) * 100)}%`,
                        background:
                          r >= 8 ? '#00a651' : r >= 7 ? '#d4af37' : r >= 6 ? '#3d4154' : '#e63946',
                      }}
                      title={`Match ${i + 1}: ${r.toFixed(1)}`}
                    />
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-slate-600 font-mono">last 5 matches</div>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <PlayerModal player={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </section>
  )
}

function Kpi({ label, value, hl }: { label: string; value: number | string; hl?: boolean }) {
  return (
    <div className={cn('rounded-md bg-slate-50 px-2 py-1.5 text-center', hl && 'bg-accent-gold/10')}>
      <div className={cn('font-display font-bold text-base', hl && 'text-accent-gold')}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

function PlayerModal({ player, onClose }: { player: Player; onClose: () => void }) {
  const team = teamByCode(player.teamCode)
  const rating = computeRating(player)
  const s = player.season

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 ring-glow"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className="text-6xl">{team?.flag ?? '🏳️'}</div>
            <div>
              <div className="text-xs uppercase tracking-widest text-accent-gold font-mono">
                #{player.shirtNumber} · {player.position}
              </div>
              <div className="font-display font-bold text-3xl mt-1">{player.name}</div>
              <div className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                {team?.name} <span className="text-slate-600">·</span>
                {getClubLogo(player.clubName) && (
                  <img
                    src={getClubLogo(player.clubName)!}
                    alt=""
                    className="w-5 h-5 object-contain"
                  />
                )}
                {player.clubName} ({player.clubLeague})
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {player.age}y · {player.height}cm · {player.preferredFoot === 'L' ? 'Left foot' : player.preferredFoot === 'R' ? 'Right foot' : 'Both feet'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 text-xl w-8 h-8 rounded-full hover:bg-slate-200 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Rating spotlight */}
        <div className="glass rounded-2xl p-6 text-center mb-6">
          <div className="text-xs uppercase tracking-widest text-slate-500 font-mono mb-2">
            WC26 Live Score
          </div>
          <div className={cn('font-display font-bold text-7xl', rating.tierColor)}>
            {rating.score}
          </div>
          <div className={cn('text-sm mt-1 font-mono', rating.tierColor)}>{rating.tier}</div>
        </div>

        {/* Season stats grid */}
        <div className="text-xs uppercase tracking-widest text-slate-500 font-mono mb-3">
          Club season
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
          <StatBig label="Matches" value={s.matches} />
          <StatBig label="Starts" value={s.starts} />
          <StatBig label="Minutes" value={s.minutes.toLocaleString()} />
          <StatBig label="Avg rating" value={s.avgRating.toFixed(2)} highlight />
          <StatBig label="Goals" value={s.goals} highlight={player.position === 'ATT'} />
          <StatBig label="Assists" value={s.assists} highlight={['ATT', 'MID'].includes(player.position)} />
          <StatBig label="Yellows" value={s.yellows} />
          <StatBig label="Reds" value={s.reds} negative />
        </div>

        {/* Position-specific stats */}
        {(s.keyPasses || s.tackles || s.shots) && (
          <>
            <div className="text-xs uppercase tracking-widest text-slate-500 font-mono mb-3">
              Specialty
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
              {s.shots != null && <StatBig label="Shots" value={s.shots} />}
              {s.keyPasses != null && <StatBig label="Key passes" value={s.keyPasses} />}
              {s.tackles != null && <StatBig label="Tackles" value={s.tackles} />}
              {s.clearances != null && <StatBig label="Clearances" value={s.clearances} />}
              {s.interceptions != null && <StatBig label="Interceptions" value={s.interceptions} />}
            </div>
          </>
        )}

        {/* Form curve */}
        <div className="text-xs uppercase tracking-widest text-slate-500 font-mono mb-3">
          Form — last 5 matches
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-end gap-1.5 h-24">
            {player.formLast5.map((r, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-xs font-mono text-slate-600">{r.toFixed(1)}</div>
                <div
                  className="w-full rounded"
                  style={{
                    height: `${(r / 10) * 80}px`,
                    background:
                      r >= 8 ? 'linear-gradient(180deg, #00a651, #007a3a)' :
                      r >= 7 ? 'linear-gradient(180deg, #d4af37, #aa8a25)' :
                      r >= 6 ? '#3d4154' : '#e63946',
                  }}
                />
                <div className="text-[10px] text-slate-600 font-mono">M{i + 1}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-3 font-mono">
            5-match avg:{' '}
            <span className="text-slate-900">
              {(player.formLast5.reduce((a, b) => a + b, 0) / player.formLast5.length).toFixed(2)}
            </span>{' '}
            · trend {trendIndicator(player.formLast5)}
          </div>
        </div>

        <div className="mt-6 text-[10px] text-slate-600 font-mono text-center">
          Sources: club fixtures (mock v1 · Sofascore v2). WC26 Live Score is computed by our model.
        </div>
      </motion.div>
    </motion.div>
  )
}

function StatBig({ label, value, highlight, negative }: { label: string; value: number | string; highlight?: boolean; negative?: boolean }) {
  return (
    <div className="glass rounded-xl p-3 text-center">
      <div
        className={cn(
          'font-display font-bold text-2xl tabular-nums',
          highlight && 'text-accent-gold',
          negative && Number(value) > 0 && 'text-accent-red'
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">{label}</div>
    </div>
  )
}

function trendIndicator(arr: number[]) {
  if (arr.length < 2) return '·'
  const first = arr.slice(0, Math.floor(arr.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(arr.length / 2)
  const last = arr.slice(Math.floor(arr.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(arr.length / 2)
  const diff = last - first
  if (diff > 0.3) return '↑ rising'
  if (diff < -0.3) return '↓ slumping'
  return '→ stable'
}
