/**
 * Clubs — arborescence continent → pays → championnat → club, servie par l'API.
 *
 * RÈGLE DE CONCEPTION : aucune donnée d'équipe ni de joueur n'est écrite ici.
 * Les noms de clubs, les logos, les couleurs et les effectifs viennent tous
 * d'ESPN au moment du rendu. Ce fichier ne contient que deux choses qui ne sont
 * pas des données : la SÉLECTION des championnats qu'on expose, et le
 * rattachement d'un pays à son continent — qu'ESPN ne donne pas.
 *
 * POURQUOI DEUX HÔTES ESPN DIFFÉRENTS. Le CORS d'ESPN n'est pas uniforme, et
 * c'est lui qui dicte l'architecture. Mesuré le 8 octobre 2026 :
 *
 *   • `site.api.espn.com/.../{ligue}/teams` (le listing) ne renvoie AUCUN
 *     en-tête `access-control-allow-origin` — 6 essais sur 6, deux ligues.
 *     Le navigateur ne peut donc pas l'appeler. C'est ce qui faisait rendre
 *     « Club not found » sur toutes les pages.
 *   • `site.web.api.espn.com/apis/v2/.../{ligue}/standings` renvoie `*`, et
 *     donne les mêmes clubs, au complet, avec id/nom/abréviation/logo. C'est
 *     donc LUI qui sert de listing. Vérifié : effectif identique au listing
 *     sur les 15 championnats (20/20 Liga, 18/18 Bundesliga, 30/30 MLS…).
 *   • `site.api.espn.com/.../teams/{id}?enable=roster` (le détail) renvoie `*`.
 *     La fiche de club et son effectif passent donc par là.
 *
 * Et pourquoi pas un relais par le worker : parce qu'il n'apporte rien ici.
 * Le classement répond déjà avec le CORS ouvert, donc le navigateur se sert
 * seul, sans hop supplémentaire ni cache à tenir. (Note : contrairement à ce
 * qui était noté depuis août 2026, ESPN n'interdit PAS les adresses IP de
 * Cloudflare — vérifié le 8 octobre, `/tournament` du worker renvoie bien ses
 * 104 événements. Le « Forbidden » qu'on voyait venait du filtre anti-`curl`
 * du worker lui-même, pas d'ESPN. Un relais reste donc possible si un jour
 * une route sans CORS devient nécessaire — c'est ce que fait la Botola.)
 */

/**
 * Le détail d'un club et son effectif. Noter l'hôte : `site.web.api`, pas
 * `site.api`.
 *
 * Mesuré le 8 octobre 2026, et la distinction n'est pas celle qu'on croit :
 * en ligne de commande les DEUX hôtes répondent 200, 40 essais sur 40. Mais
 * depuis un navigateur, `site.api.espn.com` renvoie 504 sur toutes les routes
 * essayées — l'effectif comme le scoreboard — là où `site.web.api.espn.com`
 * répond 200 partout, avec le CORS ouvert et un corps identique à l'octet.
 * C'est donc le navigateur que l'hôte traite différemment, pas la route.
 */
const ESPN_DETAIL = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer'
/** Le listing des clubs d'un championnat, via son classement — CORS ouvert. */
const ESPN_LISTE = 'https://site.web.api.espn.com/apis/v2/sports/soccer'

/**
 * La Botola n'est pas un slug ESPN : c'est un aiguillage.
 *
 * ESPN n'a AUCUN championnat marocain — son catalogue de 219 compétitions
 * n'en contient pas, `mar.1` répond vide. api-sports.io, lui, couvre
 * « Botola Pro ». Mais api-sports exige une clé dans chaque requête, et une
 * clé lisible dans le code de la page est une clé brûlée : c'est donc le
 * worker qui la détient et qui expose `/botola/teams` et `/botola/squad`.
 * Il met en cache 24 h, pour que le quota ne dépende pas du trafic.
 */
const BOTOLA = 'botola'
const WORKER = import.meta.env.VITE_API_BASE ?? 'https://wc26-api.nameless-violet-5dc1.workers.dev'

