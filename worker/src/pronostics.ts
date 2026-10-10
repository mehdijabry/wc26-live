/**
 * Les pronostics : apparier nos matchs avec ceux de Bzzoiro (BSD), puis
 * servir une carte complète sans jamais faire attendre un joueur.
 *
 * ── POURQUOI UN APPARIEMENT ────────────────────────────────────────────────
 * Nos identifiants de match viennent d'ESPN (`e401877883`). BSD a les siens
 * (`209592`). Aucun des deux ne publie la table de correspondance de l'autre,
 * donc on la construit : par JOUR et par NOMS D'ÉQUIPES.
 *
 * Pas par heure de coup d'envoi. Les deux fournisseurs ne sont pas d'accord à
 * la minute près sur une rencontre reportée ou avancée, et un écart de deux
 * minutes suffirait à perdre l'appariement. Le jour, lui, est stable, et deux
 * rencontres entre les mêmes équipes le même jour n'existent pas.
 *
 * ── POURQUOI DANS KV ET PAS DANS UNE COLONNE ──────────────────────────────
 * C'est une donnée DÉRIVÉE : elle se reconstruit entièrement à partir des deux
 * sources, en une passe, par le cron qui écrit déjà les cotes. Une colonne
 * exigerait une migration et créerait un état à tenir synchronisé — pour rien.
 *
 * ── POURQUOI NOS PROBABILITÉS ET PAS LES LEURS ────────────────────────────
 * Mesuré le 10 octobre 2026 sur trois matchs : un des trois est INCOHÉRENT
 * AVEC LUI-MÊME. LASK–Liverpool donnait 76 % de victoire extérieure alors que
 * son xG et son draw-no-bet désignaient le domicile. Leurs sous-modèles ne
 * sont pas réconciliés entre eux.
 *
 * Or on a déjà `esperancesDeButs()`, qui part de la cote RÉELLE à laquelle le
 * joueur mise, en retire la marge du bookmaker et ajuste un Poisson. Résultat
 * cohérent par construction, et surtout cohérent avec le prix affiché juste
 * à côté. On garde donc nos chiffres pour tout ce qui se déduit de la cote, et
 * on prend chez BSD ce qu'on ne sait pas produire : le onze probable, les
 * absents avec leur motif, la forme, les confrontations directes.
 */

const BSD = 'https://sports.bzzoiro.com'

/** Une journée d'appariement tient dans cette clé. Reconstruit par le cron. */
const CLE_APPARIEMENT = 'bsd:appariement'
/** Sept jours : l'appariement couvre exactement la fenêtre des cotes. */
const TTL_APPARIEMENT = 8 * 86_400
/** Le pronostic d'un match ne bouge pas plus vite que ça. */
const TTL_PRONOSTIC = 6 * 3600
/** La composition, elle, se précise à l'approche du coup d'envoi. */
const TTL_COMPOSITION = 900
/** Les confrontations directes ne bougent qu'après un match joué. */
const TTL_H2H = 86_400
/** La forme recule d'un cran à chaque journée : une demi-journée suffit. */
const TTL_FORME = 43_200

type EnvPronos = {
  CACHE: KVNamespace
  BSD_KEY?: string
}

/**
 * Les mots d'un nom d'équipe, réduits à ce que deux fournisseurs écrivent
 * pareil.
 *
 * ATTENTION À CE QU'ON JETTE. La première version retirait aussi « city »,
 * « united », « real » et « sporting » : Manchester City et Manchester United
 * se réduisaient alors tous les deux à « manchester », et rien n'empêchait
 * d'apparier le mauvais match — les deux jouent le même jour. On ne retire
 * donc QUE les mentions de forme juridique ou sportive, celles qui
 * n'identifient jamais un club parmi ceux de sa ville.
 *
 * Le radical : « bulls » → « bull », pour que « Red Bull New York » (ESPN) et
 * « New York Red Bulls » (BSD) tombent sur les mêmes mots.
 */
