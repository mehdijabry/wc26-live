/**
 * LA PAGE D'UNE VIDÉO — /v/<id>, et l'image de partage qui va avec.
 *
 * ── POURQUOI CETTE PAGE EXISTE ────────────────────────────────────────────
 * Jusqu'au 17/10/2026 un résumé partait sur Facebook en POST PHOTO : notre
 * carte, et le lien du site en commentaire. Mehdi : « vu que c'est juste une
 * image ça ne sert à rien, nous on veut convertir en trafic ». Un post photo
 * ouvre l'image en grand, il ne va nulle part.
 *
 * On publie donc un POST DE LIEN vers cette page. Facebook y lit les balises
 * Open Graph et affiche l'image qu'elles désignent — notre gabarit, avec la
 * vignette de la vidéo dans une fenêtre et un bouton de lecture par-dessus.
 * Le visuel promet une vidéo, le clic atterrit sur le site, et la vidéo y
 * joue vraiment : la promesse est tenue, ce qui est la condition pour que
 * le trafic revienne.
 *
 * ── CE QU'ON N'HÉBERGE TOUJOURS PAS ───────────────────────────────────────
 * Rien. La page porte le LECTEUR de l'ayant droit dans un cadre embarqué ;
 * les vues lui restent. C'est ce qui rend l'opération légitime, et la règle
 * ne change pas d'un pouce par rapport à /buts et /resumes.
 *
 * ── CE QUI EST VOLATIL, ET POURQUOI C'EST ACCEPTÉ ─────────────────────────
 * L'image rendue vit dans le dépôt média, que `cleanupMedia` vide au bout de
 * sept jours. Facebook, lui, fait sa copie de l'aperçu dans les secondes qui
 * suivent la publication et la garde : le post reste illustré. Au-delà d'une
 * semaine, une page rouverte redemande simplement un rendu au studio — le
 * cache KV porte l'adresse trente jours, et le studio refait l'image après.
 */
import type { Env } from './index'
import type { AutoMatch } from './automation'
import { leagueAr, renderImage, sbHeaders } from './automation'

const SITE = 'https://pressing90.live'

export type LigneVideo = {
  video_id: string
  source: string
  kind: string
  titre: string
  description?: string | null
  publie_at?: string | null
  match_id?: string | null
  competition?: string | null
  equipe_dom?: string | null
  equipe_ext?: string | null
  score_dom?: number | null
  score_ext?: number | null
  buteur?: string | null
  minute?: string | null
}

/** L'adresse à partager. C'est elle qui porte les balises Open Graph. */
export const lienPartage = (id: string): string => `${SITE}/v/${encodeURIComponent(id)}`

const estX = (source: string): boolean => source === 'x' || source.startsWith('x-')

/**
 * LES DEUX VIGNETTES DE YOUTUBE, ET POURQUOI IL EN FAUT DEUX.
 *
 * `maxresdefault` est la seule en pleine définition, mais elle N'EXISTE PAS
 * pour toutes les vidéos — YouTube répond alors 404. `hqdefault` existe
 * toujours ; elle arrive en 480×360, c'est-à-dire en 4:3 avec deux bandes
 * noires cuites autour de l'image. Le gabarit les rogne (voir `sansBandes`
 * dans le studio), donc la fenêtre garde le bon format dans les deux cas.
 */
function vignettes(v: LigneVideo): { principale: string | null; repli: string | null } {
  if (estX(v.source)) return { principale: null, repli: null }
  return {
    principale: `https://i.ytimg.com/vi/${v.video_id}/maxresdefault.jpg`,
    repli: `https://i.ytimg.com/vi/${v.video_id}/hqdefault.jpg`,
  }
}

const estBut = (kind: string): boolean => kind === 'but'

/** Ce que l'étiquette annonce, dans la langue de la page. */
function etiquetteDe(kind: string, lang: string): string {
  if (estBut(kind)) return lang === 'fr' ? 'Le but' : lang === 'en' ? 'The goal' : 'الهدف'
  if (kind === 'resume_long') {
    return lang === 'fr' ? 'Résumé long' : lang === 'en' ? 'Extended highlights' : 'ملخص موسّع'
  }
  return lang === 'fr' ? 'Résumé du match' : lang === 'en' ? 'Match highlights' : 'ملخص المباراة'
}

