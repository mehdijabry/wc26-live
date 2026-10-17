/**
 * PARTAGER UNE IMAGE VERS LES RÉSEAUX — ce qui est possible, et ce qui ne
 * l'est pas.
 *
 * ── LA RÉALITÉ DES STORIES FACEBOOK ───────────────────────────────────────
 * Aucune API publique ne permet de publier une story sur le profil PERSONNEL
 * d'un visiteur. Les API de Meta publient sur une PAGE, avec un jeton de
 * page — c'est ce que fait déjà notre chaîne pour Pressing 90'. Pour le
 * joueur, le chemin réel est celui que l'appareil offre :
 *
 *   · SUR TÉLÉPHONE — `navigator.share({ files })` ouvre la feuille de
 *     partage du système, d'où Facebook, Instagram et WhatsApp proposent
 *     « Story ». C'est un vrai partage d'image, pas un lien.
 *   · SUR ORDINATEUR — la feuille de partage n'existe pas et Facebook ne
 *     reçoit pas d'image par URL : on télécharge l'image, et on ouvre le
 *     partage de LIEN vers le profil du joueur.
 *
 * Dire au joueur « publie ta story en un clic » sur ordinateur serait un
 * mensonge : la fonction rend donc ce qu'elle a réellement fait.
 */

export type ResultatPartage = 'partage' | 'telecharge' | 'annule' | 'echec'

/** Le navigateur peut-il partager un FICHIER (et pas seulement un lien) ? */
export function peutPartagerFichier(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false
  try {
    const f = new File([new Blob([''], { type: 'image/jpeg' })], 't.jpg', { type: 'image/jpeg' })
    return navigator.canShare({ files: [f] })
  } catch { return false }
}

async function fichierDepuis(url: string, nom: string): Promise<File | null> {
  try {
    const r = await fetch(url, { mode: 'cors' })
    if (!r.ok) return null
    const b = await r.blob()
    return new File([b], nom, { type: b.type || 'image/jpeg' })
  } catch { return null }
}

/**
 * Partage l'image si l'appareil sait le faire, sinon la télécharge.
 * Rend ce qui a RÉELLEMENT eu lieu.
 */
export async function partagerImage(url: string, nom: string, texte?: string): Promise<ResultatPartage> {
  if (peutPartagerFichier()) {
    const f = await fichierDepuis(url, nom)
    if (f) {
      try {
        await navigator.share({ files: [f], text: texte })
        return 'partage'
      } catch (e) {
        // L'utilisateur a fermé la feuille : ce n'est pas une erreur.
        if ((e as { name?: string })?.name === 'AbortError') return 'annule'
      }
    }
  }
  return (await telechargerImage(url, nom)) ? 'telecharge' : 'echec'
}

/**
 * Télécharge l'image. On passe par un blob plutôt qu'un `<a download>` sur
 * l'URL distante : `download` est ignoré en cross-origin, et le navigateur
 * ouvrait l'image dans un onglet au lieu de l'enregistrer.
 */
export async function telechargerImage(url: string, nom: string): Promise<boolean> {
  try {
    const r = await fetch(url, { mode: 'cors' })
    if (!r.ok) return false
    const b = await r.blob()
    const o = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = o; a.download = nom
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(o), 4000)
    return true
  } catch { return false }
}

/** Le partage de LIEN Facebook — tout ce qu'un ordinateur sait faire. */
export function ouvrirFacebook(lien: string): void {
  const u = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(lien)}`
  window.open(u, '_blank', 'noopener,noreferrer,width=640,height=640')
}
