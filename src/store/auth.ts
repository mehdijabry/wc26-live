import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, withTimeout, type Profile } from '../lib/supabase'
import { effacerRefresh, lireRefresh, sauverRefresh } from '../lib/sessionBackup'
import { reclamerCodeEnAttente } from '../lib/codeBienvenue'

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
  /**
   * L'état du solde, et pas seulement sa valeur. Sans lui, `profile` à null
   * s'affichait « 0 crampons, 0 pressings » : le joueur croyait avoir tout
   * perdu et devait recharger pour voir son vrai solde (Mehdi, 2026-10-10).
   * Une donnée absente n'est pas une donnée nulle — l'écran doit pouvoir
   * dire « je ne sais pas encore ».
   */
  profilEtat: 'inconnu' | 'chargement' | 'pret' | 'echec'
  loading: boolean
  /**
   * True once init() has finished its first pass — we've checked
   * localStorage and either confirmed a session or confirmed there's
   * no session. After this flips true it should never go false again.
   *
   * UserMenu uses this (rather than `loading`) to decide whether to
   * show the loading skeleton, so that any subsequent loading=true
   * transitions (e.g. refresh-profile during navigation) don't replace
   * the user's signed-in pill with a white skeleton.
   */
  initialized: boolean
  /**
   * True when the URL contains an OAuth/magic-link callback token (`?code=`
   * or `#access_token=`) and we're still waiting for Supabase to exchange
   * it for a session. UI uses this to show a "completing sign-in" state
   * instead of the not-connected home view.
   */
  completingSignIn: boolean
  /**
   * Surface OAuth provider errors that come back in the URL hash/query
   * (e.g. `error_description=Unable+to+exchange+external+code`). Cleared
   * when the user dismisses or successfully signs in.
   */
  authError: string | null
  dismissAuthError: () => void

  init: () => Promise<void>
  signUpWithPassword: (email: string, password: string, alias?: string) => Promise<{ error?: string; needsConfirm?: boolean }>
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>
  signInWithMagicLink: (email: string, alias?: string) => Promise<{ error?: string }>
  signInWithGoogle: () => Promise<{ error?: string }>
  resetPassword: (email: string) => Promise<{ error?: string }>
  updatePassword: (newPassword: string) => Promise<{ error?: string }>
  updateAlias: (newAlias: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

// True if the URL looks like a Supabase auth callback (PKCE `?code=`,
// implicit `#access_token=`, or error/reset variants).
function hasAuthCallback(): boolean {
  if (typeof window === 'undefined') return false
  const q = window.location.search
  const h = window.location.hash
  return /[?&](code|error|error_description)=/.test(q)
    || /access_token=|refresh_token=|error=/.test(h)
}

// Extract a human-readable error from the URL query or hash, if Supabase /
// the provider redirected us back with one.
function readAuthErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const tryParam = (s: string): string | null => {
    const p = new URLSearchParams(s)
    const desc = p.get('error_description') ?? p.get('error_message') ?? p.get('error')
    return desc ? decodeURIComponent(desc.replace(/\+/g, ' ')) : null
  }
  return tryParam(window.location.search.slice(1))
    ?? tryParam(window.location.hash.slice(1))
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  profilEtat: 'inconnu',
  loading: true,
  initialized: false,
  completingSignIn: hasAuthCallback(),
  authError: readAuthErrorFromUrl(),
  dismissAuthError: () => {
    set({ authError: null })
    // Also clean the URL so a refresh doesn't re-trigger the error.
    if (typeof window !== 'undefined') {
      try {
        const clean = window.location.origin + window.location.pathname
        window.history.replaceState({}, '', clean)
      } catch { /* ignore */ }
    }
  },

  async init() {
    if (!supabase) {
      set({ loading: false, completingSignIn: false, initialized: true })
      return
    }

    const callback = hasAuthCallback()
    const providerError = readAuthErrorFromUrl()

    // If the provider rejected the OAuth round-trip (e.g. Supabase couldn't
    // exchange the Google authorization code because the Google Cloud
    // Console redirect URI doesn't match the Supabase callback), there's
    // no point spinning on "completing sign-in" — short-circuit straight
    // to the error state so the user actually sees what went wrong.
    if (providerError) {
      set({ loading: false, completingSignIn: false, initialized: true, authError: providerError })
      return
    }

    // Subscribe FIRST so we never miss SIGNED_IN from the URL exchange.
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session, user: session?.user ?? null, completingSignIn: false })
      // Toute session qui passe ici — connexion, rafraîchissement horaire —
      // laisse son jeton dans un cookie. C'est la copie qui survit quand iOS
      // vide le localStorage de l'app. Voir src/lib/sessionBackup.ts.
      if (session?.refresh_token) sauverRefresh(session.refresh_token)
      if (session) {
        // Un lien d'inscription en attente se réclame ici, d'où que la
        // session arrive — retour de courriel, Google, lien magique.
        // Voir lib/codeBienvenue.ts : sans ça le bonus promis en publicité
        // n'était jamais versé.
        if (event === 'SIGNED_IN' && await reclamerCodeEnAttente()) { /* crédité */ }
        await get().refreshProfile()
      } else set({ profile: null, profilEtat: 'inconnu' })

      if (event === 'SIGNED_IN' && typeof window !== 'undefined' && callback) {
        try {
          const clean = window.location.origin + window.location.pathname
          window.history.replaceState({}, '', clean)
        } catch {
          // ignore
        }
      }
    })

    // Un onglet laissé en arriere-plan voit son jeton d'acces expirer (une
    // heure). supabase-js garde son minuteur de rafraichissement actif dans
    // un onglet cache, ou il echoue sans temoin ; au retour, la premiere
    // requete se met a attendre une renegociation deja engagee et bloquee.
    // La parade est d'arreter le minuteur quand l'onglet part et de le
    // relancer quand il revient, puis de redemander le profil sous delai :
    // l'ecran se repare seul au lieu d'exiger un rechargement manuel.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!supabase) return
        if (document.visibilityState === 'visible') {
          void supabase.auth.startAutoRefresh()
          void withTimeout(supabase.auth.getSession(), 6_000, null).then(() => {
            if (get().user) void get().refreshProfile()
          })
        } else {
          void supabase.auth.stopAutoRefresh()
        }
      })
    }

    // If the URL carries a PKCE `?code=` from Google/magic-link, perform
    // the exchange EXPLICITLY. The default `detectSessionInUrl` is racy
    // when the bundle is code-split — by the time it runs, React may have
    // already painted "not signed in". Calling exchangeCodeForSession
    // ourselves guarantees the session is stored before getSession() reads.
    try {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      if (code) {
        // 8s timeout — Supabase cold-start on mobile cellular regularly
        // stalls the OAuth code exchange. Without the cap, the whole
        // app hangs on `loading: true` and the auth button stays grey
        // forever. Time out → fall through; getSession() further down
        // handles the "no session yet" state cleanly.
        await withTimeout(supabase.auth.exchangeCodeForSession(window.location.href), 8_000, null)
      }
    } catch (err) {
      // Surface but don't block — fall through to getSession.
      // eslint-disable-next-line no-console
      console.warn('[auth] exchangeCodeForSession failed:', err)
    }

    // Hard 5s timeout on getSession — same reason as above. The default
    // session-read call sits on a network round-trip; on mobile we'd
    // rather show "Sign in" than a frozen button. Empty session object
    // is the safe fallback (Supabase's TS treats `data.session: null`
    // as "anonymous" everywhere).
    const { data } = await withTimeout(
      supabase.auth.getSession(),
      5_000,
      { data: { session: null }, error: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>,
    )
    // NE JAMAIS écraser une session déjà livrée par onAuthStateChange.
    // `withTimeout` rend `session: null` quand le délai expire — et il expire
    // pour de bon au démarrage à froid d'un téléphone, parce que getSession()
    // doit alors renégocier un jeton d'accès périmé (une heure de validité)
    // sur un réseau qui se réveille. Écrire ce null par-dessus la vraie
    // session affichait « Se connecter » à quelqu'un de parfaitement connecté.
    let session = data.session ?? get().session

    // Dernier recours : plus rien dans le stockage local. Soit iOS l'a purgé,
    // soit auth-js travaillait en mémoire depuis le début faute d'avoir pu y
    // écrire. Le cookie, lui, a peut-être survécu — un seul jeton de
    // rafraîchissement suffit à reconstruire une session complète.
    if (!session) {
      const jeton = lireRefresh()
      if (jeton) {
        const reprise = await withTimeout<{ session: Session | null; statut: number | null } | 'delai'>(
          supabase.auth
            .refreshSession({ refresh_token: jeton })
            .then((r) => ({
              session: r.data.session,
              statut: (r.error as { status?: number } | null)?.status ?? null,
            })),
          8_000,
          'delai',
        )
        if (reprise !== 'delai') {
          if (reprise.session) session = reprise.session
          // Le serveur a REFUSÉ le jeton (révoqué, remplacé) : on l'oublie,
          // sinon on le repropose à chaque démarrage. Une panne réseau, elle,
          // ne donne pas de statut HTTP — on garde le jeton dans ce cas.
          else if (reprise.statut === 400 || reprise.statut === 401 || reprise.statut === 403) {
            effacerRefresh()
          }
        }
      }
    }

    set({
      session,
      user: session?.user ?? null,
      loading: false,
      initialized: true,
      completingSignIn: callback && !session,
    })
    if (session) await get().refreshProfile()

    if (callback && !session) {
      setTimeout(() => set({ completingSignIn: false }), 4000)
    }
  },

  async signUpWithPassword(email, password, alias) {
    if (!supabase) return { error: 'Supabase not configured.' }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // La page EN COURS, pas l'accueil : quelqu'un qui s'inscrit depuis
        // /bienvenue/<code> doit y revenir après avoir confirmé son
        // courriel, sinon la réclamation du bonus n'a jamais lieu.
        emailRedirectTo: window.location.origin + window.location.pathname,
        data: alias ? { alias } : undefined,
      },
    })
    if (error) return { error: error.message }
    // If session is null, Supabase requires email confirmation
    const needsConfirm = !data.session
    return { needsConfirm }
  },

  async signInWithPassword(email, password) {
    if (!supabase) return { error: 'Supabase not configured.' }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return {}
  },

  async signInWithMagicLink(email, alias) {
    if (!supabase) return { error: 'Supabase not configured.' }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // La page en cours, pas l'accueil — voir signUpWithPassword.
        emailRedirectTo: window.location.origin + window.location.pathname,
        data: alias ? { alias } : undefined,
      },
    })
    if (error) return { error: error.message }
    return {}
  },

  async signInWithGoogle() {
    if (!supabase) return { error: 'Supabase not configured.' }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // La page en cours, pas l'accueil — voir signUpWithPassword.
        redirectTo: window.location.origin + window.location.pathname,
      },
    })
    if (error) return { error: error.message }
    return {}
  },

  async resetPassword(email) {
    if (!supabase) return { error: 'Supabase not configured.' }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}?reset=1`,
    })
    if (error) return { error: error.message }
    return {}
  },

  async updatePassword(newPassword) {
    if (!supabase) return { error: 'Supabase not configured.' }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { error: error.message }
    return {}
  },

  async updateAlias(newAlias) {
    if (!supabase) return { error: 'Supabase not configured.' }
    const userId = get().user?.id
    if (!userId) return { error: 'Not signed in.' }
    const { error } = await supabase
      .from('profiles')
      .update({ alias: newAlias })
      .eq('id', userId)
    if (error) return { error: error.message }
    await get().refreshProfile()
    return {}
  },

  async signOut() {
    if (!supabase) return
    // Avant ET après : un TOKEN_REFRESHED encore en vol pourrait réécrire le
    // cookie entre les deux, et le prochain démarrage reconnecterait
    // quelqu'un qui vient justement de demander à partir.
    effacerRefresh()
    await supabase.auth.signOut()
    effacerRefresh()
    set({ user: null, session: null, profile: null, profilEtat: 'inconnu' })
  },

  async refreshProfile() {
    if (!supabase) return
    const userId = get().user?.id
    if (!userId) return
    set({ profilEtat: get().profile ? 'pret' : 'chargement' })
    // Une seule reprise : le tout premier appel part parfois avant que le
    // jeton rafraîchi soit en place, et l'échec silencieux laissait le solde
    // à zéro jusqu'au prochain rechargement de la page.
    // SOUS DÉLAI, impérativement. C'était la seule requête Supabase du
    // projet sans garde — et le 11/10/2026 elle a gelé l'app six fois de
    // suite : au retour d'un onglet resté longtemps en arrière-plan, le
    // jeton d'accès a expiré, supabase-js part le renégocier, et tant que
    // cette négociation n'aboutit pas la promesse ne se résout jamais. Le
    // solde restait sur « - », et comme onAuthStateChange attend ici, tout
    // ce qui suivait restait sur « Loading… » jusqu'au rechargement.
    type Reponse = { data: Profile | null; error: { message: string } | null }
    const EXPIRE: Reponse = { data: null, error: { message: 'timeout' } }
    for (let essai = 0; essai < 2; essai++) {
      const { data, error } = await withTimeout<Reponse>(
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle() as unknown as Promise<Reponse>,
        6_000,
        EXPIRE,
      )
      if (!error && data) { set({ profile: data as Profile, profilEtat: 'pret' }); return }
      if (!error && !data) { set({ profilEtat: 'pret' }); return }   // profil pas encore créé
      if (essai === 0) await new Promise((r) => setTimeout(r, 700))
    }
    set({ profilEtat: 'echec' })
  },
}))
