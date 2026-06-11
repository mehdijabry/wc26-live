import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { openingMatchUTC } from '../data/matches'
import { timeUntil, userTimezone, fmtDate } from '../lib/utils'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { nextLiveOrUpcoming, useTournament } from '../store/tournament'
import { eventTeams } from '../lib/api'
import { NewsTicker } from './NewsTicker'

export function Hero() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const opening = openingMatchUTC()
  const events = useTournament((s) => s.events)
  const liveOrNext = nextLiveOrUpcoming(events)
  // Prefer the actual next ESPN-known kickoff; fallback to the static opening date
  const targetIso = liveOrNext?.date ?? opening
  const ttl = timeUntil(targetIso)
  const { home, away } = liveOrNext ? eventTeams(liveOrNext) : { home: undefined, away: undefined }
  const venue = liveOrNext?.competitions?.[0]?.venue
  const isLiveNow = liveOrNext?.status?.type?.state === 'in'

  return (
    <section id="hero" className="relative overflow-hidden pt-6 pb-10 sm:pt-10 sm:pb-14 border-b border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6">
        {/* Editorial top strip — kicker line à la footmercato */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-4"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" />
              FIFA · 48 nations · 16 cities
            </span>
            <span className="hidden sm:inline text-slate-400">·</span>
            <span className="hidden sm:inline">USA · MEX · CAN</span>
          </div>
          <span className="hidden md:inline text-slate-400">
            June 11 → July 19, 2026
          </span>
        </motion.div>

        {/* The StickyCountdown pill was removed — it targeted the static
            FIFA opening fixture while the big countdown card below uses
            ESPN's live 'next match' (Mexico vs South Africa), so the
            two values disagreed by ~1h. User asked to keep only the
            bottom card; see Hero.tsx around line 65 for the source of
            truth. */}

        {/* Newsfeed — replaces the static "World Cup 2026 Live" title.
            Auto-rotates a featured ESPN article every 15s, full refresh
            every 5min. See src/components/NewsTicker.tsx. */}
        <motion.div
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <NewsTicker />
        </motion.div>

        {/* Countdown */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="glass rounded-3xl p-6 sm:p-8 ring-glow"
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-slate-500 font-mono flex items-center gap-2">
                {isLiveNow ? (
                  <>
                    <span className="flex items-center gap-1.5 text-red-400">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                      </span>
                      LIVE NOW
                    </span>
                    {venue?.fullName && <span>· {venue.fullName}</span>}
                  </>
                ) : (
                  <>
                    <span>{liveOrNext ? 'Next match' : 'Opening match'}</span>
                    {venue?.fullName && <span>· {venue.fullName}</span>}
                    {!venue?.fullName && <span>· Estadio Azteca</span>}
                  </>
                )}
              </div>
              <div className="font-display text-xl sm:text-2xl text-slate-900 mt-1">
                {isLiveNow ? 'In progress' : 'Kicks off in'}
              </div>
            </div>
            <div className="text-xs font-mono text-slate-500">
              your time · {userTimezone()}
            </div>
          </div>

          <CountdownGrid {...ttl} key={tick > 0 ? 'live' : 'init'} />

          <div className="mt-5 pt-5 border-t border-slate-200/70 text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-2">
            <span>📅 {fmtDate(targetIso)}</span>
            {liveOrNext && home?.team && away?.team && (
              <span className="flex items-center gap-2">
                ⚽️ {home.team.shortDisplayName ?? home.team.displayName}{' '}
                <span className="text-slate-600">vs</span>{' '}
                {away.team.shortDisplayName ?? away.team.displayName}
              </span>
            )}
            <span className="text-[11px] text-slate-600 font-mono ml-auto">
              source · ESPN live
            </span>
          </div>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-8 flex flex-wrap gap-3"
        >
          <Link
            to="/bracket"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
          >
            Start your bracket →
          </Link>
          <a
            href="#groups"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass glass-hover text-sm font-semibold"
          >
            Explore the 12 groups
          </a>
        </motion.div>
      </div>

      {/* WC26 official emblem — small bottom-right corner, subtle */}
      <motion.div
        aria-hidden
        className="hidden lg:block absolute right-6 bottom-6 w-16 h-16 pointer-events-none opacity-60"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'drop-shadow(0 4px 12px rgba(212,175,55,0.2))' }}
      >
        <img src="/wc26-emblem.svg" alt="FIFA World Cup 26 emblem" className="w-full h-full" />
      </motion.div>

      {/* Tiny floating ball (Lottie) */}
      <motion.div
        aria-hidden
        className="hidden xl:block absolute right-72 top-72 w-20 h-20 pointer-events-none opacity-70"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity }}
      >
        <DotLottieReact
          src="https://lottie.host/4f4f96d0-0e85-4b3b-a6e8-23c5f4d39d77/qhCs9JKMjE.lottie"
          loop
          autoplay
        />
      </motion.div>
    </section>
  )
}

function CountdownGrid({ d, h, m, s }: ReturnType<typeof timeUntil>) {
  const cells = [
    { v: d, k: 'days' },
    { v: h, k: 'hours' },
    { v: m, k: 'min' },
    { v: s, k: 'sec' },
  ]
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-4">
      {cells.map((c) => (
        <div key={c.k} className="rounded-2xl bg-slate-50 border border-slate-200/70 p-4 sm:p-6 text-center relative overflow-hidden">
          <div
            className="font-display text-4xl sm:text-6xl font-bold text-slate-900 tabular-nums"
            key={c.v}
          >
            {String(c.v).padStart(2, '0')}
          </div>
          <div className="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 mt-1">
            {c.k}
          </div>
        </div>
      ))}
    </div>
  )
}
