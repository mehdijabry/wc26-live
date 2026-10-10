/**
 * Le module de données REMPLACÉ, pour l'aperçu seulement.
 *
 * L'aperçu rend les vrais composants ; seule la source de données change,
 * par un alias Vite. Rien n'est modifié dans `src/`, et la charge utile
 * ci-dessous est celle qu'a réellement renvoyée le worker sur Arsenal–Leeds
 * le 10 octobre 2026.
 */
import reelle from './carte-reelle.json'
export * from '../src/lib/pronostic'
export { lignesDeLaFormation } from '../src/lib/pronostic'
import type { Carte } from '../src/lib/pronostic'

export async function carte(): Promise<Carte> {
  await new Promise((r) => setTimeout(r, 900))
  return reelle as unknown as Carte
}
export async function debloquer() {
  return { deja: false, crampons: 1, pressings: 0, rang: 2 }
}