export function motsDeLEquipe(nom: string): string[] {
  const bruit = new Set([
    'fc', 'cf', 'sc', 'ac', 'as', 'cd', 'sv', 'vfl', 'vfb', 'tsg', 'sd', 'afc', 'rc', 'us', 'ca',
    'ssc', 'ud', 'sk', 'fk', 'kv', 'club', 'clube', 'calcio', 'futbol', 'football', 'futebol', 'cp',
    // Formes de club qui varient d'un fournisseur à l'autre sans rien
    // identifier : ESPN écrit « Racing Genk », BSD « KRC Genk » ; ESPN
    // « Brest », BSD « Stade Brestois ».
    'krc', 'kaa', 'kvc', 'krvc', 'rsc', 'stvv', 'racing', 'stade', 'sv07', 'bsc', 'tsv', 'fsv', 'spvgg',
  ])
  const mots = nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Les lettres qui ne sont PAS un caractère accentué décomposable. « ø »
    // n'est pas « o + accent » : la normalisation Unicode le laisse entier,
    // et le filtre ci-dessous l'effaçait — « Bodø » devenait « bod », trop
    // court pour s'apparier avec le « Bodo » d'ESPN.
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a')
    .replace(/ß/g, 'ss').replace(/đ/g, 'd').replace(/ł/g, 'l').replace(/ı/g, 'i')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const utiles = mots
    .filter((m) => !bruit.has(m))
    // Les sigles de une ou deux lettres ne distinguent rien et ne sont jamais
    // écrits pareil : ESPN « RB Salzburg », BSD « Red Bull Salzburg ».
    .filter((m) => m.length >= 3)
    .map((m) => (m.length >= 5 && m.endsWith('s') ? m.slice(0, -1) : m))
  // Si on a tout jeté, c'est que le nom n'était QUE du bruit : on le garde
  // brut plutôt que de rendre une équipe sans nom.
  return utiles.length ? utiles : mots
}

/**
 * Les villes que l'anglais et la langue locale n'écrivent pas pareil.
 *
 * C'est la seule classe d'écarts qu'aucune règle de préfixe ne rattrape :
 * « Munich » et « München » ne partagent que trois lettres, « Turin » et
 * « Torino » quatre. Une table explicite est ici préférable à une distance
 * d'édition, qui rapprocherait aussi des noms réellement différents.
 *
 * Chaque entrée range ses variantes sous un même mot-clé.
 */
const EXONYMES: Record<string, string> = Object.fromEntries(
  (
    [
      ['munich', 'munchen', 'muenchen'],
      ['cologne', 'koln', 'koeln'],
      ['turin', 'torino'],
      ['milan', 'milano'],
      ['rome', 'roma'],
      ['seville', 'sevilla'],
      ['lisbon', 'lisboa'],
      ['vienna', 'wien'],
      ['geneva', 'geneve'],
      ['zurich', 'zuerich'],
      ['athens', 'athina', 'athinai'],
      ['copenhagen', 'kobenhavn', 'koebenhavn'],
      ['gothenburg', 'goteborg', 'goeteborg'],
      ['prague', 'praha'],
      ['warsaw', 'warszawa'],
      ['moscow', 'moskva'],
      ['belgrade', 'beograd'],
      ['bucharest', 'bucuresti'],
      ['antwerp', 'antwerpen'],
      ['bruges', 'brugge'],
      ['ghent', 'gent'],
      ['piraeus', 'peiraias'],
      ['salonika', 'thessaloniki'],
      ['florence', 'fiorentina', 'firenze'],
      ['naples', 'napoli'],
      ['genoa', 'genova'],
      ['venice', 'venezia'],
      ['mainz', 'mainz05'],
    ] as string[][]
  ).flatMap((groupe) => groupe.map((v) => [v, groupe[0]])),
)

/** Le mot ramené à sa forme de référence quand c'en est une variante connue. */
const canon = (m: string): string => EXONYMES[m] ?? m

