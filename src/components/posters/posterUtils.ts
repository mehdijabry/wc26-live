import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { teams, type Team } from '../../data/teams'

/**
 * Helpers shared by every PhasePoster style.
 *
 * The goal here is to keep the per-style components dumb (just JSX +
 * CSS) — anything that's data-shape, async, or branding-related lives
 * in this file.
 */

/** Find the canonical Team row by ESPN/FIFA 3-letter code. */
export function teamByCode(code: string | null | undefined): Team | null {
  if (!code) return null
  return teams.find((t) => t.code.toUpperCase() === code.toUpperCase()) ?? null
}

/**
 * Build the URL the QR points to. Three cases:
 *   - bracket published + share_slug present → /u/<slug>
 *   - logged-in user with alias but unpublished → /predict?from=<alias>
 *   - anonymous → /predict (generic invite)
 *
 * The optional `phase` lets us deep-link to a specific stage inside the
 * shared poster page later (e.g. /u/mehdijabry/qf). We don't have the
 * route yet so we just append it as a query param for now.
 */
export function predictionUrl(opts: {
  alias?: string | null
  shareSlug?: string | null
  phase?: string
}): string {
  const base = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : 'https://pressing90.live'
  const { alias, shareSlug, phase } = opts
  if (shareSlug) {
    return phase
      ? `${base}/u/${shareSlug}?phase=${phase}`
      : `${base}/u/${shareSlug}`
  }
  if (alias) {
    return `${base}/predict?from=${encodeURIComponent(alias)}${phase ? `&phase=${phase}` : ''}`
  }
  return `${base}/predict`
}

/**
 * Generate a QR code as inline SVG. We use error-correction level M
 * (15% recovery) so the central 20% emblem overlay doesn't break the
 * scan. The output is plain SVG markup we can drop into a React
 * dangerouslySetInnerHTML, which keeps the poster fully inlinable for
 * html-to-image to capture without external assets.
 */
export function useQrSvg(url: string, size = 200): string | null {
  const [svg, setSvg] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 0,
      width: size,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((s) => {
        if (!cancelled) setSvg(s)
      })
      .catch(() => {
        if (!cancelled) setSvg(null)
      })
    return () => { cancelled = true }
  }, [url, size])
  return svg
}

/**
 * The 3 styles the user picked in the mockup widget. Each style maps
 * to a different aspect ratio and visual treatment but the same data
 * inputs. The styles are intentionally distinct so the same user can
 * pick the format that matches the platform they're sharing to.
 */
export type PosterStyle = 'ticket' | 'programme' | 'stadium'

export const POSTER_STYLES: { id: PosterStyle; label: string; sub: string; aspect: string }[] = [
  { id: 'ticket', label: 'Ticket de stade', sub: '9:16 · IG Story · TikTok', aspect: '9 / 16' },
  { id: 'programme', label: 'Programme officiel', sub: '1:1 · IG feed · WhatsApp', aspect: '1 / 1' },
  { id: 'stadium', label: 'Pelouse', sub: '16:9 · X / Twitter · Discord', aspect: '16 / 9' },
]
