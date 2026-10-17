/**
 * LES RÉSUMÉS DE MATCH — détection, rattachement, publication.
 *
 * ── LES DEUX RÈGLES DE MEHDI (17/10/2026) ─────────────────────────────────
 * 1. Le résumé COURT part dès qu'il est disponible. L'EXTENDED attend la fin
 *    de la journée, et seul celui du MEILLEUR match de chaque championnat
 *    est publié — le meilleur au nombre de vues. Les autres extendeds
 *    rejoignent leur propre post en commentaire : un match = un seul post.
 * 2. SAUF la Ligue des champions, où tout passe : court pour tous les
 *    matchs, puis extended pour tous.
 *
 * ── POURQUOI LA PLAYLIST QUAND IL Y EN A UNE ──────────────────────────────
 * beIN déborde largement du football — padel, futsal, MMA, Libertadores.
 * Trier sur le titre marcherait mal. Mehdi a trouvé mieux : la chaîne range
 * sa Ligue 1 dans une playlist, et lire la playlist filtre la compétition
 * À LA SOURCE, pour le même coût d'une unité de quota.
 *
 * ── CE QU'ON NE FAIT JAMAIS ───────────────────────────────────────────────
 * Héberger la vidéo. On garde l'identifiant, on affiche le lecteur de
 * l'ayant droit, et sur Facebook on publie NOTRE carte avec le lien. Le
 * Rights Manager de Meta attrape un but reversé en quelques minutes, et
 * c'est la page qui prend l'avertissement.
 */
import type { Env } from './index'
import type { AutoMatch } from './automation'
import { bigMatchesToday, fbPost, fbComment, log, renderImage, sbHeaders } from './automation'
import { clesDAppariement, clipsDePlaylist, derniersClips, type Clip } from './youtube'

const SITE = 'https://pressing90.live'

export type Source = {
  cle: string
  nom: string
  /** La compétition telle qu'on l'affichera. */
  competition: string
  /** Le slug ESPN, pour ne rattacher qu'aux matchs de cette compétition. */
  slug: string
  type: 'chaine' | 'playlist'
  id: string
  /**
   * Le mot qui prouve que le clip appartient bien à cette compétition.
   * Inutile sur une playlist dédiée — elle est déjà filtrée — indispensable
   * sur une chaîne de diffuseur qui couvre dix sports.
   */
  motCle?: RegExp
  /** La Ligue des champions publie TOUS ses extendeds, pas seulement un. */
  extendedPourTous?: boolean
}

export const SOURCES: Source[] = [
  { cle: 'ligue1', nom: 'beIN SPORTS', competition: 'Ligue 1', slug: 'fra.1',
    type: 'playlist', id: 'PLTh8XJqdpxU4' },
  { cle: 'epl', nom: 'Fubo', competition: 'Premier League', slug: 'eng.1',
    type: 'chaine', id: 'UCD2lJITnvzflNhOqQckMpQg', motCle: /premier league/i },
  { cle: 'ucl', nom: 'DAZN', competition: 'Champions League', slug: 'uefa.champions',
    type: 'playlist', id: 'PLRnudrgaT-tc', motCle: /champions league/i, extendedPourTous: true },
  { cle: 'seriea', nom: 'Serie A', competition: 'Serie A', slug: 'ita.1',
    type: 'chaine', id: 'UCBJeMCIeLQos7wacox4hmLQ', motCle: /serie a/i },
  { cle: 'laliga', nom: 'LaLiga', competition: 'LaLiga', slug: 'esp.1',
    type: 'chaine', id: 'UCTv-XvfzLX3i4IGWAm4sbmA', motCle: /resumen|laliga/i },
  { cle: 'bundesliga', nom: 'Bundesliga', competition: 'Bundesliga', slug: 'ger.1',
    type: 'chaine', id: 'UC6UL29enLNe4mqwTfAyeNuw', motCle: /bundesliga/i },
]

