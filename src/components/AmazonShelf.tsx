import { useEffect, useState } from 'react'

/**
 * AmazonShelf — curated Amazon affiliate product rail with real product
 * imagery. Country-aware: a French visitor sees Les Bleus + ball + book,
 * a Moroccan sees Atlas Lions, etc. Unknown countries get a fully neutral
 * lineup (ball + book + WC26 bracket poster) so we never show an
 * irrelevant country jersey to a visitor whose nation we haven't curated.
 *
 * About the images
 * ----------------
 * Every img URL below was scraped on 2026-06-09 from Amazon.com search
 * results. They live on m.media-amazon.com, which Amazon serves with
 * permissive CORS for image use — hot-linking is supported and the
 * affiliate-program TOS explicitly allow displaying product images for
 * promotional purposes (when paired with the affiliate tag, which we do).
 * The image-hash portion ('51Bpk5yhjQL' etc.) is stable for the life of
 * the listing — Amazon swaps the hash only when the seller replaces the
 * main image, which on flagship products is rare. To refresh:
 *
 *   1. Open a Chrome tab to amazon.com/s?k=<query>&i=sporting
 *   2. window.document.querySelector('[data-asin] img.s-image').src
 *   3. Copy ASIN + img src into PRODUCTS / COUNTRY_JERSEYS below.
 *
 * Links are direct /dp/ASIN (with our affiliate tag) instead of /s?k=
 * search results — direct ASIN links convert better because the visitor
 * lands on a specific product page and not a noisy search results page.
 *
 * Affiliate tag
 * -------------
 * Hardcoded to 'ggreviews05f-20' (the studio's US Associates store).
 * Amazon OneLink at click time redirects the visitor to their local
 * Amazon (amazon.ca, amazon.fr, etc.) and credits the matching regional
 * tag if one is on file — works out-of-box worldwide with just the -20.
 */

const AFFILIATE_TAG = 'ggreviews05f-20'

type Product = {
  asin: string
  title: string
  caption: string
  img: string
}

// -- Universal products: ball, book, WC2026 bracket poster --------------

const PRODUCT_BALL: Product = {
  asin: 'B0DM68LLC7',
  title: 'adidas Official Match Ball',
  caption: 'The official FIFA-spec ball.',
  img: 'https://m.media-amazon.com/images/I/81q-6Ncw+uL._AC_UL320_.jpg',
}

const PRODUCT_BOOK: Product = {
  asin: 'B0CPF8DMWC',
  title: 'Inverting the Pyramid',
  caption: "Jonathan Wilson's tactical history of football.",
  img: 'https://m.media-amazon.com/images/I/814vpnmQ2RL._AC_UY218_.jpg',
}

const PRODUCT_WC26_POSTER: Product = {
  asin: 'B0H24Q34JN',
  title: '2026 World Cup Schedule Poster',
  caption: 'Full 48-team bracket on your wall.',
  img: 'https://m.media-amazon.com/images/I/813Ahx9OKNL._AC_UL320_.jpg',
}

// -- Country jerseys — scraped from Amazon.com on 2026-06-09 -----------
// Each entry is the visiting country's national-team home jersey. Caption
// is light editorial framing — kept under ~50 chars so the card layout
// stays tight at small viewport sizes.

const COUNTRY_JERSEYS: Record<string, Product> = {
  AR: {
    asin: 'B0C9V8Z5Q2',
    title: 'adidas Argentina Jersey',
    caption: 'Defending champions, still iconic.',
    img: 'https://m.media-amazon.com/images/I/51Bpk5yhjQL._AC_UL320_.jpg',
  },
  BR: {
    asin: 'B0F7X3D19Q',
    title: 'adidas Brazil Jersey',
    caption: 'Yellow, green, eternal.',
    img: 'https://m.media-amazon.com/images/I/71ye-MmqVpL._AC_UL320_.jpg',
  },
  FR: {
    asin: 'B0GHX7M73D',
    title: "Maillot équipe de France 2026",
    caption: 'Les Bleus, en bleu et blanc.',
    img: 'https://m.media-amazon.com/images/I/81nctI2cdtL._AC_UL320_.jpg',
  },
  DE: {
    asin: 'B0F7X8QMKG',
    title: "adidas Germany 26 Home Jersey",
    caption: 'Die Mannschaft, wieder da.',
    img: 'https://m.media-amazon.com/images/I/71qnp9MRN7L._AC_UL320_.jpg',
  },
  ES: {
    asin: 'B0F7XFD3J7',
    title: 'adidas Spain La Roja Jersey',
    caption: 'Campeones de Europa.',
    img: 'https://m.media-amazon.com/images/I/71u5He9Fx6L._AC_UL320_.jpg',
  },
  IT: {
    asin: 'B0F7XCM23H',
    title: "adidas Italy Azzurri Jersey",
    caption: 'Forza Azzurri.',
    img: 'https://m.media-amazon.com/images/I/71M9491r4yL._AC_UL320_.jpg',
  },
  GB: {
    asin: 'B0GVY293B1',
    title: "England 2026 Fan Jersey",
    caption: 'The Three Lions, again.',
    img: 'https://m.media-amazon.com/images/I/61Fxu4aMYLL._AC_UL320_.jpg',
  },
  US: {
    asin: 'B0D3F4QQQL',
    title: '2024 USMNT Away Jersey (Nike)',
    caption: "Pulisic's shirt, your couch.",
    img: 'https://m.media-amazon.com/images/I/61amzX-4T8L._AC_UL320_.jpg',
  },
  CA: {
    asin: 'B0FR3LCGD7',
    title: 'Canada 2026 Soccer Jersey',
    caption: 'Cheer the hosts on home soil.',
    img: 'https://m.media-amazon.com/images/I/81rH+fZGXBL._AC_UL320_.jpg',
  },
  MX: {
    asin: 'B0F7XBRSQW',
    title: 'adidas Mexico Home Jersey',
    caption: 'El Tri, the host shirt.',
    img: 'https://m.media-amazon.com/images/I/81PLKCwYz1L._AC_UL320_.jpg',
  },
  MA: {
    asin: 'B0GQJ1Z7TH',
    title: "Puma Morocco Home Jersey",
    caption: "Diema Maghreb · Atlas Lions.",
    img: 'https://m.media-amazon.com/images/I/613gRzg8iFL._AC_UL320_.jpg',
  },
}