/**
 * L'IMAGE DE PARTAGE, rendue une fois puis gardée en cache.
 *
 * `m` n'est fourni qu'au moment de la publication, quand la liste des matchs
 * du jour est en main : c'est de là que viennent les écussons. Une page
 * rouverte trois jours plus tard n'a plus cette liste — l'image est alors
 * déjà en cache, et si elle ne l'est plus, elle se refait sans écussons
 * plutôt que de ne pas se faire.
 */
export async function ogDeVideo(
  env: Env,
  v: LigneVideo,
  m: AutoMatch | null = null,
  lang = 'ar',
): Promise<string | null> {
  const cle = `og:vid:${v.video_id}:${lang}`
  const cache = await env.CACHE.get(cle)
  if (cache) return cache

  const { principale, repli } = vignettes(v)
  const dom = v.equipe_dom ?? m?.home ?? ''
  const ext = v.equipe_ext ?? m?.away ?? ''
  const sd = v.score_dom ?? (m && m.homeScore !== undefined ? Number(m.homeScore) : null)
  const se = v.score_ext ?? (m && m.awayScore !== undefined ? Number(m.awayScore) : null)
  const comp = v.competition ?? m?.league ?? ''
  try {
    const url = await renderImage(env, 'og-video', {
      lang,
      etiquette: etiquetteDe(v.kind, lang),
      // La compétition s'écrit en arabe quand la page l'est : le reste de la
      // ligne l'est, et un libellé latin au milieu casse la lecture.
      competition: lang === 'ar' ? leagueAr(comp) : comp,
      home: dom, away: ext,
      homeLogo: m?.homeLogo ?? '', awayLogo: m?.awayLogo ?? '',
      homeScore: sd, awayScore: se,
      titre: estBut(v.kind) ? (v.buteur || [dom, ext].filter(Boolean).join(' — ')) : [dom, ext].filter(Boolean).join(' — '),
      sousTitre: estBut(v.kind) && v.minute ? v.minute : '',
      minute: estBut(v.kind) ? (v.minute ?? '') : '',
      vignette: principale, vignetteRepli: repli,
      barca: true,
    })
    // Trente jours : bien au-delà de la vie utile d'un post, et bien en deçà
    // de ce que coûterait un rendu à chaque ouverture de la page.
    await env.CACHE.put(cle, url, { expirationTtl: 30 * 86400 })
    return url
  } catch {
    return null
  }
}