export type Championnat = {
  /** Le slug ESPN, qui sert de clé d'API. */
  espn: string
  /** Le slug lisible, qui sert d'URL. */
  slug: string
  /** Code ISO du pays, pour le drapeau et le regroupement. Vide pour une compétition continentale. */
  pays: string
  /**
   * L'identifiant du logo chez ESPN — PAS celui de la compétition. Les deux
   * diffèrent presque partout : la Premier League est la ligue 700 et le logo
   * 23. Relevé une fois pour toutes sur `/scoreboard` le 11/10/2026 et figé
   * ici, pour qu'afficher l'index ne coûte pas vingt-et-un appels de plus.
   *
   * Absent quand ESPN n'a pas de vrai logo : ses DEUX API ne renvoient pour la
   * Coupe de la confédération et le championnat sud-africain que son image
   * grise par défaut. Ces deux-là ont `logoFichier`.
   */
  logo?: number
  /**
   * Un écusson servi par nous, sous `public/media/ligues/`. Fourni par Mehdi
   * le 11/10/2026 depuis les sites officiels, puis ramené à 128 px carrés sur
   * fond transparent — les originaux faisaient 272 et 120 ko pour une vignette
   * de 32 px, et étaient verticaux là où la grille attend un carré.
   */
  logoFichier?: string
}

export type Continent = 'Europe' | 'Americas' | 'Africa' | 'Asia'

/**
 * Les championnats exposés. C'est une sélection éditoriale, pas une base :
 * ajouter une ligne suffit à publier tout un championnat, ses clubs et leurs
 * effectifs, sans écrire une seule donnée.
 *
 * LES COUPES NATIONALES N'Y SONT PAS, ET NE PEUVENT PAS Y ÊTRE. Cette section
 * affiche un CLASSEMENT, or une coupe à élimination directe n'en a aucun.
 * Mesuré sur l'API le 11/10/2026, saison 2026 : Copa del Rey, FA Cup, Coppa
 * Italia, DFB-Pokal, Coupe de France et Carabao Cup renvoient toutes
 * **0 équipe et 0 tableau**. Les ajouter ne donnerait que des pages vides.
 * Elles restent jouables dans Paris et suivies dans Matchs, où un calendrier
 * suffit — c'est le classement qui manque, pas les données.
 *
 * ESPN couvre 219 compétitions. On s'arrête à une vingtaine volontairement : le site
 * avait 3 pages indexées sur 50 début octobre 2026, et quelques milliers de
 * pages générées qui répètent ce que Transfermarkt classe déjà se feraient
 * répondre « explorée, actuellement non indexée » — le verdict qui frappe déjà
 * 41 pages ici.
 */
