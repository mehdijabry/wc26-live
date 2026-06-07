import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { KONAMI, logIntro, randomMoroccoQuote } from '../lib/morocco'
import { TONGUE_IN_CHEEK_ODDS } from '../lib/morocco'

/**
 * Atlas Lions — global Morocco easter-egg layer.
 * - ASCII intro logged to console on mount.
 * - Listens for Konami code → confetti + champion overlay.
 * - Shows an occasional toast quote (every ~90s, visible 5s, then dismisses).
 */
export function AtlasLions() {
  const [konamiHit, setKonamiHit] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    logIntro()
  }, [])

  // Konami code listener
  useEffect(() => {
    const buf: string[] = []
    const handler = (e: KeyboardEvent) => {
      const key = e.key
      buf.push(key)
      if (buf.length > KONAMI.length) buf.shift()
      const norm = buf.map((k) => (k.length === 1 ? k.toLowerCase() : k))
      if (KONAMI.every((k, i) => k === norm[i])) {
        setKonamiHit(true)
        setTimeout(() => setKonamiHit(false), 6000)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Occasional toast — first shows after 25s, then every 90s, visible for 5s
  useEffect(() => {
    let timer: number
    const showToast = () => {
      setToast(randomMoroccoQuote())
      timer = window.setTimeout(() => setToast(null), 5000)
    }
    const first = window.setTimeout(showToast, 25000)
    const interval = window.setInterval(showToast, 90000)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
      clearTimeout(timer)
    }
  }, [])

  return (
    <>
      {/* Occasional toast — bottom center, dismissible */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
          >
            <button
              onClick={() => setToast(null)}
              className="pointer-events-auto group max-w-md flex items-center gap-3 px-4 py-2.5 rounded-full backdrop-blur-xl bg-ink-800/85 border border-red-500/15 shadow-2xl text-xs text-slate-200 hover:bg-ink-800/95 transition-colors"
            >
              <span className="text-base">🦁</span>
              <span className="text-left flex-1 leading-snug">{toast}</span>
              <span className="text-slate-600 group-hover:text-slate-400 text-[10px] font-mono">×</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Konami overlay */}
      <AnimatePresence>
        {konamiHit && <KonamiOverlay />}
      </AnimatePresence>
    </>
  )
}

function KonamiOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-red-700/40 via-ink-900/60 to-green-700/40 backdrop-blur-md" />
      <Confetti />
      <motion.div
        initial={{ scale: 0.5, rotate: -8, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
        className="relative text-center px-8"
      >
        <div className="text-8xl mb-4">🦁🇲🇦</div>
        <div className="font-display font-bold text-5xl sm:text-7xl text-white drop-shadow-2xl">
          Atlas Lions
        </div>
        <div className="font-display font-bold text-2xl sm:text-4xl text-yellow-300 mt-2">
          World Champions 2026
        </div>
        <div className="mt-4 text-sm font-mono text-white/80 max-w-md mx-auto">
          (You found the secret. The site's true prediction model says: MAR 99.8 %.)
        </div>
      </motion.div>
    </motion.div>
  )
}

function Confetti() {
  const items = Array.from({ length: 60 })
  return (
    <div className="absolute inset-0 overflow-hidden">
      {items.map((_, i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 1.5
        const dur = 2 + Math.random() * 2
        const color = ['#c1272d', '#fff', '#006233', '#d4af37'][i % 4]
        return (
          <motion.span
            key={i}
            initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: '110vh', x: (Math.random() - 0.5) * 80, rotate: 360 * 3 }}
            transition={{ duration: dur, delay, ease: 'easeIn' }}
            className="absolute block w-2 h-3"
            style={{ left: `${left}%`, top: 0, background: color, borderRadius: 2 }}
          />
        )
      })}
    </div>
  )
}

// Tongue-in-cheek odds bar for use in Predictions section.
export function MoroccoOdds() {
  return (
    <div className="glass rounded-2xl p-6 border border-red-500/20 relative overflow-hidden">
      <div className="absolute top-0 right-0 text-[10px] text-red-400/70 font-mono px-3 py-1">
        unbiased model • totally • we promise
      </div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🦁</span>
        <div className="font-display font-bold text-xl">Cup-winner probability (live model)</div>
      </div>
      <ul className="space-y-2">
        {TONGUE_IN_CHEEK_ODDS.map((o) => (
          <li key={o.team} className="flex items-center gap-3">
            <span className="text-xl w-8">{o.flag}</span>
            <span className="text-sm font-mono w-16">{o.team.toUpperCase()}</span>
            <div className="flex-1 h-2 rounded-full bg-ink-900/60 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${o.prob}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.5 }}
                className="h-full"
                style={{
                  background:
                    o.team === 'MAR'
                      ? 'linear-gradient(90deg,#c1272d,#d4af37,#006233)'
                      : '#3d4154',
                }}
              />
            </div>
            <span className={`text-xs font-mono w-12 text-right ${o.team === 'MAR' ? 'text-accent-gold' : 'text-slate-500'}`}>
              {o.prob}%
            </span>
            <span className="text-[10px] text-slate-500 hidden sm:block flex-1 min-w-[140px]">
              {o.note}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 pt-4 border-t border-white/5 text-[11px] text-slate-500 font-mono text-center">
        © Atlas Lions Stats Inc. — peer-reviewed by Mehdi.
      </div>
    </div>
  )
}
