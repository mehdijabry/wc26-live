import { type ReactElement, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useSiteSettings } from '../store/siteSettings'
import { useT } from '../lib/i18n'

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
    // Post-tournament: 'Predict' tab replaced by News — the daily read
    // is now the site's second pillar after live scores.
    to: '/news', label: 'News',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 5h12v14H6a2 2 0 01-2-2V5zM16 8h4v9a2 2 0 01-2 2M7 9h6M7 13h6M7 16h4" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    // WC26 archive — trophy stays, the tournament is history now.
    to: '/wc26', label: 'WC26',
    icon: (a) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth={a ? 2.2 : 1.8} strokeLinejoin="round" />
      </svg>
    ),
  },
]

export function BottomNav() {
  const t2 = useT()
  const user = useAuth((s) => s.user)
  void user // (reserved for future auth-aware tab swap)
  // WC26 tab is admin-toggled; the grid adapts to 4 or 5 columns.
  const wc26Visible = useSiteSettings((s) => s.wc26Visible)
  const visibleTabs = wc26Visible ? tabs : tabs.filter((t) => t.to !== '/wc26')

  // Repair the nav position after the OS resumes the PWA from background
  // suspension. On iOS Safari (and Chrome Android PWAs to a lesser
  // extent), `position: fixed; bottom: 0` can sit on a stale layout
  // viewport when the app wakes up hours after being backgrounded — the
  // bar appears mid-page instead of glued to the bottom, and scrolls
  // with the content. Forcing a reflow on resume re-anchors it.
  useEffect(() => {
    function repair() {
      if (document.hidden) return
      // Trigger a single layout pass by reading + writing a tiny style.
      // requestAnimationFrame so we don't double-paint when many events
      // (pageshow + visibilitychange + resize) fire in the same tick.
      requestAnimationFrame(() => {
        document.body.style.minHeight = '100.001%'
        requestAnimationFrame(() => { document.body.style.minHeight = '' })
      })
    }
    document.addEventListener('visibilitychange', repair)
    window.addEventListener('pageshow', repair)
    // visualViewport tracks the true rendered viewport on mobile (URL bar
    // collapse/expand, virtual keyboard, etc.). Listening to its resize
    // catches the cases pageshow misses (e.g. app resumed without a full
    // navigation cycle).
    const vv = (window as Window & { visualViewport?: VisualViewport }).visualViewport
    vv?.addEventListener('resize', repair)
    return () => {
      document.removeEventListener('visibilitychange', repair)
      window.removeEventListener('pageshow', repair)
      vv?.removeEventListener('resize', repair)
    }
  }, [])

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200"
      // contain: layout keeps the bar in its own layout sub-tree so the
      // resume-from-background reflow above is cheap (no ancestor relayout).
      // No `transform: translateZ(0)` here — promoting the bar to a
      // composited GPU layer made the freeze-when-backgrounded bug WORSE
      // on some iOS builds (the frozen layer was rendered at its stale
      // pre-suspend position when the OS resumed the PWA).
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        contain: 'layout',
      }}
    >
      <div className={visibleTabs.length === 4 ? 'grid grid-cols-4' : 'grid grid-cols-3'}>
        {visibleTabs.map((t) => (
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
                  {t2(t.label)}
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
