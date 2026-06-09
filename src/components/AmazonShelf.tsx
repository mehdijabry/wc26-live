import { useEffect, useState } from 'react'

/**
 * AmazonShelf — editorial 'Football gear we like' rail with Amazon
 * affiliate search links. Country-aware: a French visitor sees Les
 * Bleus + Ligue 1 stuff, a Moroccan visitor sees the Atlas Lions, etc.
 *
 * Why search links instead of /dp/ASIN links:
 *   - Real product images require Amazon's PA-API (3 sales in 180 days
 *     before they grant access). Without PA-API, /dp/ASIN images break
 *     the moment Amazon swaps their image hash. Search links bypass all
 *     that — Amazon does the lookup, we just send the visitor with
 *     our affiliate tag attached.
 *   - Search results include MORE products in the visitor's local
 *     store. A visitor lands on results with their currency, their
 *     shipping options, and we still earn on whatever they end up
 *     buying inside the 24h cookie window.
 *
 * Country detection: Cloudflare's /cdn-cgi/trace endpoint returns the
 * visitor's location instantly from the nearest CF edge. No third-party
 * geolocation service, no key, no rate limit, no cookie.
 */

const AFFILIATE_TAG = 'ggreviews05f-20'

// 'k' is the Amazon search query, 'accent' is the card's brand colour.
type Product = {
  k: string
  title: string
  caption: string
  emoji: string
  accent: 'gold' | 'red' | 'green' | 'blue' | 'marine'
}

