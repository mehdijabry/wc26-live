import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

const links = [
  { label: 'Groups', href: '#groups' },
  { label: 'Schedule', href: '#schedule' },
  { label: 'Bracket', href: '#bracket' },
  { label: 'Stadiums', href: '#stadiums' },
  { label: 'Predict', href: '#predict' },
]

export function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6 }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? 'py-3 backdrop-blur-xl bg-ink-900/70 border-b border-white/5' : 'py-5'
      }`}
    >
      <div className="container max-w-6xl mx-auto px-6 flex items-center justify-between">
        <a href="#hero" className="flex items-center gap-2 group">
          <img
            src="/wc26-emblem.svg"
            alt="WC26"
            className="w-8 h-8 group-hover:scale-110 transition-transform"
          />
          <span className="font-display font-bold tracking-tight text-lg">
            WC<span className="text-accent-gold">26</span> Hub
          </span>
        </a>
        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white rounded-full hover:bg-white/5 transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="text-xs font-mono text-slate-500 hidden sm:block">
          🇺🇸 🇲🇽 🇨🇦
        </div>
      </div>
    </motion.header>
  )
}
