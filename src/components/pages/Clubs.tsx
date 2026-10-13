import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CHAMPIONNATS, CONTINENTS, clubsDuChampionnat, logoChampionnat, monogrammeChampionnat, type Continent, type Championnat, type ClubResume } from '../../lib/clubs'
import { usePageHead, useJsonLd } from '../../lib/head'
import { localeOf, trLeague, useLang, useT } from '../../lib/i18n'
import { ESPN_ABBR_TO_ISO2 } from '../../lib/utils'

/**
 * /clubs — l'arborescence continent → pays → championnat.
 *
 * Les noms de championnats et le nombre de clubs ne sont pas écrits dans le
 * code : ils sont demandés à ESPN au montage, et le prérendu photographie la
 * page une fois les réponses arrivées. Ajouter un championnat dans
 * `lib/clubs.ts` le fait apparaître ici sans toucher à ce fichier.
 */
/**
 * Ce qu'on retient d'un championnat après l'appel à ESPN.
 *
 * On ne gardait que le NOMBRE de clubs, alors que l'appel ramène la liste
 * entière. On la garde maintenant : elle ne coûte rien de plus, et c'est
 * elle qui permet de chercher un club par son nom depuis cette page —
 * « barcelona », « raja », « al hilal » — au lieu de devoir deviner dans
 * quel championnat il joue (Mehdi, 13/10/2026).
 */
type Etat = Record<string, { nom: string; clubs: ClubResume[] }>

/** Le repli quand l'API n'a pas répondu : « saudi-pro-league » → « Saudi Pro League ». */
function joliSlug(slug: string): string {
  return slug
    .split('-')
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join(' ')
}

/**
 * L'écusson des compétitions dont ESPN n'a pas de logo — la Coupe de la
 * confédération et le championnat sud-africain, vérifiés sur ses DEUX API le
 * 11/10/2026 : elles ne renvoient que son image grise par défaut.
 *
 * On ne va pas chercher le vrai logo ailleurs. Ce sont des marques déposées,
 * et les sources qui les hébergent le font sous usage loyal, ce qui n'autorise
 * pas à les afficher ici — a fortiori avec un examen AdSense en cours. On
 * dessine donc le nôtre, repris du sigle 90' : cadre carré arrondi, monogramme,
 * et le trait du terrain en dessous. Une absence assumée vaut mieux qu'un
 * emprunt, et mieux que deux lettres posées dans le vide.
 */
function EcussonMaison({ lettres }: { lettres: string }) {
  return (
    <svg viewBox="0 0 48 48" width="32" height="32" aria-hidden="true" className="w-8 h-8">
      <rect x="3" y="3" width="42" height="42" rx="11" fill="none" stroke="#D9B54A" strokeWidth="2.4" opacity="0.85" />
      <text
        x="24" y="25" textAnchor="middle" dominantBaseline="middle"
        fill="#D9B54A" fontSize="17" fontWeight="700" letterSpacing="0.5"
        fontFamily="'Big Shoulders Display', system-ui, sans-serif"
      >
        {lettres}
      </text>
      <line x1="14" y1="35" x2="34" y2="35" stroke="#D9B54A" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
    </svg>
  )
}

