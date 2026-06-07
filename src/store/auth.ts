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

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  completingSignIn: hasAuthCallback(),

  async init() {
    if (!supabase) {
      set({ loading: false, completingSignIn: false })
      return
    }

    // If the URL carries an auth callback, give Supabase a tick to process
    // the token via `detectSessionInUrl` BEFORE we ask for the session.
    // Without this, getSession() can resolve to null before the token is
    // exchanged, and the app paints a "not signed in" home view briefly.
    const callback = hasAuthCallback()

    // Subscribe FIRST so we never miss the SIGNED_IN event from the URL exchange.
    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session, user: session?.user ?? null, completingSignIn: false })
      if (session) await get().refreshProfile()
      else set({ profile: null })

      // Clean the callback bits out of the URL once we've consumed them.
      if (event === 'SIGNED_IN' && typeof window !== 'undefined' && callback) {
        try {
          const clean = window.location.origin + window.location.pathname
          window.history.replaceState({}, '', clean)
        } catch {
          // ignore
        }
      }
    })

    // Now read the session — Supabase JS will have queued the URL exchange.
    const { data } = await supabase.auth.getSession()
    set({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
      // Stay in "completing" mode briefly if we expected a callback but no
      // session yet — onAuthStateChange will clear it as soon as exchange
      // finishes. Hard-cap at 4s so we never deadlock the UI.
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
