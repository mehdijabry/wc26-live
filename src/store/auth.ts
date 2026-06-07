import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, type Profile } from '../lib/supabase'

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  init: () => Promise<void>
  signInWithMagicLink: (email: string, alias?: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,

  async init() {
    if (!supabase) {
      set({ loading: false })
      return
    }
    const { data } = await supabase.auth.getSession()
    set({ session: data.session, user: data.session?.user ?? null, loading: false })
    if (data.session) await get().refreshProfile()

    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session, user: session?.user ?? null })
      if (session) await get().refreshProfile()
      else set({ profile: null })
    })
  },

  async signInWithMagicLink(email, alias) {
    if (!supabase) return { error: 'Supabase not configured (env vars missing).' }
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
