import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { openingMatchUTC } from '../data/matches'
import { timeUntil, userTimezone, fmtDate } from '../lib/utils'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { nextLiveOrUpcoming, useTournament } from '../store/tournament'
import { eventTeams } from '../lib/api'

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
    <section id="hero" className="relative overflow-hidden pt-24 pb-12 sm:pt-32 sm:pb-20">
      {/* Animated background blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          aria-hidden
          className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-accent-gold/20 blur-[120px]"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          aria-hidden
          className="absolute top-40 -left-20 w-[400px] h-[400px] rounded-full bg-accent-green/15 blur-[100px]"
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, delay: 1 }}
        />
      </div>

      <div className="container max-w-6xl mx-auto px-6">
        {/* Pre-title */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-2 mb-6"
        >
          <span className="pill">
            <span className="w-2 h-2 rounded-full bg-accent-red animate-pulse" />
            48 nations · 16 cities · 104 matches
          </span>
          <span className="pill">🇺🇸 🇲🇽 🇨🇦 hosts</span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="font-display font-bold tracking-tighter text-5xl sm:text-7xl md:text-8xl leading-[0.9] mb-6"
        >
          The <span className="gradient-text">World Cup 2026</span>
          <br />
          Live
        </motion.h1>

        <motion.p
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-slate-400 text-lg sm:text-xl max-w-2xl mb-10 leading-relaxed"
        >
          Every match, every group, every stadium — synced to your timezone, your
          predictions, your watchlist. From kickoff in Mexico City to the final at
          MetLife Stadium.
        </motion.p>

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
              <div className="font-display text-xl sm:text-2xl text-white mt-1">
                {isLiveNow ? 'In progress' : 'Kicks off in'}
              </div>
            </div>
            <div className="text-xs font-mono text-slate-500">
              your time · {userTimezone()}
            </div>
          </div>

          <CountdownGrid {...ttl} key={tick > 0 ? 'live' : 'init'} />

          <div className="mt-5 pt-5 border-t border-white/5 text-sm text-slate-400 flex flex-wrap gap-x-6 gap-y-2">
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
          <a
            href="#predict"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
          >
            Start your bracket →
          </a>
          <a
            href="#groups"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full glass glass-hover text-sm font-semibold"
          >
            Explore the 12 groups
          </a>
        </motion.div>
      </div>

      {/* WC26 official emblem — floating */}
      <motion.div
        aria-hidden
        className="hidden lg:block absolute right-12 top-28 w-56 h-56 pointer-events-none"
        animate={{ y: [0, -16, 0], rotate: [0, 4, -4, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'drop-shadow(0 12px 40px rgba(212,175,55,0.25))' }}
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
        <div key={c.k} className="rounded-2xl bg-ink-900/60 border border-white/5 p-4 sm:p-6 text-center relative overflow-hidden">
          <div
            className="font-display text-4xl sm:text-6xl font-bold text-white tabular-nums"
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
