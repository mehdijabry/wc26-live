// La page d'une vidéo, servie sous pressing90.live/v/<id>.
//
// Même rôle que functions/p/[id].ts : le worker compose la page et ses
// balises Open Graph (lui seul lit la base et sait demander un rendu au
// studio) ; cette fonction ne fait que proxyfier, pour que le lien partagé
// porte le domaine du site. Un lien *.workers.dev se fait rogner par les
// aperçus et les filtres de courrier — et c'est précisément l'aperçu qui
// doit fonctionner ici.
export const onRequest: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url)
  const id = encodeURIComponent(url.pathname.split('/').pop() || '')
  const lang = url.searchParams.get('lang') || 'ar'
  const cible = `https://wc26-api.nameless-violet-5dc1.workers.dev/video-card?v=${id}&lang=${encodeURIComponent(lang)}`
  return fetch(new Request(cible, { headers: ctx.request.headers }))
}
