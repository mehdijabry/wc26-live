import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { UserMenu } from './UserMenu'
import { useSiteSettings } from '../store/siteSettings'
import { useLang, useT } from '../lib/i18n'

// Real route-based navigation now — each link is its own page, no more
// anchor-jump that breaks when a section is still inside a lazy Suspense.
// Post-tournament rebrand (2026-08): the site is Pressing 90' — a
// general live-scores + news site. All WC26 pages remain reachable
// under the single "WC26 Archive" entry (→ /wc26, which links out to
// bracket / predictions / stadiums / rules) instead of five WC tabs.
const BASE_LINKS: Array<{ label: string; to: string }> = [
  { label: 'Home', to: '/' },
  { label: 'Matches', to: '/today' },
  // Les 363 pages clubs ne doivent pas dépendre du seul plan du site pour
  // être trouvées : un lien depuis chaque page du site vaut mieux.
  // « Clubs » ne dit plus ce que la section contient : depuis le
  // 10/10/2026 on y trouve d'abord le classement officiel de chaque
  // championnat, les clubs ensuite (Mehdi).
  { label: 'Leagues', to: '/clubs' },
  { label: 'News', to: '/news' },
  // Le jeu et son classement sont le produit, pas une annexe : ils méritent
  // d'être dans la navigation principale, pas seulement dans un lien de pied
  // de page. Le classement vivait à /board sans qu'aucun lien n'y mène.
  { label: 'Predict', to: '/predictions' },
  // L'analyse IA n'avait de lien que dans la barre du bas : sur ordinateur,
  // la section n'existait tout simplement pas (Mehdi, 2026-10-10). Elle se
  // place entre le pari et le classement — on lit l'analyse, on parie, on
  // regarde où ça mène.
  { label: 'Analysis', to: '/analyse' },
  // Le jeu social n'avait aucune porte d'entrée : les pages existaient, rien
  // n'y menait (Mehdi, 2026-10-10). /board est maintenant la section
  // entière — ma saison, mes groupes, mes prix, le général — et ce lien est
  // sa porte. Un deuxième lien vers /leagues ne ferait que diviser.
  { label: 'Standings', to: '/board' },
]
const WC26_LINK = { label: 'WC26 Archive', to: '/wc26' }

