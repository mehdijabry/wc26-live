import { create } from 'zustand'

/**
 * Public feature flags, toggled from the admin panel and served by the
 * Worker at GET /site-settings (60s edge cache). Loaded once at boot;
 * components read the flags synchronously afterwards.
 *
 *  - wc26Visible     → show/hide every in-site WC26 archive entry point
 *  - arabicArticles  → EN/AR toggle on articles that carry a translation
 *
 * Defaults mirror the Worker's DEFAULT_SITE_SETTINGS so the first paint
 * (before the fetch resolves) already matches the post-tournament state.
 */
export type SiteSettings = {
  wc26Visible: boolean
  arabicArticles: boolean
}

const WORKER = 'https://wc26-api.nameless-violet-5dc1.workers.dev'
const LS_KEY = 'p90.siteSettings.v1'

const DEFAULTS: SiteSettings = { wc26Visible: false, arabicArticles: false }

function readCached(): SiteSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SiteSettings>) }
  } catch { /* SSR / private mode */ }
  return DEFAULTS
}

type State = SiteSettings & { loaded: boolean; load: () => Promise<void> }

export const useSiteSettings = create<State>((set) => ({
  ...readCached(),
  loaded: false,
  async load() {
    try {
      const r = await fetch(`${WORKER}/site-settings`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(String(r.status))
      const s = await r.json() as Partial<SiteSettings>
      const next: SiteSettings = {
        wc26Visible: !!s.wc26Visible,
        arabicArticles: !!s.arabicArticles,
      }
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      set({ ...next, loaded: true })
    } catch {
      set({ loaded: true }) // keep cached/default values
    }
  },
}))

if (typeof window !== 'undefined') {
  setTimeout(() => useSiteSettings.getState().load(), 100)
}
