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
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="hidden md:flex w-full justify-center my-2 pointer-events-none"
    >
      <div className="flex justify-center">
        <div
          className={
            'pointer-events-auto inline-flex items-center gap-3 px-4 py-1.5 rounded-full text-[10px] font-mono backdrop-blur-xl border tabular-nums ' +
            (hot
              ? 'bg-red-50/90 border-red-200/60'
              : 'bg-white/90 border-slate-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)]')
          }
        >
          <span className="text-slate-500 uppercase tracking-[0.18em]">
            {hot ? 'Kickoff in' : 'Opens in'}
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
          'tabular-nums font-semibold text-xs ' +
          (hot ? 'text-red-700' : 'text-slate-900')
        }
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[9px] text-slate-400 uppercase">{label}</span>
    </span>
  )
}

function Sep() {
  return <span className="text-slate-300">·</span>
}
