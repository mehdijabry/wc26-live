import { useEffect } from 'react'

/**
 * About page — explains what WC26 Live is, who built it, what makes it
 * different. Required for AdSense approval ('clear identity and purpose')
 * and useful editorial signal for trust + SEO.
 */
export function About() {
  useEffect(() => {
    document.title = 'About · WC26 Live'
  }, [])

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          About · Pressing 90'
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-marine-950 tracking-tight">
          We're building the cleanest place to follow{' '}
          <span className="text-accent-gold">WC2026</span>.
        </h1>
      </header>

      <section className="prose prose-slate prose-lg max-w-none space-y-6 text-slate-700 leading-relaxed">
        <p>
          <strong>WC26 Live</strong> is an independent fan project built
          around the 2026 FIFA World Cup — the first tournament across 48
          nations and 16 host cities in the US, Canada and Mexico. We surface
          live scores, brackets, predictions, and per-country broadcaster
          info, all on a single editorial-feel page that doesn't waste your
          attention.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          What you'll find here
        </h2>
        <ul className="space-y-2 list-disc list-inside">
          <li>
            <strong>Live scoreboard</strong> — every match, real-time minute
            ticking, scorer names with assister, halftime detection, and
            penalty shootout scores. Auto-refresh, no manual reload.
          </li>
          <li>
            <strong>Bracket predictor</strong> — fill in your bracket from the
            group stage to the final, save it to the cloud, share it on
            social, and grimpe le leaderboard as the tournament plays out.
          </li>
          <li>
            <strong>Broadcast guide</strong> — find out where to watch each
            match in your country, sourced live from TheSportsDB and
            augmented with curated rights for 20+ competitions.
          </li>
          <li>
            <strong>Team & player sheets</strong> — squads, history, stats,
            stadiums, and the editorial context behind each game.
          </li>
        </ul>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          Why we built it
        </h2>
        <p>
          Most live-score sites are either ad-heavy junk drawers or paywalled
          aggregators. We wanted a single page that feels like a sports paper
          you actually enjoy reading — typography, breathing room, real
          information density, and zero pop-ups. The launch animation,
          editorial fonts, and the FootMercato-style match sheet all come
          from that brief.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          How we get our data
        </h2>
        <p>
          Live scores and match metadata come from <strong>ESPN's public
          soccer API</strong>, the same source many newsrooms use. Broadcast
          rights per country come from <strong>TheSportsDB</strong>, an open
          sports database. We don't pretend to be official FIFA — we're not
          affiliated with FIFA, the host federations, or any broadcaster.
          Logos and trademarks belong to their respective owners.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          Who's behind this
        </h2>
        <p>
          WC26 Live is designed and built by{' '}
          <a
            href="https://mehdijabry.dev"
            className="text-accent-gold underline underline-offset-2 decoration-2 hover:text-yellow-600"
          >
            mehdijabry.dev
          </a>
          , a freelance web studio based in Canada. The same team built the
          Pressing 90' brand and the editorial systems running this site.
          Football has always been Mehdi's first sport — atlas lions for
          life — and this project doubles as both a fan letter and a public
          tech showcase.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          Get in touch
        </h2>
        <p>
          Press, partnerships, feature requests, bug reports, hate mail — all
          welcome on the{' '}
          <a
            href="/contact"
            className="text-accent-gold underline underline-offset-2 decoration-2 hover:text-yellow-600"
          >
            contact page
          </a>
          . We read everything.
        </p>
      </section>

      <footer className="mt-16 pt-8 border-t border-slate-200 font-mono text-xs text-slate-500">
        Last updated: June 2026 · WC26 Live · Pressing 90' · pressing90.live
      </footer>
    </div>
  )
}