// Country-specific picks. The first 3 entries of each list are what
// gets rendered. 'default' is what we fall back to when CF doesn't
// return a country or the visitor's country isn't in the map.
//
// ISO 3166-1 alpha-2 codes. Add markets as we identify them.
const COUNTRY_PRODUCTS: Record<string, Product[]> = {
  // -- North America --
  CA: [
    { k: 'canada+soccer+jersey',     title: 'Team Canada Jersey',         caption: 'Cheer the hosts on home soil.',     emoji: '🇨🇦', accent: 'red' },
    { k: 'fifa+world+cup+ball',      title: 'FIFA World Cup Match Ball',  caption: 'The official ball, on your desk.',  emoji: '⚽', accent: 'gold' },
    { k: 'soccer+tactics+book',      title: 'Inverting the Pyramid',      caption: 'A tactical history of football.',   emoji: '📚', accent: 'blue' },
  ],
  US: [
    { k: 'usmnt+jersey',             title: 'USMNT Home Jersey',          caption: "Pulisic's shirt, your couch.",      emoji: '🇺🇸', accent: 'blue' },
    { k: 'fifa+world+cup+ball',      title: 'FIFA World Cup Match Ball',  caption: 'The official ball, on your desk.',  emoji: '⚽', accent: 'gold' },
    { k: 'how+soccer+explains+world',title: 'How Soccer Explains the World', caption: "Foer's classic, before any tournament.", emoji: '📖', accent: 'marine' },
  ],
  MX: [
    { k: 'mexico+soccer+jersey',     title: 'El Tri Home Jersey',         caption: 'The host shirt that belongs in your closet.', emoji: '🇲🇽', accent: 'green' },
    { k: 'fifa+world+cup+ball',      title: 'FIFA World Cup Match Ball',  caption: 'The official ball, on your desk.',  emoji: '⚽', accent: 'gold' },
    { k: 'soccer+tactics+book',      title: 'Inverting the Pyramid',      caption: 'A tactical history of football.',   emoji: '📚', accent: 'blue' },
  ],
  // -- Europe --
  FR: [
    { k: 'maillot+france+football',  title: 'Maillot équipe de France',   caption: 'Mbappé sur le dos, en bleu et blanc.', emoji: '🇫🇷', accent: 'blue' },
    { k: 'ballon+coupe+du+monde',    title: 'Ballon officiel FIFA',       caption: 'Le vrai, sur ton bureau.',           emoji: '⚽', accent: 'gold' },
    { k: 'football+livre+tactique',  title: 'Inverting the Pyramid',      caption: 'Une histoire tactique du foot.',    emoji: '📚', accent: 'red' },
  ],
  GB: [
    { k: 'england+football+shirt',   title: 'England Home Shirt',         caption: 'The Three Lions, again.',           emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', accent: 'red' },
    { k: 'fifa+world+cup+ball',      title: 'FIFA World Cup Match Ball',  caption: 'The official ball, on your desk.',  emoji: '⚽', accent: 'gold' },
    { k: 'inverting+the+pyramid+wilson', title: 'Inverting the Pyramid',   caption: "Jonathan Wilson's tactical history.", emoji: '📚', accent: 'blue' },
  ],
  DE: [
    { k: 'deutschland+trikot',       title: 'Deutschland Heimtrikot',     caption: 'Die Mannschaft, wieder da.',         emoji: '🇩🇪', accent: 'marine' },
    { k: 'fifa+world+cup+ball',      title: 'FIFA WM Spielball',          caption: 'Der Original-Ball.',                 emoji: '⚽', accent: 'gold' },
    { k: 'soccer+tactics+book',      title: 'Inverting the Pyramid',      caption: 'Taktik-Geschichte des Fußballs.',    emoji: '📚', accent: 'red' },
  ],
  ES: [
    { k: 'camiseta+seleccion+española', title: 'Camiseta La Roja',        caption: 'Campeones de Europa.',               emoji: '🇪🇸', accent: 'red' },
    { k: 'balon+fifa',               title: 'Balón oficial FIFA',          caption: 'El balón real, en tu mesa.',         emoji: '⚽', accent: 'gold' },
    { k: 'inverting+the+pyramid',    title: 'Inverting the Pyramid',       caption: 'Historia táctica del fútbol.',       emoji: '📚', accent: 'blue' },
  ],
  IT: [
    { k: 'maglia+italia+calcio',     title: "Maglia Italia Azzurra",      caption: 'Forza Azzurri.',                     emoji: '🇮🇹', accent: 'blue' },
    { k: 'pallone+fifa',             title: 'Pallone ufficiale FIFA',     caption: 'Il pallone vero, sulla tua scrivania.', emoji: '⚽', accent: 'gold' },
    { k: 'tattica+calcio+libro',     title: 'Inverting the Pyramid',      caption: 'Storia tattica del calcio.',         emoji: '📚', accent: 'green' },
  ],
  // -- Africa & Middle East --
  MA: [
    { k: 'maillot+maroc+football',   title: 'Maillot Lions de l\'Atlas',  caption: 'Diema Maghreb.',                      emoji: '🇲🇦', accent: 'red' },
    { k: 'ballon+coupe+du+monde',    title: 'Ballon officiel FIFA',       caption: 'Le vrai, sur ton bureau.',           emoji: '⚽', accent: 'gold' },
    { k: 'football+livre+tactique',  title: 'Inverting the Pyramid',      caption: 'Une histoire tactique du foot.',    emoji: '📚', accent: 'green' },
  ],
  // -- South America --
  AR: [
    { k: 'camiseta+argentina+seleccion', title: 'Camiseta Argentina',     caption: 'Vamos vamos Argentina.',             emoji: '🇦🇷', accent: 'blue' },
    { k: 'pelota+fifa+oficial',      title: 'Pelota oficial FIFA',         caption: 'La pelota de verdad.',               emoji: '⚽', accent: 'gold' },
    { k: 'futbol+tactica+libro',     title: 'Inverting the Pyramid',      caption: 'Historia táctica del fútbol.',       emoji: '📚', accent: 'red' },
  ],
  BR: [
    { k: 'camisa+brasil+selecao',    title: 'Camisa Seleção Brasileira',  caption: 'Verde e amarelo, eterno.',           emoji: '🇧🇷', accent: 'green' },
    { k: 'bola+fifa+oficial',        title: 'Bola oficial FIFA',           caption: 'A bola de verdade.',                emoji: '⚽', accent: 'gold' },
    { k: 'futebol+tatica+livro',     title: 'Inverting the Pyramid',      caption: 'História tática do futebol.',        emoji: '📚', accent: 'blue' },
  ],
  // -- Default fallback (international) --
  default: [
    { k: 'argentina+soccer+jersey',  title: 'Argentina Home Jersey',      caption: 'Defending champions, still iconic.', emoji: '🇦🇷', accent: 'blue' },
    { k: 'fifa+world+cup+ball',      title: 'FIFA World Cup Match Ball',  caption: 'The official ball, on your desk.',  emoji: '⚽', accent: 'gold' },
    { k: 'how+soccer+explains+world',title: 'How Soccer Explains the World', caption: "Foer's classic, before any tournament.", emoji: '📖', accent: 'red' },
  ],
}

/**
 * Try to resolve the visitor's 2-letter country code from Cloudflare's
 * trace endpoint. Resolves quickly because it's served from the edge
 * the visitor is already connected to. Falls back to navigator.language
 * (less accurate) and finally to 'default'.
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

const ACCENT_BG: Record<Product['accent'], string> = {
  gold:   'bg-gradient-to-br from-accent-gold/25 to-accent-gold/5',
  red:    'bg-gradient-to-br from-accent-red/20 to-accent-red/5',
  green:  'bg-gradient-to-br from-accent-green/20 to-accent-green/5',
  blue:   'bg-gradient-to-br from-accent-blue/20 to-accent-blue/5',
  marine: 'bg-gradient-to-br from-ink-900/15 to-ink-900/5',
}

function searchUrl(q: string): string {
  return `https://www.amazon.com/s?k=${q}&tag=${encodeURIComponent(AFFILIATE_TAG)}`
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

  const products = (COUNTRY_PRODUCTS[country] ?? COUNTRY_PRODUCTS.default).slice(0, 3)

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
            key={p.k}
            href={searchUrl(p.k)}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="group block bg-white border border-slate-200/70 rounded-2xl overflow-hidden hover:border-accent-gold transition-colors shadow-sm hover:shadow-md"
          >
            {/* Accent header — flag/icon + soft gradient background. Replaces
                the broken product image. Stays editorial-feel. */}
            <div className={'h-28 sm:h-32 flex items-center justify-center text-5xl sm:text-6xl ' + ACCENT_BG[p.accent]}>
              <span aria-hidden className="drop-shadow-sm group-hover:scale-110 transition-transform duration-300">
                {p.emoji}
              </span>
            </div>
            <div className="p-4">
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-400">
                Amazon · search
              </div>
              <div className="mt-1 text-sm font-display font-semibold text-ink-900 leading-tight line-clamp-2">
                {p.title}
              </div>
              <div className="mt-1.5 text-xs text-slate-600 line-clamp-2">
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
