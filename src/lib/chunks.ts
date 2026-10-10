/**
 * Récupération d'un morceau de code introuvable.
 *
 * ── CE QUI SE PASSE ───────────────────────────────────────────────────────
 * Le site se découpe en morceaux chargés à la demande. À chaque déploiement
 * les noms changent, et l'onglet déjà ouvert garde en mémoire les anciens.
 * S'il en réclame un pendant la minute où Cloudflare propage le nouveau
 * déploiement, l'import échoue, React vide l'arbre : page blanche.
 *
 * ── CE QUI MANQUAIT ───────────────────────────────────────────────────────
 * Cette fonction existait déjà, dans `main.tsx`, branchée sur deux
 * évènements : `vite:preloadError` et `unhandledrejection`. Or l'échec d'un
 * `React.lazy()` ne passe par AUCUN des deux : React attrape la promesse
 * rejetée et la RELANCE pendant le rendu. C'est donc une erreur de rendu —
 * elle sort par `window.onerror` et par les barrières d'erreur, et la
 * récupération ne la voyait jamais. Une seule exception dans la console, et
 * l'écran restait blanc pour de bon (Mehdi, 2026-10-10).
 */
const MOTIFS =
  /dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported|Failed to fetch dynamically/i

/** Vrai si ce motif est un morceau manquant (et non un vrai bogue à nous). */
export function estChunkManquant(raison: unknown): boolean {
  const msg = String((raison as { message?: unknown })?.message ?? raison ?? '')
  return MOTIFS.test(msg)
}

/**
 * Soigne le cache et recharge, au plus une fois par quart de minute.
 *
 * Le rechargement n'est pas plafonné à une fois par session : pendant une
 * propagation, ce rechargement unique tombait encore sur un 404 et
 * l'utilisateur restait blanc jusqu'à la fin de sa session (vu le
 * 2026-07-15). Il réessaie donc indéfiniment, espacé.
 *
 * @returns vrai si un rechargement a été programmé.
 */
export function recupererChunkPerime(raison: unknown): boolean {
  if (!estChunkManquant(raison)) return false
  const msg = String((raison as { message?: unknown })?.message ?? raison ?? '')
  let dernier = 0
  try { dernier = Number(sessionStorage.getItem('wc26.chunkReloadAt') ?? 0) } catch { /* navigation privée */ }
  if (Date.now() - dernier < 15_000) return false // on vient d'essayer
  try { sessionStorage.setItem('wc26.chunkReloadAt', String(Date.now())) } catch { /* navigation privée */ }
  console.warn('[p90] morceau périmé ou injoignable, on soigne le cache et on recharge :', msg)
  // L'échec peut être une ENTRÉE DE CACHE EMPOISONNÉE (un 404 ou du HTML
  // mis en cache sous l'adresse du morceau pendant la propagation) : un
  // rechargement simple la réutiliserait indéfiniment. `cache: 'reload'`
  // court-circuite le cache et REMPLACE l'entrée par la réponse fraîche.
  // Vu le 2026-08-06 : fetch() répondait 200 pendant qu'import() échouait
  // encore sur la même adresse.
  const adresse = /https?:\/\/\S+?\.js/.exec(msg)
  const soin = adresse
    ? fetch(adresse[0], { cache: 'reload' }).catch(() => undefined)
    : Promise.resolve(undefined)
  void soin.finally(() => window.location.reload())
  return true
}
