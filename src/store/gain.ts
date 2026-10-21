import { create } from 'zustand'

/**
 * LE GAIN DE JETONS, ANNONCÉ DEPUIS N'IMPORTE OÙ.
 *
 * Mehdi, 21/10/2026 : « je veux une animation de ce genre pour tous les
 * boutons de réclamation pressings ou crampons ».
 *
 * ── POURQUOI UN MAGASIN, ET PAS UNE ANIMATION PAR BOUTON ──────────────
 * Il y a aujourd'hui trois endroits où l'on réclame — le bonus de groupe
 * au classement, le même sur la page d'une ligue, et les prix
 * hebdomadaires — et il y en aura d'autres. Recoller l'animation à chaque
 * bouton garantit qu'elle diverge : trois durées, trois couleurs, et le
 * quatrième bouton qui n'en a pas du tout.
 *
 * Ici le bouton se contente d'annoncer ce qu'il vient d'obtenir ; la
 * scène est montée UNE FOIS, au sommet de l'application, et décide seule
 * de la manière de le montrer.
 *
 *   montrerGain(12, 'crampon')
 *
 * ── CE QU'IL NE FAIT PAS ──────────────────────────────────────────────
 * Il n'ajoute rien au solde : la base l'a déjà fait, et le profil se
 * rafraîchit de son côté. Ce magasin ne porte qu'une annonce — si elle se
 * perd, le joueur a quand même ses jetons.
 */
export type TypeJeton = 'crampon' | 'pressing'

type Annonce = { montant: number; type: TypeJeton; cle: number }

type EtatGain = {
  annonce: Annonce | null
  montrerGain: (montant: number, type: TypeJeton) => void
  fini: (cle: number) => void
}

export const useGain = create<EtatGain>((set, get) => ({
  annonce: null,
  montrerGain: (montant, type) => {
    // Zéro ou négatif : rien à fêter. Un bouton qui rend « 0 crampon »
    // parce que le bonus était déjà pris ne doit pas lancer de confettis.
    if (!Number.isFinite(montant) || montant <= 0) return
    // La clé force le remontage même si deux gains identiques se suivent :
    // sans elle, réclamer deux fois 12 crampons ne rejouerait rien.
    set({ annonce: { montant, type, cle: Date.now() } })
  },
  fini: (cle) => {
    // On ne ferme QUE l'annonce qu'on croit fermer : une plus récente
    // arrivée entre-temps doit survivre.
    if (get().annonce?.cle === cle) set({ annonce: null })
  },
}))
