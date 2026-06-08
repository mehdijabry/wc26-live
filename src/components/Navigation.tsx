import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { UserMenu } from './UserMenu'

// Real route-based navigation now — each link is its own page, no more
// anchor-jump that breaks when a section is still inside a lazy Suspense.
const links: Array<{ label: string; to: string }> = [
  { label: 'Home', to: '/' },
  { label: 'My Bracket', to: '/bracket' },
  { label: 'Predict', to: '/predict' },
  { label: 'Today', to: '/today' },
  { label: 'Squads', to: '/squads' },
  { label: 'Board', to: '/board' },
  { label: 'Stadiums', to: '/stadiums' },
]

export function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll while drawer open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? 'py-3 backdrop-blur-xl bg-paper/70 border-b border-slate-200/70' : 'py-5'
        }`}
      >
        <div className="container max-w-6xl mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img
              src="/wc26-emblem.svg"
              alt="WC26"
              className="w-8 h-8 group-hover:scale-110 transition-transform shrink-0"
            />
            <div className="leading-tight">
              <div className="font-display font-bold tracking-tight text-base sm:text-lg whitespace-nowrap">
                WC<span className="text-accent-gold">26</span> Live
              </div>
              <div className="text-[9px] uppercase tracking-[0.2em] font-mono whitespace-nowrap mt-0.5">
                <span className="text-slate-900">Pressing</span>{' '}
                <span className="text-accent-red font-semibold">90′</span>
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  'px-3 py-1.5 text-sm rounded-full transition-colors ' +
                  (isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <UserMenu />
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Open menu"
              className="md:hidden w-10 h-10 rounded-full glass glass-hover flex items-center justify-center"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-[55] bg-slate-900/40 backdrop-blur-md md:hidden"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 240 }}
              className="fixed top-0 right-0 bottom-0 z-[60] w-[80%] max-w-xs bg-white border-l border-slate-200 p-6 md:hidden overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <Link to="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5">
                  <img src="/wc26-emblem.svg" alt="" className="w-7 h-7" />
                  <div className="leading-tight">
                    <div className="font-display font-bold tracking-tight text-sm">
                      WC<span className="text-accent-gold">26</span> Live
                    </div>
                    <div className="text-[8px] uppercase tracking-[0.2em] font-mono mt-0.5">
                      <span className="text-slate-900">Pressing</span>{' '}
                      <span className="text-accent-red font-semibold">90′</span>
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="w-9 h-9 rounded-full glass glass-hover flex items-center justify-center text-xl"
                >
                  ×
                </button>
              </div>

              <nav className="space-y-1">
                {links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      'block px-4 py-3 rounded-xl text-base transition-colors ' +
                      (isActive
                        ? 'bg-slate-900 text-white'
                        : 'hover:bg-slate-100 text-slate-800 hover:text-slate-900')
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
              </nav>

              <div className="mt-10 pt-6 border-t border-slate-200/70 text-[10px] uppercase tracking-widest text-slate-600 font-mono">
                June 11 → July 19, 2026
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
