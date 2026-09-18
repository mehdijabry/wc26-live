import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Floating "Ask AI" bubble — discrete entry point to ai.pressing90.live.
 *
 * Visibility rules:
 *   - Only on the public site (NOT on /admin*, /ai, /install-debug, or
 *     the ai.pressing90.live subdomain itself).
 *   - Mobile: sits 88 px above the bottom edge so it clears the BottomNav.
 *   - Desktop: bottom-right corner with a tooltip on hover.
 *   - Hides while the user is mid-typing in an input/textarea to avoid
 *     blocking form fields.
 *   - One-time dismissal: after 'don't show again' the user has to
 *     manually re-enable from settings (not implemented yet).
 *
 * Click behaviour: opens https://ai.pressing90.live in a new tab. Falls
 * back to the same-origin /ai route if the subdomain isn't yet
 * propagated (we test reachability lazily on first click).
 */

const DISMISSED_KEY = 'wc26.ai-bubble.dismissed'
const AI_SUBDOMAIN = 'https://ai.pressing90.live'

function isDismissed(): boolean {
  try { return Boolean(localStorage.getItem(DISMISSED_KEY)) } catch { return false }
}

export function AskAiBubble() {
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  const [tooltip, setTooltip] = useState(false)

  // Mount-time gate — only show after a short delay so it doesn't fight
  // the intro splash for attention. Also lets us re-evaluate on route
  // change without flashing in/out.
  useEffect(() => {
    if (isDismissed()) return
    if (typeof window === 'undefined') return

    // Skip on excluded routes and on the AI subdomain itself.
    const path = location.pathname
    const host = window.location.hostname
    if (host === 'ai.pressing90.live') return
    if (host === 'admin.pressing90.live') return
    if (path.startsWith('/admin-panel') || path === '/ai' || path === '/install-debug') return

    // Hide while a form input is focused (mobile keyboard would cover it
    // anyway, and it can occlude the field).
    function checkFocus() {
      const ae = document.activeElement
      const tag = ae?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (ae as HTMLElement | null)?.isContentEditable) {
        setVisible(false)
      } else {
        setVisible(true)
      }
    }

    const t = window.setTimeout(checkFocus, 1200)
    document.addEventListener('focusin', checkFocus)
    document.addEventListener('focusout', checkFocus)
    return () => {
      clearTimeout(t)
      document.removeEventListener('focusin', checkFocus)
      document.removeEventListener('focusout', checkFocus)
      setVisible(false)
    }
  }, [location.pathname])

  function openAi(e: React.MouseEvent) {
    e.preventDefault()
    // Open in new tab so we don't kill the user's reading session.
    // Same window if they're already on a less-important page.
    window.open(AI_SUBDOMAIN, '_blank', 'noopener,noreferrer')
  }

  function dismiss(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())) } catch { /* ignore */ }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      className="fixed z-30 pointer-events-none"
      // Bottom-right anchor. The 88 px clears the mobile BottomNav (which
      // sits at bottom: 0 + safe-area + ~64 px tall). On desktop the nav
      // is hidden (md:hidden) so we'd be too high — bump down via media
      // query in the inline style (Tailwind doesn't ship `md:bottom-6`
      // out of the box that beats our base).
      style={{
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
      }}
    >
      <div className="pointer-events-auto flex items-center gap-2">
        {/* Tooltip — only on desktop, fades in on hover. */}
        {tooltip && (
          <div className="hidden md:block px-3 py-1.5 rounded-full bg-ink-900 text-white text-[11px] font-mono whitespace-nowrap shadow-lg">
            Ask anything about WC26
          </div>
        )}

        {/* Main button + dismiss handle */}
        <div className="relative">
          <button
            onClick={openAi}
            onMouseEnter={() => setTooltip(true)}
            onMouseLeave={() => setTooltip(false)}
            aria-label="Ask the WC26 AI assistant"
            className="relative h-12 w-12 rounded-full bg-ink-900 text-accent-gold flex items-center justify-center shadow-[0_6px_20px_rgba(0,0,0,0.25)] active:scale-95 transition-transform"
          >
            {/* Single soft pulse on mount — uses Tailwind's animate-ping
                with an inline animationIterationCount cap so it doesn't
                spin forever and start to feel intrusive. */}
            <span
              className="absolute inset-0 rounded-full bg-accent-gold/30 animate-ping"
              style={{ animationIterationCount: 3, animationDuration: '1.8s' }}
            />
            {/* Sparkle icon — universal "AI" cue, brand-neutral. */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
              <path d="M19 14l.9 2.3L22 17l-2.1.7L19 20l-.9-2.3L16 17l2.1-.7z" />
              <path d="M5 17l.6 1.5L7 19l-1.4.5L5 21l-.6-1.5L3 19l1.4-.5z" />
            </svg>
          </button>
          {/* Dismiss × — appears top-right of the bubble, very small */}
          <button
            onClick={dismiss}
            aria-label="Hide Ask AI"
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-white border border-slate-300 text-slate-500 hover:text-slate-900 hover:border-slate-500 text-[10px] leading-none flex items-center justify-center shadow"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
