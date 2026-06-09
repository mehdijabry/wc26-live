import { useEffect, useRef, useState } from 'react'

/**
 * AdSlot — Adsterra ad placement, lazy-loaded via IntersectionObserver.
 *
 * Two Adsterra integration patterns:
 *   1. Standard Banner (iframe) — uses atOptions + invoke.js loader
 *   2. Native Banner            — uses container div + invoke.js loader
 *
 * Design principles (per user):
 *  - Subtle. Reserves space so the page never jumps (no CLS).
 *  - "Sponsored" label, FTC compliant.
 *  - Silent fail. Adblock or empty fill → slot collapses, no guilt message.
 *  - No popups, popunders, push, social bars, video, interstitials.
 *  - Only loads when scrolled near the viewport (saves bandwidth).
 */

export type AdFormat =
  | 'banner-728x90'
  | 'banner-300x250'
  | 'banner-320x50'
  | 'native'

export type AdSlotProps = {
  zoneKey: string         // The hash from Adsterra (32-char hex)
  format: AdFormat
  className?: string
}

const BANNER_SIZE: Record<Exclude<AdFormat, 'native'>, { w: number; h: number }> = {
  'banner-728x90':  { w: 728, h: 90 },
  'banner-300x250': { w: 300, h: 250 },
  'banner-320x50':  { w: 320, h: 50 },
}

const INVOKE_DOMAIN = 'https://turbulentrefreshments.com'

