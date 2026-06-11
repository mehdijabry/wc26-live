import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  broadcastersFor,
  competitionLabel,
  competitionsForCountry,
  watchCountryFromSlug,
  type Broadcaster,
} from '../../lib/api'

/**
 * /watch/:country — editorial 'where to watch FIFA WC 2026 in <country>'
 * landing page. Built as an SEO trap for the run-up search wave:
 * 'where to watch world cup 2026 in canada', 'maillots france diffusion
 * mondial 2026', 'mondial 2026 en direct au maroc'. Each country gets a
 * dedicated URL like /watch/canada so Google can index one canonical page
 * per locale.
 *
 * On-page elements:
 *   1. Strong H1 with the canonical search phrase
 *   2. Local kickoff for the opening match (June 11, 20:00 ET in MEX/USA/CAN)
 *   3. Broadcasters list with Free TV / Pay TV / Streaming labels
 *   4. Schedule rail with timezone-converted kickoffs
 *   5. 'What else is on' rail with other competitions we have rights for
 *   6. Internal links back to /wc26, /predictions, /today
 *
 * SEO meta:
 *   - <title> tuned per country, includes the headline broadcaster
 *   - meta description with the broadcasters listed inline
 *   - JSON-LD WebPage + BroadcastEvent structured data
 *   - canonical URL (no querystring weirdness)
 */

// FIFA-confirmed opening match kickoff. Mexico host. The minute is
// already widely published so we hardcode the UTC instant and let the
// per-country timezone math localise it.
const OPENING_MATCH_UTC = '2026-06-11T19:00:00Z'

// IANA-tz aware local time string. We use Intl.DateTimeFormat directly
// rather than dayjs/luxon so we don't bring a date library along.
function formatLocal(utc: string, tz: string, locale = 'en-US'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: tz,
      hour12: false,
    }).format(new Date(utc))
  } catch {
    return new Date(utc).toUTCString()
  }
}

