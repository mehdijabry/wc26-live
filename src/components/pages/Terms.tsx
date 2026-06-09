import { useEffect } from 'react'

/**
 * Terms of Service. Required for AdSense + sets the legal boundary for
 * acceptable use, IP, no-warranty, and how rights holders should reach us
 * for takedowns. Effective date is bumped in source when terms change.
 */
export function Terms() {
  useEffect(() => {
    document.title = 'Terms of Service · WC26 Live'
  }, [])

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          Terms of Service
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-marine-950 tracking-tight">
          The <span className="text-accent-gold">house rules</span>, in
          readable English.
        </h1>
        <p className="mt-4 font-mono text-xs text-slate-500">
          Effective: June 9, 2026 · Last updated: June 9, 2026
        </p>
      </header>

      <section className="prose prose-slate prose-lg max-w-none space-y-6 text-slate-700 leading-relaxed">
        <p>
          By using <strong>pressing90.live</strong> ("the Service", "the
          Site") you agree to these terms. If you don't agree, please don't
          use the Site. We may update these terms — if we do, we'll update
          the "Last updated" date and continued use means you accept the new
          version.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          1. Who runs this
        </h2>
        <p>
          The Site is operated by <strong>mehdijabry.dev studio</strong>, a
          freelance web studio based in Canada. Contact:{' '}
          <a href="mailto:jabrymyriam@gmail.com" className="text-accent-gold underline">
            jabrymyriam@gmail.com
          </a>.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          2. What the Site is (and isn't)
        </h2>
        <p>
          The Site is an independent fan project covering the 2026 FIFA
          World Cup and worldwide football. It is <strong>not affiliated</strong>{' '}
          with FIFA, US Soccer, the Canadian Soccer Association, the
          Mexican Football Federation, any participating nation's federation,
          UEFA, CONMEBOL, ESPN, TheSportsDB, or any broadcaster.
        </p>
        <p>
          We provide scores, predictions, and broadcast information for
          general entertainment and editorial purposes. We do not provide
          betting tips, professional analysis, or financial advice.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          3. Accounts
        </h2>
        <p>
          You can browse most of the Site without an account. To save and
          share a bracket or to appear on the leaderboard, you need to
          create one. You agree:
        </p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li>To give us a real email address that you control.</li>
          <li>To keep your sign-in credentials secret.</li>
          <li>That you are at least 13 years old.</li>
          <li>That you are responsible for activity from your account.</li>
        </ul>
        <p>
          We can suspend or delete accounts that we reasonably believe are
          fraudulent, abusive, impersonating someone else, scraping at scale,
          or attempting to break the Site.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          4. Acceptable use
        </h2>
        <p>You agree NOT to:</p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li>Scrape the Site at scale, attempt DDoS, or otherwise interfere with availability.</li>
          <li>Reverse-engineer, decompile, or attempt to extract proprietary code (the Site is delivered as a public web app, but the codebase is © its authors).</li>
          <li>Use the Site to harass other users, post unlawful content as a display name, or impersonate other people.</li>
          <li>Use automated tools to create fake accounts or stuff brackets.</li>
          <li>Frame, mirror, or republish the Site without permission.</li>
        </ul>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          5. Intellectual property
        </h2>
        <p>
          <strong>Our content</strong> — the design, brand identity ("WC26
          Live", "Pressing 90'"), copy, layouts, illustrations, and original
          editorial — is owned by mehdijabry.dev studio. You may not
          republish it commercially without written permission. Linking to
          and quoting (with attribution) for non-commercial use is fine.
        </p>
        <p>
          <strong>Third-party content</strong> — scores, schedules, team
          logos, player photos, and broadcaster trademarks are the property
          of their respective owners (FIFA, federations, broadcasters,
          ESPN, etc.). We use this material under fair use / fair dealing
          for editorial purposes. If you are a rights holder and believe a
          specific use is not covered, see §10 (Takedowns).
        </p>
        <p>
          <strong>Your content</strong> — the bracket picks and predictions
          you create remain yours, but you grant us a non-exclusive,
          worldwide, royalty-free licence to display them on the Site,
          aggregate them into leaderboards and statistics, and share the
          poster image you generate via the "Share bracket" feature.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          6. Predictions, leaderboards, and gameplay
        </h2>
        <p>
          The bracket predictor is for entertainment only. It is not
          gambling, there is no monetary prize, and we don't accept any
          form of wager. Leaderboard rankings have no real-world standing
          and we reserve the right to recalculate, freeze, or reset them
          (e.g. to correct a data error, kick out cheaters).
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          7. Advertising
        </h2>
        <p>
          We run third-party display ads on the Site. We do not endorse the
          advertisers and we are not responsible for the products or
          services they promote. If you see an ad that is invasive,
          misleading, deceptive, or breaks the law, please report it to{' '}
          <a href="mailto:jabrymyriam@gmail.com" className="text-accent-gold underline">
            jabrymyriam@gmail.com
          </a>{' '}
          so we can blacklist the creative.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          8. No warranty
        </h2>
        <p>
          The Site is provided "AS IS" and "AS AVAILABLE" with no warranty
          of any kind. Scores can be wrong, late, or missing. Brackets can
          be lost in the event of a data store failure. Broadcast listings
          can be out of date. We will do our best, but we do not guarantee
          uptime, accuracy, or fitness for any particular purpose.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          9. Liability cap
        </h2>
        <p>
          To the maximum extent allowed by law, our total liability to you
          for any claim arising from your use of the Site is capped at the
          greater of <strong>CAD $10</strong> or what you paid us in the 12
          months preceding the claim (which, since the Site is free, will be
          $0).
        </p>
        <p>
          We are not liable for indirect, incidental, special, consequential,
          or punitive damages — including lost earnings on a bracket
          competition you ran with friends.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          10. DMCA / copyright takedowns
        </h2>
        <p>
          If you are a rights holder and you believe we have used your
          material in a way that exceeds fair use, please email{' '}
          <a href="mailto:jabrymyriam@gmail.com" className="text-accent-gold underline">
            jabrymyriam@gmail.com
          </a>{' '}
          with:
        </p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li>Your contact info + proof that you represent the rights holder.</li>
          <li>The specific URL(s) on our Site where the content appears.</li>
          <li>A description of the original work.</li>
          <li>A signed statement that you have a good-faith belief the use is unauthorised.</li>
        </ul>
        <p>
          We aim to action all legitimate takedown requests within
          <strong> 5 business days</strong>.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          11. Termination
        </h2>
        <p>
          You can stop using the Site at any time. You can delete your
          account from the user menu or by emailing us. We can suspend or
          terminate access for users who break these terms.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          12. Governing law
        </h2>
        <p>
          These terms are governed by the laws of the Province of Quebec,
          Canada, without regard to its conflict-of-law principles. Any
          dispute will be heard in the courts of Montreal, QC, except where
          a consumer-protection statute in your home jurisdiction guarantees
          you a different forum.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          13. Contact
        </h2>
        <p>
          Questions about these terms:{' '}
          <a href="mailto:jabrymyriam@gmail.com" className="text-accent-gold underline">
            jabrymyriam@gmail.com
          </a>
          .
        </p>
      </section>

      <footer className="mt-16 pt-8 border-t border-slate-200 font-mono text-xs text-slate-500">
        WC26 Live · Pressing 90' · pressing90.live
      </footer>
    </div>
  )
}
