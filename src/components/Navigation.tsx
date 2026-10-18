import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { UserMenu } from './UserMenu'
import { Notifications } from './Notifications'
import Avatar from './Avatar'
import { Jeton } from './Jeton'
import { useAuth } from '../store/auth'
import { soldeCourt } from '../lib/jeu'
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
  { label: 'Leaderboard', to: '/board' },
]
const WC26_LINK = { label: 'WC26 Archive', to: '/wc26' }

export function Navigation() {
  // WC26 archive entry is admin-toggled (site settings → wc26Visible).
  const wc26Visible = useSiteSettings((s) => s.wc26Visible)
  const links = wc26Visible ? [...BASE_LINKS, WC26_LINK] : BASE_LINKS
  const t = useT()
  const lang = useLang((s) => s.lang)
  // L'avatar du bouton mobile, et le solde qui n'apparait qu'une fois ouvert.
  const user = useAuth((s) => s.user)
  const profile = useAuth((s) => s.profile)
  const profilEtat = useAuth((s) => s.profilEtat)
  const setLang = useLang((s) => s.setLang)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // ── LE TIROIR SE FERME DÈS QU'ON CHANGE DE PAGE ──────────────────────
  // Il ne se fermait que sur ses PROPRES liens, qui appellent chacun
  // `setMenuOpen(false)` à la main. Tout ce qui navigue depuis l'intérieur
  // sans passer par eux — les raccourcis du compte, la recherche de
  // joueur, un lien ajouté demain — laissait le tiroir ouvert par-dessus
  // la page demandée (Mehdi, 17/10/2026).
  //
  // Une règle unique posée sur l'adresse vaut mieux qu'un rappel par
  // lien : elle couvre aussi ceux qui n'existent pas encore. `UserMenu`
  // suit déjà exactement ce schéma pour sa liste déroulante.
  const chemin = useLocation().pathname
  useEffect(() => { setMenuOpen(false) }, [chemin])

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
          <Link to="/" className="flex items-center gap-2.5 group min-w-0">
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
            <div className="leading-tight min-w-0" dir="ltr">
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
              {/* RIEN SOUS `sm`. Mesuré le 11/10/2026 : avec la pastille du
                  solde (148 px, davantage encore quand le joueur porte des
                  médailles), la signature fait déborder l'en-tête de 5 px
                  sur un écran de 390 — et elle passait sous la pastille sur
                  celui de Mehdi. Un téléphone porte déjà la marque, le solde
                  et le menu ; la signature vit sur ordinateur et au pied de
                  page, où elle a la place. */}
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
          </nav>

          <div className="flex items-center gap-2">
            {/* ── LA LANGUE REMONTE DANS L'EN-TETE ──────────────────────────
                Elle vivait tout en bas du tiroir mobile, en trois gros
                boutons. Le hamburger ayant libere la place (Mehdi,
                16/10/2026), elle reprend ici la forme qu'elle a deja a
                l'ordinateur : EN / FR / AR ecrit court, et le choix au clic. */}
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
            {/* ── LA CLOCHE, SUR TOUT LE SITE ──────────────────────────────
                Mehdi, 17/10/2026 : « le bouton ne doit pas etre juste dans
                profil, il doit etre general au site comme le bouton avatar ».
                Elle se place a GAUCHE de l'avatar, ordinateur et telephone
                confondus, et ne s'affiche que pour un joueur connecte — sans
                compte, il n'y a rien a notifier. */}
            <Notifications />
            {/* La pastille complete — solde compris — reste a l'ordinateur. */}
            <div className="hidden md:block">
              <UserMenu />
            </div>
            {/* ── SUR MOBILE, UN SEUL BOUTON : L'AVATAR ────────────────────
                Mehdi, 16/10/2026 : le hamburger disparait, l'avatar le
                remplace, et RIEN ne s'affiche avant le clic — ni le solde de
                crampons ni celui de pressings. Deux boutons cote a cote
                partageaient la meme barre pour deux choses que le visiteur
                percoit comme une seule : « mon compte ». */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t('Open menu')}
              className="md:hidden w-10 h-10 rounded-full glass glass-hover flex items-center justify-center overflow-hidden"
            >
              {user ? (
                <Avatar alias={profile?.alias ?? 'fan'} url={profile?.avatar_url} graine={profile?.id} taille={30} />
              ) : (
                // Personne de connecte : meme bouton, meme place. Sans lui la
                // navigation deviendrait inaccessible aux visiteurs.
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M4.5 20c.9-3.6 3.9-5.5 7.5-5.5s6.6 1.9 7.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
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

              {/* ── LE SOLDE, PUIS LE PROFIL, PUIS LA NAVIGATION ───────────
                  Mehdi, 16/10/2026 : rien de tout cela ne s'affiche avant
                  qu'on ait touche l'avatar. Le solde d'abord, parce que c'est
                  ce qu'on vient voir ; la gestion du compte ensuite ; les
                  liens du site en dessous, inchanges. */}
              {user && (
                <div className="mb-5 rounded-2xl glass px-4 py-3 flex items-center gap-6">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Jeton type="crampon" taille={11} />
                    </div>
                    <div className="font-display text-xl leading-none tabular-nums mt-1">
                      {/* « — » et non 0 tant que le solde n'est pas revenu :
                          afficher zero ferait croire au joueur qu'il a tout
                          perdu (regle posee le 10/10). */}
                      {profilEtat === 'pret' || profile ? soldeCourt(profile?.crampons, lang === 'ar' ? 'ar-u-nu-latn' : lang) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Jeton type="pressing" taille={11} />
                    </div>
                    <div className="font-display text-xl leading-none tabular-nums mt-1 text-accent-violet">
                      {profilEtat === 'pret' || profile ? soldeCourt(profile?.pressings, lang === 'ar' ? 'ar-u-nu-latn' : lang) : '—'}
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6 pb-6 border-b border-slate-200">
                <UserMenu panneau onNaviguer={() => setMenuOpen(false)} />
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
                {/* Les langues ne sont plus ici : elles ont repris leur place
                    dans l'en-tete, au format court EN / FR / AR. */}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
