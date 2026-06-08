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

  // Inject Adsterra script when visible — pattern depends on format
  useEffect(() => {
    if (!visible || !containerRef.current) return
    const host = containerRef.current.querySelector<HTMLDivElement>('.ad-host')
    if (!host || host.dataset.injected === '1') return
    host.dataset.injected = '1'

    if (format === 'native') {
      // Native Banner pattern:
      //   <script async data-cfasync="false" src=".../{KEY}/invoke.js"></script>
      //   <div id="container-{KEY}"></div>
      const div = document.createElement('div')
      div.id = `container-${zoneKey}`
      host.appendChild(div)

      const loader = document.createElement('script')
      loader.async = true
      loader.setAttribute('data-cfasync', 'false')
      loader.src = `${INVOKE_DOMAIN}/${zoneKey}/invoke.js`
      host.appendChild(loader)
    } else {
      // Standard Banner pattern:
      //   <script>atOptions = { key, format: 'iframe', height, width, params }</script>
      //   <script src=".../{KEY}/invoke.js"></script>
      const sizes = BANNER_SIZE[format]
      const config = document.createElement('script')
      config.type = 'text/javascript'
      // Adsterra's invoke.js reads window.atOptions on load
      config.textContent =
        `atOptions = { 'key': '${zoneKey}', 'format': 'iframe', 'height': ${sizes.h}, 'width': ${sizes.w}, 'params': {} };`
      host.appendChild(config)

      const loader = document.createElement('script')
      loader.type = 'text/javascript'
      loader.src = `${INVOKE_DOMAIN}/${zoneKey}/invoke.js`
      host.appendChild(loader)
    }

    // After 6s, if no actual ad markup landed, collapse the slot
    const t = window.setTimeout(() => {
      const rendered = host.querySelector('iframe, ins, [id*="adsterra"], [class*="adsterra"]')
      if (!rendered) setEmpty(true)
    }, 6_000)
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
/* Zone keys for wc26.mehdijabry.dev — pulled from Adsterra dashboard         */
/* (publishers > websites > wc26.mehdijabry.dev > Get code on each unit)       */
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