/**
 * Deux mots désignent-ils la même chose ?
 *
 * L'égalité ne suffit pas : BSD écrit « Inter » là où ESPN écrit
 * « Internazionale », et « Stade Brestois » là où ESPN écrit « Brest ». Le
 * préfixe règle les deux. Quatre lettres au minimum, sinon « bre » ouvrirait
 * sur Brest, Brescia et Bremen.
 */
function memeMot(brutA: string, brutB: string): boolean {
  const a = canon(brutA)
  const b = canon(brutB)
  if (a === b) return true
  const court = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  return court.length >= 4 && long.startsWith(court)
}

/**
 * À quel point deux noms se ressemblent, de 0 à 1.
 *
 * CE QUI COMPTE N'EST PAS LA LONGUEUR, C'EST LE CONFLIT.
 *
 * Un mot EN PLUS d'un côté est anodin : ESPN écrit « Feyenoord Rotterdam »
 * là où BSD écrit « Feyenoord », « Ajax Amsterdam » là où BSD écrit « Ajax ».
 * Un mot qui se CONTREDIT des deux côtés est fatal : « Manchester City » et
 * « Manchester United » partagent la ville et diffèrent sur ce qui identifie
 * le club.
 *
 * On refuse donc dès que les DEUX noms gardent un mot sans correspondant, et
 * on note sur le nom le plus court sinon. Mesuré sur les deux versions
 * précédentes : diviser par le plus court laissait passer City/United ;
 * diviser par le plus long perdait Feyenoord, Ajax, Mainz et Wolverhampton.
 */
export function ressemblance(a: string, b: string): number {
  const ma = motsDeLEquipe(a)
  const mb = motsDeLEquipe(b)
  if (!ma.length || !mb.length) return 0
  const [court, long] = ma.length <= mb.length ? [ma, mb] : [mb, ma]
  const restants = [...long]
  let trouves = 0
  for (const m of court) {
    const i = restants.findIndex((x) => memeMot(m, x))
    if (i >= 0) { trouves++; restants.splice(i, 1) }
  }
  if (!trouves) return 0
  // Des mots sans correspondant des DEUX côtés : les noms se contredisent.
  const orphelinsCourt = court.length - trouves
  const orphelinsLong = restants.length
  if (orphelinsCourt > 0 && orphelinsLong > 0) return 0
  return trouves / court.length
}

/** Un nom identique mot pour mot — le signal le plus fiable qu'on ait. */
const exact = (a: string, b: string): boolean => {
  const ma = motsDeLEquipe(a).slice().sort().join(' ')
  const mb = motsDeLEquipe(b).slice().sort().join(' ')
  return ma === mb && ma.length > 0
}

type EvBsd = {
  id: number
  event_date?: string
  home_team?: string
  away_team?: string
  league_name?: string
}

/** Le jour UTC d'un instant ISO, sous la forme `2026-10-11`. */
const jourDe = (iso: string): string => iso.slice(0, 10)

