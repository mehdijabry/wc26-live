import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  api,
  competitionSlugFromEvent,
  eventTeams,
  liveClock,
  statusLabel,
  ymdUtc,
  type DailyResponse,
  type EspnCompetitor,
  type EspnEvent,
} from '../lib/api'
import { localeOf, useLang, useT } from '../lib/i18n'
import { teamBadgeFallback } from '../lib/utils'
import Ecusson from './Ecusson'
import { MatchSheet } from './MatchSheet'

/**
 * LE BANDEAU DU DIRECT — une ligne de texte qui défile sous l'en-tête.
 *
 * ── CE QU'ON MONTRE ───────────────────────────────────────────────────────
 * Seulement les matchs EN COURS. Un match à venir ou terminé n'a rien à
 * faire ici : le bandeau répond à « que se passe-t-il, là, maintenant ? ».
 * Quand rien ne se joue, le bandeau reste et le dit — « Aucun match en
 * cours » qui tourne — plutôt que de disparaître et de laisser croire que
 * la page a perdu quelque chose.
 *
 * ── POURQUOI PAS UNE ANIMATION CSS ────────────────────────────────────────
 * Une `@keyframes marquee` défile toute seule, mais elle ne se SAISIT pas :
 * on ne peut ni l'arrêter sous le doigt, ni la tirer, ni la reprendre de
 * là où on l'a lâchée. Ici la position vit dans un `useRef` et une boucle
 * `requestAnimationFrame` écrit `translateX` sur UN seul élément, à chaque
 * image, sans jamais passer par React. Le doigt (ou la souris) prend la
 * main, la rend, et trois secondes plus tard la bande repart de l'endroit
 * exact où elle est.
 *
 * ── LA BOUCLE SANS COUTURE ────────────────────────────────────────────────
 * Le contenu est rendu N fois à la suite (N ≥ 2, assez de copies pour que
 * la fenêtre soit toujours pleine — un seul match sur un grand écran en
 * demande sept). La position est ramenée modulo la largeur de la PREMIÈRE
 * copie : quand elle est entièrement sortie, on la remet à zéro et la
 * deuxième copie occupe pile la même place. L'œil ne voit rien.
 */

/** Vitesse de croisière, en pixels par seconde — indépendante du framerate. */
const VITESSE = 40
/** Temps d'attente après qu'on a lâché la bande, avant qu'elle reparte. */
const REPRISE_MS = 3_000
/**
 * En deçà, un appui est un TAP (ouvre le match) ; au-delà, un GLISSER
 * (ne doit rien ouvrir). Six pixels : un doigt qui tremble reste un tap.
 */
const SEUIL_TAP = 6
/** Au-delà, on arrête de dupliquer : on ne couvre pas un écran infini. */
const COPIES_MAX = 12
/**
 * À partir de combien de matchs en cours la bande se referme sur le présent.
 *
 * Mehdi, 20/10/2026 : « quand il y a moins de 4 matchs live, affiche les
 * matchs live ET les prochains, dans l'ordre des cinq grands championnats,
 * la C1, etc., comme dans la page matchs. Si plus de 4, la bande n'affiche
 * que les matchs live. »
 *
 * La raison tient en une phrase : une bande qui ne porterait qu'un seul
 * match un mardi après-midi tournerait à vide, alors qu'un samedi à seize
 * heures le direct suffit largement à la remplir — et tout ce qui n'est pas
 * en cours ne ferait qu'éloigner ce qui l'est.
 */
const SEUIL_DIRECT = 4
/** Plafond global : au-delà, la boucle devient trop longue pour revenir. */
const TOTAL_MAX = 12

type Glisser = {
  pointerId: number
  x0: number
  pos0: number
  bouge: boolean
  /** Le bouton touché au moment de l'appui, pour l'ouvrir si c'est un tap. */
  cible: HTMLElement | null
}

function nomDe(c: EspnCompetitor | undefined): string {
  // Le nom complet, comme sur la maquette — pas l'abréviation.
  return c?.team?.shortDisplayName ?? c?.team?.displayName ?? c?.team?.abbreviation ?? '?'
}

