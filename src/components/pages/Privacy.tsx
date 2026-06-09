import { useEffect } from 'react'

/**
 * Privacy policy. Required for AdSense + GDPR + cookie consent compliance.
 * Lists every third party we send user data to and what we keep ourselves.
 * Effective date is updated in source whenever we change real behaviour.
 */
export function Privacy() {
  useEffect(() => {
    document.title = 'Privacy Policy · WC26 Live'
  }, [])

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          Privacy Policy
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-marine-950 tracking-tight">
          Your data, in <span className="text-accent-gold">plain English</span>.
        </h1>
        <p className="mt-4 font-mono text-xs text-slate-500">
          Effective: June 9, 2026 · Last updated: June 9, 2026
        </p>
      </header>

      <section className="prose prose-slate prose-lg max-w-none space-y-6 text-slate-700 leading-relaxed">
        <p>
          WC26 Live (operated by mehdijabry.dev studio, "<strong>we</strong>",
          "<strong>us</strong>", "<strong>our</strong>") respects your
          privacy. This page explains what we collect, why, who we share it
          with, and what rights you have. If anything here is unclear, write
          to <a href="mailto:jabrymyriam@gmail.com" className="text-accent-gold underline">jabrymyriam@gmail.com</a> and
          we'll fix the language.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          1. What we collect
        </h2>

        <p>
          <strong>A. When you just browse the site (no account)</strong>
        </p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li>
            Standard server logs (IP address, user-agent, pages visited,
            timestamp) for ~30 days for security + analytics.
          </li>
          <li>
            Anonymous, aggregate analytics via Cloudflare Web Analytics
            (no cookies, no fingerprinting). See{' '}
            <a href="https://www.cloudflare.com/web-analytics-privacy/" className="text-accent-gold underline" target="_blank" rel="noopener noreferrer">
              their privacy notice
            </a>.
          </li>
          <li>
            Anonymous, aggregate analytics via Google Analytics 4 (cookies +
            IP anonymisation enabled). You can opt out in your browser.
          </li>
          <li>
            Local-storage on your device for things you do on the site
            (e.g. your bracket picks, preferred date). Stays on your machine
            unless you sign in.
          </li>
        </ul>

        <p>
          <strong>B. When you create an account</strong>
        </p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li>Your email address and chosen display name.</li>
          <li>Your bracket picks and prediction history (so we can sync across devices).</li>
          <li>
            If you sign in with Google, we receive your name, email, and
            profile picture from Google — nothing else. See Google's
            disclosure flow at sign-in for the exact scope.
          </li>
          <li>An OAuth-managed session token stored in a cookie.</li>
        </ul>

        <p>
          <strong>C. We do NOT collect</strong>
        </p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li>Payment information (we have no payments).</li>
          <li>Phone numbers.</li>
          <li>Location (beyond what an IP address coarsely implies).</li>
          <li>Microphone, camera, or device sensors.</li>
        </ul>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          2. Why we collect it
        </h2>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li>To serve the site (you can't visit without an IP).</li>
          <li>To remember your bracket so you can come back to it.</li>
          <li>To improve the site — which features people use, which break.</li>
          <li>To prevent abuse — automated scraping, brute-force sign-ins.</li>
          <li>To run ads (see §4) so the site stays free.</li>
        </ul>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          3. Who we share it with
        </h2>
        <p>We use third-party services to run the site. Each gets only what they need:</p>
        <ul className="space-y-2 list-disc list-inside ml-2">
          <li>
            <strong>Cloudflare</strong> (DNS, CDN, edge security) — sees every
            request to the site at the network layer.{' '}
            <a href="https://www.cloudflare.com/privacypolicy/" className="text-accent-gold underline" target="_blank" rel="noopener noreferrer">
              Their privacy policy
            </a>.
          </li>
          <li>
            <strong>Supabase</strong> (database + auth) — stores your account
            and bracket picks if you create an account.{' '}
            <a href="https://supabase.com/privacy" className="text-accent-gold underline" target="_blank" rel="noopener noreferrer">
              Their privacy policy
            </a>.
          </li>
          <li>
            <strong>Google</strong> (sign-in with Google + Analytics) — only
            if you choose to sign in with Google, or for anonymous traffic
            analytics.{' '}
            <a href="https://policies.google.com/privacy" className="text-accent-gold underline" target="_blank" rel="noopener noreferrer">
              Google privacy policy
            </a>.
          </li>
          <li>
            <strong>Adsterra</strong> (advertising network) — drops a cookie
            and may use device + IP signals to target ads. See §4.{' '}
            <a href="https://adsterra.com/privacy-policy/" className="text-accent-gold underline" target="_blank" rel="noopener noreferrer">
              Their privacy policy
            </a>.
          </li>
          <li>
            <strong>ESPN, TheSportsDB</strong> (data sources) — we call their
            public APIs from our edge worker, so they only see our server's IP,
            not yours.
          </li>
          <li>
            <strong>Resend</strong> (transactional email) — sends sign-in /
            recovery emails if you create an account.{' '}
            <a href="https://resend.com/legal/privacy-policy" className="text-accent-gold underline" target="_blank" rel="noopener noreferrer">
              Their privacy policy
            </a>.
          </li>
        </ul>
        <p>
          We do not sell your personal data. We do not share it with anyone
          not listed above except when forced by law.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          4. Advertising
        </h2>
        <p>
          We run third-party display ads to keep the site free. Right now our
          ad partner is <strong>Adsterra</strong> (turbulentrefreshments.com
          loader). They may set their own cookies and use your IP + device
          info to serve targeted ads.
        </p>
        <p>
          We do <em>not</em> allow popunder, push-notification, social-bar, or
          in-page-redirect ad formats — only contained iframe banners and
          native cards. If you ever see something invasive, that's a bug —
          please report it.
        </p>
        <p>
          If you're in the EU/UK/EEA: under GDPR, ad targeting requires your
          consent. If our cookie banner shows when you visit, your choices
          there take precedence over anything else on this page.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          5. Cookies
        </h2>
        <p>
          We use the smallest set of cookies that actually do something:
        </p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li><strong>Session cookies</strong> — keep you signed in.</li>
          <li><strong>Preference cookies</strong> — remember UI choices like dark/light theme.</li>
          <li><strong>Analytics cookies</strong> — Google Analytics 4 (anonymised IP).</li>
          <li><strong>Advertising cookies</strong> — set by Adsterra. Block via your browser if you want.</li>
        </ul>
        <p>
          Most modern browsers let you block, limit, or delete cookies. If
          you do, parts of the site (sign-in, saved brackets) may break.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          6. Your rights (GDPR, CCPA, PIPEDA)
        </h2>
        <p>
          Depending on where you live, you have the right to:
        </p>
        <ul className="space-y-1 list-disc list-inside ml-2">
          <li>Ask what data we hold about you.</li>
          <li>Ask us to correct or delete it.</li>
          <li>Ask us to port it to another service.</li>
          <li>Withdraw your consent at any time.</li>
          <li>File a complaint with your data protection authority.</li>
        </ul>
        <p>
          To exercise any of these, email{' '}
          <a href="mailto:jabrymyriam@gmail.com" className="text-accent-gold underline">
            jabrymyriam@gmail.com
          </a>{' '}
          from the address tied to your account. We'll respond inside 30 days.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          7. Children
        </h2>
        <p>
          WC26 Live is not directed at children under 13. We don't knowingly
          collect their data. If you believe a child has signed up, write to
          us and we'll delete the account.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          8. Security
        </h2>
        <p>
          Traffic is HTTPS-only. Accounts are stored on Supabase (managed
          Postgres, encryption at rest). We never store passwords — only
          Supabase-managed Argon2 hashes. We patch dependencies on a
          rolling basis. If you find a security issue, write to{' '}
          <a href="mailto:jabrymyriam@gmail.com" className="text-accent-gold underline">
            jabrymyriam@gmail.com
          </a>{' '}
          — we'll respond quickly and credit you (if you want) in the fix.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          9. Changes to this policy
        </h2>
        <p>
          If we change how we handle data, we'll update the "Last updated"
          date at the top of this page and, for material changes, post a
          notice on the home page for at least 30 days.
        </p>

        <h2 className="text-2xl font-display font-bold text-marine-950 mt-10 mb-3">
          10. Contact
        </h2>
        <p>
          Privacy questions, requests, complaints:{' '}
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