export function Navigation() {
  // WC26 archive entry is admin-toggled (site settings → wc26Visible).
  const wc26Visible = useSiteSettings((s) => s.wc26Visible)
  const links = wc26Visible ? [...BASE_LINKS, WC26_LINK] : BASE_LINKS
  const t = useT()
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Lock body scroll while drawer open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        // Fixed top header — logo + Sign in + hamburger always visible
        // no matter where the user scrolls. The LiveTicker matches row
        // beneath this nav is in normal document flow (NOT fixed) so it
        // scrolls away naturally with the rest of the page — only this
        // nav stays pinned.
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? 'backdrop-blur-xl bg-paper/85 border-b border-slate-200/70' : 'bg-paper'
        }`}
        // Safe-area-aware padding: in iOS standalone (PWA from home screen)
        // there's no Safari chrome, so without this the WC26 logo + Sign in
        // button slide under the notch / Dynamic Island. env(safe-area-
        // inset-top) is 0 in browser mode, ~47-59px on notched iPhones in
        // standalone mode — so this gracefully adapts to both.
        style={{
          paddingTop: `calc(env(safe-area-inset-top, 0px) + ${scrolled ? '0.75rem' : '1.25rem'})`,
          paddingBottom: scrolled ? '0.75rem' : '1.25rem',
        }}
      >
        <div className="container max-w-6xl mx-auto px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            {/* PAS DE `rounded-lg` ICI. Le SVG porte déjà ses propres coins
                arrondis ; un second rognage par CSS coupait le filet doré de
                la tuile, et le dessin se réduisait à « 90' » et un trait
                (Mehdi, 2026-10-10).

                La tuile fait une fois et demie la hauteur du bloc de texte,
                comme sur le logo de référence — à égalité elle disparaissait
                à côté du nom. */}
            <img
              src="/p90-logo.svg"
              alt="Pressing 90’"
              className="w-11 h-11 sm:w-12 sm:h-12 group-hover:scale-110 transition-transform shrink-0"
            />
            {/* dir=ltr — the Latin wordmark must not reorder in RTL mode
                (the trailing ’ jumps to the left side otherwise) */}
            <div className="leading-tight" dir="ltr">
              <div className="font-display font-bold tracking-tight text-base sm:text-lg whitespace-nowrap">
                Pressing <span className="text-accent-gold">90’</span>
              </div>
              {/* La signature de marque ne se traduit pas — une baseline
                  vit dans une seule langue. Mais elle fait quarante-deux
                  caractères : sur un téléphone elle pousserait le bouton de
                  connexion hors de l'écran, donc en dessous de `sm` on garde
                  la ligne courte qui dit ce qu'est le site. */}
              {/* SUR DEUX LIGNES. En une seule, la signature poussait la
                  navigation vers la droite et mangeait la place d'« Accueil »
                  (Mehdi, 2026-10-10). Pliée en deux et réduite d'un pixel,
                  elle tient sous le nom sans dépasser sa largeur. */}
              <div className="hidden sm:block text-[8px] uppercase tracking-[0.16em] font-mono whitespace-nowrap mt-1 leading-[1.5] text-slate-500">
                <div>More than a game.</div>
                <div>Our field of expression.</div>
              </div>
              <div className="sm:hidden text-[9px] uppercase tracking-[0.2em] font-mono whitespace-nowrap mt-0.5 text-slate-500">
                {t('live football scores')}
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  'px-3 py-1.5 text-sm rounded-sm transition-colors ' +
                  // L'onglet actif était un pavé crème : sur le sol encre
                  // c'est la chose la plus lumineuse de la page, alors que
                  // ce n'est qu'un repère. Un filet doré sous le mot suffit.
                  (isActive
                    ? 'text-accent-gold border-b-2 border-accent-gold rounded-none'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                }
              >
                {t(l.label)}
              </NavLink>
            ))}
            {/* La langue : un menu déroulant, plus la pastille à trois
                boutons. Elle occupait la largeur de deux liens de
                navigation pour une action qu'on fait une fois (Mehdi,
                2026-10-10).

                `<select>` natif plutôt qu'un menu dessiné : il se pose au
                bon endroit sur chaque système, s'ouvre au clavier, et sur
                téléphone il appelle le sélecteur de l'appareil. Un menu
                maison coûterait cent lignes pour faire moins bien. */}
            <div className="ms-3 relative">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as 'en' | 'fr' | 'ar')}
                aria-label="Language"
                className="appearance-none bg-transparent border-0 ps-1 pe-4 py-1 text-[11px] font-mono uppercase tracking-wider text-slate-500 hover:text-slate-900 focus:outline-none focus:text-slate-900 cursor-pointer transition-colors"
              >
                {([['en', 'EN'], ['fr', 'FR'], ['ar', 'AR']] as const).map(([code, label]) => (
                  // Les options sont dessinées par le système : il faut leur
                  // poser des couleurs en dur, elles n'héritent ni du thème
                  // ni des classes Tailwind.
                  <option key={code} value={code} style={{ background: '#121916', color: '#ECEFE8' }}>
                    {label}
                  </option>
                ))}
              </select>
              {/* Le chevron, puisque `appearance-none` retire celui du
                  système. `pointer-events-none` pour que le clic traverse
                  jusqu'au select. */}
              <svg
                aria-hidden="true"
                width="8" height="8" viewBox="0 0 10 6"
                className="pointer-events-none absolute end-0 top-1/2 -translate-y-1/2 text-slate-500"
              >
                <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </nav>

          <div className="flex items-center gap-2">
            <UserMenu />
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Open menu"
              className="md:hidden w-10 h-10 rounded-full glass glass-hover flex items-center justify-center"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-[55] bg-slate-900/40 backdrop-blur-md md:hidden"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 240 }}
              className="fixed top-0 right-0 bottom-0 z-[60] w-[80%] max-w-xs bg-white border-l border-slate-200 p-6 md:hidden overflow-y-auto"
              // Safe-area padding so the close × button and WC26 logo at the
              // top of the drawer aren't clipped by the notch / Dynamic Island
              // when the app runs in PWA standalone mode. Same trick as the
              // main nav header.
              style={{
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
                paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
              }}
            >
              <div className="flex items-center justify-between mb-8">
                <Link to="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5">
                  <img src="/p90-logo.svg" alt="" className="w-9 h-9" />
                  <div className="leading-tight" dir="ltr">
                    <div className="font-display font-bold tracking-tight text-sm">
                      Pressing <span className="text-accent-gold">90’</span>
                    </div>
                    <div className="text-[8px] uppercase tracking-[0.2em] font-mono mt-0.5 text-slate-500">
                      live football scores
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="w-9 h-9 rounded-full glass glass-hover flex items-center justify-center text-xl"
                >
                  ×
                </button>
              </div>

              <nav className="space-y-1">
                {links.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      'block px-4 py-3 rounded-xl text-base transition-colors ' +
                      (isActive
                        ? 'bg-slate-900 text-white'
                        : 'hover:bg-slate-100 text-slate-800 hover:text-slate-900')
                    }
                  >
                    {t(l.label)}
                  </NavLink>
                ))}
                <div className="pt-3 flex gap-2">
                  {([['en', 'English'], ['fr', 'Français'], ['ar', 'عربي']] as const).map(([code, label]) => (
                    <button
                      key={code}
                      onClick={() => setLang(code)}
                      className={'flex-1 px-2 py-2 rounded-xl text-sm font-mono transition-colors ' + (lang === code ? 'bg-accent-gold text-ink-900 font-semibold' : 'bg-slate-100 text-slate-600')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </nav>

              <div className="mt-10 pt-6 border-t border-slate-200/70 text-[10px] uppercase tracking-widest text-slate-600 font-mono">
                June 11 → July 19, 2026
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
