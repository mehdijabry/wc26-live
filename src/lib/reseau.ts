/**
 * LE RÉSEAU BORNÉ — aucune requête du site n'a plus le droit d'attendre
 * indéfiniment.
 *
 * ── LE BOGUE QUE CE FICHIER EXISTE POUR TUER ──────────────────────────────
 * Mehdi, 18/10/2026 : « des fois quand on ouvre le site on ne voit ni la
 * vidéo highlight ni les matchs, on voit juste un genre d'animation
 * chargement mais rien ne se passe ; il faut absolument actualiser. Sur
 * mobile surtout, mais pas que. »
 *
 * `fetch()` NE REJETTE PAS tout seul. Une requête partie au mauvais moment
 * — radio qui se réveille, portail captif, bascule wifi/4G, instance
 * Supabase froide — peut rester en l'air sans jamais aboutir ni échouer.
 * Et trois composants de l'accueil attendaient ce résultat avant de faire
 * quoi que ce soit d'autre :
 *
 *   · `Hero`         — `await api.today(...)`, puis `setTimeout` pour le
 *                      tour suivant. La promesse ne retombe jamais, donc
 *                      la ligne du `setTimeout` n'est JAMAIS atteinte :
 *                      pas de nouvel essai, jamais, jusqu'au rechargement.
 *   · `DailyMatches` — même forme : le `finally` qui éteint le squelette
 *                      et la reprogrammation à 30 s sont tous deux APRÈS
 *                      l'attente.
 *   · `ResumesALaUne`— `videosRecentes()` via Supabase, même histoire.
 *
 * D'où le symptôme exact : un squelette qui pulse pour toujours, et un
 * rechargement qui répare — parce qu'il repart sur une connexion réveillée.
 *
 * ── POURQUOI ICI, ET PAS DANS CHAQUE APPELANT ─────────────────────────────
 * `withTimeout()` existe dans `supabase.ts` depuis des mois, écrit pour ce
 * même bogue (« keeps NewsTicker stuck on a loader… on Chrome Android »).
 * Il n'a rien réglé pour de bon parce qu'il faut PENSER à l'appeler : tout
 * appel écrit depuis l'a oublié, et le bogue est revenu par la porte d'à
 * côté. La borne descend donc dans le TRANSPORT. On ne peut plus l'oublier :
 * il n'existe plus de chemin vers le réseau qui en soit dépourvu.
 *
 * ── CE QU'ON NE RETENTE PAS ───────────────────────────────────────────────
 * Seules les lectures. Rejouer une écriture dont on n'a pas vu la réponse,
 * c'est risquer de la passer deux fois — un pari posé en double, des
 * crampons débités deux fois. `fetchBorne` ne retente donc RIEN de
 * lui-même ; `fetchLecture` retente, et ne sert qu'aux GET.
 */

/** Huit secondes. Au-delà, sur un réseau qui marche, c'est que ça ne vient pas. */
export const DELAI_LECTURE = 8000
/** Supabase démarre à froid en cinq à quinze secondes sur cellulaire. */
export const DELAI_SUPABASE = 12000

/**
 * `fetch`, avec un délai de garde — et rien d'autre de changé.
 *
 * On n'utilise PAS `AbortSignal.timeout()`, arrivé avec Safari 16 : une
 * part de l'audience est sur des iPhone plus anciens, et c'est précisément
 * celle qui souffre le plus du réseau. `AbortController` existe partout
 * depuis 2017. De même, `abort()` est appelé sans argument : passer une
 * raison demande Safari 15.4.
 */
export async function fetchBorne(
  entree: RequestInfo | URL,
  init: RequestInit = {},
  ms = DELAI_LECTURE,
): Promise<Response> {
  const ctrl = new AbortController()
  const horloge = setTimeout(() => ctrl.abort(), ms)

  // LE SIGNAL DE L'APPELANT DOIT CONTINUER D'ANNULER. Supabase passe le
  // sien pour abandonner une requête devenue inutile ; l'écraser ferait
  // fuir des requêtes que le client croyait avoir arrêtées.
  const externe = init.signal
  const relais = () => ctrl.abort()
  if (externe) {
    if (externe.aborted) relais()
    else externe.addEventListener('abort', relais, { once: true })
  }

  try {
    return await fetch(entree, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(horloge)
    externe?.removeEventListener('abort', relais)
  }
}

/**
 * Une LECTURE bornée, retentée une fois.
 *
 * Le cas courant n'est pas une panne, c'est une première requête perdue :
 * l'appareil sort de veille, la radio n'est pas prête, et le deuxième essai
 * passe en quelques centaines de millisecondes. Une seule reprise suffit —
 * au-delà, c'est au composant de décider quoi montrer, parce que lui seul
 * sait s'il doit afficher une erreur, se taire, ou réessayer plus tard.
 *
 * À RÉSERVER AUX GET. Voir l'en-tête : une écriture ne se rejoue pas.
 */
export async function fetchLecture(
  entree: RequestInfo | URL,
  init: RequestInit = {},
  ms = DELAI_LECTURE,
): Promise<Response> {
  try {
    return await fetchBorne(entree, init, ms)
  } catch (e) {
    // Une annulation VOULUE par l'appelant n'est pas un échec réseau : la
    // retenter relancerait ce qu'on vient d'arrêter.
    if (init.signal?.aborted) throw e
    return await fetchBorne(entree, init, ms)
  }
}