/**
 * LE MOT FAIT FOI. Mehdi, 17/10/2026 : « dans la playlist il y a aussi des
 * reels, vérifie toujours qu'il y a le mot highlights dans le titre ».
 *
 * Mesuré sur la playlist de la Ligue des champions : sur seize vidéos,
 * HUIT sont des reels, des interviews ou des clips de but — « RÜDIGER
 * ADMITS… », « VITINHA WITH AN ABSOLUTE GOLAZO! » — et seulement sept sont
 * de vrais résumés. Sans ce garde, une interview d'après-match partirait
 * sur la page comme résumé de la rencontre.
 *
 * Il n'y a donc PAS de classe « but » ici : un but se publie à la main
 * depuis l'admin, parce qu'un titre ne dit pas toujours s'il s'agit d'un
 * but, d'un arrêt ou d'un reel. Tout ce qui ne porte pas le mot est écarté.
 *
 * L'ordre des tests compte : « EXTENDED HIGHLIGHTS » contient « HIGHLIGHTS ».
 */
const MOT_RESUME = /highlights|resumen|r[ée]sum[ée]|sintesi|zusammenfassung/i

export function classer(titre: string): 'resume_court' | 'resume_long' | 'resume' | 'autre' {
  const t = String(titre || '')
  if (!MOT_RESUME.test(t)) return 'autre'
  if (/quick highlights/i.test(t)) return 'resume_court'
  if (/extended highlights|resumen extendido/i.test(t)) return 'resume_long'
  return 'resume'
}

/**
 * Normalisation d'un nom de club, des deux côtés de l'appariement.
 * « Brentford FC » chez Fubo contre « Brentford » chez nous : on retire les
 * affixes de club avant de comparer, sinon rien ne tombe jamais juste.
 */
/**
 * Les lettres que `NFD` ne décompose pas : ø, æ, ß, đ, ł ne sont pas des
 * voyelles accentuées mais des lettres à part entière. « Bødo / Glimt »
 * contre « Bodo/Glimt » ne tombait pas juste sans cette table.
 */
const LETTRES = [['ø', 'o'], ['æ', 'ae'], ['œ', 'oe'], ['ß', 'ss'], ['đ', 'd'], ['ð', 'd'], ['ł', 'l'], ['þ', 'th']] as const
const translit = (x: string) => LETTRES.reduce((t, [a, b]) => t.split(a).join(b), x)

