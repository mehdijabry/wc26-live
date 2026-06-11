import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { listWatchCountries } from '../../lib/api'

/**
 * /watch — index of every country we have broadcast rights data for.
 * The whole point is to capture the 'where to watch world cup 2026'
 * search wave then funnel visitors to their country-specific page —
 * which is the page Google actually surfaces in 'near me'-style results.
 *
 * Layout: hero, big grid of country tiles (flag + name → link),
 * editorial copy explaining how we source the rights, internal links
 * back into /wc26 + /today + /predictions.
 */
export function Watch() {
  const countries = listWatchCountries()

  useEffect(() => {
    document.title = 'Where to Watch FIFA World Cup 2026 by Country · Pressing 90'
    setMeta('description',
      `Find the official broadcasters for the FIFA World Cup 2026 in your country. ${countries.length} countries covered — free TV, pay-TV, and streaming options listed for each.`
    )
    setLink('canonical', 'https://pressing90.live/watch')
    setOg('og:title', 'Where to Watch FIFA World Cup 2026 — every country')
    setOg('og:url', 'https://pressing90.live/watch')
    setOg('og:description', `Broadcasters in ${countries.length}+ countries for the 2026 FIFA World Cup. Pick your country, see the channels.`)

    // Index page JSON-LD — ItemList of the country pages, helps Google
    // discover the per-country canonical URLs without needing to crawl
    // a sitemap.
    setJsonLd('watch-index', {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'FIFA World Cup 2026 Broadcasters by Country',
      url: 'https://pressing90.live/watch',
      hasPart: countries.map((c) => ({
        '@type': 'WebPage',
        name: `Where to Watch FIFA World Cup 2026 in ${c.name}`,
        url: `https://pressing90.live/watch/${c.slug}`,
      })),
    })
    return () => {
      const tag = document.querySelector('script[data-ld-key="watch-index"]')
      if (tag) tag.remove()
    }
  }, [countries])

  return (
    <div className="container max-w-5xl mx-auto px-6 pt-6 pb-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          Where to watch
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-ink-900 tracking-tight leading-[1.1]">
          FIFA <span className="text-accent-gold">World Cup 2026</span>{' '}
          <span className="italic text-slate-700">by country</span>
        </h1>
        <p className="mt-5 text-lg text-slate-700 leading-relaxed max-w-2xl">
          Find the official TV channels and streaming services airing the FIFA World
          Cup 2026 in your country. Tap a flag for kickoff times in your timezone,
          free vs paid coverage, and what else is on the same networks.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="font-display font-bold text-2xl text-ink-900 mb-5">
          🌍 Pick your country
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {countries.map((c) => (
            <Link
              key={c.code}
              to={`/watch/${c.slug}`}
              className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 hover:border-accent-gold hover:bg-paper-elev transition-colors"
            >
              <span className="text-3xl leading-none shrink-0">{c.flag}</span>
              <div className="min-w-0">
                <div className="font-display font-semibold text-sm text-ink-900 truncate">
                  {c.name}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 group-hover:text-accent-gold">
                  See channels →
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-12 prose prose-slate max-w-none">
        <h2 className="font-display font-bold text-2xl text-ink-900">
          How we source the rights
        </h2>
        <p className="text-slate-700 leading-relaxed">
          Each country page lists the broadcasters that have publicly announced rights
          deals with FIFA for the 2026 World Cup, sorted by audience reach. We split
          them into three categories: <strong>Free TV</strong> (no subscription needed),{' '}
          <strong>Pay-TV</strong> (cable / satellite bundle), and <strong>Streaming</strong>{' '}
          (subscription app / web). We don't link directly to any provider — pricing
          and availability change too often, so we leave the final hop to you.
        </p>
        <p className="text-slate-700 leading-relaxed">
          On match day, our{' '}
          <Link to="/today" className="text-accent-gold underline">Today's matches</Link>{' '}
          page also surfaces per-match broadcasters via TheSportsDB live data, which
          covers more obscure regional rights than the universal FIFA territory map.
        </p>
      </section>

      <section className="rounded-2xl bg-marine-950 text-cream p-6 sm:p-8">
        <h2 className="font-display font-bold text-2xl mb-3">
          Stay on the page — bracket, scores, predictions
        </h2>
        <p className="text-cream/80 mb-5 max-w-xl">
          We built the cleanest live-scoreboard for the tournament, plus a 48-team
          bracket predictor that takes 90 seconds and ranks you on a public
          leaderboard.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/wc26"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
          >
            Enter the WC26 Hub →
          </Link>
          <Link
            to="/predictions"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-cream text-sm font-semibold transition-colors"
          >
            🏆 Make my prediction
          </Link>
        </div>
      </section>
    </div>
  )
}

// ----- meta helpers (duplicated from WatchCountry — small enough to inline) -

function setMeta(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = name
    document.head.appendChild(tag)
  }
  tag.content = content
}

function setOg(property: string, content: string) {
  let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.content = content
}

function setLink(rel: string, href: string) {
  let tag = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!tag) {
    tag = document.createElement('link')
    tag.rel = rel
    document.head.appendChild(tag)
  }
  tag.href = href
}

function setJsonLd(key: string, ld: unknown) {
  document.querySelectorAll(`script[data-ld-key="${key}"]`).forEach((n) => n.remove())
  const tag = document.createElement('script')
  tag.type = 'application/ld+json'
  tag.setAttribute('data-ld-key', key)
  tag.textContent = JSON.stringify(ld)
  document.head.appendChild(tag)
}
