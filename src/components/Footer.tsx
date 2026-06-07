export function Footer() {
  return (
    <footer className="border-t border-slate-200/70 py-12 text-center text-xs text-slate-500">
      <div className="container max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <img src="/wc26-emblem.svg" alt="" className="w-7 h-7" />
          <div className="leading-tight text-left">
            <div className="font-display font-bold text-base text-white">
              WC<span className="text-accent-gold">26</span> Live
            </div>
            <div className="text-[9px] uppercase tracking-[0.2em] font-mono mt-0.5">
              <span className="text-slate-900">Pressing</span>{' '}
              <span className="text-accent-red font-semibold">90′</span>
            </div>
          </div>
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
