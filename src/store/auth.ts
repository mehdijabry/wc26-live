import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, withTimeout, type Profile } from '../lib/supabase'
import { effacerRefresh, lireRefresh, sauverRefresh } from '../lib/sessionBackup'

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
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
      if (session) await get().refreshProfile()
      else set({ profile: null })

      if (event === 'SIGNED_IN' && typeof window !== 'undefined' && callback) {
        try {
          const clean = window.location.origin + window.location.pathname
          window.history.replaceState({}, '', clean)
        } catch {
          // ignore
        }
      }
    })

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
        emailRedirectTo: window.location.origin,
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
        emailRedirectTo: window.location.origin,
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
        redirectTo: window.location.origin,
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
    set({ user: null, session: null, profile: null })
  },

  async refreshProfile() {
    if (!supabase) return
    const userId = get().user?.id
    if (!userId) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) set({ profile: data as Profile })
  },
}))
