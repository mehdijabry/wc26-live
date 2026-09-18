import { Link } from 'react-router-dom'
import { useSiteSettings } from '../store/siteSettings'
import { useT } from '../lib/i18n'

export function Footer() {
  const t = useT()
  const wc26Visible = useSiteSettings((s) => s.wc26Visible)
  return (
    <footer className="border-t border-slate-200/70 py-12 text-center text-xs text-slate-500">
      <div className="container max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <img src="/p90-logo.svg" alt="" className="w-7 h-7 rounded-md" />
          <div className="leading-tight text-left" dir="ltr">
            <div className="font-display font-bold text-base text-slate-900">
              Pressing <span className="text-accent-gold">90’</span>
            </div>
            <div className="text-[9px] uppercase tracking-[0.2em] font-mono mt-0.5 text-slate-500">
              live football scores
            </div>
          </div>
        </div>

        {/* Site map — About / Contact / Privacy / Terms. Required for the
            AdSense application and a general trust signal. */}
        <nav className="my-5 flex items-center justify-center flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.15em]">
          <Link to="/about" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('About')}
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/contact" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('Contact')}
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/privacy" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('Privacy')}
          </Link>
          <span className="text-slate-300">·</span>
          <Link to="/terms" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('Terms')}
          </Link>
        </nav>

        <div className="font-mono">
          {t('Not affiliated with FIFA or any league. Data source: ESPN public API.')}{' '}
          {t('Built by')}{' '}
          <a
            href="https://mehdijabry.dev"
            className="text-accent-gold hover:text-yellow-300 transition-colors"
          >
            mehdijabry.dev
          </a>
          .
        </div>
        {/* Gambling disclaimer — required by the ANJ risk-message rule and
            by affiliate networks' site review before any bookmaker
            affiliation. Keep it on every page (footer), short, with the
            full detail on /responsible-gambling. */}
        <div className="mt-4 font-mono text-[11px] text-slate-500">
          <span className="font-semibold text-slate-600">18+</span>{' · '}
          {t('Gambling involves risks: debt, isolation, addiction.')}{' '}
          <Link to="/responsible-gambling" className="text-accent-gold hover:text-yellow-300 underline decoration-accent-gold/40 transition-colors">
            {t('Play responsibly')}
          </Link>
        </div>
        <div className="mt-4 text-slate-700">
          {t('⚽ Live scores · news')}
          {wc26Visible && (
            <>
              {' · '}
              <Link to="/wc26" className="hover:text-accent-gold transition-colors underline decoration-slate-300">
                {t('World Cup 2026 archive')}
              </Link>
            </>
          )}
        </div>
      </div>
    </footer>
  )
}
