import { useEffect } from 'react'

/**
 * Per-route <head> for a single-page app.
 *
 * Why this exists: five routes — /wc26, /today, /predictions, /board and
 * /stadiums — never set a title of their own, so they inherited the one in
 * index.html. Measured against production on 7 October 2026: fifteen URLs out
 * of the 106 in the sitemap served the identical home-page title and
 * description. Google reported 3 pages indexed and 47 not, 41 of them as
 * "crawled, currently not indexed" — which is what duplicate, interchangeable
 * pages get.
 *
 * `scripts/prerender.mjs` snapshots the DOM after this effect has run, so
 * whatever is set here is what a crawler reads on first byte.
 */

export type PageHead = {
  /** Under 60 characters. " · Pressing 90" is appended unless `brut` is set. */
  titre: string
  /** 120 to 160 characters. Has to deliver on the title. */
  description: string
  /** Path only, e.g. "/today". The canonical is built from it. */
  chemin: string
  /** Set when the title already carries the brand and must not be suffixed. */
  brut?: boolean
}

const ORIGINE = 'https://pressing90.live'

export function usePageHead({ titre, description, chemin, brut }: PageHead) {
  useEffect(() => {
    const titreComplet = brut ? titre : `${titre} · Pressing 90`
    const url = `${ORIGINE}${chemin}`

    document.title = titreComplet
    poserMeta('name', 'description', description)
    poserMeta('property', 'og:title', titreComplet)
    poserMeta('property', 'og:description', description)
    poserMeta('property', 'og:url', url)
    poserMeta('name', 'twitter:title', titreComplet)
    poserMeta('name', 'twitter:description', description)

    let lien = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
    if (!lien) {
      lien = document.createElement('link')
      lien.rel = 'canonical'
      document.head.appendChild(lien)
    }
    lien.href = url
  }, [titre, description, chemin, brut])
}

function poserMeta(cle: 'name' | 'property', valeur: string, contenu: string) {
  let tag = document.querySelector(`meta[${cle}="${valeur}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(cle, valeur)
    document.head.appendChild(tag)
  }
  tag.content = contenu
}
