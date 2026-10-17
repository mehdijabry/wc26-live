/**
 * YOUTUBE — la source vidéo des buts et des résumés.
 *
 * ── POURQUOI YOUTUBE ET PAS X ─────────────────────────────────────────────
 * Mesuré le 17/10/2026. Les deux portes gratuites de X sont fermées :
 * l'endpoint de syndication que charge le widget d'embed répond 429 dès la
 * première requête, et `cdn.syndication.twimg.com` répond 200 avec zéro
 * octet. Lire un fil de X coûte donc ~0,005 $ par post (API à l'usage).
 *
 * YouTube, lui, donne tout gratuitement : identifiant vidéo, titre, heure de
 * publication et DESCRIPTION COMPLÈTE. Pour la Serie A, la description porte
 * le buteur et sa minute — « Adams 49’ » — et le titre porte le match.
 *
 * ── LA RÈGLE DE QUOTA QUI DÉCIDE DE TOUT ──────────────────────────────────
 * Documentation Google : 10 000 unités par jour, mais seulement **100 appels
 * à `search.list`**. La recherche est donc inutilisable. En revanche, lister
 * les mises en ligne d'une chaîne (`playlistItems.list`) coûte **1 unité
 * pour 50 vidéos**. Onze chaînes toutes les cinq minutes = 3 168 unités, un
 * tiers du quota. Tout ce module est construit sur cette contrainte : on ne
 * cherche JAMAIS, on liste.
 *
 * L'astuce qui rend ça possible : la playlist des mises en ligne d'une
 * chaîne est son identifiant avec `UC` remplacé par `UU`.
 */

type EnvYt = { YOUTUBE_API_KEY?: string }

export type Clip = {
  videoId: string
  titre: string
  description: string
  publie: string
  chaine: string
}

/**
 * Les comptes officiels, relevés un par un le 17/10/2026 (l'identifiant est
 * lu sur le `rel="canonical"` de la page de la chaîne, pas deviné).
 *
 * `fiable` dit ce que le relevé du soir a montré :
 *   'resume'  — titre `ÉQUIPE-ÉQUIPE | HIGHLIGHTS` et buteurs en description
 *   'clip'    — titres-accroches, mais un hashtag identifie le match
 *   'faible'  — rien ne permet de rattacher la vidéo à un match
 */
export const CHAINES: Array<{ cle: string; nom: string; id: string; slug?: string; fiable: 'resume' | 'clip' | 'faible' }> = [
  { cle: 'seriea',  nom: 'Serie A',        id: 'UCBJeMCIeLQos7wacox4hmLQ', slug: 'ita.1', fiable: 'resume' },
  { cle: 'laliga',  nom: 'LaLiga',         id: 'UCTv-XvfzLX3i4IGWAm4sbmA', slug: 'esp.1', fiable: 'clip' },
  { cle: 'bundesliga', nom: 'Bundesliga',  id: 'UC6UL29enLNe4mqwTfAyeNuw', slug: 'ger.1', fiable: 'clip' },
  { cle: 'ucl',     nom: 'UEFA',           id: 'UCyGa1YEx9ST66rYrJTGIKOw', slug: 'uefa.champions', fiable: 'faible' },
  { cle: 'ligue1',  nom: 'Ligue 1',        id: 'UCQsH5XtIc9hONE1BQjucM0g', slug: 'fra.1', fiable: 'faible' },
  { cle: 'epl',     nom: 'Premier League', id: 'UCG5qGWdu8nIRZqJ_GgDwQ-w', slug: 'eng.1', fiable: 'faible' },
  { cle: 'facup',   nom: 'The FA',         id: 'UCKvm1WdGoJF3gohzzdJdabw', slug: 'eng.fa', fiable: 'faible' },
  { cle: 'coppa',   nom: 'Coppa Italia',   id: 'UChtcq-XNGluTgtW3o6N2FbA', slug: 'ita.coppa_italia', fiable: 'faible' },

  // ── LES DIFFUSEURS ────────────────────────────────────────────────────
  // Là où le championnat ne publie que des compilations de journée, c'est
  // le DÉTENTEUR DES DROITS qui met les buts en ligne, match par match
  // (Mehdi, 17/10/2026). L'embed reste propre : la vidéo joue sur leur
  // lecteur, et ce sont eux qui gardent les vues.
  { cle: 'bein',    nom: 'beIN SPORTS USA',  id: 'UC0YatYmg5JRYzXJPxIdRd8g', slug: 'fra.1', fiable: 'clip' },
  { cle: 'fubo',    nom: 'Fubo',             id: 'UCD2lJITnvzflNhOqQckMpQg', slug: 'eng.1', fiable: 'clip' },
  { cle: 'dazn',    nom: 'DAZN Football',    id: 'UCSZ21xyG8w_33KriMM69IxQ', slug: 'uefa.champions', fiable: 'clip' },
]

/** La playlist des mises en ligne : l'identifiant de chaîne, `UC` → `UU`. */
export const playlistDesUploads = (channelId: string) => `UU${channelId.slice(2)}`

