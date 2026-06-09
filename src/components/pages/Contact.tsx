import { useEffect, useState } from 'react'

/**
 * Contact page. Required for AdSense ('user must be able to reach you')
 * and a trust signal for SEO. Uses mailto: so we don't need any backend —
 * lower attack surface than a form endpoint.
 */
export function Contact() {
  useEffect(() => {
    document.title = 'Contact · WC26 Live'
  }, [])
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (value: string) => {
    navigator.clipboard?.writeText(value)
    setCopied(value)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          Contact · Pressing 90'
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-marine-950 tracking-tight">
          Reach out. We{' '}
          <span className="text-accent-gold">read everything</span>.
        </h1>
        <p className="mt-4 text-slate-700 text-lg">
          One inbox for everything — press, partnerships, bug reports,
          feature requests, sponsorship enquiries, data licensing, hate
          mail.
        </p>
      </header>

      <section className="space-y-8">
        {/* Primary inbox */}
        <div className="bg-paper-elev border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500 mb-2">
            Primary inbox
          </div>
          <a
            href="mailto:info@pressing90.live?subject=WC26%20Live%20%E2%80%93%20"
            className="font-display font-bold text-2xl sm:text-3xl text-marine-950 hover:text-accent-gold transition-colors break-all"
          >
            info@pressing90.live
          </a>
          <div className="mt-4 flex gap-3">
            <a
              href="mailto:info@pressing90.live?subject=WC26%20Live%20%E2%80%93%20"
              className="inline-flex items-center gap-2 bg-marine-950 text-cream rounded-full px-5 py-2.5 text-sm font-semibold hover:bg-marine-800 transition-colors"
            >
              ✉️ Send email
            </a>
            <button
              onClick={() => copy('info@pressing90.live')}
              className="inline-flex items-center gap-2 border border-slate-300 text-slate-700 rounded-full px-5 py-2.5 text-sm font-medium hover:bg-slate-100 transition-colors"
            >
              {copied === 'info@pressing90.live' ? '✓ Copied' : 'Copy address'}
            </button>
          </div>
          <div className="mt-4 text-xs text-slate-500 font-mono">
            Response time: usually under 48h on weekdays.
          </div>
        </div>

        {/* What to write about */}
        <div className="rounded-2xl border border-slate-200 p-8">
          <h2 className="font-display font-bold text-xl text-marine-950 mb-4">
            What you can write about
          </h2>
          <ul className="space-y-3 text-slate-700">
            <li className="flex gap-3">
              <span className="text-accent-gold font-bold">→</span>
              <span>
                <strong className="text-marine-950">Press & media:</strong>{' '}
                interviews, podcast invites, feature requests for editorial
                content.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent-gold font-bold">→</span>
              <span>
                <strong className="text-marine-950">Sponsorship & ads:</strong>{' '}
                direct sponsorship spots, in-content placements, branded
                bracket campaigns.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent-gold font-bold">→</span>
              <span>
                <strong className="text-marine-950">Bug reports:</strong>{' '}
                broken scores, wrong logos, layout glitches, broadcast
                listings that are off — include the match URL + your
                browser/device.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent-gold font-bold">→</span>
              <span>
                <strong className="text-marine-950">Feature requests:</strong>{' '}
                what's missing? What would make you bookmark the site?
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent-gold font-bold">→</span>
              <span>
                <strong className="text-marine-950">Data & licensing:</strong>{' '}
                if you run a paper / app and want to embed our bracket
                widget, we can talk.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-accent-gold font-bold">→</span>
              <span>
                <strong className="text-marine-950">Legal & DMCA:</strong>{' '}
                rights holders → see{' '}
                <a href="/terms" className="text-accent-gold underline">terms</a>{' '}
                for the takedown process.
              </span>
            </li>
          </ul>
        </div>

        {/* Studio link */}
        <div className="rounded-2xl border border-slate-200 p-8">
          <h2 className="font-display font-bold text-xl text-marine-950 mb-3">
            Other links
          </h2>
          <div className="space-y-2 font-mono text-sm">
            <div>
              <span className="text-slate-500">Studio:</span>{' '}
              <a
                href="https://mehdijabry.dev"
                className="text-accent-gold underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                mehdijabry.dev
              </a>
            </div>
            <div>
              <span className="text-slate-500">Facebook page:</span>{' '}
              <a
                href="https://facebook.com/pressing90"
                className="text-accent-gold underline underline-offset-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                Pressing 90'
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-16 pt-8 border-t border-slate-200 font-mono text-xs text-slate-500">
        WC26 Live · Pressing 90' · pressing90.live
      </footer>
    </div>
  )
}
