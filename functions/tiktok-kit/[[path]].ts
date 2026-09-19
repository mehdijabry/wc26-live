// TikTok hand-off kit served from the site's own domain (2026-09-19).
// The kit page and its push endpoint live in the worker, but the e-mail that carries the link is sent from
// @pressing90.live: a button pointing at *.workers.dev made Gmail drop the message (the test mail, whose only link is
// the site itself, arrived). Same-domain link = same-domain sender, so the mail is delivered and the page is unchanged.
export const onRequest: PagesFunction = async (ctx) => {
  const url = new URL(ctx.request.url)
  const target = `https://wc26-api.nameless-violet-5dc1.workers.dev${url.pathname}${url.search}`
  return fetch(new Request(target, ctx.request))
}
