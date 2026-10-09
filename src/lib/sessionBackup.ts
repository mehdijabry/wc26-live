/**
 * Filet de sécurité de la session — le jeton de rafraîchissement en cookie.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Supabase range la session dans `localStorage`. Sur iOS, c'est un support
 * qui peut disparaître sans prévenir, et de trois façons distinctes :
 *
 *  1. `auth-js` teste `localStorage` en écrivant une clé au démarrage
 *     (`supportsLocalStorage()`). Si cette écriture lève — quota plein,
 *     « Bloquer tous les cookies » dans Réglages, navigation privée —
 *     il bascule SANS LE DIRE sur un stockage EN MÉMOIRE. La session
 *     fonctionne alors parfaitement… jusqu'à ce qu'on ferme l'app, et
 *     elle est perdue à chaque fois.
 *  2. La protection anti-pistage de WebKit efface tout le stockage
 *     accessible aux scripts après sept jours sans visite.
 *  3. iOS peut purger le conteneur d'une app ajoutée à l'écran d'accueil
 *     quand la mémoire manque.
 *
 * Dans les trois cas, le symptôme est le même et c'est celui qui a été
 * signalé : on ferme l'application, on la rouvre, il faut se reconnecter.
 *
 * CE QU'ON STOCKE, ET POURQUOI SI PEU
 *
 * Uniquement le jeton de rafraîchissement, pas la session entière. Un
 * cookie plafonne à 4 Ko et une session Supabase complète (JWT d'accès +
 * objet utilisateur) les dépasse régulièrement — on se retrouverait avec
 * un cookie tronqué, donc inutilisable, et silencieusement. Le jeton de
 * rafraîchissement fait quelques dizaines d'octets et suffit à tout
 * reconstruire : `supabase.auth.refreshSession({ refresh_token })` rend
 * une session complète et neuve.
 *
 * CE QUE ÇA NE RÉSOUT PAS
 *
 * Un cookie écrit par un script reste soumis au plafond de sept jours de
 * WebKit, comme `localStorage`. Il couvre donc les cas 1 et 3, pas le 2.
 * Pour s'affranchir aussi du 2, il faudrait que le cookie soit posé par
 * un en-tête `Set-Cookie` du serveur — c'est le pas suivant si le
 * problème persiste au-delà d'une semaine d'inactivité.
 *
 * SÉCURITÉ. Le jeton n'est pas plus exposé qu'avant : il était déjà
 * lisible par n'importe quel script de la page dans `localStorage`. Le
 * cookie est `SameSite=Lax` et `Secure` (hors développement local), donc
 * il ne part jamais vers une autre origine.
 */

const COOKIE = 'p90.rt'
/** 400 jours — le plafond que les navigateurs imposent de toute façon. */
const DUREE = 400 * 86_400

function attributs(): string {
  const sur = typeof location !== 'undefined' && location.protocol === 'https:'
  return `path=/; max-age=${DUREE}; SameSite=Lax` + (sur ? '; Secure' : '')
}

/** Mémorise le jeton de rafraîchissement de la session courante. */
export function sauverRefresh(token: string | null | undefined): void {
  if (typeof document === 'undefined' || !token) return
  try {
    document.cookie = `${COOKIE}=${encodeURIComponent(token)}; ${attributs()}`
  } catch { /* cookies bloqués — on fait sans */ }
}

/** Le jeton mémorisé, ou null. */
export function lireRefresh(): string | null {
  if (typeof document === 'undefined') return null
  try {
    for (const part of document.cookie.split(';')) {
      const [nom, ...reste] = part.trim().split('=')
      if (nom === COOKIE) {
        const v = decodeURIComponent(reste.join('='))
        return v.length > 0 ? v : null
      }
    }
  } catch { /* cookies bloqués */ }
  return null
}

/** Oublie le jeton — déconnexion volontaire, ou jeton refusé par le serveur. */
export function effacerRefresh(): void {
  if (typeof document === 'undefined') return
  try {
    const sur = location.protocol === 'https:'
    document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax` + (sur ? '; Secure' : '')
  } catch { /* ignore */ }
}

/**
 * `localStorage` accepte-t-il réellement une écriture ?
 *
 * Reproduit exactement le test de `auth-js` : c'est lui qui décide si la
 * session va sur disque ou en mémoire. Sert au diagnostic /install-debug,
 * pour voir d'un coup d'œil si on est dans le cas 1 ci-dessus.
 */
export function localStorageUtilisable(): boolean {
  try {
    const cle = `lswt-${Math.random()}`
    localStorage.setItem(cle, cle)
    localStorage.removeItem(cle)
    return true
  } catch {
    return false
  }
}

/** La clé sous laquelle Supabase range la session, déduite de l'URL du projet. */
export function cleSupabase(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!url) return null
  try {
    const ref = new URL(url).hostname.split('.')[0]
    return `sb-${ref}-auth-token`
  } catch {
    return null
  }
}
