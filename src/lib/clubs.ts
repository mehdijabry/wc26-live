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
 * Et pourquoi pas le worker : ESPN répond 403 aux adresses IP de Cloudflare.
 * Vérifié sur la production — `wc26-api.../scoreboard` renvoie « Forbidden ».
 * Un relais côté serveur est donc exclu, ici comme ailleurs sur le site.
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

export type Championnat = {
  /** Le slug ESPN, qui sert de clé d'API. */
  espn: string
  /** Le slug lisible, qui sert d'URL. */
  slug: string
  /** Code ISO du pays, pour le drapeau et le regroupement. Vide pour une compétition continentale. */
  pays: string
}

export type Continent = 'Europe' | 'Americas' | 'Africa' | 'Asia'

/**
 * Les championnats exposés. C'est une sélection éditoriale, pas une base :
 * ajouter une ligne suffit à publier tout un championnat, ses clubs et leurs
 * effectifs, sans écrire une seule donnée.
 *
 * ESPN couvre 219 compétitions. On s'arrête à seize volontairement : le site
 * avait 3 pages indexées sur 50 début octobre 2026, et quelques milliers de
 * pages générées qui répètent ce que Transfermarkt classe déjà se feraient
 * répondre « explorée, actuellement non indexée » — le verdict qui frappe déjà
 * 41 pages ici.
 */
export const CHAMPIONNATS: Record<Continent, Championnat[]> = {
  Europe: [
    { espn: 'eng.1', slug: 'premier-league', pays: 'ENG' },
    { espn: 'esp.1', slug: 'laliga', pays: 'ESP' },
    { espn: 'ger.1', slug: 'bundesliga', pays: 'GER' },
    { espn: 'ita.1', slug: 'serie-a', pays: 'ITA' },
    { espn: 'fra.1', slug: 'ligue-1', pays: 'FRA' },
    { espn: 'por.1', slug: 'primeira-liga', pays: 'POR' },
    { espn: 'ned.1', slug: 'eredivisie', pays: 'NED' },
    { espn: 'tur.1', slug: 'super-lig', pays: 'TUR' },
  ],
  Americas: [
    { espn: 'bra.1', slug: 'brasileirao', pays: 'BRA' },
    { espn: 'arg.1', slug: 'liga-profesional', pays: 'ARG' },
    { espn: 'usa.1', slug: 'mls', pays: 'USA' },
    { espn: 'mex.1', slug: 'liga-mx', pays: 'MEX' },
  ],
  Africa: [
    { espn: 'caf.champions', slug: 'caf-champions-league', pays: '' },
    { espn: 'caf.confed', slug: 'caf-confederation-cup', pays: '' },
    { espn: 'rsa.1', slug: 'south-african-premiership', pays: 'RSA' },
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
    { espn: 'ksa.1', slug: 'saudi-pro-league', pays: 'KSA' },
    { espn: 'jpn.1', slug: 'j-league', pays: 'JPN' },
  ],
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

export type Joueur = {
  id: string
  nom: string
  poste: string | null
  numero: string | null
  age: number | null
  nationalite: string | null
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
  standings?: { entries?: Array<{ team?: EspnTeamRaw }> }
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
  }>
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

/** Les clubs d'un championnat, et le nom qu'ESPN lui donne. */
export async function clubsDuChampionnat(
  espnSlug: string,
): Promise<{ nomLigue: string; clubs: ClubResume[] }> {
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
  }))
  return {
    ...versResume(t),
    effectif,
    stade: t.venue?.fullName ?? null,
    lienOfficiel: t.clubhouse ?? t.links?.find((l) => l.rel?.includes('clubhouse'))?.href ?? null,
  }
}