export const CHAMPIONNATS: Record<Continent, Championnat[]> = {
  Europe: [
    { espn: 'eng.1', slug: 'premier-league', pays: 'ENG', logo: 23 },
    { espn: 'esp.1', slug: 'laliga', pays: 'ESP', logo: 15 },
    { espn: 'ger.1', slug: 'bundesliga', pays: 'GER', logo: 10 },
    { espn: 'ita.1', slug: 'serie-a', pays: 'ITA', logo: 12 },
    { espn: 'fra.1', slug: 'ligue-1', pays: 'FRA', logo: 9 },
    { espn: 'por.1', slug: 'primeira-liga', pays: 'POR', logo: 14 },
    { espn: 'ned.1', slug: 'eredivisie', pays: 'NED', logo: 11 },
    { espn: 'tur.1', slug: 'super-lig', pays: 'TUR', logo: 18 },
    // Les trois coupes d'Europe. Elles ont un VRAI tableau depuis que l'UEFA
    // a remplacé les groupes par une phase de ligue unique : 36 équipes dans
    // un seul classement, vérifié le 11/10/2026 sur les trois.
    { espn: 'uefa.champions', slug: 'champions-league', pays: '', logo: 2 },
    { espn: 'uefa.europa', slug: 'europa-league', pays: '', logo: 2310 },
    { espn: 'uefa.europa.conf', slug: 'conference-league', pays: '', logo: 20296 },
  ],
  Americas: [
    { espn: 'bra.1', slug: 'brasileirao', pays: 'BRA', logo: 85 },
    { espn: 'arg.1', slug: 'liga-profesional', pays: 'ARG', logo: 1 },
    { espn: 'usa.1', slug: 'mls', pays: 'USA', logo: 19 },
    { espn: 'mex.1', slug: 'liga-mx', pays: 'MEX', logo: 22 },
    { espn: 'conmebol.libertadores', slug: 'copa-libertadores', pays: '', logo: 58 },
  ],
  Africa: [
    { espn: 'caf.champions', slug: 'caf-champions-league', pays: '', logo: 2391 },
    { espn: 'caf.confed', slug: 'caf-confederation-cup', pays: '', logoFichier: 'caf-confederation-cup' },
    // LA BOTOLA EST PRÊTE MAIS N'EST PAS PUBLIÉE. Pour l'activer, il suffit
    // de décommenter la ligne ci-dessous — tout le reste existe déjà : la
    // route `/botola/teams` et `/botola/squad` du worker, l'aiguillage plus
    // bas dans ce fichier, et le script du plan du site.
    //
    // Ce qui bloque n'est pas technique : le forfait gratuit d'api-sports
    // s'arrête à la saison 2024, et publier des effectifs vieux de deux ans
    // sur un site de scores en direct n'a pas de sens. Vérifié le 8 octobre
    // 2026 — en saison 2024 l'API renvoie bien les 18 clubs avec Raja
    // Casablanca, Wydad, FAR et leurs stades, donc la chaîne est prouvée.
    // Il faut un forfait API-FOOTBALL payant (le premier, à 19 $/mois, est
    // déjà très surdimensionné : le cache 24 h du worker ramène la Botola
    // entière à une vingtaine de requêtes par jour). Décision de Mehdi,
    // 8 octobre 2026 : on attend.
    //
    // { espn: 'botola', slug: 'botola', pays: 'MAR' },
    { espn: 'rsa.1', slug: 'south-african-premiership', pays: 'RSA', logoFichier: 'south-african-premiership' },
    // LE MAROC n'a pas de championnat chez ESPN : le catalogue des 219
    // compétitions ne contient aucune Botola (`mar.1` répond vide). Les clubs
    // marocains n'arrivent donc que par les deux coupes africaines ci-dessus —
    // AS FAR et RSB Berkane par la C1, Wydad AC et l'Olympic Safi par la C2.
    // Raja Casablanca reste absent : ESPN ne le connaît qu'au tour
    // préliminaire de la C1, hors du tableau des groupes qui sert de listing.
    // Pour le Maroc en entier il faut une seconde source — api-sports.io
    // couvre la Botola mais demande une clé. Dès qu'elle existe, ajouter la
    // ligne ici et un adaptateur à côté de `clubsDuChampionnat`.
  ],
  Asia: [
    { espn: 'ksa.1', slug: 'saudi-pro-league', pays: 'KSA', logo: 2488 },
    { espn: 'jpn.1', slug: 'j-league', pays: 'JPN', logo: 2199 },
  ],
}

/**
 * L'écusson d'une compétition. On prend la variante « 500-dark », qui est le
 * jeu dessiné POUR les fonds sombres — donc le nôtre. Rend `null` quand ESPN
 * n'a pas de vrai logo, et l'appelant pose alors un monogramme.
 */
export const logoChampionnat = (ch: Championnat): string | null =>
  ch.logoFichier
    ? `/media/ligues/${ch.logoFichier}.png`
    : ch.logo
      ? `https://a.espncdn.com/i/leaguelogos/soccer/500-dark/${ch.logo}.png`
      : null

/**
 * Les deux lettres d'un écusson maison, tirées du SLUG et non du nom traduit :
 * un monogramme doit rester le même dans les trois langues, comme un blason.
 * `caf-confederation-cup` → CC, `south-african-premiership` → SA.
 */
export function monogrammeChampionnat(slug: string): string {
  const mots = slug.split('-').filter((m) => !/^(de|du|la|le|of|the|cup|coupe|league|liga)$/i.test(m))
  const pris = mots.length >= 2 ? mots[0][0] + mots[1][0] : slug.slice(0, 2)
  return pris.toUpperCase()
}

export const CONTINENTS: Continent[] = ['Europe', 'Americas', 'Africa', 'Asia']