// Default lineup for any country we haven't curated. NO country-specific
// jersey — a Vietnamese visitor shouldn't see "Argentina Jersey" with no
// context. Ball + book + bracket poster work for any football fan, any
// language, any region.
const DEFAULT_PRODUCTS: Product[] = [
  PRODUCT_BALL,
  PRODUCT_BOOK,
  PRODUCT_WC26_POSTER,
]

/**
 * Cloudflare's edge trace returns the visitor's 2-letter country code
 * directly from the edge they're connected to. Free, instant, no third
 * party, no cookie. Falls back to navigator.language and then 'default'.
 */
async function detectCountry(): Promise<string> {
  try {
    const r = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' })
    const txt = await r.text()
    const m = txt.match(/loc=([A-Z]{2})/)
    if (m) return m[1]
  } catch { /* network blocked, fall through */ }
  try {
    const lang = (navigator.language || '').toUpperCase()
    const m = lang.match(/-([A-Z]{2})/)
    if (m) return m[1]
  } catch { /* SSR / no navigator */ }
  return 'default'
}

function amazonUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}?tag=${encodeURIComponent(AFFILIATE_TAG)}`
}

export type AmazonShelfProps = {
  heading?: string
  className?: string
}

export function AmazonShelf({
  heading = 'Football gear we like',
  className,
}: AmazonShelfProps) {
  const [country, setCountry] = useState<string>('default')
  useEffect(() => {
    let cancelled = false
    detectCountry().then((c) => {
      if (!cancelled) setCountry(c)
    })
    return () => { cancelled = true }
  }, [])

  // Curated countries: jersey + ball + book.
  // Unknown countries: ball + book + WC26 bracket poster (no jersey).
  const jersey = COUNTRY_JERSEYS[country]
  const products: Product[] = jersey
    ? [jersey, PRODUCT_BALL, PRODUCT_BOOK]
    : DEFAULT_PRODUCTS

  return (
    <section className={'container max-w-6xl mx-auto px-6 my-12 ' + (className ?? '')}>
      <header className="flex items-end justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
            Sponsored picks · Amazon
          </div>
          <h2 className="font-display font-bold text-xl sm:text-2xl text-ink-900 mt-1">
            {heading}
          </h2>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400 hidden sm:block">
          Affiliate · we earn on qualifying purchases
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
        {products.map((p) => (
          <a
            key={p.asin}
            href={amazonUrl(p.asin)}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="group block bg-white border border-slate-200/70 rounded-2xl overflow-hidden hover:border-accent-gold transition-colors shadow-sm hover:shadow-md"
          >
            {/* Real Amazon product image. White background panel so the
                cut-out product photo reads cleanly against the card. */}
            <div className="aspect-square bg-white p-4 flex items-center justify-center overflow-hidden">
              <img
                src={p.img}
                alt={p.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  // Image hash invalidated by Amazon — fade out so card
                  // still feels intentional rather than broken.
                  e.currentTarget.style.opacity = '0.15'
                }}
              />
            </div>
            <div className="p-3 sm:p-4 border-t border-slate-100">
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-400">
                Amazon
              </div>
              <div className="mt-1 text-sm font-display font-semibold text-ink-900 leading-tight line-clamp-2">
                {p.title}
              </div>
              <div className="mt-1.5 text-xs text-slate-600 line-clamp-2 hidden sm:block">
                {p.caption}
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.12em] text-accent-gold font-semibold">
                Shop on Amazon <span aria-hidden>→</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <footer className="mt-3 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400 sm:hidden text-center">
        Affiliate · we earn on qualifying purchases
      </footer>
    </section>
  )
}
