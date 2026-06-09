/**
 * AmazonShelf — curated Amazon affiliate product row.
 *
 * Looks like editorial content (a "Gear we like" rail), not a banner.
 * Three products per row on desktop, two columns on mobile. Each card
 * opens Amazon in a new tab with our affiliate tag appended — we earn
 * 1-4% on whatever the visitor ends up buying during that session.
 *
 * Why this over a generic Adsterra slot:
 *   - CPA (commission per sale) typically pays $0.50-$5 per conversion,
 *     vs $0.001-$0.01 per display impression. 50-500× higher per
 *     conversion event.
 *   - Looks like genuine editorial — no banner blindness, no AdBlock,
 *     no clickbait shame.
 *   - We pick the products → no NSFW / dating / scam slipping through
 *     a third-party auction.
 *
 * Affiliate tag is hardcoded ('ggreviews05f-20', the US Associates store
 * for the studio's account). To rotate it, swap the AFFILIATE_TAG
 * constant — there's no env-var indirection because the tag is public
 * by design (it appears in every product URL anyway).
 */

const AFFILIATE_TAG = 'ggreviews05f-20'

type Product = {
  asin: string        // 10-char Amazon ID, the canonical product identifier
  title: string
  caption: string     // 1-line editorial framing
  image: string       // we use Amazon's media CDN
}

/**
 * Hand-picked World-Cup-2026-adjacent products. Curated for editorial
 * relevance, not just commission rate. Swap freely — the data lives
 * here so a future contributor can add seasonal rotations.
 */
const PRODUCTS: Product[] = [
  {
    asin: 'B0DC1ZBNRH',
    title: 'Adidas Argentina Home Jersey 2024',
    caption: 'Defending champions, still iconic.',
    image: 'https://m.media-amazon.com/images/I/61pyVdRBKpL._AC_UX679_.jpg',
  },
  {
    asin: 'B0D4HQBCK2',
    title: 'Adidas FIFA Official Match Ball',
    caption: 'The literal ball, on your desk.',
    image: 'https://m.media-amazon.com/images/I/71kV3rW3hWL._AC_SX679_.jpg',
  },
  {
    asin: 'B07YYLZ5K6',
    title: 'How Soccer Explains the World',
    caption: "Foer's classic, before any tournament.",
    image: 'https://m.media-amazon.com/images/I/81Vw9d2X-2L._SY425_.jpg',
  },
  {
    asin: 'B07L2RW6X1',
    title: 'Adidas Predator Football Boots',
    caption: 'The same boots the pros wear.',
    image: 'https://m.media-amazon.com/images/I/81wLDcEMykL._AC_UX695_.jpg',
  },
  {
    asin: 'B0BPDX4P5L',
    title: 'Inverting the Pyramid — Jonathan Wilson',
    caption: 'A tactical history of football.',
    image: 'https://m.media-amazon.com/images/I/81WKlOOTQYL._SY425_.jpg',
  },
  {
    asin: 'B08HG2BHSL',
    title: 'Adidas Brazil Home Jersey',
    caption: 'Yellow, green, eternal.',
    image: 'https://m.media-amazon.com/images/I/81-0jVU5z+L._AC_UX679_.jpg',
  },
]

function amazonUrl(asin: string): string {
  // Single-store .com link — Amazon's OneLink auto-redirects visitors to
  // their local store (.ca, .co.uk, .fr) at click time, and credits the
  // tag if the visitor's locale has a matching tag on file. So one URL,
  // worldwide-friendly out of the box.
  return `https://www.amazon.com/dp/${asin}?tag=${encodeURIComponent(AFFILIATE_TAG)}`
}

export type AmazonShelfProps = {
  /** Tagline above the rail — keeps the editorial framing. */
  heading?: string
  /** Optional className for the outer wrapper.             */
  className?: string
  /** How many products to show. Defaults to 3 (one row).   */
  count?: number
}

export function AmazonShelf({
  heading = 'Football gear we like',
  className,
  count = 3,
}: AmazonShelfProps) {
  const visible = PRODUCTS.slice(0, count)

  return (
    <section className={'container max-w-6xl mx-auto px-6 my-12 ' + (className ?? '')}>
      <header className="flex items-end justify-between mb-4 gap-3 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
            Sponsored picks · Amazon
          </div>
          <h2 className="font-display font-bold text-xl sm:text-2xl text-marine-950 mt-1">
            {heading}
          </h2>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400 hidden sm:block">
          Affiliate · we earn on qualifying purchases
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
        {visible.map((p) => (
          <a
            key={p.asin}
            href={amazonUrl(p.asin)}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="group block bg-paper-elev border border-slate-200/70 rounded-2xl overflow-hidden hover:border-accent-gold transition-colors"
          >
            <div className="aspect-square bg-white overflow-hidden">
              <img
                src={p.image}
                alt={p.title}
                loading="lazy"
                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                onError={(e) => (e.currentTarget.style.opacity = '0.2')}
              />
            </div>
            <div className="p-3 sm:p-4">
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-400">
                Amazon
              </div>
              <div className="mt-1 text-sm font-display font-semibold text-marine-950 leading-tight line-clamp-2">
                {p.title}
              </div>
              <div className="mt-1.5 text-xs text-slate-600 line-clamp-2 hidden sm:block">
                {p.caption}
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-[0.12em] text-accent-gold font-semibold">
                View on Amazon <span aria-hidden>→</span>
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