/** Tous les championnats, à plat. */
export function tousLesChampionnats(): Array<Championnat & { continent: Continent }> {
  return CONTINENTS.flatMap((c) => CHAMPIONNATS[c].map((ch) => ({ ...ch, continent: c })))
}

export function championnatParSlug(slug: string) {
  return tousLesChampionnats().find((c) => c.slug === slug) ?? null
}

// ───────────────────────────── Appels API ─────────────────────────────

export type ClubResume = {
  id: string
  nom: string
  nomCourt: string
  abbr: string
  /** Slug d'URL dérivé du nom ESPN — stable tant que le club ne change pas de nom. */
  slug: string
  logo: string | null
  couleur: string | null
}

/**
 * La ligne statistique d'un joueur sur la saison en cours.
 *
 * Elle arrive DÉJÀ dans la réponse `/roster` que la page de club télécharge
 * — on la jetait. Zéro requête de plus pour l'afficher.
 *
 * Tout est nullable : ESPN ne renseigne pas les mêmes catégories partout, et
 * une valeur absente n'est pas un zéro. Un attaquant sans ligne de tirs n'a
 * pas tiré zéro fois : on ne sait pas.
 */
export type StatsJoueur = {
  matchs: number | null
  buts: number | null
  passes: number | null
  tirs: number | null
  tirsCadres: number | null
  jaunes: number | null
  rouges: number | null
  fautes: number | null
  /** Gardiens seulement. */
  arrets: number | null
  encaisses: number | null
}

export type Joueur = {
  id: string
  nom: string
  poste: string | null
  numero: string | null
  age: number | null
  nationalite: string | null
  /** Nulle quand ESPN ne publie aucune statistique pour ce joueur. */
  stats: StatsJoueur | null
}

export type ClubDetail = ClubResume & {
  effectif: Joueur[]
  stade: string | null
  lienOfficiel: string | null
}

/** « Atlético Madrid » → « atletico-madrid ». Les URL restent lisibles et sans accent. */
export function slugDuClub(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} — ${url}`)
  return (await r.json()) as T
}

/** Le classement : un arbre de groupes, chacun portant ses lignes. */
type EspnStandings = {
  name?: string
  children?: EspnStandings[]
  standings?: {
    entries?: Array<{
      team?: EspnTeamRaw
      /** Le classement officiel. Il arrivait DÉJÀ dans cette réponse — on
       *  ne lisait que les équipes et on jetait les points. */
      stats?: Array<{ name?: string; displayValue?: string; value?: number }>
    }>
  }
}
type EspnTeamRaw = {
  id: string
  displayName?: string
  shortDisplayName?: string
  abbreviation?: string
  color?: string
  logos?: Array<{ href?: string }>
  /** La forme courte renvoyée par `/roster`. */
  logo?: string
  clubhouse?: string
  venue?: { fullName?: string }
  links?: Array<{ href?: string; rel?: string[] }>
  athletes?: Array<{
    id?: string
    displayName?: string
    jersey?: string
    age?: number
    position?: { abbreviation?: string }
    citizenship?: string
    birthPlace?: { country?: string }
    statistics?: {
      splits?: {
        categories?: Array<{ stats?: Array<{ name?: string; value?: number }> }>
      }
    }
  }>
}

/**
 * Pioche une statistique nommée dans la réponse ESPN.
 *
 * Les valeurs sont rangées par catégorie — « general », « offensive »,
 * « goalKeeping » — et on ne peut pas se fier à l'ordre : on cherche par nom
 * à travers toutes les catégories.
 */
function valeurStat(
  a: NonNullable<EspnTeamRaw['athletes']>[number],
  nom: string,
): number | null {
  for (const c of a.statistics?.splits?.categories ?? []) {
    for (const x of c.stats ?? []) if (x.name === nom) return x.value ?? null
  }
  return null
}

function statsDe(a: NonNullable<EspnTeamRaw['athletes']>[number]): StatsJoueur | null {
  if (!a.statistics) return null
  const s: StatsJoueur = {
    matchs: valeurStat(a, 'appearances'),
    buts: valeurStat(a, 'totalGoals'),
    passes: valeurStat(a, 'goalAssists'),
    tirs: valeurStat(a, 'totalShots'),
    tirsCadres: valeurStat(a, 'shotsOnTarget'),
    jaunes: valeurStat(a, 'yellowCards'),
    rouges: valeurStat(a, 'redCards'),
    fautes: valeurStat(a, 'foulsCommitted'),
    arrets: valeurStat(a, 'saves'),
    encaisses: valeurStat(a, 'goalsConceded'),
  }
  // Une ligne entièrement vide ne vaut pas la peine d'être affichée.
  return Object.values(s).some((v) => v !== null) ? s : null
}

function versResume(t: EspnTeamRaw): ClubResume {
  const nom = t.displayName ?? t.shortDisplayName ?? t.abbreviation ?? t.id
  return {
    id: t.id,
    nom,
    nomCourt: t.shortDisplayName ?? nom,
    abbr: t.abbreviation ?? '',
    slug: slugDuClub(nom),
    logo: t.logos?.[0]?.href ?? t.logo ?? null,
    couleur: t.color ? `#${t.color}` : null,
  }
}