export function Clubs() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const [etat, setEtat] = useState<Etat>({})

  /**
   * La recherche. Vingt-neuf championnats sur quatre sections : trouver
   * « Botola » ou « Copa del Rey » demandait de parcourir toute la page. On
   * cherche dans le NOM, le PAYS et le slug à la fois — un visiteur tape
   * aussi bien « maroc » que « botola » que « espagne ».
   */
  const [recherche, setRecherche] = useState('')

  /**
   * Les championnats mis en favori.
   *
   * ── POURQUOI LE STOCKAGE LOCAL ET PAS LE COMPTE ────────────────────────
   * C'est une préférence d'affichage, pas une donnée de jeu : la ranger
   * dans le profil obligerait à se connecter pour s'en servir, alors que
   * l'écrasante majorité des visiteurs de cette page n'a pas de compte.
   * Ici elle marche pour tout le monde, tout de suite.
   *
   * La contrepartie est assumée : elle ne suit pas d'un appareil à l'autre.
   * Le jour où ça gêne, une colonne sur `profiles` prendra le relais pour
   * les connectés, ce stockage restant le repli des autres.
   *
   * Tout est sous try/catch : en navigation privée, lire ou écrire ici peut
   * lever une exception, et une page de championnats ne doit pas tomber
   * pour une étoile.
   */
  const [favoris, setFavoris] = useState<string[]>(() => {
    try {
      const brut = localStorage.getItem('p90.liguesFavorites')
      const liste = brut ? (JSON.parse(brut) as unknown) : []
      return Array.isArray(liste) ? liste.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  })

  function basculerFavori(slug: string) {
    setFavoris((avant) => {
      const apres = avant.includes(slug) ? avant.filter((x) => x !== slug) : [...avant, slug]
      try { localStorage.setItem('p90.liguesFavorites', JSON.stringify(apres)) } catch { /* privée */ }
      return apres
    })
  }

  usePageHead(
    Object.keys(etat).length
      ? {
          titre: 'Football league tables, clubs and squads',
          description: `The live table of ${CONTINENTS.flatMap((c) => CHAMPIONNATS[c]).length} leagues across ${CONTINENTS.length} continents — points, goal difference, form — and every club's current squad. Premier League, LALIGA, Serie A, Brasileirão, MLS and more.`,
          chemin: '/clubs',
        }
      : null,
  )

  const pret = Object.keys(etat).length
  const nombreDeLigues = CONTINENTS.flatMap((c) => CHAMPIONNATS[c]).length

  /** Minuscules, sans accents : « Corée » et « coree » doivent se trouver. */
  const sansAccent = (x: string) =>
    x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  const q = sansAccent(recherche.trim())

  /**
   * Le nom du pays dans la langue du visiteur, depuis le code à trois
   * lettres d'ESPN. `ch.pays` vaut « ESP », pas « Espagne » : chercher
   * « espagne » ne trouvait donc rien, alors que c'est exactement ce qu'on
   * tape. On passe par la table FIFA → ISO déjà tenue pour les drapeaux,
   * puis par `Intl.DisplayNames`, qui connaît les noms de pays dans les
   * trois langues — rien de nouveau à maintenir à la main.
   */
  const nomDuPays = (code: string): string => {
    // LES QUATRE NATIONS BRITANNIQUES D'ABORD. Leur code ISO est « gb-eng »,
    // « gb-sct »… et `Intl.DisplayNames` n'en connaît que la première
    // moitié : tronquer donnait « Royaume-Uni », si bien que chercher
    // « angleterre » ne trouvait pas la Premier League — le championnat le
    // plus cherché du site.
    const nations: Record<string, string> = {
      ENG: t('England'), SCO: t('Scotland'), WAL: t('Wales'), NIR: t('Northern Ireland'),
    }
    if (nations[code]) return nations[code]

    const iso2 = ESPN_ABBR_TO_ISO2[code]
    if (!iso2) return ''
    try {
      return new Intl.DisplayNames([localeOf(lang)], { type: 'region' })
        .of(iso2.toUpperCase().slice(0, 2)) ?? ''
    } catch {
      return ''
    }
  }

  /** Un championnat correspond-il à la recherche ? */
  const correspond = (ch: Championnat) => {
    if (!q) return true
    const nom = trLeague(etat[ch.slug]?.nom ?? joliSlug(ch.slug), lang)
    return [nom, ch.pays ?? '', nomDuPays(ch.pays ?? ''), ch.slug.replace(/[.-]/g, ' ')]
      .some((champ) => sansAccent(champ).includes(q))
  }

  /**
   * Les CLUBS qui correspondent à la recherche, avec leur championnat.
   *
   * Deux caractères au minimum : sous ce seuil, « a » renverrait la moitié
   * des quatre cents clubs chargés, ce qui n'aide personne et fait ramer la
   * page. Et vingt-quatre résultats au plus, pour la même raison — qui
   * cherche un club précis le trouve dans les premiers.
   */
  const clubsTrouves =
    q.length < 2
      ? []
      : CONTINENTS.flatMap((c) => CHAMPIONNATS[c])
          .flatMap((ch) =>
            (etat[ch.slug]?.clubs ?? [])
              .filter((cl) =>
                [cl.nom, cl.nomCourt, cl.abbr].some((x) => sansAccent(x ?? '').includes(q)),
              )
              .map((cl) => ({ club: cl, ligue: ch })),
          )
          .slice(0, 24)

  const aucunResultat =
    !!q &&
    clubsTrouves.length === 0 &&
    CONTINENTS.every((c) => CHAMPIONNATS[c].every((ch) => !correspond(ch)))

  /** Les favoris encore présents dans le tableau, et retenus par la recherche. */
  const liguesFavorites = CONTINENTS.flatMap((c) => CHAMPIONNATS[c])
    .filter((ch) => favoris.includes(ch.slug) && correspond(ch))
  useJsonLd(
    'clubs-index',
    pret
      ? {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Football league tables, clubs and squads',
          url: 'https://pressing90.live/clubs',
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: pret,
            itemListElement: CONTINENTS.flatMap((c) => CHAMPIONNATS[c])
              .filter((ch) => etat[ch.slug])
              .map((ch, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: etat[ch.slug]!.nom,
                url: `https://pressing90.live/clubs/${ch.slug}`,
              })),
          },
        }
      : null,
  )

  useEffect(() => {
    let vivant = true
    const tous = CONTINENTS.flatMap((c) => CHAMPIONNATS[c])
    // En série plutôt qu'en parallèle : seize requêtes simultanées vers ESPN
    // se font jeter, et le prérendu a tout son temps.
    ;(async () => {
      for (const ch of tous) {
        // Deux tentatives : l'échec observé le 8 octobre 2026 sur la J-League
        // était un hoquet isolé — six appels de contrôle ont tous répondu 200
        // dans la foulée. Le lien du championnat est rendu quoi qu'il arrive
        // (voir plus bas) ; cette reprise sert à ne pas perdre son nom réel
        // ni son nombre de clubs pour une seule requête malchanceuse.
        for (let essai = 0; essai < 2; essai++) {
          try {
            const { nomLigue, clubs } = await clubsDuChampionnat(ch.espn)
            if (!vivant) return
            setEtat((e) => ({ ...e, [ch.slug]: { nom: nomLigue, clubs } }))
            break
          } catch {
            if (!vivant) return
            if (essai === 0) await new Promise((r) => setTimeout(r, 600))
            // Au second échec on abandonne ce championnat : son lien reste
            // affiché, sans son nom complet ni son compte. On n'invente rien.
          }
        }
      }
    })()
    return () => {
      vivant = false
    }
  }, [])


  /**
   * La carte d'un championnat. Extraite parce qu'elle sert à DEUX endroits :
   * la section Favoris en tête, et les sections par continent.
   *
   * L'étoile est un `button` SŒUR du lien, pas un enfant : un bouton dans
   * une ancre n'est pas du HTML valide, et le clic partirait vers la fiche
   * du championnat au lieu de poser le favori.
   */
  const carteLigue = (ch: Championnat) => {
    const info = etat[ch.slug]
    // ESPN colle un qualificatif de pays que personne n'emploie — « English
    // Premier League ». `trLeague` ne traduit pas le nom, il le normalise.
    const nom = trLeague(info?.nom ?? joliSlug(ch.slug), lang)
    const ecusson = logoChampionnat(ch)
    const aime = favoris.includes(ch.slug)
    return (
      <li key={ch.slug} className="relative">
        <Link
          to={`/clubs/${ch.slug}`}
          className="group h-full flex items-center gap-3.5 rounded-xl glass glass-hover px-3.5 py-3.5 pe-10"
        >
          <span className="shrink-0 w-11 h-11 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
            {ecusson ? (
              // Dimensions explicites et chargement différé : vingt-neuf
              // images sur une page d'index, autant qu'elles n'entrent pas
              // toutes dans le premier rendu.
              <img
                src={ecusson}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
                className="w-8 h-8 object-contain"
              />
            ) : (
              <EcussonMaison lettres={monogrammeChampionnat(ch.slug)} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] leading-tight text-slate-900 group-hover:text-accent-gold transition-colors">
              {nom}
            </span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-slate-500 tabular-nums truncate">
              {ch.pays || t('continental')}
              {info && ` · ${t('{n} clubs').replace('{n}', String(info.clubs.length))}`}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => basculerFavori(ch.slug)}
          aria-pressed={aime}
          aria-label={aime ? t('Remove from favourites') : t('Add to favourites')}
          title={aime ? t('Remove from favourites') : t('Add to favourites')}
          className={
            'absolute top-2 end-2 w-7 h-7 flex items-center justify-center rounded-md transition-colors ' +
            (aime ? 'text-accent-gold' : 'text-slate-400 hover:text-accent-gold')
          }
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden
               fill={aime ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z"
                  strokeLinejoin="round" />
          </svg>
        </button>
      </li>
    )
  }

  return (
    <div className="container max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{t('Leagues')}</h1>
      <p className="mt-3 text-slate-500 max-w-2xl">
        {t('{n} leagues across {c} continents. Open one for its live table — points, goal difference, games played — and for every club in it, squad included. All of it pulled live, never typed by hand.')
          .replace('{n}', String(nombreDeLigues))
          .replace('{c}', String(CONTINENTS.length))}
      </p>

      <label className="mt-6 block">
        <span className="sr-only">{t('Search a club, a league or a country')}</span>
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('Search a club, a league or a country')}
          className="w-full rounded-xl glass px-4 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-accent-gold/60 border border-slate-200 transition-colors"
        />
      </label>

      {aucunResultat && (
        <p className="mt-8 text-sm text-slate-500">
          {t('No league matches “{q}”.').replace('{q}', recherche)}
        </p>
      )}

      {/* ── LES CLUBS TROUVÉS ───────────────────────────────────────────
          Avant cette section, chercher « barcelona » sur cette page ne
          donnait rien : elle n'indexait que les championnats, alors qu'elle
          chargeait déjà la liste de leurs clubs pour en compter les lignes.
          Le visiteur devait savoir dans quel championnat jouait le club
          qu'il cherchait — c'est exactement ce qu'il vient demander. */}
      {clubsTrouves.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-gold">{t('Clubs')}</h2>
            <div className="h-px flex-1 bg-slate-200" />
            <span className="font-mono text-[11px] tabular-nums text-slate-500">{clubsTrouves.length}</span>
          </div>
          <ul className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-3">
            {clubsTrouves.map(({ club, ligue }) => (
              <li key={`${ligue.slug}/${club.slug}`}>
                <Link
                  to={`/club/${ligue.slug}/${club.slug}`}
                  className="group h-full flex items-center gap-3.5 rounded-xl glass glass-hover px-3.5 py-3.5"
                >
                  <span className="shrink-0 w-11 h-11 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
                    {club.logo ? (
                      <img src={club.logo} alt="" width={32} height={32} loading="lazy" decoding="async" className="w-8 h-8 object-contain" />
                    ) : (
                      <EcussonMaison lettres={club.abbr?.slice(0, 3) || club.nom.slice(0, 2)} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[15px] leading-tight text-slate-900 group-hover:text-accent-gold transition-colors truncate">
                      {club.nomCourt || club.nom}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-slate-500 truncate">
                      {trLeague(etat[ligue.slug]?.nom ?? joliSlug(ligue.slug), lang)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── LES FAVORIS, EN TÊTE ────────────────────────────────────────
          Même grammaire de section que les continents : filet doré,
          intitulé en capitales, compte à droite. La section n'existe que
          s'il y a quelque chose dedans — un bandeau « Favoris » vide
          apprendrait seulement qu'on n'en a pas. */}
      {liguesFavorites.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-gold">{t('Favourites')}</h2>
            <div className="h-px flex-1 bg-slate-200" />
            <span className="font-mono text-[11px] tabular-nums text-slate-500">{liguesFavorites.length}</span>
          </div>
          <ul className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-3">
            {liguesFavorites.map(carteLigue)}
          </ul>
        </section>
      )}

      {CONTINENTS.map((continent: Continent) => {
        // On rend TOUS les championnats du tableau, pas seulement ceux dont
        // l'appel a abouti. Sinon un hoquet d'ESPN pendant le prérendu fait
        // disparaître un championnat entier de l'index — et ses vingt fiches
        // avec lui, puisque c'est d'ici qu'on y accède. C'est arrivé à la
        // J-League le 8 octobre 2026. Le nom et le compte restent, eux,
        // conditionnés à la réponse : on n'invente rien.
        const ligues = CHAMPIONNATS[continent].filter((ch) => correspond(ch))
        // Un continent vidé par la recherche disparaît : garder son bandeau
        // au-dessus du vide ferait croire à un défaut de chargement.
        if (!ligues.length) return null
        return (
          <section key={continent} className="mt-10">
            {/* Le continent est une DONNÉE (la clé du tableau des
                championnats), pas un libellé : il passe quand même par le
                dictionnaire, sinon « Americas » reste en anglais au milieu
                d'une page française. */}
            {/* Un bandeau de section plutôt qu'un titre nu : filet doré,
                intitulé en capitales espacées, compte à droite. C'est la
                grammaire du reste du site, que cette page n'avait pas. */}
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-gold">{t(continent)}</h2>
              <div className="h-px flex-1 bg-slate-200" />
              <span className="font-mono text-[11px] tabular-nums text-slate-500">{ligues.length}</span>
            </div>
            <ul className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-3">
              {ligues.map(carteLigue)}
            </ul>
          </section>
        )
      })}

      <p className="mt-12 text-sm text-slate-500">
        {t('Squads and club details come from ESPN’s public soccer API and refresh on their schedule, not ours. Morocco has no league of its own here — that source carries no Botola at all — so Moroccan sides appear only through the two African cups above.')}
      </p>
    </div>
  )
}