async function bsdJson<T>(env: EnvPronos, chemin: string, params?: Record<string, string>): Promise<T> {
  if (!env.BSD_KEY) throw new Error('BSD_KEY absente')
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const r = await fetch(`${BSD}${chemin}${qs}`, {
    headers: { authorization: `Token ${env.BSD_KEY}`, accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!r.ok) throw new Error(`BSD ${r.status} sur ${chemin}`)
  return (await r.json()) as T
}

/** Tous les matchs BSD de la fenêtre, en suivant la pagination. */
async function evenementsBsd(env: EnvPronos, jours: number): Promise<EvBsd[]> {
  const aujourdhui = new Date()
  const fin = new Date(Date.now() + jours * 86_400_000)
  const out: EvBsd[] = []
  let offset = 0
  // Garde-fou : sans lui, une pagination qui ne s'arrête pas boucle sur le
  // temps CPU du worker. 556 matchs sur sept jours mesurés le 10/10/2026.
  for (let page = 0; page < 12; page++) {
    const d = await bsdJson<{ results?: EvBsd[]; next?: string | null }>(env, '/api/v2/events/', {
      date_from: jourDe(aujourdhui.toISOString()),
      date_to: jourDe(fin.toISOString()),
      limit: '200',
      offset: String(offset),
    })
    const lot = d.results ?? []
    out.push(...lot)
    if (!d.next || lot.length === 0) break
    offset += lot.length
  }
  return out
}

export type Appariement = Record<string, number>

/**
 * Construit la correspondance `e401877883` → `209592` pour la fenêtre des
 * cotes, et la pose dans KV. Renvoie de quoi la mesurer.
 *
 * `nosMatchs` vient d'ESPN, là où le worker a déjà les noms sous la main —
 * c'est-à-dire au moment où il écrit les cotes.
 */
export async function construireAppariement(
  env: EnvPronos,
  nosMatchs: Array<{ id: string; date: string; dom: string; ext: string }>,
  jours = 7,
): Promise<{ apparies: number; total: number; manques: string[] }> {
  const leurs = await evenementsBsd(env, jours)

  // Index par jour : comparer 423 matchs à 556 autres en entier coûterait
  // 235 000 comparaisons de chaînes. Par jour, c'est quelques centaines.
  const parJour = new Map<string, EvBsd[]>()
  for (const e of leurs) {
    if (!e.event_date) continue
    const j = jourDe(e.event_date)
    const l = parJour.get(j)
    if (l) l.push(e)
    else parJour.set(j, [e])
  }

  const table: Appariement = {}
  const manques: string[] = []

  for (const m of nosMatchs) {
    const j = jourDe(m.date)
    // La veille et le lendemain aussi : un coup d'envoi à 23 h 10 UTC tombe
    // le jour suivant chez l'un et pas chez l'autre selon l'arrondi.
    const candidats = [
      ...(parJour.get(j) ?? []),
      ...(parJour.get(jourDe(new Date(Date.parse(m.date) - 86_400_000).toISOString())) ?? []),
      ...(parJour.get(jourDe(new Date(Date.parse(m.date) + 86_400_000).toISOString())) ?? []),
    ]
    // ON APPARIE LA PAIRE, PAS CHAQUE ÉQUIPE. « Bayern Munich » et
    // « FC Bayern München » ne se ressemblent qu'à moitié, mais le match
    // « Augsburg – Bayern » du jour est sans ambiguïté dès lors que l'autre
    // équipe, elle, correspond exactement. Exiger la perfection des deux
    // côtés perdait des Ligue 1, des Serie A et des Bundesliga entières.
    let meilleur: { e: EvBsd; score: number } | null = null
    let second = 0
    for (const e of candidats) {
      if (!e.home_team || !e.away_team) continue
      const sd = ressemblance(m.dom, e.home_team)
      const se = ressemblance(m.ext, e.away_team)
      // Deux portes, et une seule suffit : soit les deux noms sont très
      // proches, soit l'un est identique mot pour mot et l'autre reste
      // nettement au-dessus du hasard. Le seuil de 0,6 est ce qui recale
      // « Manchester City » face à « Manchester United » (0,5) tout en
      // laissant passer « Bayern Munich » face à « FC Bayern München » (1).
      const net = sd >= 0.75 && se >= 0.75
      const ancre = (exact(m.dom, e.home_team) && se >= 0.6) || (exact(m.ext, e.away_team) && sd >= 0.6)
      if (!net && !ancre) continue
      const score = sd + se
      if (!meilleur || score > meilleur.score) { second = meilleur?.score ?? 0; meilleur = { e, score } }
      else if (score > second) second = score
    }
    // Une égalité parfaite entre deux candidats n'est pas un appariement,
    // c'est un doute : on préfère pas de pronostic à un faux pronostic.
    const trouve = meilleur && meilleur.score > second ? meilleur.e : null
    if (trouve) table[m.id] = trouve.id
    else if (manques.length < 60) manques.push(`${m.dom} / ${m.ext}`)
  }

  await env.CACHE.put(CLE_APPARIEMENT, JSON.stringify(table), { expirationTtl: TTL_APPARIEMENT })
  // Les échecs sont gardés exprès : sans eux on ne sait pas POURQUOI un match
  // n'a pas de pronostic, et on corrige la normalisation à l'aveugle.
  await env.CACHE.put(
    `${CLE_APPARIEMENT}:manques`,
    JSON.stringify({ quand: new Date().toISOString(), total: nosMatchs.length, apparies: Object.keys(table).length, manques }),
    { expirationTtl: TTL_APPARIEMENT },
  )
  return { apparies: Object.keys(table).length, total: nosMatchs.length, manques }
}

/** La correspondance en cache, ou vide si le cron n'a pas encore tourné. */
export async function appariement(env: EnvPronos): Promise<Appariement> {
  const brut = await env.CACHE.get(CLE_APPARIEMENT)
  return brut ? (JSON.parse(brut) as Appariement) : {}
}

export type Forme = {
  equipe: string
  /** Les dix derniers résultats, du plus ancien au plus récent : « LWWDW… ». */
  serie: string
  joues: number
  gagnes: number
  nuls: number
  perdus: number
  butsPour: number
  butsContre: number
  pointsParMatch: number
  /**
   * LES SOIXANTE STATISTIQUES, telles quelles.
   *
   * On n'en gardait que deux. Mehdi en veut l'intégralité — et c'est la
   * bonne décision : ce sont des moyennes déjà calculées sur la fenêtre, le
   * fournisseur ne facture rien, et choisir à sa place lesquelles comptent
   * pour parier est précisément ce qu'on ne peut pas savoir. L'interface
   * met en avant les plus parlantes et replie le reste.
   *
   * Chaque clé porte aussi son propre dénominateur côté fournisseur : une
   * équipe peut avoir la possession sur dix matchs et les dribbles sur
   * quatre. On ne garde que la moyenne, déjà divisée par le bon compte.
   */
  stats: Record<string, number>
}

export type FaceAFace = {
  total: number
  domGagne: number
  nuls: number
  extGagne: number
  butsDom: number
  butsExt: number
  butsParMatch: number
  derniers: Array<{ date: string; dom: string; ext: string; score: string }>
}

export type CartePronostic = {
  match: string
  source: number | null
  /** Ce que BSD annonce, gardé tel quel et JAMAIS mélangé aux nôtres. */
  leurs: {
    probabilites: { dom: number; nul: number; ext: number } | null
    xg: { dom: number; ext: number } | null
    plusDe: { un5: number; deux5: number; trois5: number } | null
    lesDeuxMarquent: number | null
    scoreProbable: string | null
    corners: { huit5: number; neuf5: number; dix5: number } | null
    confiance: number | null
    modele: string | null
    /** Vrai quand leurs blocs se contredisent : on n'affiche alors rien d'eux. */
    incoherent: boolean
  } | null
  composition: unknown | null
  absents: unknown | null
  statutComposition: string
  /** La forme des deux équipes et leur histoire commune. Nulles quand le
   *  fournisseur ne les a pas — la carte se monte sans elles. */
  forme: { dom: Forme | null; ext: Forme | null } | null
  faceAFace: FaceAFace | null
}

/**
 * Leurs blocs se contredisent-ils ?
 *
 * Trois lectures du même match doivent désigner le même favori : le 1X2, le
 * xG, et le draw-no-bet. Quand elles divergent, c'est que leurs sous-modèles
 * ne parlent pas de la même rencontre — on refuse alors le bloc en entier
 * plutôt que d'afficher trois chiffres dont deux mentent.
 */
export function pronosticIncoherent(m: {
  match_result?: { prob_home?: number; prob_away?: number }
  expected_goals?: { home?: number; away?: number }
  draw_no_bet?: { prob_home?: number }
}): boolean {
  const r = m.match_result
  const g = m.expected_goals
  const d = m.draw_no_bet
  if (!r || g?.home === undefined || g?.away === undefined || d?.prob_home === undefined) return false
  const favori1 = (r.prob_home ?? 0) > (r.prob_away ?? 0)
  const favoriX = g.home > g.away
  const favoriD = d.prob_home > 50
  return !(favori1 === favoriX && favori1 === favoriD)
}

/**
 * La carte d'un match, montée depuis le cache quand il est chaud.
 *
 * DEUX CACHES SÉPARÉS, et c'est volontaire : le pronostic ne bouge presque
 * pas (six heures), la composition se précise dans l'heure qui précède le
 * coup d'envoi (quinze minutes). Les mettre ensemble forcerait à rafraîchir
 * le pronostic toutes les quinze minutes pour rien.
 */
export async function cartePronostic(env: EnvPronos, matchId: string): Promise<CartePronostic> {
  const table = await appariement(env)
  const source = table[matchId] ?? null
  const vide: CartePronostic = {
    match: matchId,
    source: null,
    leurs: null,
    composition: null,
    absents: null,
    statutComposition: 'unavailable',
    forme: null,
    faceAFace: null,
  }
  if (!source) return vide

  const clePro = `bsd:pro:${source}`
  const cleComp = `bsd:comp:${source}`

  type RepPro = {
    markets?: {
      match_result?: { prob_home?: number; prob_draw?: number; prob_away?: number }
      expected_goals?: { home?: number; away?: number }
      over_under?: { prob_over_15?: number; prob_over_25?: number; prob_over_35?: number }
      btts?: { prob_yes?: number }
      score?: { most_likely?: string }
      draw_no_bet?: { prob_home?: number }
      corners?: { prob_over_85?: number; prob_over_95?: number; prob_over_105?: number }
    }
    model?: { confidence?: number; version?: string }
  }
  type RepComp = {
    lineup_status?: string
    lineups?: unknown
    unavailable_players?: unknown
  }

  const lire = async <T>(cle: string, chemin: string, ttl: number): Promise<T | null> => {
    const chaud = await env.CACHE.get(cle)
    if (chaud) return JSON.parse(chaud) as T
    try {
      const d = await bsdJson<T>(env, chemin)
      env.CACHE.put(cle, JSON.stringify(d), { expirationTtl: ttl }).catch(() => {})
      return d
    } catch {
      // Une donnée absente n'est pas une page cassée : la carte se montera
      // sans ce bloc, et le site affichera nos propres chiffres.
      return null
    }
  }

  type RepH2H = {
    total_matches?: number
    home_wins?: number
    draws?: number
    away_wins?: number
    home_goals?: number
    away_goals?: number
    avg_total_goals?: number
    recent_matches?: Array<{ date?: string; home?: string; away?: string; score?: string }>
  }
  type RepForme = {
    team_name?: string
    overall?: {
      matches?: number
      won?: number
      drawn?: number
      lost?: number
      goals_for?: number
      goals_against?: number
      form?: string
      points_per_match?: number
      stats?: Record<string, { average?: number } | undefined>
    }
  }

  const [pro, comp, h2h] = await Promise.all([
    lire<RepPro>(clePro, `/api/v2/events/${source}/prediction/`, TTL_PRONOSTIC),
    lire<RepComp>(cleComp, `/api/v2/events/${source}/lineups/`, TTL_COMPOSITION),
    lire<RepH2H>(`bsd:h2h:${source}`, `/api/v2/events/${source}/h2h/`, TTL_H2H),
  ])

  // LES IDENTIFIANTS D'ÉQUIPE VIENNENT DE LA COMPOSITION, donc cette passe-ci
  // ne peut pas être lancée en même temps que la précédente. C'est le seul
  // appel en deux temps de la carte, et il est conditionnel : pas de
  // composition, pas de forme — plutôt que d'aller chercher une forme qu'on
  // ne saurait rattacher à personne.
  const cotes = comp?.lineups as { home?: { team_id?: number }; away?: { team_id?: number } } | undefined
  const idDom = cotes?.home?.team_id
  const idExt = cotes?.away?.team_id
  const [formeDom, formeExt] = await Promise.all([
    idDom ? lire<RepForme>(`bsd:forme:${idDom}`, `/api/v2/teams/${idDom}/form/`, TTL_FORME) : Promise.resolve(null),
    idExt ? lire<RepForme>(`bsd:forme:${idExt}`, `/api/v2/teams/${idExt}/form/`, TTL_FORME) : Promise.resolve(null),
  ])

  const formeDe = (f: RepForme | null): Forme | null => {
    const o = f?.overall
    if (!o) return null
    return {
      equipe: f?.team_name ?? '',
      serie: o.form ?? '',
      joues: o.matches ?? 0,
      gagnes: o.won ?? 0,
      nuls: o.drawn ?? 0,
      perdus: o.lost ?? 0,
      butsPour: o.goals_for ?? 0,
      butsContre: o.goals_against ?? 0,
      pointsParMatch: o.points_per_match ?? 0,
      stats: Object.fromEntries(
        Object.entries(o.stats ?? {})
          .map(([k, v]) => [k, v?.average])
          .filter((e): e is [string, number] => typeof e[1] === 'number'),
      ),
    }
  }

  const m = pro?.markets
  const incoherent = m ? pronosticIncoherent(m) : false

  return {
    match: matchId,
    source,
    leurs: m
      ? {
          probabilites:
            m.match_result && !incoherent
              ? {
                  dom: m.match_result.prob_home ?? 0,
                  nul: m.match_result.prob_draw ?? 0,
                  ext: m.match_result.prob_away ?? 0,
                }
              : null,
          xg: m.expected_goals && !incoherent ? { dom: m.expected_goals.home ?? 0, ext: m.expected_goals.away ?? 0 } : null,
          plusDe: m.over_under
            ? {
                un5: m.over_under.prob_over_15 ?? 0,
                deux5: m.over_under.prob_over_25 ?? 0,
                trois5: m.over_under.prob_over_35 ?? 0,
              }
            : null,
          lesDeuxMarquent: m.btts?.prob_yes ?? null,
          scoreProbable: incoherent ? null : (m.score?.most_likely ?? null),
          corners: m.corners
            ? {
                huit5: m.corners.prob_over_85 ?? 0,
                neuf5: m.corners.prob_over_95 ?? 0,
                dix5: m.corners.prob_over_105 ?? 0,
              }
            : null,
          confiance: pro?.model?.confidence ?? null,
          modele: pro?.model?.version ?? null,
          incoherent,
        }
      : null,
    composition: comp?.lineups ?? null,
    absents: comp?.unavailable_players ?? null,
    statutComposition: comp?.lineup_status ?? 'unavailable',
    forme: formeDom || formeExt ? { dom: formeDe(formeDom), ext: formeDe(formeExt) } : null,
    faceAFace: h2h?.total_matches
      ? {
          total: h2h.total_matches,
          domGagne: h2h.home_wins ?? 0,
          nuls: h2h.draws ?? 0,
          extGagne: h2h.away_wins ?? 0,
          butsDom: h2h.home_goals ?? 0,
          butsExt: h2h.away_goals ?? 0,
          butsParMatch: Math.round((h2h.avg_total_goals ?? 0) * 100) / 100,
          derniers: (h2h.recent_matches ?? []).slice(0, 4).map((m) => ({
            date: m.date ?? '',
            dom: m.home ?? '',
            ext: m.away ?? '',
            score: m.score ?? '',
          })),
        }
      : null,
  }
}
