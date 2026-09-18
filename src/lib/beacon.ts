import { API_BASE } from './api'

/**
 * Visitor analytics beacon — one tiny POST per pageview to the worker's
 * /hit endpoint, which stores {country (CF geo), path, source, lang}.
 * This is what the admin "Visitors" stats read: real people, not
 * requests (bots/API polls are filtered worker-side too).
 *
 * Source attribution runs ONCE per browser session (how did they ARRIVE?):
 *   ?ref= / ?utm_source= (Facebook posts carry ?ref=fb)  >  referrer
 *   domain  >  'direct'. SPA navigations after that log as 'internal'.
 */

let attributed = false

function detectSource(): string {
  try {
    const q = new URLSearchParams(window.location.search)
    const tag = q.get('ref') ?? q.get('utm_source')
    if (tag) return tag === 'fb' ? 'facebook' : tag.slice(0, 24)
    const refHost = document.referrer ? new URL(document.referrer).hostname : ''
    if (!refHost || refHost.endsWith('pressing90.live')) return 'direct'
    if (/facebook\.|fb\.me|^l\.facebook/.test(refHost)) return 'facebook'
    if (/google\./.test(refHost)) return 'google'
    if (/bing\./.test(refHost)) return 'bing'
    if (/instagram/.test(refHost)) return 'instagram'
    if (/t\.co$|twitter|x\.com/.test(refHost)) return 'x'
    if (/reddit/.test(refHost)) return 'reddit'
    return 'ref:' + refHost.slice(0, 19)
  } catch { return 'direct' }
}

export function sendHit(pathname: string): void {
  try {
    // Never count automation: prerender (puppeteer) and other headless
    // drivers set navigator.webdriver.
    if (navigator.webdriver) return
    // Never count the operator's own admin browsing.
    if (pathname.startsWith('/visca-barca') || pathname.startsWith('/admin-panel-')) return

    let ns = false
    let source = 'internal'
    if (!attributed) {
      attributed = true
      source = detectSource()
      try {
        ns = !sessionStorage.getItem('p90.sess')
        if (ns) sessionStorage.setItem('p90.sess', '1')
      } catch { ns = true }
    }

    const body = JSON.stringify({
      path: pathname,
      source,
      lang: (() => { try { return localStorage.getItem('p90.lang') ?? 'en' } catch { return 'en' } })(),
      ns,
    })
    const url = `${API_BASE}/hit`
    // sendBeacon survives page unloads and never blocks rendering.
    // CAREFUL: the payload MUST be text/plain — Chrome silently kills
    // cross-origin sendBeacon calls with non-safelisted content types
    // (application/json) while still returning true, so the fallback
    // never fires and no hit ever lands. The worker's req.json() parses
    // the body regardless of the content-type header.
    if (!navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) {
      void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {})
    }
  } catch { /* analytics must never break the site */ }
}
