import { useEffect, useState } from 'react'

const THRESHOLD = 80          // pixels of pull required to trigger a refresh
const MAX_PULL = 140          // visual ceiling — the indicator stops moving past this
const RUBBER = 0.5            // damping so the pull feels resistant (like native iOS)

/**
 * Pull-to-refresh for installed PWAs.
 *
 * iOS Safari's native pull-to-refresh only works in browser mode. Once
 * the user installs the site to their Home Screen (standalone mode),
 * the gesture stops doing anything — which surprises users coming from
 * native apps. This component reimplements it.
 *
 * Behavior:
 *   - User touches at scroll-top, pulls down → a circular indicator
 *     appears under the nav, rotates as the pull grows
 *   - Past THRESHOLD (80px) → release triggers window.location.reload()
 *   - Below threshold → release animates back to 0 (no refresh)
 *   - Rubber-band damping (×0.5) so the pull feels like native iOS
 *
 * Mounted at the document level (single instance from App.tsx), listens
 * to passive touch events on the document. Removes itself cleanly on
 * unmount — safe to re-render.
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let startY = 0
    let current = 0
    let active = false

    function start(e: TouchEvent) {
      // Only engage when the page is already at the top — otherwise the
      // user is mid-scroll and we'd hijack a normal swipe.
      if (window.scrollY > 0) return
      startY = e.touches[0].clientY
      current = 0
      active = true
    }
    function move(e: TouchEvent) {
      if (!active) return
      const dy = e.touches[0].clientY - startY
      if (dy <= 0) {
        // User reversed direction → reset.
        current = 0
        setPull(0)
        return
      }
      current = Math.min(dy * RUBBER, MAX_PULL)
      setPull(current)
    }
    function end() {
      if (!active) return
      active = false
      if (current >= THRESHOLD) {
        setRefreshing(true)
        // Tiny delay so the spinner is visible before the page tears
        // down — better than the reload feeling instant + broken.
        setTimeout(() => window.location.reload(), 280)
      } else {
        setPull(0)
      }
    }

    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', end, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
    }
  }, [])

  // No DOM when idle — keeps the layout clean and saves a paint.
  if (pull === 0 && !refreshing) return null

  const progress = Math.min(pull / THRESHOLD, 1)
  const ready = progress >= 1

  return (
    <div
      className="fixed inset-x-0 z-[60] flex items-start justify-center pointer-events-none"
      // Slide down from the top of the viewport (under the nav). We
      // start at top: env(safe-area-inset-top) so the indicator drops
      // INSIDE the safe area on PWA, not under the notch.
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + 64px)`,
        transform: `translateY(${refreshing ? 24 : pull * 0.5}px)`,
        transition: refreshing ? 'transform 0.18s' : undefined,
        opacity: refreshing ? 1 : Math.min(progress * 1.2, 1),
      }}
    >
      <div
        className="w-10 h-10 rounded-full bg-white border border-slate-200 shadow-[0_4px_14px_rgba(0,0,0,0.12)] flex items-center justify-center"
        style={{
          transform: refreshing ? 'none' : `rotate(${progress * 360}deg)`,
          transition: refreshing ? 'transform 0.18s' : undefined,
        }}
      >
        {refreshing ? (
          // Spinner — borrows the same accent-gold + slate ring we use
          // elsewhere so the loader feels in-brand.
          <div className="w-5 h-5 rounded-full border-[2.5px] border-slate-200 border-t-accent-gold animate-spin" />
        ) : (
          <svg
            className={ready ? 'text-accent-gold' : 'text-slate-500'}
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12l7 7 7-7" />
          </svg>
        )}
      </div>
    </div>
  )
}