export function cleClub(nom: string): string {
  return translit(String(nom || '').toLowerCase())
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(fc|cf|afc|rc|rcd|sv|ac|as|us|sc|ss|ssc|ogc|losc|sco|fk|bk|cd|ud|club|calcio|de|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Les INITIALES d'un nom composé : « Paris Saint-Germain » → « psg ».
 *
 * Sans elles, les quinze clips de Ligue 1 du 17/10 sont restés orphelins :
 * beIN écrit le nom en entier, ESPN écrit l'abréviation, et aucun des deux
 * ne contient l'autre. Les affixes de club sont retirés d'abord, sinon
 * « RC Strasbourg » donnerait « rs ».
 */
export function initiales(nom: string): string {
  const mots = translit(String(nom || '').toLowerCase())
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !/^(fc|cf|afc|rc|rcd|sv|ac|as|us|sc|ss|ssc|ogc|losc|sco|fk|bk|cd|ud|club|calcio|de|the|united|city)$/.test(w))
  return mots.length >= 2 ? mots.map((w) => w[0]).join('') : ''
}

/** Le match du jour qui correspond à cette paire, ou rien. */
export function trouverMatch(pool: AutoMatch[], paire: [string, string], slug: string): AutoMatch | null {
  const [a, b] = paire.map(cleClub)
  if (!a || !b) return null
  const ini = paire.map(initiales)
  const proche = (x: string, y: string, iy: string, ix: string) =>
    !!x && !!y && (x === y || x.includes(y) || y.includes(x)
      // L'abréviation d'un côté contre le nom complet de l'autre.
      || (!!iy && iy.length >= 2 && iy === x) || (!!ix && ix.length >= 2 && ix === y))
  // Le slug d'abord : deux clubs homonymes dans deux pays existent, et un
  // clip de Ligue 1 n'a rien à faire sur un match de Premier League.
  const candidats = pool.filter((m) => m.slug === slug)
  const va = (m: AutoMatch, x: string, ix: string) =>
    proche(cleClub(m.home), x, ix, initiales(m.home))
  const vb = (m: AutoMatch, x: string, ix: string) =>
    proche(cleClub(m.away), x, ix, initiales(m.away))
  return candidats.find((m) => va(m, a, ini[0]) && vb(m, b, ini[1]))
      ?? candidats.find((m) => va(m, b, ini[1]) && vb(m, a, ini[0]))
      ?? null
}

type Ligne = {
  video_id: string; source: string; kind: string; titre: string; description: string | null
  publie_at: string; match_id: string | null; competition: string | null
  equipe_dom: string | null; equipe_ext: string | null
  score_dom: number | null; score_ext: number | null
  publie_site: boolean; publie_fb?: boolean; fb_post_id?: string | null
}

async function ecrire(env: Env, lignes: Ligne[]): Promise<void> {
  if (!lignes.length) return
  await fetch(`${env.SUPABASE_URL}/rest/v1/videos_matchs?on_conflict=video_id`, {
    method: 'POST',
    headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(lignes),
  })
}

/** Les vidéos déjà en base pour ce match, pour ne pas doubler un post. */
async function dejaLa(env: Env, matchId: string): Promise<Array<{ kind: string; fb_post_id: string | null; publie_fb: boolean }>> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?match_id=eq.${encodeURIComponent(matchId)}&select=kind,fb_post_id,publie_fb`,
    { headers: sbHeaders(env) },
  )
  return (await r.json().catch(() => [])) as Array<{ kind: string; fb_post_id: string | null; publie_fb: boolean }>
}

/** La carte Facebook d'un résumé, dessinée par le studio. */
async function carte(env: Env, m: AutoMatch | null, s: Source, videoId: string): Promise<string> {
  const repli = `${SITE}/icon-512.png`
  try {
    return await renderImage(env, 'but-clip', {
      lang: 'ar', competition: s.competition,
      home: m?.home ?? '', away: m?.away ?? '',
      homeLogo: m?.homeLogo ?? '', awayLogo: m?.awayLogo ?? '',
      homeScore: m?.homeScore ?? '', awayScore: m?.awayScore ?? '',
      vignette: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      barca: true,
    })
  } catch { return repli }
}

const lienYt = (id: string) => `https://www.youtube.com/watch?v=${id}`

/**
 * LA PASSE DE DÉTECTION. Une unité de quota par source, soit six par tour.
 * À cinq minutes d'intervalle : 1 728 unités par jour sur les 10 000.
 */
export async function scanResumes(env: Env, date: string): Promise<string> {
  if (!(env as unknown as { YOUTUBE_API_KEY?: string }).YOUTUBE_API_KEY) return 'pas de clé YouTube'
  const pool = await bigMatchesToday(env).catch(() => [] as AutoMatch[])
  const notes: string[] = []

  for (const s of SOURCES) {
    let clips: Clip[] = []
    try {
      clips = s.type === 'playlist'
        ? await clipsDePlaylist(env as unknown as { YOUTUBE_API_KEY?: string }, s.id, 20)
        : await derniersClips(env as unknown as { YOUTUBE_API_KEY?: string }, s.id, 20)
    } catch (e) {
      notes.push(`${s.cle}: ÉCHEC ${String(e).slice(0, 80)}`); continue
    }

    const nouvelles: Ligne[] = []
    for (const c of clips) {
      const vu = `vid:${c.videoId}`
      if (await env.CACHE.get(vu)) continue
      // Le témoin est posé AVANT toute décision : un clip qu'on a regardé
      // et écarté ne doit pas être réexaminé à chaque tour.
      await env.CACHE.put(vu, '1', { expirationTtl: 5 * 86400 })

      // Le MOT d'abord — un reel ou une interview n'ira jamais plus loin —
      // puis la compétition. Le titre seul pour le mot : une description
      // porte souvent « Highlights » dans son pied de chaîne.
      const kind = classer(c.titre)
      if (kind === 'autre') continue
      if (s.motCle && !s.motCle.test(`${c.titre} ${c.description}`)) continue
      // Un résumé sans paire d'équipes reconnue n'est pas un résumé de
      // match : c'est une compilation de journée (« EVERY Weekend Goal »).
      // On ne l'écarte pas, mais il ne sera jamais posté — faute de match.

      const k = clesDAppariement(c)
      const m = k.paire ? trouverMatch(pool, k.paire, s.slug) : null

      nouvelles.push({
        video_id: c.videoId, source: s.cle, kind,
        titre: c.titre, description: (c.description || '').slice(0, 2000),
        publie_at: c.publie || new Date().toISOString(),
        match_id: m?.id ?? null,
        competition: s.competition,
        equipe_dom: m?.home ?? k.paire?.[0] ?? null,
        equipe_ext: m?.away ?? k.paire?.[1] ?? null,
        score_dom: k.score ? k.score[0] : (m ? Number(m.homeScore) : null),
        score_ext: k.score ? k.score[1] : (m ? Number(m.awayScore) : null),
        publie_site: true,
      })
    }

    await ecrire(env, nouvelles)
    if (nouvelles.length) notes.push(`${s.cle}: ${nouvelles.length} nouvelles`)
  }

  // ── PUIS ON PUBLIE, UN SEUL À LA FOIS ─────────────────────────────────
  const poste = await publierUnCourt(env, pool)
  if (poste) notes.push(poste)

  const note = notes.join(' | ') || 'rien de neuf'
  await log(env, date, 'yt-scan', true, note.slice(0, 700))
  return note
}

/**
 * PUBLIE AU PLUS UN RÉSUMÉ COURT PAR PASSE.
 *
 * Deux raisons, et aucune n'est cosmétique :
 *
 *   · LE PREMIER TOUR. Au tout premier passage, le témoin KV est vide et
 *     une journée entière de résumés serait vue d'un coup — dix posts en
 *     rafale sur la page. Un par passe, toutes les cinq minutes, donne le
 *     rythme d'une publication humaine.
 *   · LA REPRISE. Ce qui n'est pas publié reste en base avec `publie_fb`
 *     à faux : si le worker tombe, la passe suivante reprend là où elle en
 *     était. Rien ne dépend d'un drapeau perdu dans le KV.
 *
 * Et on ne publie QUE du frais : au-delà de trois heures, le match est
 * oublié et le post ferait vieux.
 */
async function publierUnCourt(env: Env, pool: AutoMatch[]): Promise<string | null> {
  const depuis = new Date(Date.now() - 3 * 3600_000).toISOString()
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?publie_fb=eq.false&match_id=not.is.null`
    + `&kind=in.(resume,resume_court)&publie_at=gte.${encodeURIComponent(depuis)}`
    + `&select=video_id,source,kind,titre,match_id,competition,equipe_dom,equipe_ext,score_dom,score_ext`
    + `&order=publie_at.asc&limit=5`,
    { headers: sbHeaders(env) },
  )
  const attente = (await r.json().catch(() => [])) as Array<{
    video_id: string; source: string; kind: string; titre: string; match_id: string
    competition: string | null; equipe_dom: string | null; equipe_ext: string | null
    score_dom: number | null; score_ext: number | null
  }>
  if (!attente.length) return null

  for (const x of attente) {
    // Un match = un seul post. Si le court est déjà sorti sous une autre
    // version (QUICK puis HIGHLIGHTS), on marque celle-ci comme traitée et
    // on passe : elle rejoindra le post en commentaire si besoin.
    const freres = await dejaLa(env, x.match_id)
    if (freres.some((f) => f.publie_fb && (f.kind === 'resume' || f.kind === 'resume_court'))) {
      await marquer(env, x.video_id, { publie_fb: true })
      continue
    }
    const s = SOURCES.find((o) => o.cle === x.source)
    if (!s) { await marquer(env, x.video_id, { publie_fb: true }); continue }
    const m = pool.find((o) => o.id === x.match_id) ?? null
    const img = await carte(env, m, s, x.video_id)
    const dom = x.equipe_dom ?? m?.home ?? ''
    const ext = x.equipe_ext ?? m?.away ?? ''
    const sd = x.score_dom ?? (m ? Number(m.homeScore) : null)
    const se = x.score_ext ?? (m ? Number(m.awayScore) : null)
    const p = await fbPost(env, {
      message: `⚽ ${dom} ${sd ?? ''}-${se ?? ''} ${ext}\n🏆 ${s.competition}\n\n👉 ${SITE}/resumes`,
      link: `${SITE}/resumes`, image_url: img, title: x.titre.slice(0, 100),
      comment: `▶️ ${lienYt(x.video_id)}`,
    })
    await marquer(env, x.video_id, { publie_fb: p.ok, fb_post_id: p.id ?? null })
    return `${x.source}: ${p.ok ? 'posté' : 'échec'} ${dom}-${ext}`
  }
  return null
}

/**
 * LA PASSE DE FIN DE JOURNÉE — les EXTENDED.
 *
 * Ligue des champions : tous. Ailleurs : seulement le match le plus vu, et
 * les autres extendeds rejoignent leur propre post en commentaire — un
 * match reste un seul post, c'est la règle posée le 17/10.
 *
 * « Le plus vu » se mesure sur YouTube, sur la vidéo courte du match : elle
 * est sortie en même temps pour tout le monde, donc comparable. Une unité
 * de quota pour cinquante vidéos.
 */
export async function extendedDuJour(env: Env, date: string): Promise<string> {
  const cle = (env as unknown as { YOUTUBE_API_KEY?: string }).YOUTUBE_API_KEY
  if (!cle) return 'pas de clé YouTube'
  const depuis = new Date(Date.now() - 20 * 3600_000).toISOString()
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?publie_at=gte.${encodeURIComponent(depuis)}&select=video_id,source,kind,titre,match_id,competition,equipe_dom,equipe_ext,score_dom,score_ext,publie_fb,fb_post_id&order=publie_at.desc&limit=200`,
    { headers: sbHeaders(env) },
  )
  const rows = (await r.json().catch(() => [])) as Array<{
    video_id: string; source: string; kind: string; titre: string; match_id: string | null
    competition: string | null; equipe_dom: string | null; equipe_ext: string | null
    score_dom: number | null; score_ext: number | null; publie_fb: boolean; fb_post_id: string | null
  }>

  const notes: string[] = []
  for (const s of SOURCES) {
    const longs = rows.filter((x) => x.source === s.cle && x.kind === 'resume_long' && !x.publie_fb && x.match_id)
    if (!longs.length) continue

    let aPublier = longs
    if (!s.extendedPourTous) {
      // Les vues de la vidéo COURTE de chaque match : c'est elle qui mesure
      // l'intérêt, pas l'extended que personne n'a encore vu.
      const courts = rows.filter((x) => x.source === s.cle && (x.kind === 'resume' || x.kind === 'resume_court') && x.match_id)
      const ids = courts.map((x) => x.video_id).slice(0, 50)
      const vues = new Map<string, number>()
      if (ids.length) {
        const st = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(',')}&key=${cle}`, { signal: AbortSignal.timeout(20_000) })
        const sj = await st.json().catch(() => ({})) as { items?: Array<{ id?: string; statistics?: { viewCount?: string } }> }
        for (const it of sj.items ?? []) {
          const court = courts.find((x) => x.video_id === it.id)
          if (court?.match_id) vues.set(court.match_id, Number(it.statistics?.viewCount ?? 0))
        }
      }
      const meilleur = [...longs].sort((a, b) => (vues.get(b.match_id!) ?? 0) - (vues.get(a.match_id!) ?? 0))[0]
      aPublier = meilleur ? [meilleur] : []
      // Les autres rejoignent leur post en commentaire.
      for (const x of longs) {
        if (meilleur && x.video_id === meilleur.video_id) continue
        const freres = rows.filter((y) => y.match_id === x.match_id && y.fb_post_id)
        const post = freres[0]?.fb_post_id
        if (post) {
          await fbComment(env, post, `🎬 Résumé long : ${lienYt(x.video_id)}`)
          notes.push(`${s.cle}: extended en commentaire (${x.equipe_dom}-${x.equipe_ext})`)
        }
        await marquer(env, x.video_id, { publie_fb: true })
      }
    }

    for (const x of aPublier) {
      const img = await carte(env, null, s, x.video_id)
      const p = await fbPost(env, {
        message: `🎬 ${x.equipe_dom} ${x.score_dom ?? ''}-${x.score_ext ?? ''} ${x.equipe_ext}\n🏆 ${s.competition}\n\n👉 ${SITE}/resumes`,
        link: `${SITE}/resumes`, image_url: img, title: x.titre.slice(0, 100),
        comment: `▶️ ${lienYt(x.video_id)}`,
      })
      await marquer(env, x.video_id, { publie_fb: p.ok, fb_post_id: p.id ?? null })
      notes.push(`${s.cle}: extended ${p.ok ? 'posté' : 'échec'} (${x.equipe_dom}-${x.equipe_ext})`)
    }
  }

  const note = notes.join(' | ') || 'aucun extended à publier'
  await log(env, date, 'yt-extended', true, note.slice(0, 700))
  return note
}

async function marquer(env: Env, videoId: string, champs: Record<string, unknown>): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/videos_matchs?video_id=eq.${encodeURIComponent(videoId)}`, {
    method: 'PATCH',
    headers: sbHeaders(env, { 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify(champs),
  })
}

/**
 * Réessaie l'appariement des clips restés sans match.
 *
 * Deux cas le justifient : un résumé sorti avant que la liste du jour ne
 * soit à jour, et une correction de normalisation qu'il faut pouvoir
 * appliquer à ce qui est déjà en base — c'est exactement ce qui est arrivé
 * le 17/10 avec « Paris Saint-Germain » contre « PSG ».
 */
export async function rattacherOrphelins(env: Env, date: string): Promise<string> {
  const pool = await bigMatchesToday(env).catch(() => [] as AutoMatch[])
  if (!pool.length) return 'aucun match du jour en mémoire'
  const depuis = new Date(Date.now() - 30 * 3600_000).toISOString()
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?match_id=is.null&publie_at=gte.${encodeURIComponent(depuis)}`
    + `&select=video_id,source,titre&limit=100`,
    { headers: sbHeaders(env) },
  )
  const rows = (await r.json().catch(() => [])) as Array<{ video_id: string; source: string; titre: string }>
  let n = 0
  const noms: string[] = []
  for (const x of rows) {
    const s = SOURCES.find((o) => o.cle === x.source)
    if (!s) continue
    const k = clesDAppariement({ videoId: x.video_id, titre: x.titre, description: '', publie: '', chaine: '' })
    const m = k.paire ? trouverMatch(pool, k.paire, s.slug) : null
    if (!m) continue
    await marquer(env, x.video_id, {
      match_id: m.id, equipe_dom: m.home, equipe_ext: m.away,
      score_dom: Number(m.homeScore), score_ext: Number(m.awayScore),
    })
    n++; if (noms.length < 6) noms.push(`${m.home}-${m.away}`)
  }
  const note = n ? `${n} rattachés : ${noms.join(', ')}` : `aucun rattachement (${rows.length} orphelins examinés)`
  await log(env, date, 'yt-rattacher', true, note.slice(0, 400))
  return note
}
