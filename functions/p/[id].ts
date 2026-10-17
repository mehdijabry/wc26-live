// La page d'un pari publie, servie sous pressing90.live/p/<id>.
//
// Elle existe pour UNE raison : Facebook ne partage qu'un lien, et l'image
// qu'il affiche vient des balises Open Graph de la page pointee. Le worker
// les compose (il seul lit la base et connait l'URL du ticket) ; cette
// fonction ne fait que proxyfier, pour que le lien partage porte le domaine
// du site — un lien *.workers.dev se fait rogner par les apercus et les
// filtres de courrier.
export const onRequest: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url)
  const id = encodeURIComponent(url.pathname.split('/').pop() || '')
  const lang = url.searchParams.get('lang') || 'en'
  const cible = `https://wc26-api.nameless-violet-5dc1.workers.dev/post-card?id=${id}&lang=${encodeURIComponent(lang)}`
  return fetch(new Request(cible, { headers: ctx.request.headers }))
}