export function AdSlot({ zoneKey, format, className }: AdSlotProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [empty, setEmpty] = useState(false)

  // Reveal slot when within 300px of the viewport
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: '300px 0px 300px 0px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Inject Adsterra into the slot when visible.
  //
  // KEY PROBLEM with multiple banners on one page: Adsterra's invoke.js
  // reads `window.atOptions` to know which zone to serve. If we put
  // several <script>atOptions = {...}</script> tags into the parent
  // document, they ALL write to the same global — last one wins, and
  // since the browser dedupes the cached invoke.js for repeated zone
  // URLs (same hash), most slots end up empty.
  //
  // Fix: for standard banners, render the entire atOptions + invoke.js
  // pair inside a sandboxed <iframe srcDoc> so each ad has its own
  // window.atOptions scope. Native banners already use a unique
  // `container-{KEY}` div so they're fine in the parent document.
  useEffect(() => {
    if (!visible || !containerRef.current) return
    const host = containerRef.current.querySelector<HTMLDivElement>('.ad-host')
    if (!host || host.dataset.injected === '1') return
    host.dataset.injected = '1'

    if (format === 'native') {
      // Native Banner pattern: container div with id == container-{KEY},
      // then loader script — each one has its own DOM target so no clash.
      const div = document.createElement('div')
      div.id = `container-${zoneKey}`
      host.appendChild(div)

      const loader = document.createElement('script')
      loader.async = true
      loader.setAttribute('data-cfasync', 'false')
      loader.src = `${INVOKE_DOMAIN}/${zoneKey}/invoke.js`
      host.appendChild(loader)
    } else {
      // Standard Banner — isolate inside an iframe srcDoc so atOptions
      // can't be overwritten by another banner elsewhere on the page.
      const sizes = BANNER_SIZE[format]
      const html = [
        '<!doctype html><html><head>',
        '<meta charset="utf-8">',
        '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}</style>',
        '</head><body>',
        '<script type="text/javascript">',
        `atOptions = { 'key': '${zoneKey}', 'format': 'iframe', 'height': ${sizes.h}, 'width': ${sizes.w}, 'params': {} };`,
        '</script>',
        `<script type="text/javascript" src="${INVOKE_DOMAIN}/${zoneKey}/invoke.js"></script>`,
        '</body></html>',
      ].join('')

      const frame = document.createElement('iframe')
      frame.srcdoc = html
      frame.width = String(sizes.w)
      frame.height = String(sizes.h)
      frame.scrolling = 'no'
      frame.title = 'Sponsored content'
      frame.style.border = '0'
      frame.style.display = 'block'
      frame.setAttribute('loading', 'lazy')
      host.appendChild(frame)
    }

    // Fill watchdog. User reported home-mid only showed ~1 page-load in
    // 20: previous 12s timeout was killing the slot before Adsterra's
    // invoke.js had a chance to serve a native ad (their auctioneer
    // is slow on fresh zones — frequently 15-25s in practice). Three
    // changes:
    //  - bumped timeout to 30s (banner) / 45s (native, slower fill)
    //  - for NATIVE, we no longer collapse on empty. We keep showing
    //    the 'Sponsored' label + reserved space so the layout stays
    //    deterministic and a late-arriving ad can still render in
    //    place (Adsterra's invoke.js sometimes posts content well
    //    after the watchdog fires). Cost: a sliver of blank space on
    //    fill miss. Benefit: when it does serve, the ad lands cleanly.
    //  - for iframe banners we still collapse on miss (an empty
    //    iframe with a 'Sponsored' label looks broken — banners are
    //    expected to either fill or vanish).
    const timeoutMs = format === 'native' ? 45_000 : 30_000
    const t = window.setTimeout(() => {
      if (format === 'native') {
        // Don't collapse — leave the placeholder so a late fill can
        // still appear. Just log so we can spot consistent misses.
        const container = host.querySelector(`#container-${zoneKey}`)
        const hasContent = !!container && container.children.length > 0
        if (!hasContent && typeof console !== 'undefined') {
          console.info('[adslot] native', zoneKey, 'unfilled after', timeoutMs / 1000, 's — keeping slot reserved')
        }
      } else {
        try {
          const frame = host.querySelector('iframe') as HTMLIFrameElement | null
          const doc = frame?.contentDocument
          const hasContent = !!doc?.body?.children?.length && doc.body.innerHTML.trim().length > 100
          if (!hasContent) setEmpty(true)
        } catch {
          // Cross-origin: assume it filled (Adsterra often renders into a child iframe)
        }
      }
    }, timeoutMs)
    return () => clearTimeout(t)
  }, [visible, zoneKey, format])

  if (empty) return null

  // Reserve space: native is flex-width with min height; banners are fixed
  const reserved =
    format === 'native'
      ? { width: '100%', minHeight: 250, maxWidth: 728 }
      : { width: BANNER_SIZE[format].w, minHeight: BANNER_SIZE[format].h, maxWidth: '100%' }

  return (
    <div
      ref={containerRef}
      className={'mx-auto flex flex-col items-center my-6 ' + (className ?? '')}
      style={{ minHeight: format === 'native' ? 260 : BANNER_SIZE[format].h + 14 }}
      aria-label="Sponsored content"
    >
      <span className="text-[8px] uppercase tracking-[0.22em] text-slate-400 mb-1.5 font-mono">
        Sponsored
      </span>
      <div
        className="ad-host"
        style={{ ...reserved, overflow: 'hidden' }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Zone keys for pressing90.live — pulled from Adsterra dashboard         */
/* (publishers > websites > pressing90.live > Get code on each unit)       */
/* -------------------------------------------------------------------------- */

export const ADSTERRA_ZONES = {
  native:     '4206024ed395c7d39e23ea899fea475b', // NativeBanner_1
  banner320:  '111d5dc72ead6ef8616f65b57c12f258', // 320x50 (mobile)
  banner300:  '0936eaa3f807a32e23702c0788a45a82', // 300x250 (in-content)
  banner728:  'cea8e56ed099a4849d831cb15a84f89a', // 728x90 (leaderboard)
} as const

/**
 * Convenience wrapper — pick a slot semantically and we'll pick the best
 * Adsterra zone for that placement. One source of truth so swapping
 * formats/providers later only touches this file.
 */
export type SlotName =
  | 'home-mid'
  | 'home-footer'
  | 'wc26-mid'
  | 'today-strip'
  | 'predict-mid'
  | 'squads-footer'
  | 'board-mid'
  | 'profile-footer'

const SLOT_TO_ZONE: Record<SlotName, { key: string; format: AdFormat }> = {
  'home-mid':       { key: ADSTERRA_ZONES.native,    format: 'native' },
  'home-footer':    { key: ADSTERRA_ZONES.banner728, format: 'banner-728x90' },
  'wc26-mid':       { key: ADSTERRA_ZONES.banner300, format: 'banner-300x250' },
  'today-strip':    { key: ADSTERRA_ZONES.banner728, format: 'banner-728x90' },
  'predict-mid':    { key: ADSTERRA_ZONES.native,    format: 'native' },
  'squads-footer':  { key: ADSTERRA_ZONES.banner728, format: 'banner-728x90' },
  'board-mid':      { key: ADSTERRA_ZONES.banner300, format: 'banner-300x250' },
  'profile-footer': { key: ADSTERRA_ZONES.banner728, format: 'banner-728x90' },
}

export function Ad({ slot, className }: { slot: SlotName; className?: string }) {
  const cfg = SLOT_TO_ZONE[slot]
  if (!cfg.key) return null
  return <AdSlot zoneKey={cfg.key} format={cfg.format} className={className} />
}