/**
 * Une ligne du classement officiel.
 *
 * `rang` vient d'ESPN et non de l'ordre du tableau : les entrées arrivent
 * DÉSORDONNÉES (mesuré sur la MLS le 10/10/2026 — 2, 13, 3…). Trier soi-même
 * sur les points serait faux aussi, les règles de départage varient d'un
 * championnat à l'autre.
 */
export type LigneClassement = {
  rang: number
  club: ClubResume
  joues: number
  gagnes: number
  nuls: number
  perdus: number
  pour: number
  contre: number
  difference: string
  points: number
}

/** Un tableau : un championnat n'en a qu'un, la MLS en a deux (conférences). */
export type GroupeClassement = { nom: string; lignes: LigneClassement[] }

function stat(
  stats: Array<{ name?: string; displayValue?: string; value?: number }> | undefined,
  nom: string,
): { n: number; texte: string } {
  const s = (stats ?? []).find((x) => x.name === nom)
  const texte = s?.displayValue ?? ''
  const n = Number(s?.value ?? Number(texte))
  return { n: Number.isFinite(n) ? n : 0, texte }
}

/**
 * Le championnat en une seule requête : son nom, ses clubs, et son
 * classement officiel.
 *
 * UNE SEULE REQUÊTE, et c'est le point : la liste des clubs sortait déjà de
 * `/standings`, on jetait simplement les colonnes. Afficher le tableau ne
 * coûte donc aucun aller-retour de plus.
 *
 * `groupes` est vide quand la compétition n'a pas de classement (la Botola
 * passe par notre worker, qui ne publie que les équipes) : l'appelant
 * retombe alors sur la grille de clubs seule.
 */
export async function championnatComplet(
  espnSlug: string,
): Promise<{ nomLigue: string; clubs: ClubResume[]; groupes: GroupeClassement[] }> {
  if (espnSlug === BOTOLA) {
    const { nomLigue, clubs } = await clubsDuChampionnat(espnSlug)
    return { nomLigue, clubs, groupes: [] }
  }

  const d = await jget<EspnStandings>(`${ESPN_LISTE}/${espnSlug}/standings`)
  const vus = new Map<string, ClubResume>()
  const groupes: GroupeClassement[] = []

  const descendre = (n: EspnStandings, nomParent: string) => {
    const entrees = n.standings?.entries ?? []
    if (entrees.length > 0) {
      const lignes: LigneClassement[] = []
      for (const e of entrees) {
        if (!e.team?.id) continue
        const club = versResume(e.team)
        if (!vus.has(e.team.id)) vus.set(e.team.id, club)
        lignes.push({
          rang: stat(e.stats, 'rank').n,
          club,
          joues: stat(e.stats, 'gamesPlayed').n,
          gagnes: stat(e.stats, 'wins').n,
          nuls: stat(e.stats, 'ties').n,
          perdus: stat(e.stats, 'losses').n,
          pour: stat(e.stats, 'pointsFor').n,
          contre: stat(e.stats, 'pointsAgainst').n,
          difference: stat(e.stats, 'pointDifferential').texte,
          points: stat(e.stats, 'points').n,
        })
      }
      // Une entrée sans rang (ESPN en laisse passer) finirait en tête d'un
      // tri naïf : elle est renvoyée au bout.
      lignes.sort((a, b) => (a.rang || 999) - (b.rang || 999))
      if (lignes.length > 0) groupes.push({ nom: n.name ?? nomParent, lignes })
    }
    for (const enfant of n.children ?? []) descendre(enfant, n.name ?? nomParent)
  }
  descendre(d, d.name ?? espnSlug)

  const clubs = [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'en'))
  return { nomLigue: d.name ?? espnSlug, clubs, groupes }
}

