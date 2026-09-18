import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { nextLiveOrUpcoming, useTournament } from '../store/tournament'
import { eventTeams } from '../lib/api'
import { timeUntil } from '../lib/utils'

/**
 * Floating next-match pill — replaces the big countdown card that used
 * to live inside the Hero. Sticky: it scrolls with the page until it
 * reaches the nav, then stays pinned below it so the countdown (or the
 * live score) is ALWAYS visible while browsing the home page.
 *
 * Driven by the same ESPN store as everything else (nextLiveOrUpcoming),
 * so it can't disagree with the Today section the way the old static
 * FIFA-opening-date pill did:
 *  - upcoming  → "MAR vs FRA · 01d 02h 33m 12s"
 *  - live      → "● LIVE MAR 1–0 FRA" (tap → #today)
 *  - tournament over / no data → renders nothing.
 */
export function StickyCountdown() {
  const navigate = useNavigate()
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const events = useTournament((s) => s.events)
  const next = nextLiveOrUpcoming(events)
  if (!next?.date) return null

  const isLive = next.status?.type?.state === 'in'
  const { home, away } = eventTeams(next)
  const hn = home?.team?.abbreviation ?? home?.team?.shortDisplayName ?? '—'
  const an = away?.team?.abbreviation ?? away?.team?.shortDisplayName ?? '—'
  const hs = typeof home?.score === 'string' ? home.score : '0'
  const as_ = typeof away?.score === 'string' ? away.score : '0'
  const t = timeUntil(next.date)

  return (
    <div
      className="sticky z-40 flex justify-center pointer-events-none px-4"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.75rem)' }}
    >
      {/* motion.a (real DOM node), NOT motion.create(Link): framer never
          received the DOM ref through react-router's Link, leaving the
          pill frozen at its initial opacity-0 state. href kept for
          semantics / middle-click; primary click navigates client-side. */}
      <motion.a
        href="/today"
        onClick={(e) => { e.preventDefault(); navigate('/today') }}
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, delay: 0.2 }}
        className={
          'pointer-events-auto inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-mono ' +
          'backdrop-blur-xl border shadow-[0_4px_16px_rgba(0,0,0,0.08)] tabular-nums transition-colors ' +
          (isLive
            ? 'bg-red-50/95 border-red-200/70 hover:bg-red-100/95'
            : 'bg-white/95 border-slate-200/80 hover:bg-white')
        }
      >
        {isLive ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="text-red-600 font-semibold uppercase tracking-widest">Live</span>
            <span className="text-slate-900 font-semibold">
              {hn} <span className="text-lg font-display">{hs}–{as_}</span> {an}
            </span>
          </>
        ) : (
          <>
            <span className="text-slate-500 uppercase tracking-[0.16em]">
              {hn} <span className="text-slate-400 normal-case">vs</span> {an}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5 text-slate-900 font-semibold">
              {t.d > 0 && <Digit v={t.d} l="d" />}
              <Digit v={t.h} l="h" />
              <Digit v={t.m} l="m" />
              <Digit v={t.s} l="s" />
            </span>
          </>
        )}
      </motion.a>
    </div>
  )
}

function Digit({ v, l }: { v: number; l: string }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span className="tabular-nums">{String(v).padStart(2, '0')}</span>
      <span className="text-[9px] text-slate-400 uppercase">{l}</span>
    </span>
  )
}