/** Lit une ligne de `videos_matchs`. */
export async function lireVideo(env: Env, id: string): Promise<LigneVideo | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/videos_matchs?video_id=eq.${encodeURIComponent(id)}`
    + '&select=video_id,source,kind,titre,description,publie_at,match_id,competition'
    + ',equipe_dom,equipe_ext,score_dom,score_ext,buteur,minute&limit=1',
    { headers: sbHeaders(env) },
  )
  if (!r.ok) return null
  const l = (await r.json().catch(() => [])) as LigneVideo[]
  return Array.isArray(l) && l[0] ? l[0] : null
}

const esc = (x: string): string =>
  String(x ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string))

/**
 * LA PAGE. Les balises d'abord — c'est pour elles qu'elle existe — puis un
 * lecteur, la ligne du match, et deux portes vers le reste du site.
 *
 * `noindex` : ces pages sont minces par construction (un cadre embarqué et
 * trois lignes) et il en naît des dizaines par jour. Les laisser indexer
 * diluerait /buts et /resumes, qui sont les pages de fond. Le trafic visé
 * vient de Facebook, et un post de lien se moque bien de `robots`.
 */
export async function pageVideo(env: Env, id: string, langDemandee: string | null): Promise<Response> {
  const v = await lireVideo(env, id)
  if (!v) return new Response('introuvable', { status: 404 })
  const lang = ['fr', 'en', 'ar'].includes(langDemandee ?? '') ? (langDemandee as string) : 'ar'
  const rtl = lang === 'ar'
  const og = await ogDeVideo(env, v, null, lang)

  const affiche = [v.equipe_dom, v.equipe_ext].filter(Boolean).join(' — ')
  const score = v.score_dom !== null && v.score_dom !== undefined && v.score_ext !== null && v.score_ext !== undefined
    ? `${v.score_dom} – ${v.score_ext}` : ''
  const titre = estBut(v.kind)
    ? [v.buteur, affiche].filter(Boolean).join(' · ')
    : [affiche, score].filter(Boolean).join(' ') || v.titre
  const etiquette = etiquetteDe(v.kind, lang)
  const comp = lang === 'ar' ? leagueAr(v.competition ?? '') : (v.competition ?? '')
  const desc = [etiquette, comp, titre].filter(Boolean).join(' · ')

  // Le lecteur de l'ayant droit, jamais un fichier à nous.
  const lecteur = estX(v.source)
    ? `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(v.video_id)}`
    : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.video_id)}?rel=0&modestbranding=1`

  const L = lang === 'fr'
    ? { buts: 'Les buts du jour', resumes: 'Les résumés du jour', accueil: 'Pressing 90’' }
    : lang === 'en'
      ? { buts: 'Today’s goals', resumes: 'Today’s highlights', accueil: 'Pressing 90’' }
      : { buts: 'أهداف اليوم', resumes: 'ملخصات اليوم', accueil: 'Pressing 90’' }

  const html = `<!doctype html><html lang="${lang}"${rtl ? ' dir="rtl"' : ''}><head><meta charset="utf-8">
<title>${esc(titre)} — Pressing 90’</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="video.other">
<meta property="og:title" content="${esc(titre)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(lienPartage(v.video_id))}">
<meta property="og:site_name" content="Pressing 90’">
${og ? `<meta property="og:image" content="${esc(og)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(titre)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${esc(lienPartage(v.video_id))}">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0B0F0D;color:#ECEFE8;
  font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:22px 18px 46px}
.marque{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.02em;
  color:#ECEFE8;text-decoration:none;font-size:15px}
.marque span{color:#D9B54A}
.chip{display:inline-block;margin:18px 0 8px;padding:5px 14px;border:1px solid #41C97C;
  border-radius:999px;color:#41C97C;font-size:13px;font-weight:600}
h1{margin:4px 0 2px;font-size:clamp(21px,4.4vw,31px);line-height:1.2}
.sous{margin:0 0 16px;color:#8d978f;font-size:14px}
.cadre{position:relative;aspect-ratio:16/9;border:1px solid rgba(217,181,74,.45);
  border-radius:12px;overflow:hidden;background:#05080F}
.cadre iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.portes{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
.portes a{flex:1 1 200px;text-align:center;padding:14px 16px;border-radius:12px;
  text-decoration:none;font-weight:700;font-size:15px}
.or{background:#D9B54A;color:#0B0F0D}
.vert{background:transparent;color:#41C97C;border:1px solid rgba(65,201,124,.5)}
footer{margin-top:28px;font-size:13px;color:#6f7a72}
footer a{color:#D9B54A;text-decoration:none}
</style></head><body><main>
<a class="marque" href="${SITE}/?ref=fb-video">Pressing <span>90’</span></a>
<div class="chip">${esc(etiquette)}</div>
<h1>${esc(titre)}</h1>
<p class="sous">${esc([comp, score].filter(Boolean).join(' · '))}</p>
<div class="cadre"><iframe src="${esc(lecteur)}" title="${esc(titre)}" allowfullscreen
  allow="accelerometer;autoplay;clipboard-write;encrypted-media;picture-in-picture" loading="eager"></iframe></div>
<nav class="portes">
  <a class="or" href="${SITE}/resumes?ref=fb-video">${esc(L.resumes)}</a>
  <a class="vert" href="${SITE}/buts?ref=fb-video">${esc(L.buts)}</a>
</nav>
<footer><a href="${SITE}/?ref=fb-video">${esc(L.accueil)}</a></footer>
</main></body></html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' },
  })
}