/** Les clubs d'un championnat, et le nom qu'ESPN lui donne. */
export async function clubsDuChampionnat(
  espnSlug: string,
): Promise<{ nomLigue: string; clubs: ClubResume[] }> {
  if (espnSlug === BOTOLA) {
    const d = await jget<{ nomLigue: string; clubs: Array<{ id: string; nom: string; abbr: string; logo: string | null }> }>(
      `${WORKER}/botola/teams`,
    )
    const clubs = d.clubs
      .map((c) => ({
        id: c.id,
        nom: c.nom,
        nomCourt: c.nom,
        abbr: c.abbr,
        slug: slugDuClub(c.nom),
        logo: c.logo,
        couleur: null,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'en'))
    return { nomLigue: d.nomLigue, clubs }
  }

  const d = await jget<EspnStandings>(`${ESPN_LISTE}/${espnSlug}/standings`)
  // Une coupe range ses clubs dans plusieurs groupes ; un championnat n'en a
  // qu'un. On descend l'arbre dans les deux cas, et on dédoublonne par id —
  // un club peut figurer dans deux tableaux (classement général et domicile).
  const vus = new Map<string, ClubResume>()
  const descendre = (n: EspnStandings) => {
    for (const e of n.standings?.entries ?? []) {
      if (e.team?.id && !vus.has(e.team.id)) vus.set(e.team.id, versResume(e.team))
    }
    for (const enfant of n.children ?? []) descendre(enfant)
  }
  descendre(d)
  const clubs = [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'en'))
  return { nomLigue: d.name ?? espnSlug, clubs }
}

/**
 * Un club et son effectif.
 *
 * `/teams/{id}/roster` plutôt que `/teams/{id}?enable=roster` : l'endpoint
 * dédié renvoie un effectif plus riche (poste en clair, nationalité, âge) et
 * s'accommode de l'hôte `site.web.api` retenu ci-dessus.
 *
 * Pas de stade : ESPN n'en publie pour aucun club, même sur `/teams/{id}`.
 */
export async function clubAvecEffectif(espnSlug: string, id: string): Promise<ClubDetail> {
  if (espnSlug === BOTOLA) {
    const d = await jget<{
      id: string
      nom: string
      logo: string | null
      effectif: Joueur[]
    }>(`${WORKER}/botola/squad?team=${encodeURIComponent(id)}`)
    // api-sports ne donne pas de statistiques sur cette route : on le dit
    // explicitement plutôt que de laisser le champ absent.
    d.effectif = d.effectif.map((j) => ({ ...j, stats: j.stats ?? null }))
    return {
      id: d.id,
      nom: d.nom,
      nomCourt: d.nom,
      abbr: '',
      slug: slugDuClub(d.nom),
      logo: d.logo,
      couleur: null,
      effectif: d.effectif,
      stade: null,
      lienOfficiel: null,
    }
  }

  const d = await jget<{ team: EspnTeamRaw; athletes?: EspnTeamRaw['athletes'] }>(
    `${ESPN_DETAIL}/${espnSlug}/teams/${id}/roster`,
  )
  const t = d.team
  const effectif: Joueur[] = (d.athletes ?? []).map((a) => ({
    id: a.id ?? '',
    nom: a.displayName ?? '',
    poste: a.position?.abbreviation ?? null,
    numero: a.jersey ?? null,
    age: typeof a.age === 'number' ? a.age : null,
    nationalite: a.citizenship ?? a.birthPlace?.country ?? null,
    stats: statsDe(a),
  }))
  return {
    ...versResume(t),
    effectif,
    stade: t.venue?.fullName ?? null,
    lienOfficiel: t.clubhouse ?? t.links?.find((l) => l.rel?.includes('clubhouse'))?.href ?? null,
  }
}