async function ytGet(env: EnvYt, chemin: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  if (!env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY absente')
  const qs = new URLSearchParams({ ...params, key: env.YOUTUBE_API_KEY })
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${chemin}?${qs}`, {
    headers: { 'user-agent': 'p90-worker/1.0' },
    signal: AbortSignal.timeout(20_000),
  })
  const j = await r.json().catch(() => ({})) as Record<string, unknown>
  if (!r.ok) {
    const e = (j.error ?? {}) as { message?: string }
    throw new Error(`youtube ${chemin} ${r.status}: ${(e.message ?? '').slice(0, 140)}`)
  }
  return j
}

/** Les N dernières mises en ligne d'une chaîne. 1 unité de quota, 50 max. */
export async function derniersClips(env: EnvYt, channelId: string, n = 20): Promise<Clip[]> {
  const j = await ytGet(env, 'playlistItems', {
    part: 'snippet',
    playlistId: playlistDesUploads(channelId),
    maxResults: String(Math.min(50, Math.max(1, n))),
  })
  const items = (j.items ?? []) as Array<{ snippet?: Record<string, unknown> }>
  return items.map((it) => {
    const s = (it.snippet ?? {}) as Record<string, unknown>
    const res = (s.resourceId ?? {}) as { videoId?: string }
    return {
      videoId: String(res.videoId ?? ''),
      titre: String(s.title ?? ''),
      description: String(s.description ?? ''),
      publie: String(s.publishedAt ?? ''),
      chaine: String(s.channelTitle ?? ''),
    }
  }).filter((c) => c.videoId)
}

/**
 * Résout une chaîne par sa poignée (@bundesliga). 1 unité.
 * Sert à compléter le registre sans lire une page HTML de YouTube, qui
 * renvoie un mur de consentement selon l'adresse d'où on appelle.
 */
export async function chaineParPoignee(env: EnvYt, poignee: string): Promise<{ id: string; titre: string } | null> {
  const j = await ytGet(env, 'channels', { part: 'snippet', forHandle: poignee.replace(/^@/, '') })
  const items = (j.items ?? []) as Array<{ id?: string; snippet?: { title?: string } }>
  const c = items[0]
  return c?.id ? { id: c.id, titre: String(c.snippet?.title ?? '') } : null
}

/**
 * LES CLÉS D'APPARIEMENT d'un clip avec un match.
 *
 * Par ordre de fiabilité, parce qu'elles ne se valent pas :
 *   1. le hashtag de match     (#RealBetisBarça, #VeneziaNapoli)
 *   2. le motif ÉQUIPE-ÉQUIPE  (VENEZIA-NAPOLI | HIGHLIGHTS)
 * Le reste — rattacher par la seule heure de publication — se fait côté
 * appelant, en croisant avec les matchs terminés : ici on ne rend que ce
 * que le texte dit vraiment.
 */
export function clesDAppariement(c: Clip): {
  hashtags: string[]; paire: [string, string] | null; score: [number, number] | null
} {
  const hashtags = [...`${c.titre} ${c.description}`.matchAll(/#([\p{L}\p{N}_]{4,40})/gu)].map((m) => m[1])
  const t = c.titre

  // ── TROIS MOTIFS, DANS CET ORDRE ──────────────────────────────────────
  // L'ordre n'est pas cosmétique : les noms de clubs CONTIENNENT des
  // tirets (Paris Saint-Germain, Saint-Étienne) et des chiffres (1. FC
  // Köln). Chercher le tiret en premier coupait « Paris Saint-Germain » en
  // deux et rendait « Strasbourg vs Paris Saint » contre « Germain »
  // (relevé du 17/10). Le tiret passe donc EN DERNIER, quand aucun
  // séparateur plus explicite n'a été trouvé.
  //
  // Chaque motif démarre au début du titre OU juste après un « | » : les
  // diffuseurs font précéder la paire d'une accroche (« Seven-Goal
  // THRILLER! | … »), et sans cette ancre le motif mordait au milieu d'un
  // mot.
  const NOM = "[\\p{L}\\d'’.\\-& ]{3,40}?"

  // 1. Le score entre les deux noms — LaLiga. Le meilleur des trois : il
  //    apparie ET donne le résultat, donc de quoi vérifier le match.
  const avecScore = t.match(new RegExp(`(?:^|\\|)\\s*(${NOM})\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+(${NOM})\\s*(?:\\||$)`, 'u'))
  if (avecScore) {
    return {
      hashtags,
      paire: [avecScore[1].trim(), avecScore[4].trim()],
      score: [Number(avecScore[2]), Number(avecScore[3])],
    }
  }

  // 2. « vs » / « vs. » — beIN, Fubo, DAZN. Sans ambiguïté possible.
  const avecVs = t.match(new RegExp(`(?:^|\\|)\\s*(${NOM})\\s+vs\\.?\\s+(${NOM})\\s*(?:\\||$)`, 'iu'))
  if (avecVs) return { hashtags, paire: [avecVs[1].trim(), avecVs[2].trim()], score: null }

  // 3. Le tiret — Serie A, Bundesliga. En dernier, voir plus haut.
  const avecTiret = t.match(new RegExp(`(?:^|\\|)\\s*([\\p{L}\\d'’.& ]{3,40}?)\\s*[-–]\\s*([\\p{L}\\d'’.& ]{3,40}?)\\s*(?:\\||$)`, 'u'))
  if (avecTiret) return { hashtags, paire: [avecTiret[1].trim(), avecTiret[2].trim()], score: null }

  return { hashtags, paire: null, score: null }
}

/** Normalisation commune aux deux côtés de l'appariement. */
export const cleNom = (s: string) => s.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/** Un résumé de match se reconnaît au mot, pas à la durée (inconnue ici). */
export const estResume = (c: Clip) => /highlights|resumen|r[ée]sum[ée]|sintesi|zusammenfassung|tore des spieltags/i.test(c.titre)
