// La page d'une vidéo, servie sous pressing90.live/v/<id>.
//
// ── POURQUOI UNE FONCTION, ET PAS LE REPLI SPA HABITUEL ───────────────────
// Le site est une application d'une seule page : Google et Facebook n'y
// voient que la coquille, et la coquille porte les balises de l'ACCUEIL.
// Un lien partagé vers /v/<id> sortirait donc avec le titre du site et son
// image générique — exactement ce qu'on cherchait à quitter en passant au
// post de lien.
//
// Cette fonction sert la MÊME coquille à tout le monde — aucun contenu
// différent selon le visiteur, donc aucun cloaking — et y remplace les
// balises d'en-tête par celles de la vidéo. React prend ensuite la main et
// rend la vraie page, lecteur compris.
//
// Le worker reste la source : lui seul a la clé de service et peut
// demander son image au studio.
interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

const API = 'https://wc26-api.nameless-violet-5dc1.workers.dev'
const esc = (x: unknown): string =>
  String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const id = (url.pathname.split('/').pop() || '').trim()
  const lang = ['fr', 'en', 'ar'].includes(url.searchParams.get('lang') ?? '')
    ? (url.searchParams.get('lang') as string) : 'en'

  // La coquille d'abord : si elle manque, rien d'autre n'a de sens.
  const coquille = await ctx.env.ASSETS.fetch(new Request(new URL('/index.html', url).toString()))
  let html = await coquille.text()

  let meta: {
    titre?: string; recit?: string; og?: string | null; lien?: string
    video?: { titre?: string; competition?: string | null }
  } | null = null
  try {
    const r = await fetch(`${API}/video-public?v=${encodeURIComponent(id)}&lang=${lang}`, {
      headers: { 'user-agent': 'p90-pages/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (r.ok) meta = await r.json()
  } catch { /* la coquille nue vaut mieux qu'une page d'erreur */ }

  if (meta?.titre) {
    const titre = `${meta.titre} — Pressing 90’`
    const desc = (meta.recit || meta.video?.titre || '').slice(0, 300)
    const lien = meta.lien || url.toString()
    // On RETIRE les balises de l'accueil avant d'écrire les nôtres : les
    // laisser en place donnerait deux og:title, et les aspirateurs
    // retiennent le premier.
    html = html
      .replace(/<title>[\s\S]*?<\/title>/i, '')
      .replace(/<meta\s+property="og:[^"]*"[^>]*>/gi, '')
      .replace(/<meta\s+name="(description|twitter:[^"]*)"[^>]*>/gi, '')
      .replace(/<link\s+rel="canonical"[^>]*>/gi, '')
      // Celui de la coquille dit « index, follow » : laissé en place, il
      // précède le nôtre et certains aspirateurs retiennent le premier.
      // Google prendrait le plus restrictif, mais on ne va pas parier
      // là-dessus pour tous les autres.
      .replace(/<meta\s+name="robots"[^>]*>/gi, '')
    const balises = [
      `<title>${esc(titre)}</title>`,
      `<link rel="canonical" href="${esc(lien)}">`,
      `<meta name="description" content="${esc(desc)}">`,
      '<meta property="og:type" content="video.other">',
      '<meta property="og:site_name" content="Pressing 90’">',
      `<meta property="og:title" content="${esc(meta.titre)}">`,
      `<meta property="og:description" content="${esc(desc)}">`,
      `<meta property="og:url" content="${esc(lien)}">`,
      meta.og ? `<meta property="og:image" content="${esc(meta.og)}">` : '',
      meta.og ? '<meta property="og:image:width" content="1200">' : '',
      meta.og ? '<meta property="og:image:height" content="630">' : '',
      meta.og ? `<meta property="og:image:alt" content="${esc(meta.titre)}">` : '',
      '<meta name="twitter:card" content="summary_large_image">',
      meta.og ? `<meta name="twitter:image" content="${esc(meta.og)}">` : '',
      // Ces pages naissent par dizaines chaque jour et ne vivent qu'un
      // jour ou deux. Les laisser indexer diluerait /buts et /resumes,
      // qui sont les pages de fond — et un post de lien se moque de
      // `robots`.
      '<meta name="robots" content="noindex,follow">',
    ].filter(Boolean).join('\n')
    html = html.replace('</head>', `${balises}\n</head>`)
  }

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
}
