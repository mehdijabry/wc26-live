export function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 text-center text-xs text-slate-500">
      <div className="container max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="text-xl">⚽️</span>
          <span className="font-display font-bold text-base text-white">
            WC<span className="text-accent-gold">26</span> Hub
          </span>
        </div>
        <div className="font-mono">
          Not affiliated with FIFA. Data sources (planned v2): ESPN public API ·
          FIFA.com v3 endpoints · Sofascore. Built by{' '}
          <a
            href="https://mehdijabry.dev"
            className="text-accent-gold hover:text-yellow-300 transition-colors"
          >
            mehdijabry.dev
          </a>
          .
        </div>
        <div className="mt-4 text-slate-700">
          June 11 → July 19, 2026 · 🇨🇦 🇲🇽 🇺🇸 · 48 nations · 104 matches · one bracket
        </div>
      </div>
    </footer>
  )
}
