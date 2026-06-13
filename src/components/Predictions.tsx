import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { matches } from '../data/matches'
import { teamByCode } from '../data/teams'
import { fmtDate, cn } from '../lib/utils'
import { usePredictions, shareLink } from '../store/predictions'
import { SectionHeader } from './Groups'
import { MoroccoOdds } from './AtlasLions'

export function Predictions() {
  // All 72 group-stage matches, grouped A..L so the UI stays navigable
  // (was previously slice(0,12) — only the opening matchday — which
  // hid 60 fixtures from the picker).
  const groupedMatches = useMemo(() => {
    const all = matches.filter((m) => m.stage === 'group')
    const out: Array<{ group: string; ms: typeof all }> = []
    const letters = ['A','B','C','D','E','F','G','H','I','J','K','L']
    for (const g of letters) {
      const ms = all.filter((m) => m.group === g)
      if (ms.length) out.push({ group: g, ms })
    }
    return out
  }, [])
  const totalMatches = groupedMatches.reduce((acc, g) => acc + g.ms.length, 0)
  const [activeGroup, setActiveGroup] = useState<string>('A')
  const { alias, setAlias, picks, setPick, clear } = usePredictions()
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  function onShare() {
    const url = shareLink(picks, alias || 'anonymous')
    setShareUrl(url)
    navigator.clipboard?.writeText(url)
  }

  // Count picks for filled tally + per-group counter
  const filled = Object.keys(picks).length
  const total = totalMatches
  function filledInGroup(g: string): number {
    const ids = new Set((groupedMatches.find((x) => x.group === g)?.ms ?? []).map((m) => m.id))
    return Object.keys(picks).filter((id) => ids.has(id)).length
  }

  return (
    <section id="predict" className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="your bracket"
          title="Predict every group match"
          sub="All 72 group-stage fixtures. Pick a final score for each — your picks save locally, sync to the cloud when you sign in, and feed the live leaderboard once results come in."
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
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent-gold/50 flex-1 max-w-[180px]"
            />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              <span className="text-slate-900 font-mono">{filled}</span> / {total} filled
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
            className="mt-3 glass rounded-xl px-4 py-3 text-xs text-slate-600 break-all"
          >
            <span className="text-accent-green font-mono">✓ Copied to clipboard:</span>{' '}
            {shareUrl}
          </motion.div>
        )}

        {/* Group picker — A..L, with a per-group filled tally so the
            user can see at a glance which groups still need attention. */}
        <div className="flex gap-1.5 mt-8 mb-6 overflow-x-auto pb-1">
          {groupedMatches.map(({ group, ms }) => {
            const f = filledInGroup(group)
            const done = f === ms.length
            return (
              <button
                key={group}
                onClick={() => setActiveGroup(group)}
                className={cn(
                  'shrink-0 px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-widest transition-all flex items-center gap-1.5',
                  activeGroup === group
                    ? 'bg-ink-900 text-white font-semibold'
                    : 'glass glass-hover text-slate-700'
                )}
              >
                <span>{group}</span>
                <span className={cn(
                  'text-[10px] tabular-nums px-1.5 py-0.5 rounded-full',
                  done ? 'bg-accent-gold/20 text-accent-gold' : 'bg-slate-200/60 text-slate-500'
                )}>
                  {f}/{ms.length}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(groupedMatches.find((g) => g.group === activeGroup)?.ms ?? []).map((m) => {
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
                      onChange={(v) => { void setPick({ matchId: m.id, homeScore: v, awayScore: pick?.awayScore ?? 0, ts: Date.now() }) }}
                    />
                    <span className="text-slate-600">:</span>
                    <Stepper
                      value={pick?.awayScore ?? 0}
                      onChange={(v) => { void setPick({ matchId: m.id, homeScore: pick?.homeScore ?? 0, awayScore: v, ts: Date.now() }) }}
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

        {/* 🦁 Tongue-in-cheek prediction model */}
        <div className="mt-8">
          <MoroccoOdds />
        </div>
      </div>
    </section>
  )
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 py-1">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-6 h-6 rounded-md text-slate-600 hover:bg-slate-200 transition-colors"
      >
        −
      </button>
      <span className="font-display font-bold text-2xl text-slate-900 w-6 text-center tabular-nums">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(9, value + 1))}
        className="w-6 h-6 rounded-md text-slate-600 hover:bg-slate-200 transition-colors"
      >
        +
      </button>
    </div>
  )
}