function BroadcasterChip({ b }: { b: Broadcaster }) {
  const tone =
    b.free
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : b.type === 'streaming'
        ? 'bg-blue-50 text-blue-800 border-blue-200'
        : 'bg-slate-50 text-slate-800 border-slate-200'
  const label =
    b.free
      ? 'Free TV'
      : b.type === 'streaming'
        ? 'Streaming'
        : 'TV'
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border ${tone}`}>
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] opacity-70">
        {label}
      </span>
      <span className="font-display font-semibold text-sm">{b.name}</span>
    </div>
  )
}

export function WatchCountry() {
  const { country: slug } = useParams<{ country: string }>()
  const country = useMemo(() => (slug ? watchCountryFromSlug(slug) : null), [slug])

  // Pull WC rights specifically — the headline rail on every country page
  // is 'where do I watch the World Cup'. The 'else on' rail uses
  // competitionsForCountry() to surface UCL / domestic top tier as well.
  const wcRights = useMemo(() => {
    if (!country) return [] as Broadcaster[]
    const all = broadcastersFor('fifa.world') ?? []
    const row = all.find((r) => r.country === country.code)
    return row?.broadcasters ?? []
  }, [country])

  const others = useMemo(() => {
    if (!country) return []
    return competitionsForCountry(country.code).filter((c) => c.slug !== 'fifa.world')
  }, [country])

  // SEO: title, description, JSON-LD, canonical
  useEffect(() => {
    if (!country) return
    const headline = wcRights.slice(0, 3).map((b) => b.name).join(' · ')
    const title = `Where to Watch FIFA World Cup 2026 in ${country.name}${headline ? ` · ${headline}` : ''}`
    document.title = title
    setMeta('description',
      `Watch the FIFA World Cup 2026 in ${country.name}: live on ${
        wcRights.length > 0 ? wcRights.map((b) => b.name).join(', ') : 'check local listings'
      }. Opening match kicks off ${formatLocal(OPENING_MATCH_UTC, country.timezone)}.`
    )
    setLink('canonical', `https://pressing90.live/watch/${country.slug}`)
    setOg('og:title', title)
    setOg('og:url', `https://pressing90.live/watch/${country.slug}`)
    setOg('og:description', `${country.name} broadcasters for the 2026 FIFA World Cup. Local kickoff times, free TV vs paid TV vs streaming, full schedule.`)

    // JSON-LD structured data — a WebPage with a contained
    // BroadcastEvent. Helps Google show this page in 'Where to watch'
    // rich results.
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description: `Where to watch the FIFA World Cup 2026 in ${country.name}`,
      url: `https://pressing90.live/watch/${country.slug}`,
      inLanguage: 'en',
      mainEntity: {
        '@type': 'SportsEvent',
        name: 'FIFA World Cup 2026',
        startDate: OPENING_MATCH_UTC,
        endDate: '2026-07-19T22:00:00Z',
        location: {
          '@type': 'Place',
          name: 'United States · Mexico · Canada',
        },
        organizer: {
          '@type': 'SportsOrganization',
          name: 'FIFA',
        },
        ...(wcRights.length > 0 && {
          subEvent: wcRights.map((b) => ({
            '@type': 'BroadcastEvent',
            isLiveBroadcast: true,
            publishedOn: {
              '@type': 'BroadcastService',
              name: b.name,
              broadcastDisplayName: b.name,
            },
          })),
        }),
      },
    }
    setJsonLd('watch-country', ld)
    return () => {
      const tag = document.querySelector('script[data-ld-key="watch-country"]')
      if (tag) tag.remove()
    }
  }, [country, wcRights])

  if (!country) {
    return (
      <div className="container max-w-3xl mx-auto px-6 pt-6 pb-16 text-center">
        <h1 className="font-display text-3xl font-bold text-ink-900">
          Country not found
        </h1>
        <p className="mt-3 text-slate-600">
          We don't have broadcast info for this country yet.{' '}
          <Link to="/watch" className="text-accent-gold underline">
            See all supported countries →
          </Link>
        </p>
      </div>
    )
  }

  const localKickoff = formatLocal(OPENING_MATCH_UTC, country.timezone)

  return (
    <div className="container max-w-3xl mx-auto px-6 pt-6 pb-16">
      <header className="mb-10">
        <Link to="/watch" className="text-xs font-mono text-slate-500 hover:text-accent-gold">
          ← All countries
        </Link>
        <div className="mt-4 text-6xl leading-none">{country.flag}</div>
        <div className="mt-3 font-mono text-xs uppercase tracking-[0.22em] text-slate-500">
          Where to watch
        </div>
        <h1 className="mt-2 font-display font-bold text-4xl sm:text-5xl text-ink-900 tracking-tight leading-[1.1]">
          FIFA <span className="text-accent-gold">World Cup 2026</span> in {country.name}
        </h1>
        <p className="mt-4 text-lg text-slate-700 leading-relaxed">
          Opening match kicks off <strong>{localKickoff}</strong> local time. The first
          tournament across 48 nations and 16 host cities in the US, Canada, and Mexico
          runs through July 19, 2026. Here is every legal way to follow it from {country.name}.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="font-display font-bold text-2xl text-ink-900 mb-4">
          📺 Broadcasters in {country.name}
        </h2>
        {wcRights.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-paper-elev p-6 text-slate-600">
            We don't have confirmed broadcaster info for {country.name} yet. FIFA usually
            publishes the full territory map ~30 days before kickoff. Check back closer
            to June 11, or follow our <Link to="/today" className="text-accent-gold underline">live scores</Link> in
            the meantime.
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {wcRights.map((b) => (
              <BroadcasterChip key={b.name} b={b} />
            ))}
          </div>
        )}
        <div className="mt-3 text-xs font-mono text-slate-500">
          Free TV = no subscription · Streaming = web/app subscription · TV = pay-TV bundle
        </div>
      </section>

      <section className="mb-12">
        <h2 className="font-display font-bold text-2xl text-ink-900 mb-4">
          🕐 Local kickoff times
        </h2>
        <div className="rounded-2xl border border-slate-200 bg-paper-elev p-6 space-y-3 text-slate-700">
          <div>
            <span className="text-xs font-mono uppercase tracking-[0.18em] text-slate-500 block">Opening match</span>
            <span className="font-display text-lg font-semibold text-ink-900">{localKickoff}</span>
          </div>
          <div>
            <span className="text-xs font-mono uppercase tracking-[0.18em] text-slate-500 block">Final</span>
            <span className="font-display text-lg font-semibold text-ink-900">
              {formatLocal('2026-07-19T20:00:00Z', country.timezone)}
            </span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mt-3 pt-3 border-t border-slate-200">
            All 104 match times are converted to your local timezone automatically when
            you visit <Link to="/today" className="text-accent-gold underline">Today's matches</Link> or
            the <Link to="/wc26" className="text-accent-gold underline">WC26 hub</Link>.
          </p>
        </div>
      </section>

      {others.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-ink-900 mb-4">
            ⚽ What else is on in {country.name}
          </h2>
          <p className="text-slate-600 mb-4 leading-relaxed">
            While you're waiting for the next World Cup match, these competitions are
            broadcast on the same networks.
          </p>
          <div className="space-y-3">
            {others.map((c) => (
              <div key={c.slug} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="font-display font-semibold text-ink-900">
                  {competitionLabel(c.slug)}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.broadcasters.map((b) => (
                    <BroadcasterChip key={b.name} b={b} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-12 rounded-2xl bg-marine-950 text-cream p-6 sm:p-8">
        <h2 className="font-display font-bold text-2xl mb-3">
          Make your bracket while you wait
        </h2>
        <p className="text-cream/80 mb-5">
          Pick your 48 → 1 path, share a poster, climb the global leaderboard.
          It takes 90 seconds.
        </p>
        <Link
          to="/predictions"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
        >
          Start your bracket →
        </Link>
      </section>

      <footer className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500 font-mono">
        Broadcaster info compiled from publicly announced rights deals.
        We don't control any third-party schedule — please verify with your
        provider on match day. Spotted a missing or wrong broadcaster?
        Email <a href="mailto:info@pressing90.live" className="text-accent-gold underline">info@pressing90.live</a>.
      </footer>
    </div>
  )
}

// ----- meta helpers shared with the index page -------------------------

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
