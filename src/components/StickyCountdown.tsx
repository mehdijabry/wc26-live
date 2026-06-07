import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { openingMatchUTC } from '../data/matches'
import { timeUntil } from '../lib/utils'

/**
 * Sticky strip under the nav showing a precise live countdown to kickoff.
 * Updates every second. Disappears once the tournament starts (delta <= 0).
 */
export function StickyCountdown() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const opening = openingMatchUTC()
  const t = timeUntil(opening)
  // Use `now` to make the effect actually retick (suppresses TS unused warning too)
  void now

  if (t.done) return null

  // Hot mode: tournament starts in <7 days → louder gradient + pulse
  const hot = t.d < 7

  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="hidden md:block fixed top-[60px] inset-x-0 z-40 pointer-events-none"
    >
      <div className="container max-w-6xl mx-auto px-6 flex justify-center">
        <div
          className={
            'pointer-events-auto inline-flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-2 rounded-full text-xs font-mono backdrop-blur-xl border ' +
            (hot
              ? 'bg-gradient-to-r from-red-50 via-yellow-50 to-red-50 border-yellow-300/50 animate-pulse-slow'
              : 'bg-white border-slate-200 shadow-sm')
          }
        >
          <span className="text-slate-500 uppercase tracking-widest hidden sm:inline">
            {hot ? 'KICKOFF IN' : 'OPENING IN'}
          </span>
          <Digit label="d" value={t.d} />
          <Sep />
          <Digit label="h" value={t.h} />
          <Sep />
          <Digit label="m" value={t.m} />
          <Sep />
          <Digit label="s" value={t.s} hot={hot} />
        </div>
      </div>
    </motion.div>
  )
}

function Digit({ value, label, hot }: { value: number; label: string; hot?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span
        className={
          'tabular-nums font-semibold ' +
          (hot
            ? 'text-yellow-700 text-sm sm:text-base'
            : 'text-slate-900 text-sm sm:text-base')
        }
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[9px] text-slate-500 uppercase">{label}</span>
    </span>
  )
}

function Sep() {
  return <span className="text-slate-600">:</span>
}
