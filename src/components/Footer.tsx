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
          <img src="/p90-logo.svg" alt="" className="w-9 h-9" />
          <div className="leading-tight text-left" dir="ltr">
            <div className="font-display font-bold text-base text-slate-900">
              Pressing <span className="text-accent-gold">90’</span>
            </div>
            <div className="text-[8px] uppercase tracking-[0.16em] font-mono mt-1 leading-[1.5] text-slate-500">
              <div>More than a game.</div>
              <div>Our field of expression.</div>
            </div>
          </div>
        </div>

        {/* Site map — About / Contact / Privacy / Terms. Required for the
            AdSense application and a general trust signal. */}
        <nav className="my-5 flex items-center justify-center flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.15em]">
          <Link to="/about" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('About')}
          </Link>
          <span className="text-slate-400">·</span>
          <Link to="/contact" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('Contact')}
          </Link>
          <span className="text-slate-400">·</span>
          <Link to="/privacy" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('Privacy')}
          </Link>
          <span className="text-slate-400">·</span>
          <Link to="/terms" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('Terms')}
          </Link>
          <span className="text-slate-400">·</span>
          {/* Le bandeau 18+ qui menait à cette page a été retiré le
              12/10/2026 avec les traces d'affiliation, et la page s'est
              retrouvée ORPHELINE : indexée, utile, mais atteignable par
              personne. Elle reprend sa place ici, sous son vrai sujet —
              ce que sont les cotes affichées et pourquoi le jeu est
              gratuit. */}
          <Link to="/responsible-gambling" className="text-slate-600 hover:text-accent-gold transition-colors">
            {t('Odds & fair play')}
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
        {/* ── LE BANDEAU « 18+ · LES JEUX D'ARGENT COMPORTENT DES RISQUES »
            A ÉTÉ RETIRÉ LE 12/10/2026 ────────────────────────────────────
            Il n'avait jamais été posé pour nos joueurs : il était là pour
            la revue des RÉGIES D'AFFILIATION, en prévision d'une
            affiliation bookmaker qui n'a jamais été mise en place (voir le
            meta « Gambling Affiliation » retiré d'index.html le même jour).

            Or il décrivait faux. On ne prend pas d'argent, on n'en verse
            pas, il n'y a aucun lien sortant vers un opérateur : on mise des
            crampons gratuits sur des cotes réelles. Afficher sur CHAQUE
            page « les jeux d'argent comportent des risques : endettement,
            isolement, dépendance » décrivait un produit qui n'existe pas —
            et le décrivait à Google, en plein examen AdSense, qui refuse
            les sites de jeux d'argent. */}
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
