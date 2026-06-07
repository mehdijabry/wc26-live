import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type Profile } from '../lib/supabase'

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
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
      set({ loading: false, completingSignIn: false })
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
      set({ loading: false, completingSignIn: false, authError: providerError })
      return
    }

    // Subscribe FIRST so we never miss SIGNED_IN from the URL exchange.
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session, user: session?.user ?? null, completingSignIn: false })
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
        await supabase.auth.exchangeCodeForSession(window.location.href)
      }
    } catch (err) {
      // Surface but don't block — fall through to getSession.
      // eslint-disable-next-line no-console
      console.warn('[auth] exchangeCodeForSession failed:', err)
    }

    const { data } = await supabase.auth.getSession()
    set({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
      completingSignIn: callback && !data.session,
    })
    if (data.session) await get().refreshProfile()

    if (callback && !data.session) {
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
    await supabase.auth.signOut()
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
