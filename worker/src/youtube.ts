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

  // 1. LaLiga écrit le SCORE entre les deux noms :
  //    « VILLARREAL CF 0 - 0 ELCHE CF | RESUMEN LALIGA EA SPORTS ».
  //    C'est la meilleure clé des trois — elle donne l'appariement ET le
  //    résultat, donc de quoi vérifier qu'on a bien le bon match.
  const avecScore = c.titre.match(/^\s*([\p{L}'’ .&-]{3,34}?)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([\p{L}'’ .&-]{3,34}?)\s*(?:\||$)/u)
  if (avecScore) {
    return {
      hashtags,
      paire: [avecScore[1].trim(), avecScore[4].trim()],
      score: [Number(avecScore[2]), Number(avecScore[3])],
    }
  }

  // 2. La Serie A sépare par un tiret, sans score :
  //    « VENEZIA-NAPOLI | HIGHLIGHTS | SERIE A ENILIVE 2026/27 ».
  // Les chiffres font partie des noms : « 1. FC KÖLN », « 1899 Hoffenheim ».
  // Sans eux, un Francfort - Cologne passait au travers (relevé du 17/10).
  const m = c.titre.match(/([\p{L}\d'’ .&]{3,26})\s*[-–]\s*([\p{L}\d'’ .&]{3,26})\s*\|/u)
  return { hashtags, paire: m ? [m[1].trim(), m[2].trim()] : null, score: null }
}

/** Normalisation commune aux deux côtés de l'appariement. */
export const cleNom = (s: string) => s.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/** Un résumé de match se reconnaît au mot, pas à la durée (inconnue ici). */
export const estResume = (c: Clip) => /highlights|resumen|r[ée]sum[ée]|sintesi|zusammenfassung|tore des spieltags/i.test(c.titre)
