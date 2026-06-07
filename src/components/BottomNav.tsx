import { useEffect, useState, type ReactElement } from 'react'
import { useAuth } from '../store/auth'

/**
 * Bottom tab bar — footmercato-style.
 * Mobile-only; on desktop the top nav handles everything.
 * The active tab is detected by the closest section in view.
 */

type Tab = {
  id: string
  label: string
  href: string
  icon: (active: boolean) => ReactElement
}

const tabs: Tab[] = [
  {
    id: 'hero', label: 'Home', href: '#hero',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 11l9-8 9 8M5 9v11h4v-6h6v6h4V9" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'today', label: 'Matches', href: '#today',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'groups', label: 'Groups', href: '#groups',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} />
        <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} />
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} />
        <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} />
      </svg>
    ),
  },
  {
    id: 'bracket', label: 'Bracket', href: '#bracket',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 5h6v4h6v6h6M3 11h6M9 17h6" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'leaderboard', label: 'Board', href: '#leaderboard',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 21h4v-8H4v8zM10 21h4V3h-4v18zM16 21h4v-12h-4v12z" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinejoin="round" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const [active, setActive] = useState<string>('hero')
  const user = useAuth((s) => s.user)
  void user // (reserved for future auth-aware tab swap)

  useEffect(() => {
    // Update active tab as the user scrolls.
    const ids = tabs.map((t) => t.id)
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el)
    if (!sections.length) return

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    sections.forEach((s) => obs.observe(s))
    return () => obs.disconnect()
  }, [])

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {tabs.map((t) => {
          const a = active === t.id
          return (
            <a
              key={t.id}
              href={t.href}
              onClick={() => setActive(t.id)}
              className={
                'flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ' +
                (a ? 'text-accent-blue' : 'text-slate-500')
              }
            >
              {t.icon(a)}
              <span className={'text-[10px] ' + (a ? 'font-semibold' : 'font-medium')}>
                {t.label}
              </span>
              {a && <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent-blue rounded-full" />}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