export function LiveTicker() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const rtl = lang === 'ar'
  const [events, setEvents] = useState<EspnEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  // L'instant où la dernière réponse ESPN est arrivée : liveClock() s'en
  // sert pour faire avancer la minute entre deux sondages (67' → 68' sans
  // attendre les 60 s du prochain fetch). Même mécanique que DailyMatches.
  // À 0 tant que rien n'est arrivé : liveClock() rend alors l'horloge brute.
  const [fetchedAt, setFetchedAt] = useState<number>(0)
  // Tic de 5 s : un re-rendu léger pour recalculer la minute projetée.
  const [, setTick] = useState(0)
  const [openMatch, setOpenMatch] = useState<{ id: string; slug: string } | null>(null)
  const [reduit, setReduit] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
  })
  const [nbCopies, setNbCopies] = useState(2)
  const vide = loaded && events.length === 0
  // Calculé ICI et pas plus bas : le décrochage en dépend, et un `const`
  // lu avant sa déclaration lève une erreur de zone morte à l'exécution.
  const aucunDirect = loaded && events.length > 0 && !events.some((ev) => statusLabel(ev).live)
  const direct = loaded && !vide && !aucunDirect

  // ── Tout ce que la boucle d'animation touche vit dans des refs : la
  // position, l'état « tenu », la pause, le sens. Rien ici ne déclenche un
  // rendu React — c'est ce qui permet d'écrire soixante images par seconde
  // sans que l'arbre bouge.
  const cadre = useRef<HTMLDivElement>(null)   // la fenêtre (overflow hidden)
  const piste = useRef<HTMLDivElement>(null)   // l'élément translaté
  // Les deux copies du décrochage. Elles portent LE MÊME décalage que la
  // piste, écrit à la même image : une tranche arrachée qui montrerait un
  // autre moment de la boucle se verrait immédiatement.
  const pisteC1 = useRef<HTMLDivElement>(null)
  const pisteC2 = useRef<HTMLDivElement>(null)
  const racine = useRef<HTMLDivElement>(null)
  const copieA = useRef<HTMLDivElement>(null)  // la première copie, mesurée
  const pos = useRef(0)                        // décalage en px, ramené dans [0, largeur)
  const largeur = useRef(0)                    // largeur d'une copie
  const tenue = useRef(false)                  // un pointeur tient la bande
  const enPause = useRef(false)                // lâchée, en attente de reprise
  const reprise = useRef<number | null>(null)  // le minuteur de reprise
  const glisser = useRef<Glisser | null>(null)
  // +1 en RTL (la piste avance vers la droite, sens de lecture), −1 en LTR.
  const sens = useRef(rtl ? 1 : -1)
  useEffect(() => { sens.current = rtl ? 1 : -1 }, [rtl])

  // ── Données : les matchs du jour, filtrés sur le direct. ──────────────
  useEffect(() => {
    let stop = false
    async function load() {
      try {
        const r = (await api.today(ymdUtc(new Date()))) as DailyResponse
        if (stop) return
        // statusLabel() porte la garde anti « match zombie » (state='in'
        // des heures avant le coup d'envoi) : on passe par lui, jamais par
        // status.type.state directement. On l'appelle UNE fois par match —
        // il relit l'horloge et la date, ce n'est pas gratuit.
        const flat = r.competitions.flatMap((c) =>
          c.events.map((ev) => ({ ev, tier: c.tier, s: statusLabel(ev) })))
        // `tier` est la hiérarchie des compétitions du site (LEAGUE_META dans
        // api.ts) : Mondial, C1, les cinq grands championnats, puis le reste.
        // C'est elle qui ordonne la page des matchs ; la bande la suit, pour
        // que les deux racontent le classement du football dans le même ordre.
        const rang = (a: { tier: number; ev: EspnEvent }, b: { tier: number; ev: EspnEvent }) =>
          a.tier - b.tier || (a.ev.date ?? '').localeCompare(b.ev.date ?? '')
        const direct = flat.filter((x) => x.s.live).sort(rang)
        const avenir = flat.filter((x) => !x.s.live && !x.s.finished).sort(rang)
        // Le direct d'abord, toujours. Les prochains ne viennent compléter
        // que lorsque le présent ne suffit pas à remplir la bande.
        const choix = direct.length >= SEUIL_DIRECT ? direct : [...direct, ...avenir]
        setEvents(choix.slice(0, TOTAL_MAX).map((x) => x.ev))
        setFetchedAt(Date.now())
      } catch {
        /* le réseau est borné (reseau.ts) : on garde la dernière liste */
      } finally {
        if (!stop) setLoaded(true)
      }
    }
    load()
    const id = setInterval(load, 60_000)
    const tickId = setInterval(() => setTick((n) => n + 1), 5_000)
    return () => { stop = true; clearInterval(id); clearInterval(tickId) }
  }, [])

  // ── SOUS L'EN-TÊTE, ET JAMAIS À MOITIÉ DESSOUS ────────────────────────
  // Mehdi, 20/10/2026, deux captures à l'appui : « une partie du haut de la
  // bande est cachée par l'en-tête ». Elle était dans le flux du document,
  // donc elle glissait sous l'en-tête fixe au premier défilement — et une
  // bande de 48 px à moitié couverte ne se lit pas comme un élément qui
  // s'en va, elle se lit comme un défaut d'affichage.
  //
  // Elle est donc COLLANTE, posée juste sous l'en-tête. Et on MESURE cet
  // en-tête au lieu de recopier une constante : il rétrécit en défilant
  // (1,25 rem de marge au repos, 0,75 une fois défilé) et grandit du
  // creux de l'écran en mode application. Un `top` écrit en dur serait
  // faux dans au moins un de ces trois états.
  const [hautEntete, setHautEntete] = useState<number | null>(null)
  useEffect(() => {
    const entete = document.querySelector('header')
    if (!entete) return
    const mesurer = () => setHautEntete(Math.round(entete.getBoundingClientRect().height))
    mesurer()
    // `border-box`, ET PAS LE DÉFAUT. L'en-tête ne change pas de contenu
    // quand il rétrécit — il change de REMBOURRAGE (1,25 rem → 0,75 au
    // défilement). Un ResizeObserver en `content-box`, qui est le défaut,
    // ne voit rien de ce changement : la bande restait collée à 84 px sous
    // un en-tête redescendu à 64, et vingt pixels de fond s'ouvraient entre
    // les deux. Mesuré en production avant correction.
    const ro = new ResizeObserver(mesurer)
    ro.observe(entete, { box: 'border-box' })
    return () => ro.disconnect()
  }, [])

  // ── Mouvement réduit : on écoute le réglage, il peut changer en route. ──
  useEffect(() => {
    const mq = (() => {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)') } catch { return null }
    })()
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setReduit(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ── Mesure : largeur d'une copie, et combien de copies il faut. ──────
  // Le contenu change (un but, un match qui finit, la police qui arrive)
  // sans que la bande ne s'en aperçoive : un ResizeObserver, pas une
  // mesure à chaque image.
  useEffect(() => {
    if (reduit) return
    const a = copieA.current
    const c = cadre.current
    if (!a || !c) return
    const mesurer = () => {
      const L = a.offsetWidth
      largeur.current = L
      const W = c.clientWidth
      setNbCopies(L > 0 ? Math.min(COPIES_MAX, Math.max(2, Math.ceil(W / L) + 1)) : 2)
    }
    mesurer()
    const ro = new ResizeObserver(mesurer)
    ro.observe(a)
    ro.observe(c)
    return () => ro.disconnect()
    // `loaded` et `vide` : la copie A est remontée quand on passe du vide au
    // message, ou du message aux matchs — il faut la ré-observer.
  }, [reduit, loaded, vide])

  // ── La boucle. Une seule, lancée une fois, qui ne connaît que des refs. ──
  useEffect(() => {
    if (reduit) return
    let id = 0
    let prev = performance.now()
    const appliquer = () => {
      const p = piste.current
      if (!p) return
      const L = largeur.current
      if (L > 0) pos.current = ((pos.current % L) + L) % L
      const t = `translateX(${sens.current * pos.current}px)`
      p.style.transform = t
      if (pisteC1.current) pisteC1.current.style.transform = t
      if (pisteC2.current) pisteC2.current.style.transform = t
    }
    const image = (now: number) => {
      // Un onglet qui revient d'arrière-plan livre un delta énorme : borné
      // à 100 ms pour que la bande ne saute pas d'un écran entier.
      const dt = Math.min(now - prev, 100) / 1000
      prev = now
      if (!tenue.current && !enPause.current) pos.current += VITESSE * dt
      appliquer()
      id = requestAnimationFrame(image)
    }
    id = requestAnimationFrame(image)
    return () => cancelAnimationFrame(id)
  }, [reduit])

  // ── LE DÉCROCHAGE DU PANNEAU ──────────────────────────────────────
  // Il ne tourne QUE quand le panneau est allumé : un panneau sans
  // courant ne décroche pas. Et son rythme est tiré au sort entre sept
  // et seize secondes — une cadence régulière se lit immédiatement comme
  // un truquage, c'est l'irrégularité qui fait vrai.
  useEffect(() => {
    if (reduit || !direct) return
    let prochain = 0
    let fin = 0
    const zap = () => {
      const el = racine.current
      if (!el) return
      el.classList.remove('p90-zap')
      void el.offsetWidth          // force le navigateur à rejouer l'animation
      el.classList.add('p90-zap')
      fin = window.setTimeout(() => el.classList.remove('p90-zap'), 280)
    }
    const boucle = () => { zap(); prochain = window.setTimeout(boucle, 7000 + Math.random() * 9000) }
    prochain = window.setTimeout(boucle, 4000 + Math.random() * 6000)
    return () => {
      clearTimeout(prochain); clearTimeout(fin)
      racine.current?.classList.remove('p90-zap')
    }
  }, [reduit, direct])

  // Le minuteur de reprise survivrait au démontage si on ne l'annulait pas.
  useEffect(() => () => { if (reprise.current !== null) clearTimeout(reprise.current) }, [])

  const programmerReprise = () => {
    if (reprise.current !== null) clearTimeout(reprise.current)
    enPause.current = true
    reprise.current = window.setTimeout(() => {
      enPause.current = false
      reprise.current = null
    }, REPRISE_MS)
  }

  const ouvrir = (el: HTMLElement | null) => {
    const id = el?.dataset.id
    const slug = el?.dataset.slug
    if (id && slug) setOpenMatch({ id, slug })
  }

  // ── Le doigt (et la souris) : prendre, tirer, lâcher. ─────────────────
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const c = cadre.current
    if (!c) return
    // La capture : les mouvements continuent d'arriver même quand le doigt
    // sort du bandeau, et le relâchement nous parvient toujours.
    try { c.setPointerCapture(e.pointerId) } catch { /* pointeur déjà parti */ }
    glisser.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      pos0: pos.current,
      bouge: false,
      cible: (e.target as HTMLElement).closest<HTMLElement>('[data-id]'),
    }
    tenue.current = true
    if (reprise.current !== null) { clearTimeout(reprise.current); reprise.current = null }
    // Empêche la sélection de texte à la souris pendant qu'on tire.
    if (e.pointerType === 'mouse') e.preventDefault()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = glisser.current
    if (!g || g.pointerId !== e.pointerId) return
    const dx = e.clientX - g.x0
    if (!g.bouge && Math.abs(dx) > SEUIL_TAP) g.bouge = true
    // La piste suit le doigt : en LTR translateX = −pos, donc tirer vers la
    // droite (dx > 0) fait BAISSER pos ; en RTL translateX = +pos et le même
    // geste le fait monter. `sens` porte ce signe. La boucle rAF écrira la
    // transformation à la prochaine image — une écriture par image, pas une
    // par événement.
    pos.current = g.pos0 + sens.current * dx
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = glisser.current
    if (!g || g.pointerId !== e.pointerId) return
    glisser.current = null
    tenue.current = false
    try { cadre.current?.releasePointerCapture(e.pointerId) } catch { /* déjà libéré */ }
    // Un tap ouvre le match touché à l'appui. On ne compte pas sur le
    // `click` du navigateur : avec la capture sur le cadre, il n'atteint
    // pas toujours le bouton (il part sur l'ancêtre commun, le cadre). Un
    // pointercancel (la page a pris le geste vertical) n'ouvre rien.
    if (!g.bouge && e.type === 'pointerup') ouvrir(g.cible)
    programmerReprise()
  }

  // Le clavier passe par `click` (Entrée/Espace) avec detail = 0 ; un vrai
  // clic de souris (detail ≥ 1) a déjà été traité par pointerup — on
  // l'ignore pour ne pas ouvrir deux fois. En mouvement réduit il n'y a pas
  // de pointeur capturé : le clic redevient le seul chemin.
  const onClickClavier = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (reduit || e.detail === 0) ouvrir(e.currentTarget)
  }

  // Un bouton qui reçoit le focus au clavier peut être hors de la fenêtre :
  // le navigateur ferait alors défiler le cadre `overflow:hidden` en douce
  // (scrollLeft ≠ 0), ce qui casserait notre translation. On ramène plutôt
  // la piste pour que le bouton soit visible, on remet scrollLeft à 0, et on
  // laisse le temps d'appuyer sur Entrée.
  const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
    if (reduit) return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')
    const c = cadre.current
    const p = piste.current
    if (!el || !c || !p) return
    const marge = 16
    pos.current = sens.current < 0
      ? Math.max(0, el.offsetLeft - marge)
      : Math.max(0, p.offsetWidth - el.offsetLeft - el.offsetWidth - marge)
    requestAnimationFrame(() => { c.scrollLeft = 0 })
    programmerReprise()
  }

  // ── Le contenu d'UNE copie. ───────────────────────────────────────────
  const contenu = (copie: number) => {
    if (!loaded) return null
    if (vide) {
      return (
        <span className="inline-flex items-center whitespace-nowrap font-sans text-[13px] text-white/50">
          {t('No match in progress')}
          <span aria-hidden className="mx-10 text-white/25">·</span>
        </span>
      )
    }
    const items = events.map((ev) => {
      const { home, away } = eventTeams(ev)
      const s = statusLabel(ev)
      // UN MATCH EN COURS PORTE SON SCORE, UN MATCH À VENIR SON HEURE.
      // Et il le dit aussi par sa couleur : le direct en craie pleine, le
      // reste en gris. Sans cette différence, une bande mêlant les deux
      // ferait lire « 0 - 0 » sur un match qui n'a pas commencé.
      const centre = s.live
        ? `${home?.score ?? '0'} - ${away?.score ?? '0'}`
        : t('vs')
      const marque = s.live
        ? (s.paused ? t('HT') : liveClock(s.rawClock, fetchedAt))
        // `localeOf` et pas `undefined` : sur un appareil réglé autrement,
        // l'heure sortirait dans la langue de la machine — et en arabe elle
        // sortirait en chiffres ٠١٢٣, que le site n'affiche jamais.
        : (ev.date ? new Date(ev.date).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' }) : '')
      // SUR LE PANNEAU, PLUS AUCUN NOM — rien que les écussons. Et chacun
      // sur une PASTILLE CLAIRE : sur le rouge, Liverpool tombe à 1,47 de
      // contraste quand il en faudrait 3 (mesuré le 20/10 ; PSG, Milan,
      // Barcelone, Villarreal et Manchester United sont sous le seuil eux
      // aussi). La pastille le règle pour TOUS les clubs, y compris ceux
      // qu'on n'a pas encore croisés, sans seuil ni mesure.
      //
      // La silhouette blanche avait d'abord paru plus simple. Elle efface
      // le dessin : « on ne reconnaît plus les logos » (Mehdi, 20/10) —
      // Barcelone devenait un bouclier vide.
      return (
        <button
          key={ev.id}
          type="button"
          data-id={ev.id}
          data-slug={competitionSlugFromEvent(ev)}
          // Les copies suivantes sont cachées aux lecteurs d'écran ; elles ne
          // doivent pas non plus recevoir le focus au clavier.
          tabIndex={copie > 0 ? -1 : 0}
          onClick={onClickClavier}
          aria-label={`${nomDe(home)} ${centre} ${nomDe(away)}${marque ? ` (${marque})` : ''}`}
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-sm px-1 outline-none focus-visible:ring-1 focus-visible:ring-white/70"
        >
          <Blason camp={home} />
          {/* Le score d'un match en cours, en blanc ; le « vs » d'un match à
              venir, en doré. L'heure et la minute restent blanches. */}
          <span
            className={
              s.live
                ? 'font-display text-[19px] font-bold leading-none tabular-nums text-white [text-shadow:0_1px_4px_rgba(0,0,0,.55)]'
                : 'font-mono text-[11px] font-semibold uppercase tracking-wider text-accent-gold [text-shadow:0_1px_3px_rgba(0,0,0,.5)]'
            }
          >
            {centre}
          </span>
          <Blason camp={away} />
          {marque && (
            <span className={'font-mono text-[11px] font-semibold tabular-nums ' + (s.live ? 'text-white' : 'text-white/75')}>
              ({marque})
            </span>
          )}
        </button>
      )
    })
    // Rien en cours, mais des matchs à venir : la bande le DIT avant de les
    // énumérer. Le badge gris le signale déjà, mais il est hors de la piste
    // et sort du champ de lecture dès que la bande a défilé.
    if (aucunDirect) {
      items.unshift(
        <span key="rien" className="inline-flex items-center whitespace-nowrap font-sans text-[13px] text-white/50">
          {t('No match in progress')}
        </span>,
      )
    }
    return items
  }

  // Le badge est FIXE, hors de la piste ; premier enfant du flex, il se
  // retrouve de lui-même du côté où la lecture commence (à droite en RTL).
  const badge = (
    <div
      aria-hidden
      className={
        'relative z-[4] flex h-full shrink-0 items-center gap-2 px-3 border-e '
        + (direct ? 'border-white/20' : 'border-white/[0.07]')
      }
    >
      {/* LE TÉMOIN CLIGNOTE, mot et point ENSEMBLE — c'est un voyant, pas
          une décoration. Le clignotement vit dans `p90-temoin` (index.css). */}
      <span
        className={
          'h-2 w-2 rounded-full ' + (direct ? 'p90-lampe' : 'bg-[#8E9496]')
        }
      />
      <span
        className={
          'p90-temoin font-mono text-[11px] font-bold tracking-[0.2em] '
          + (direct ? 'text-white [text-shadow:0_0_12px_rgba(255,255,255,.45)]' : 'text-[#C2C6C7]')
        }
      >
        LIVE
      </span>
    </div>
  )

  // Les copies du décrochage : même contenu, même décalage, invisibles tant
  // qu'il ne se passe rien. Elles ne sont montées que sur un panneau allumé —
  // un panneau sans courant ne décroche pas, inutile d'en porter le poids.
  const copies = (ref: typeof piste) => (
    <div ref={ref} className="relative flex h-full w-max items-center ps-4 will-change-transform">
      {Array.from({ length: nbCopies }, (_, i) => (
        <div key={i} aria-hidden className="flex h-full items-center gap-12 pe-12">{contenu(i)}</div>
      ))}
    </div>
  )

  return (
    <div
      ref={racine}
      role="region"
      aria-label={t('Live scores')}
      aria-live="off"
      // `z-40` : sous l'en-tête (50) — si les deux devaient se croiser, c'est
      // l'en-tête qui passe devant. Le repli en `calc()` sert la première
      // image, avant que la mesure ne soit tombée.
      className={
        'p90-panneau sticky z-40 flex h-[52px] select-none items-stretch '
        + (direct ? 'p90-allume' : 'p90-eteint')
      }
      style={{ top: hautEntete ?? 'calc(env(safe-area-inset-top, 0px) + 5.25rem)' }}
    >
      {badge}
      {reduit ? (
        // Mouvement réduit : pas de défilement automatique. Un overflow natif,
        // glissable au doigt et parcourable au clavier, et une seule copie.
        <div className="no-scrollbar relative z-[2] min-w-0 flex-1 overflow-x-auto">
          <div className="flex h-full w-max items-center gap-12 px-4">{contenu(0)}</div>
        </div>
      ) : (
        <div
          ref={cadre}
          className="relative z-[2] min-w-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
          // pan-y : le doigt qui monte ou descend fait défiler la PAGE, le
          // navigateur garde ce geste ; on ne prend que l'horizontal.
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onFocus={onFocus}
        >
          {/* Aucun `style` React sur la piste : c'est la boucle rAF qui écrit
              son transform, et un re-rendu ne doit jamais l'effacer.
              `relative` pour que les offsetLeft des boutons se mesurent
              depuis la piste (le focus clavier en dépend). */}
          <div ref={piste} className="p90-secousse relative flex h-full w-max items-center ps-4 will-change-transform">
            {Array.from({ length: nbCopies }, (_, i) => (
              <div
                key={i}
                ref={i === 0 ? copieA : undefined}
                // Un lecteur d'écran ne lit la liste qu'une fois : les copies
                // suivantes sont purement visuelles.
                aria-hidden={i > 0 || undefined}
                className="flex h-full items-center gap-12 pe-12"
              >
                {contenu(i)}
              </div>
            ))}
          </div>
          {direct && !reduit && (
            <>
              <div className="p90-calque p90-c1">{copies(pisteC1)}</div>
              <div className="p90-calque p90-c2">{copies(pisteC2)}</div>
            </>
          )}
        </div>
      )}
      {/* La matière du panneau, au-dessus de tout et insensible au doigt. */}
      <div className="p90-balayage" aria-hidden />
      <div className="p90-stries" aria-hidden />
      <MatchSheet
        open={!!openMatch}
        eventId={openMatch?.id}
        competitionSlug={openMatch?.slug}
        onClose={() => setOpenMatch(null)}
      />
    </div>
  )
}

