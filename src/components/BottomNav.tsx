import { type ReactElement } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../store/auth'

/**
 * Bottom tab bar — footmercato-style.
 * Mobile-only; on desktop the top nav handles everything.
 * Each tab is now its own route (was scroll-anchor before, which broke
 * when a section was still inside a lazy <Suspense>).
 */

type Tab = {
  to: string
  label: string
  icon: (active: boolean) => ReactElement
}

const tabs: Tab[] = [
  {
    to: '/', label: 'Home',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 11l9-8 9 8M5 9v11h4v-6h6v6h4V9" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/today', label: 'Matches',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/bracket', label: 'Bracket',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 5h6v4h6v6h6M3 11h6M9 17h6" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/predict', label: 'Predict',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/board', label: 'Board',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 21h4v-8H4v8zM10 21h4V3h-4v18zM16 21h4v-12h-4v12z" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinejoin="round" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const user = useAuth((s) => s.user)
  void user // (reserved for future auth-aware tab swap)

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) =>
              'relative flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ' +
              (isActive ? 'text-accent-blue' : 'text-slate-500')
            }
          >
            {({ isActive }) => (
              <>
                {t.icon(isActive)}
                <span className={'text-[10px] ' + (isActive ? 'font-semibold' : 'font-medium')}>
                  {t.label}
                </span>
                {isActive && (
                  <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent-blue rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
