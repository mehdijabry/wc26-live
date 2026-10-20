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

  // ── Tout ce que la boucle d'animation touche vit dans des refs : la
  // position, l'état « tenu », la pause, le sens. Rien ici ne déclenche un
  // rendu React — c'est ce qui permet d'écrire soixante images par seconde
  // sans que l'arbre bouge.
  const cadre = useRef<HTMLDivElement>(null)   // la fenêtre (overflow hidden)
  const piste = useRef<HTMLDivElement>(null)   // l'élément translaté
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
      p.style.transform = `translateX(${sens.current * pos.current}px)`
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
        <span className="inline-flex items-center whitespace-nowrap font-sans text-[13px] text-slate-500">
          {t('No match in progress')}
          <span aria-hidden className="mx-10 text-slate-400">·</span>
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
      const teinte = s.live ? 'text-slate-900' : 'text-slate-500'
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
          className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-sm px-1 outline-none focus-visible:ring-1 focus-visible:ring-accent-red/70"
        >
          <span className={'font-sans text-[13px] ' + teinte}>{nomDe(home)}</span>
          <span
            className={
              (s.live
                ? 'font-display text-[17px] font-bold leading-none tabular-nums text-slate-900'
                : 'font-mono text-[11px] uppercase tracking-wider text-slate-400')
            }
          >
            {centre}
          </span>
          <span className={'font-sans text-[13px] ' + teinte}>{nomDe(away)}</span>
          {marque && (
            <span className={'font-mono text-[11px] tabular-nums ' + (s.live ? 'text-slate-500' : 'text-slate-400')}>
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
        <span key="rien" className="inline-flex items-center whitespace-nowrap font-sans text-[13px] text-slate-500">
          {t('No match in progress')}
        </span>,
      )
    }
    return items
  }

  // Un seul match en cours suffit à allumer le badge. S'il n'y en a aucun
  // alors que la bande porte des matchs, c'est qu'elle montre l'à-venir.
  const aucunDirect = loaded && events.length > 0 && !events.some((ev) => statusLabel(ev).live)
  const direct = loaded && !vide && !aucunDirect
  // Le badge est FIXE, hors de la piste ; premier enfant du flex, il se
  // retrouve de lui-même du côté où la lecture commence (à droite en RTL).
  const badge = (
    <div
      aria-hidden
      className="relative z-10 flex h-full shrink-0 items-center gap-2 border-e border-slate-200 bg-card px-3"
    >
      <span className="relative flex h-2 w-2">
        {direct && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red/60 opacity-75" />
        )}
        <span className={'relative inline-flex h-2 w-2 rounded-full ' + (direct ? 'bg-accent-red' : 'bg-slate-500')} />
      </span>
      <span className={'font-mono text-[11px] font-bold tracking-[0.2em] ' + (direct ? 'text-accent-red' : 'text-slate-500')}>
        LIVE
      </span>
    </div>
  )

  return (
    <div
      role="region"
      aria-label={t('Live scores')}
      aria-live="off"
      // Dans le flux du document, sous la Navigation fixe : le bandeau part
      // avec le défilement de la page, l'en-tête reste.
      className="flex h-12 select-none items-stretch border-b border-slate-200 bg-card"
    >
      {badge}
      {reduit ? (
        // Mouvement réduit : pas de défilement automatique. Un overflow natif,
        // glissable au doigt et parcourable au clavier, et une seule copie.
        <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
          <div className="flex h-full w-max items-center gap-12 px-4">{contenu(0)}</div>
        </div>
      ) : (
        <div
          ref={cadre}
          className="min-w-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
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
          <div ref={piste} className="relative flex h-full w-max items-center ps-4 will-change-transform">
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
        </div>
      )}
      <MatchSheet
        open={!!openMatch}
        eventId={openMatch?.id}
        competitionSlug={openMatch?.slug}
        onClose={() => setOpenMatch(null)}
      />
    </div>
  )
}
