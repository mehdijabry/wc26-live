import { useEffect, useState } from 'react'

/**
 * UN ÉCUSSON NOIR SUR UN SOL NOIR NE SE VOIT PAS.
 *
 * Mehdi, 17/10/2026, sur la fiche Juventus - Lazio : « la Juventus n'est
 * pas visible, c'est noir sur noir, on ne voit rien ». Le logo de la Juve
 * est du noir pur sur fond transparent, et le sol du site est #0B0F0D.
 *
 * Le studio résolvait déjà ce cas pour les images rendues
 * (`lisibleSurFondSombre` dans draw-gabarits.js) : on MESURE la luminance
 * moyenne des pixels opaques, et on ne repeint que ce qui est illisible.
 * Les chiffres relevés le 16/10 : Juventus **0/255**, Milan 108,
 * Barcelone 109, Real Madrid 151 — le seuil est franc, et il n'y a aucune
 * liste de clubs à tenir à jour.
 *
 * Même méthode ici, portée au navigateur. Deux détails la rendent
 * possible :
 *   · le CDN d'ESPN renvoie `access-control-allow-origin: *` (vérifié le
 *     17/10), donc la toile n'est pas souillée et `toDataURL` passe ;
 *   · on garde la SILHOUETTE et on la remplit — `source-in` ne peint que
 *     là où le dessin existe — plutôt que d'inverser les couleurs, qui
 *     retournerait aussi un logo bicolore sombre.
 *
 * En cas d'échec — pas de CORS, image absente, toile souillée — on rend
 * l'original. Un écusson difficile à lire reste préférable à un trou.
 */

const CREME = '#ECEFE8'
/** Une mesure par adresse, pour toute la vie de l'onglet. */
const vues = new Map<string, string | null>()

function repeindre(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onerror = () => resolve(null)
    im.onload = () => {
      try {
        // On mesure sur une réduction : le verdict est le même, le coût
        // est divisé par dix.
        const N = 64
        const p = document.createElement('canvas'); p.width = N; p.height = N
        const pc = p.getContext('2d', { willReadFrequently: true })
        if (!pc) return resolve(null)
        pc.drawImage(im, 0, 0, N, N)
        const d = pc.getImageData(0, 0, N, N).data
        let opaques = 0, somme = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 128) continue
          opaques++; somme += (d[i] + d[i + 1] + d[i + 2]) / 3
        }
        if (!opaques || somme / opaques >= 42) return resolve(null)

        // 128 px suffisent : l'écusson s'affiche au plus à 64, et doubler
        // couvre les écrans à forte densité sans peser en mémoire.
        const T = 128
        const c = document.createElement('canvas'); c.width = T; c.height = T
        const ctx = c.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(im, 0, 0, T, T)
        ctx.globalCompositeOperation = 'source-in'
        ctx.fillStyle = CREME
        ctx.fillRect(0, 0, T, T)
        resolve(c.toDataURL('image/png'))
      } catch { resolve(null) }
    }
    im.src = url
  })
}

export default function Ecusson({ src, repli, alt = '', className }: {
  src?: string | null
  /** Ce qu'on affiche si l'adresse est cassée — un monogramme, en général. */
  repli?: string | null
  alt?: string
  className?: string
}) {
  const [source, setSource] = useState<string | null>(src ?? null)

  useEffect(() => {
    setSource(src ?? null)
    if (!src) return
    if (vues.has(src)) { const v = vues.get(src); if (v) setSource(v); return }
    let vivant = true
    void repeindre(src).then((v) => {
      vues.set(src, v)
      if (vivant && v) setSource(v)
    })
    return () => { vivant = false }
  }, [src])

  if (!source) return null
  return (
    <img
      src={source}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(e) => {
        // Une adresse cassée tombe sur le monogramme ; sans repli on
        // laisse le navigateur faire, comme avant.
        if (repli && e.currentTarget.src !== repli) e.currentTarget.src = repli
      }}
    />
  )
}