/**
 * UN ÉCUSSON SUR LE PANNEAU — cerné de blanc, jamais repeint.
 *
 * Sur le rouge, Liverpool tombe à 1,47 de contraste quand il en faudrait
 * 3 (mesuré le 20/10 sur les écussons réels ; PSG 2,05, Milan 2,27,
 * Barcelone 2,37, Villarreal 2,54 et Manchester United 2,57 passent sous
 * le seuil eux aussi). Deux pistes ont été écartées avant celle-ci :
 *
 *   · la SILHOUETTE BLANCHE efface le dessin — « on ne reconnaît plus les
 *     logos » (Mehdi, 20/10), Barcelone devenait un bouclier vide ;
 *   · la PASTILLE claire derrière l'écusson règle le contraste mais pose
 *     un rond blanc sur le panneau, et on perd la matière du rouge.
 *
 * Le liseré cerne la forme sans rien recouvrir. Deux passes serrées d'un
 * pixel plutôt qu'une large : une ombre portée large fait un HALO, et
 * Mehdi l'a vu sur la première version — « baisse un peu le halo, il est
 * trop intense ». Ce qu'on veut est un bord net, pas une lueur.
 *
 * `mode="jamais"` : surtout ne pas laisser `Ecusson` repeindre. Sa mesure
 * répond à « trop sombre pour le SOL du site ? », une question qui n'a
 * pas de sens ici — et elle rendrait la Juventus en crème, donc illisible
 * une fois cernée de blanc.
 */
function Blason({ camp }: { camp: EspnCompetitor | undefined }) {
  const t = camp?.team
  const src = teamBadgeFallback(t?.logo, t?.abbreviation, t?.shortDisplayName ?? t?.displayName)
  if (!src) return <span className="h-[26px] w-[26px] shrink-0" />
  return (
    <Ecusson
      src={src}
      mode="jamais"
      alt=""
      className="h-[26px] w-[26px] shrink-0 object-contain [filter:drop-shadow(0_0_1px_rgba(255,255,255,.7))_drop-shadow(0_0_1px_rgba(255,255,255,.45))_drop-shadow(0_1px_2px_rgba(0,0,0,.5))]"
    />
  )
}
