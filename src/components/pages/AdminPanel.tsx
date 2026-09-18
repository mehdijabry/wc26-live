import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../lib/api'
import { StoryComposer } from './StoryComposer'
import { ReelComposer } from './ReelComposer'
import { MatchStoryComposer } from './MatchStoryComposer'
import { uploadPostCards } from '../../lib/newsCards'

/**
 * Admin panel — protected operator console for pressing90.live.
 *
 * Route: /admin-panel-1992  (obscured slug; real auth is the password)
 *
 * Sections:
 *   1. Overview      — total subs / users / brackets at a glance
 *   2. Analytics     — Cloudflare + Google Search Console live data
 *   3. Push          — broadcast to everyone OR target a single subscriber
 *   4. Email         — send a one-off Resend email
 *   5. Database      — Supabase tables (subs / users / brackets) viewer
 *   6. Site Health   — ESPN + KV liveness, server time
 *   7. Quick Actions — clear caches, etc.
 *
 * Auth: the password POSTs to /admin/auth/login. The Worker compares
 * SHA-256(salt + ':' + pw) against ADMIN_PASSWORD_HASH and issues an
 * httpOnly cookie 'wc26_admin' valid 8h. The frontend never sees the
 * session token itself.
 */

type Tab =
  | 'overview' | 'analytics' | 'push' | 'email' | 'database' | 'health' | 'actions' | 'news' | 'social' | 'insights'

// Token storage key in sessionStorage. We use sessionStorage (not local)
// so the token clears when the tab closes — saves us from a stale
// 8h-old session sitting on a shared machine.
const TOKEN_KEY = 'wc26.admin.token'
function getToken(): string | null { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } }
function setToken(t: string | null) { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY) } catch {} }

export function AdminPanel() {
  const [authed, setAuthed] = useState<null | boolean>(null) // null=loading
  const [pw, setPw] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  // Session probe on mount — sends the Bearer token from sessionStorage
  // if we have one. If not, immediately render the login screen.
  //
  // Also swaps the PWA manifest to the admin-only variant so iOS "Add
  // to Home Screen" registers this URL (/admin-panel-1992) as the
  // start_url. Without this, the saved icon would open the public site.
  useEffect(() => {
    document.title = 'Admin · Pressing 90'
    setMeta('robots', 'noindex,nofollow,noarchive')
    const restoreManifest = swapPWAMetaForAdmin()
    const tok = getToken()
    if (!tok) { setAuthed(false) } else {
      void fetch(`${API_BASE}/admin/auth/session`, {
        headers: { authorization: `Bearer ${tok}` },
      })
        .then((r) => r.json())
        .then((j) => {
          if (j.ok) setAuthed(true)
          else { setToken(null); setAuthed(false) }
        })
        .catch(() => setAuthed(false))
    }
    return restoreManifest
  }, [])

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError(null)
    try {
      const r = await fetch(`${API_BASE}/admin/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok && data.token) {
        // Stash the token so subsequent fetches send it via
        // Authorization: Bearer. Cookies don't work cross-origin in
        // Safari/Brave/strict-mode Firefox, so we don't rely on them.
        setToken(data.token)
        setAuthed(true)
        setPw('')
      } else if (r.status === 429) {
        setLoginError('Too many attempts. Wait a minute.')
      } else {
        setLoginError('Invalid password.')
      }
    } catch {
      setLoginError('Network error.')
    } finally {
      setLoggingIn(false)
    }
  }

  async function onLogout() {
    setToken(null)
    setAuthed(false)
  }

  if (authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500 font-mono">checking session…</div>
  }

  if (!authed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-6"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        }}
      >
        <form onSubmit={onLogin} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-3">
            Pressing 90 · admin
          </div>
          <h1 className="font-display font-bold text-2xl text-slate-900 mb-6">
            Sign in
          </h1>
          <label className="block text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">
            Password
          </label>
          <input
            autoFocus
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            disabled={loggingIn}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm"
          />
          {loginError && (
            <div className="mt-3 text-xs text-accent-red font-mono">{loginError}</div>
          )}
          <button
            type="submit"
            disabled={loggingIn || !pw}
            className="mt-5 w-full px-4 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loggingIn ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="mt-6 pt-5 border-t border-slate-200 text-xs text-slate-500 font-mono leading-relaxed">
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 mb-2">
              Install on iPhone
            </div>
            Open this page in Safari → tap <strong className="text-slate-900">Share</strong>
            {' '}<span aria-hidden>⬆</span> → <strong className="text-slate-900">Add to Home Screen</strong>.
            The icon opens straight to this admin login — not the public site.
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky header. Top padding combines the iOS safe-area (notch /
          Dynamic Island in standalone PWA mode — 0 in a browser tab)
          with the regular py-3 so content never hides under the notch. */}
      <header
        className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-slate-200"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Pressing 90 · admin
            </div>
            <div className="font-display font-bold text-slate-900 truncate text-base sm:text-lg">
              Operator console
            </div>
          </div>
          {/* Real button instead of a tiny link — 44px min target for
              comfortable iPhone taps, with a clear logout chip. */}
          <button
            onClick={onLogout}
            className="shrink-0 px-3 py-2 rounded-full border border-slate-200 text-[11px] font-mono uppercase tracking-widest text-slate-600 hover:text-accent-red hover:border-accent-red active:bg-slate-50 transition-colors"
          >
            Sign out
          </button>
        </div>
        {/* Horizontal tab strip — scroll-padding so the active chip never
            sits right under the rounded edge when scrolled into view. */}
        <nav
          className="max-w-6xl mx-auto px-4 sm:px-5 pb-2 flex gap-1.5 overflow-x-auto scroll-smooth"
          style={{ scrollPaddingInline: '1rem', WebkitOverflowScrolling: 'touch' }}
        >
          {(['overview', 'analytics', 'insights', 'news', 'social', 'push', 'email', 'database', 'health', 'actions'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'shrink-0 px-3.5 py-2 rounded-full text-[11px] font-mono uppercase tracking-widest transition-colors ' +
                (tab === t
                  ? 'bg-ink-900 text-white font-semibold'
                  : 'text-slate-500 hover:bg-slate-100 active:bg-slate-200')
              }
              // Explicit inline style as a belt-and-braces fallback —
              // Safari sometimes ignores the Tailwind text-white utility
              // if the parent applies a backdrop-filter (we have one on
              // the sticky header above).
              style={tab === t ? { color: '#ffffff' } : undefined}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      {/* Main scrollable area. Bottom padding adds the iOS home-indicator
          safe area so the last section isn't covered by the gesture bar. */}
      <main
        className="max-w-6xl mx-auto px-4 sm:px-5 py-5 sm:py-8"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
      >
        {tab === 'overview' && <Overview />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'push' && <Push />}
        {tab === 'email' && <EmailPanel />}
        {tab === 'database' && <Database />}
        {tab === 'health' && <SiteHealth />}
        {tab === 'actions' && <QuickActions />}
        {tab === 'news' && <News />}
        {tab === 'social' && <Social />}
        {tab === 'insights' && <Insights />}
      </main>
    </div>
  )
}

// ─── Section: Overview ─────────────────────────────────────────────

function Overview() {
  const [data, setData] = useState<{ subs: number; profiles: number; brackets: number; fetchedAt: string } | null>(null)
  useEffect(() => {
    void adminGet("/admin/stats/overview").then((d) => setData(d as any))
  }, [])
  return (
    <Section title="Overview" eyebrow="At a glance">
      {!data ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Push subscribers" value={data.subs} accent="gold" />
          <KpiCard label="Registered users" value={data.profiles} />
          <KpiCard label="Brackets saved" value={data.brackets} />
          <KpiCard label="Fetched" value={new Date(data.fetchedAt).toLocaleTimeString()} mono />
        </div>
      )}
    </Section>
  )
}

// ─── Section: Analytics ─────────────────────────────────────────────

// ISO-3166 alpha-2 → flag emoji (regional indicator pair).
function isoFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '🌐'
  const base = 0x1f1e6
  const up = code.toUpperCase()
  return String.fromCodePoint(base + up.charCodeAt(0) - 65, base + up.charCodeAt(1) - 65)
}

type VisitsData = {
  ok: boolean
  days: number
  pageviews: number
  sessions: number
  byCountry: Array<{ key: string; count: number }>
  bySource: Array<{ key: string; count: number }>
  byLang: Array<{ key: string; count: number }>
  byDay: Array<{ key: string; count: number }>
}

/** Real-visitor stats — the numbers that matter. Fed by the /hit beacon
 *  (people opening pages), NOT Cloudflare request counts (bots, API
 *  polls, assets), which massively overstate reality. */
function Visitors() {
  const [days, setDays] = useState<1 | 7 | 30>(1)
  const [data, setData] = useState<VisitsData | null>(null)
  useEffect(() => {
    setData(null)
    void adminGet(`/admin/stats/visits?days=${days}`).then((d) => setData(d as VisitsData))
  }, [days])

  const fbCount = data?.bySource.find((s) => s.key === 'facebook')?.count ?? 0
  const fbPct = data && data.pageviews > 0 ? Math.round((fbCount / data.pageviews) * 100) : 0
  const maxDay = data ? Math.max(1, ...data.byDay.map((d) => d.count)) : 1

  return (
    <Section title="Visitors · real people" eyebrow={days === 1 ? 'Beacon · last 24h' : `Beacon · last ${days} days`}>
      <div className="flex gap-2 mb-4">
        {([1, 7, 30] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={
              'px-3 py-1 text-xs font-mono rounded-full transition-colors ' +
              (days === d ? 'bg-ink-900 font-semibold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
            }
            style={days === d ? { color: '#ffffff' } : undefined}
          >
            {d === 1 ? '24h' : `${d}d`}
          </button>
        ))}
      </div>
      {!data ? <Loading /> : !data.ok ? (
        <div className="text-xs font-mono text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Table « hits » indisponible — exécute worker/sql/analytics-hits.sql dans Supabase.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Visits (sessions)" value={data.sessions} accent="gold" />
            <KpiCard label="Page views" value={data.pageviews} />
            <KpiCard
              label="Top country"
              value={data.byCountry[0] ? `${isoFlag(data.byCountry[0].key)} ${data.byCountry[0].key}` : '—'}
            />
            <KpiCard label="From Facebook" value={`${fbPct}%`} accent={fbPct > 0 ? 'green' : undefined} mono />
          </div>

          {/* Daily mini-bars */}
          {data.byDay.length > 1 && (
            <div className="mt-5 flex items-end gap-1 h-16">
              {data.byDay.map((d) => (
                <div key={d.key} className="flex-1 flex flex-col items-center gap-1" title={`${d.key} · ${d.count} vues`}>
                  <div
                    className="w-full rounded-t bg-accent-gold/70"
                    style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 grid sm:grid-cols-2 gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">Top countries</div>
              <div className="space-y-1">
                {data.byCountry.slice(0, 10).map((c) => (
                  <div key={c.key} className="flex items-center gap-2 text-sm">
                    <span>{isoFlag(c.key)}</span>
                    <span className="font-mono text-xs text-slate-600 w-8">{c.key}</span>
                    <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                      <div className="h-full bg-accent-gold/60" style={{ width: `${(c.count / (data.byCountry[0]?.count || 1)) * 100}%` }} />
                    </div>
                    <span className="font-mono text-xs text-slate-500 w-10 text-right">{c.count}</span>
                  </div>
                ))}
                {data.byCountry.length === 0 && <div className="text-xs text-slate-500">Aucune visite enregistrée pour l’instant.</div>}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">Traffic sources</div>
              <div className="space-y-1">
                {data.bySource.map((s) => (
                  <div key={s.key} className="flex items-center gap-2 text-sm">
                    <span className={'font-mono text-xs w-24 truncate ' + (s.key === 'facebook' ? 'text-accent-green font-bold' : 'text-slate-600')}>
                      {s.key === 'facebook' ? '📘 facebook' : s.key}
                    </span>
                    <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
                      <div className={'h-full ' + (s.key === 'facebook' ? 'bg-accent-green/70' : 'bg-slate-300')} style={{ width: `${(s.count / (data.bySource[0]?.count || 1)) * 100}%` }} />
                    </div>
                    <span className="font-mono text-xs text-slate-500 w-10 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
              <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mt-4 mb-2">Languages</div>
              <div className="flex gap-3 font-mono text-xs text-slate-600">
                {data.byLang.map((l) => <span key={l.key}>{l.key}: {l.count}</span>)}
              </div>
            </div>
          </div>
        </>
      )}
    </Section>
  )
}

function Analytics() {
  const [cf, setCf] = useState<unknown>(null)
  const [gsc, setGsc] = useState<unknown>(null)
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h')

  useEffect(() => {
    void adminGet(`/admin/stats/cloudflare?range=${range}`).then(setCf)
    void adminGet('/admin/stats/gsc').then(setGsc)
  }, [range])

  type CfMock = {
    requests: number
    pageViews: number
    uniques: number
    bandwidth: string
    cachedRequests?: number
    cachedBytes?: string
    cacheReqPct?: number
    cacheBytesPct?: number
    topCountries: Array<{ code: string; name: string; requests: number }>
    topStatuses?: Array<{ code: number; requests: number }>
    topBrowsers?: Array<{ name: string; pageViews: number }>
    topContentTypes?: Array<{ name: string; requests: number; bytes: string }>
  }
  type GscMock = { clicks: number; impressions: number; ctr: string; position: number; topQueries: Array<{ query: string; clicks: number; impressions: number }>; topPages: Array<{ url: string; clicks: number; impressions: number }> }
  const cfData = cf as { configured?: boolean; message?: string; mock?: CfMock; raw?: unknown } | null
  const gscData = gsc as { configured?: boolean; error?: string; message?: string; mock?: GscMock } | null

  // The worker now flattens both 'configured' AND 'mock' paths into
  // the same shape, so we just read .mock either way and the UI
  // renders identically. The bandeau only appears when configured=false.
  const cfShow = cfData?.mock
  const gscShow = gscData?.mock

  return (
    <>
      <Visitors />
      <Section title="Cloudflare Analytics" eyebrow={`Traffic · last ${range}`}>
        <div className="flex gap-2 mb-4">
          {(['24h', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={
                'px-3 py-1 text-xs font-mono rounded-full transition-colors ' +
                (range === r ? 'bg-ink-900 font-semibold' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
              }
              // Inline color fallback — Safari sometimes ignores Tailwind
              // text-* utilities when an ancestor applies backdrop-filter.
              style={range === r ? { color: '#ffffff' } : undefined}
            >
              {r}
            </button>
          ))}
        </div>
        {!cfData ? <Loading /> : cfShow ? (
          <>
            {!cfData.configured && <ConfigBanner message={cfData.message ?? ''} />}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Requests" value={cfShow.requests} accent="gold" />
              <KpiCard label="Page views" value={cfShow.pageViews} />
              <KpiCard label="Unique visitors" value={cfShow.uniques} />
              <KpiCard label="Bandwidth" value={cfShow.bandwidth} mono />
            </div>
            {/* Cache rate — single most-actionable number for a CDN-fronted
                site. Higher = fewer round trips to origin = faster + cheaper.
                Color-coded so you can grok at a glance. */}
            {(cfShow.cacheReqPct !== undefined || cfShow.cachedRequests !== undefined) && (
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard
                  label="Cache hit · requests"
                  value={cfShow.cacheReqPct !== undefined ? `${cfShow.cacheReqPct.toFixed(1)}%` : '—'}
                  mono
                  accent={cfShow.cacheReqPct && cfShow.cacheReqPct >= 70 ? 'gold' : undefined}
                />
                <KpiCard
                  label="Cache hit · bytes"
                  value={cfShow.cacheBytesPct !== undefined ? `${cfShow.cacheBytesPct.toFixed(1)}%` : '—'}
                  mono
                />
                <KpiCard
                  label="Cached requests"
                  value={cfShow.cachedRequests ?? 0}
                />
                <KpiCard
                  label="Cached bytes"
                  value={cfShow.cachedBytes ?? '—'}
                  mono
                />
              </div>
            )}

            <div className="mt-5 grid sm:grid-cols-2 gap-5">
              {cfShow.topCountries.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
                    Top countries
                  </div>
                  <ul className="space-y-1.5">
                    {cfShow.topCountries.map((c, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <span>{c.name}</span>
                        <span className="font-mono text-slate-500">{c.requests.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cfShow.topBrowsers && cfShow.topBrowsers.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
                    Top browsers
                  </div>
                  <ul className="space-y-1.5">
                    {cfShow.topBrowsers.map((b) => (
                      <li key={b.name} className="flex items-center justify-between text-sm">
                        <span>{b.name}</span>
                        <span className="font-mono text-slate-500">{b.pageViews.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cfShow.topStatuses && cfShow.topStatuses.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
                    HTTP status codes
                  </div>
                  <ul className="space-y-1.5">
                    {cfShow.topStatuses.map((s) => (
                      <li key={s.code} className="flex items-center justify-between text-sm">
                        <span className={
                          'font-mono ' +
                          (s.code >= 500 ? 'text-red-600' : s.code >= 400 ? 'text-amber-600' : 'text-emerald-700')
                        }>{s.code}</span>
                        <span className="font-mono text-slate-500">{s.requests.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cfShow.topContentTypes && cfShow.topContentTypes.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
                    Top content types · bytes
                  </div>
                  <ul className="space-y-1.5">
                    {cfShow.topContentTypes.map((c) => (
                      <li key={c.name} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs">{c.name}</span>
                        <span className="font-mono text-slate-500">{c.bytes}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-600">No data.</div>
        )}
      </Section>

      <Section title="Google Search Console" eyebrow="Search · last 7 days">
        {!gscData ? <Loading /> : gscShow ? (
          <>
            {!gscData.configured && <ConfigBanner message={gscData.message ?? ''} />}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Clicks" value={gscShow.clicks} accent="gold" />
              <KpiCard label="Impressions" value={gscShow.impressions} />
              <KpiCard label="CTR" value={gscShow.ctr} />
              <KpiCard label="Avg position" value={gscShow.position} />
            </div>
            <div className="mt-5 grid sm:grid-cols-2 gap-5">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">Top queries</div>
                <ul className="space-y-1.5">
                  {gscShow.topQueries.map((q) => (
                    <li key={q.query} className="flex items-center justify-between text-sm">
                      <span className="truncate">{q.query}</span>
                      <span className="font-mono text-slate-500 shrink-0 ml-3">{q.clicks} cl</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">Top pages</div>
                <ul className="space-y-1.5">
                  {gscShow.topPages.map((p) => (
                    <li key={p.url} className="flex items-center justify-between text-sm">
                      <span className="truncate font-mono text-xs">{p.url}</span>
                      <span className="font-mono text-slate-500 shrink-0 ml-3">{p.clicks} cl</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : gscData?.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
            <div className="font-bold text-rose-900 mb-1">GSC error — {gscData.error}</div>
            {gscData.message && (
              <div className="text-rose-800 text-xs font-mono break-all">{gscData.message}</div>
            )}
            <div className="text-rose-700 text-xs mt-2">
              Common causes: refresh token expired/revoked, missing scope (needs <code>webmasters.readonly</code>),
              or <code>GSC_SITE_URL</code> doesn't match a verified property. Re-run <code>scripts/get-gsc-refresh-token.mjs</code> and
              <code> wrangler secret put GSC_REFRESH_TOKEN</code> to refresh.
            </div>
          </div>
        ) : !gscData?.configured ? (
          <ConfigBanner message={gscData?.message ?? 'GSC not configured.'} />
        ) : (
          <div className="text-sm text-slate-600">No data yet — GSC needs a few days to index your site.</div>
        )}
      </Section>
    </>
  )
}

// ─── Section: Push ─────────────────────────────────────────────────

// All notifications share the same shape so they look uniform to the
// reader: a single emoji prefix, a short headline, one-sentence body,
// and an in-app deep-link URL. The presets fill these fields for the
// operator instead of typing free-form text every time.
type PresetKind = 'custom' | 'match' | 'article' | 'section' | 'test'

type PresetArticle = { id: string; slug: string; title: string; excerpt: string | null; published_at: string | null }
type PresetMatch = { id: string; date: string; home: string; away: string; homeAbbr: string | null; awayAbbr: string | null; venue: string | null }
type PresetSection = { path: string; label: string; emoji: string }

const SECTIONS: PresetSection[] = [
  { path: '/today',       label: 'Today',                emoji: '⚽' },
  { path: '/wc26',        label: 'WC26 hub',             emoji: '🏆' },
  { path: '/predictions', label: 'Predictions / bracket', emoji: '🔮' },
  { path: '/board',       label: 'Leaderboard',          emoji: '📊' },
  { path: '/news',        label: 'News',                 emoji: '📰' },
  { path: '/stadiums',    label: 'Stadiums',             emoji: '🏟' },
]

// Format a kickoff time as 'Sat 14 Jun, 18:00' in the operator's locale,
// short enough to fit in a push body line.
function formatKickoff(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function Push() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/today')
  const [tag, setTag] = useState('')
  const [preset, setPreset] = useState<PresetKind>('custom')
  const [subs, setSubs] = useState<Array<{ provider: string; tail: string; fullEndpoint: string; ua?: string | null; lang?: string | null; created_at?: string | null; alias?: string | null }>>([])
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Preset data, lazily loaded the first time the operator picks a preset.
  const [matches, setMatches] = useState<PresetMatch[] | null>(null)
  const [articles, setArticles] = useState<PresetArticle[] | null>(null)

  useEffect(() => {
    void adminGet('/admin/subscriptions').then((d) => setSubs((d as { rows: typeof subs }).rows ?? []))
  }, [])

  function clearForm() {
    setTitle('')
    setBody('')
    setUrl('/today')
    setTag('')
  }

  async function onPickPreset(kind: PresetKind) {
    setPreset(kind)
    setStatus(null)
    if (kind === 'custom') {
      clearForm()
      return
    }
    if (kind === 'test') {
      setTitle('🧪 Push test')
      setBody('If you see this notification, delivery is working as expected.')
      setUrl('/')
      setTag('test')
      return
    }
    if (kind === 'match' && !matches) {
      try { setMatches(((await adminGet('/admin/push/preset/matches')) as { matches?: PresetMatch[] }).matches ?? []) } catch { setMatches([]) }
    }
    if (kind === 'article' && !articles) {
      try { setArticles(((await adminGet('/admin/push/preset/articles')) as { articles?: PresetArticle[] }).articles ?? []) } catch { setArticles([]) }
    }
    if (kind === 'section') {
      // Pre-fill with the Today section by default — most common deep link.
      applySectionPreset(SECTIONS[0])
    }
  }

  function applyMatchPreset(m: PresetMatch) {
    setTitle(`⚽ ${m.home} vs ${m.away}`)
    setBody(`Kick-off ${formatKickoff(m.date)} · Tap to follow live.`)
    setUrl('/today')
    setTag(`match-upcoming-${m.id}`)
  }

  function applyArticlePreset(a: PresetArticle) {
    const t = (a.title || '').slice(0, 90)
    const ex = (a.excerpt || '').slice(0, 140) || 'New article on Pressing 90.'
    setTitle(`📰 ${t}`)
    setBody(ex)
    setUrl(`/news/${a.slug}`)
    setTag(`article-${a.slug}`)
  }

  function applySectionPreset(s: PresetSection) {
    setTitle(`${s.emoji} Pressing 90' · ${s.label}`)
    setBody(`Open ${s.label.toLowerCase()} in the app.`)
    setUrl(s.path)
    setTag(`section-${s.path.replace(/\//g, '')}`)
  }

  async function broadcast() {
    if (!title || !body) { setStatus('title + body required'); return }
    setBusy(true)
    setStatus(null)
    try {
      const r = await adminPost('/admin/push/broadcast', { title, body, url, tag: tag || undefined })
      const data = r as { sent?: number; failed?: number; total?: number }
      setStatus(`Sent ${data.sent ?? '?'} / ${data.total ?? '?'} · ${data.failed ?? 0} failed`)
    } catch (e) {
      setStatus(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function sendSingle() {
    if (!selectedEndpoint || !title || !body) { setStatus('pick a sub + fill title/body'); return }
    setBusy(true)
    setStatus(null)
    try {
      const r = await adminPost('/admin/push/single', { endpoint: selectedEndpoint, title, body, url })
      setStatus(`Single sent: ${JSON.stringify(r)}`)
    } catch (e) {
      setStatus(String(e))
    } finally {
      setBusy(false)
    }
  }

  // Live preview matches the actual SW notification rendering — emoji
  // prefix in title, body wrapped to two lines max, deep-link URL
  // shown as a footer pill. Lets the operator catch overflow before
  // hitting Broadcast.
  const previewActive = !!(title || body)

  return (
    <>
      <AutoPushSettingsSection />

      <ScheduledAlertsSection />

      <Section title="Compose notification" eyebrow="Broadcast">
        {/* Preset picker — pick a recipe first, then fine-tune. */}
        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">Preset</div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(['custom','match','article','section','test'] as PresetKind[]).map((k) => (
            <button
              key={k}
              onClick={() => onPickPreset(k)}
              className={
                'px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest transition-colors ' +
                (preset === k
                  ? 'bg-ink-900 text-white font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
              }
              style={preset === k ? { color: '#ffffff' } : undefined}
            >
              {k === 'custom' ? '✎ custom'
                : k === 'match' ? '⚽ match'
                : k === 'article' ? '📰 article'
                : k === 'section' ? '🔗 section'
                : '🧪 test'}
            </button>
          ))}
        </div>

        {/* Preset-specific picker */}
        {preset === 'match' && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
              Upcoming match {matches ? `· ${matches.length} options` : '· loading…'}
            </div>
            <select
              onChange={(e) => { const m = matches?.find((x) => x.id === e.target.value); if (m) applyMatchPreset(m) }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm"
              defaultValue=""
            >
              <option value="" disabled>— pick a match —</option>
              {(matches ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.home} v {m.away} · {formatKickoff(m.date)}
                </option>
              ))}
            </select>
          </div>
        )}
        {preset === 'article' && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">
              Published article {articles ? `· ${articles.length} options` : '· loading…'}
            </div>
            <select
              onChange={(e) => { const a = articles?.find((x) => x.id === e.target.value); if (a) applyArticlePreset(a) }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white font-mono text-sm"
              defaultValue=""
            >
              <option value="" disabled>— pick an article —</option>
              {(articles ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title.slice(0, 60)}{a.title.length > 60 ? '…' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {preset === 'section' && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">App section</div>
            <div className="flex flex-wrap gap-1.5">
              {SECTIONS.map((s) => (
                <button
                  key={s.path}
                  onClick={() => applySectionPreset(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-mono bg-white border border-slate-200 hover:bg-slate-100"
                >
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Editable fields — same for every preset, pre-filled by the picker above. */}
        <InputField label="Title" value={title} onChange={setTitle} placeholder="⚽ Morocco vs Spain" />

        <div className="mt-3">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Kick-off in 15 min — tap to follow live."
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm h-20"
          />
        </div>

        {/* URL = the relative path the user lands on when they tap the
            notification. Dropdown to avoid typos on the common
            destinations; 'Custom path…' reveals a text input for deep
            links like /news/<slug> or /team/MAR. */}
        <UrlPicker value={url} onChange={setUrl} />

        {/* TAG groups notifications — a newer one with the same tag
            replaces the previous in the iOS notification tray instead
            of stacking. Dropdown enforces consistency; 'Custom tag…'
            reveals a text input. */}
        <TagPicker value={tag} onChange={setTag} />

        {/* Live preview — matches the SW notification shape. */}
        {previewActive && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1.5">Preview</div>
            <div className="flex items-start gap-3">
              <img src="/icon-192.png" alt="" className="w-9 h-9 rounded-lg shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold text-sm text-slate-900 truncate">{title || 'Title…'}</div>
                <div className="text-xs text-slate-700 mt-0.5 line-clamp-2">{body || 'Body…'}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-1.5">→ {url}{tag ? ` · #${tag}` : ''}</div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-3 flex-wrap">
          <button
            onClick={broadcast}
            disabled={busy}
            className="px-5 py-2.5 rounded-full bg-accent-red font-semibold text-sm hover:bg-red-600 disabled:opacity-40"
            style={{ color: '#ffffff' }}
          >
            Broadcast to everyone
          </button>
          <button
            onClick={sendSingle}
            disabled={busy || !selectedEndpoint}
            className="px-5 py-2.5 rounded-full bg-ink-900 font-semibold text-sm hover:bg-ink-800 disabled:opacity-40"
            style={{ color: '#ffffff' }}
          >
            Send to selected user
          </button>
        </div>
        {status && <div className="mt-3 text-sm font-mono text-slate-600">{status}</div>}
      </Section>

      <Section title="Subscribers" eyebrow={`${subs.length} active`}>
        {subs.length === 0 ? <Empty>No subscribers yet.</Empty> : (
          <ul className="divide-y divide-slate-200">
            {subs.map((s) => (
              <li key={s.fullEndpoint} className="py-2 flex items-center gap-3">
                <input
                  type="radio"
                  name="sub-pick"
                  checked={selectedEndpoint === s.fullEndpoint}
                  onChange={() => setSelectedEndpoint(s.fullEndpoint)}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {s.provider} · <span className="font-mono text-slate-500">…{s.tail}</span>
                    {s.alias && (
                      <span className="px-1.5 py-0.5 rounded-md bg-accent-gold/15 text-accent-gold text-xs font-mono font-bold tracking-wide">
                        {s.alias}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">{s.ua ?? ''}</div>
                </div>
                <div className="text-xs font-mono text-slate-400 shrink-0">
                  {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  )
}

// ─── Scheduled alerts widget ───────────────────────────────────────
//
// Lists every push currently queued in the KickoffScheduler DO (T-60,
// T-15, T-0 per upcoming match). Per-row actions:
//   · Cancel    — removes it from the queue + sets a KV sentinel so
//                 the cron doesn't re-queue it.
//   · +15 / +30 — postpone by N minutes (useful when ESPN's kickoff
//                 time is stale).

type ScheduledAlert = {
  id: string
  matchId: string
  leadMinutes: number | null
  fireAt: number
  fireAtIso: string
  title: string
  body: string
  url: string
  tag: string | null
}

function ScheduledAlertsSection() {
  const [items, setItems] = useState<ScheduledAlert[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  async function refresh() {
    try {
      const r = (await adminGet('/admin/push/scheduled')) as { queue?: ScheduledAlert[] }
      setItems((r.queue ?? []).sort((a, b) => a.fireAt - b.fireAt))
    } catch (e) {
      setStatus(String(e))
    }
  }

  useEffect(() => { void refresh() }, [])

  async function cancel(id: string) {
    if (!confirm(`Cancel scheduled alert ${id}?`)) return
    setBusy(id)
    setStatus(null)
    try {
      await adminPost('/admin/push/scheduled/cancel', { id })
      await refresh()
    } catch (e) {
      setStatus(String(e))
    } finally {
      setBusy(null)
    }
  }

  async function postpone(id: string, deltaMinutes: number) {
    setBusy(id)
    setStatus(null)
    try {
      await adminPost('/admin/push/scheduled/reschedule', { id, deltaMinutes })
      await refresh()
    } catch (e) {
      setStatus(String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section title="Scheduled alerts" eyebrow={items === null ? 'loading…' : `${items.length} pending`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-600">
          Auto-fired by the cron at T-60 / T-15 / kickoff for every upcoming match.
        </div>
        <button
          onClick={() => void refresh()}
          className="text-[10px] uppercase tracking-widest font-mono text-slate-500 hover:text-slate-900 px-2 py-1"
        >
          ↻ refresh
        </button>
      </div>
      {items === null ? <Loading /> : items.length === 0 ? (
        <Empty>Nothing queued. Either no upcoming matches in ESPN yet, or kickoff alerts are disabled in Settings.</Empty>
      ) : (
        <ul className="divide-y divide-slate-200">
          {items.map((it) => {
            const minutesAway = Math.round((it.fireAt - Date.now()) / 60_000)
            const stale = minutesAway < 0
            return (
              <li key={it.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-semibold text-sm text-slate-900 truncate">{it.title}</span>
                    {it.leadMinutes !== null && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-widest bg-slate-100 text-slate-600">
                        T-{it.leadMinutes}m
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    Fires {new Date(it.fireAt).toLocaleString()} · {stale ? `${-minutesAway}m ago` : `in ${minutesAway}m`}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap">
                  <button
                    onClick={() => postpone(it.id, 15)}
                    disabled={busy === it.id}
                    className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  >
                    +15m
                  </button>
                  <button
                    onClick={() => postpone(it.id, 30)}
                    disabled={busy === it.id}
                    className="px-2.5 py-1 rounded-full text-[11px] font-mono bg-slate-100 hover:bg-slate-200 disabled:opacity-40"
                  >
                    +30m
                  </button>
                  <button
                    onClick={() => cancel(it.id)}
                    disabled={busy === it.id}
                    className="px-2.5 py-1 rounded-full text-[11px] font-mono border border-accent-red text-accent-red hover:bg-accent-red/10 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {status && <div className="mt-3 text-sm font-mono text-accent-red">{status}</div>}
    </Section>
  )
}

// ─── Section: Email ─────────────────────────────────────────────────

function EmailPanel() {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!to || !subject || !text) { setStatus({ kind: 'err', text: 'To + subject + body required.' }); return }
    setBusy(true)
    setStatus(null)
    try {
      const r = await adminPost('/admin/email/send', { to, subject, text }) as { configured?: boolean; message?: string; id?: string }
      // Distinguish three outcomes:
      //   - configured=false → Resend secrets missing on the worker
      //   - has id → Resend returned the message id (real send OK)
      //   - other → surface message for debug
      if (r.configured === false) {
        setStatus({ kind: 'warn', text: `Not sent — Resend not configured on worker. ${r.message ?? ''}` })
      } else if (r.id) {
        setStatus({ kind: 'ok', text: `Sent ✓ Resend id: ${r.id}` })
      } else {
        setStatus({ kind: 'err', text: 'Unexpected response: ' + JSON.stringify(r) })
      }
    } catch (e) {
      setStatus({ kind: 'err', text: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Send a one-off email" eyebrow="Resend">
      <InputField label="To (email)" value={to} onChange={setTo} placeholder="user@example.com" />
      <InputField label="Subject" value={subject} onChange={setSubject} placeholder="Heads up — kickoff tomorrow" />
      <div className="mt-3">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Body (plain text)</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm h-36"
        />
      </div>
      <button onClick={send} disabled={busy} className="mt-4 px-5 py-2 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40">
        Send
      </button>
      {status && (
        <div className={
          'mt-3 px-3 py-2 rounded-lg text-sm font-mono whitespace-pre-wrap break-all border ' +
          (status.kind === 'ok'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : status.kind === 'warn'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-rose-50 text-rose-800 border-rose-200')
        }>
          {status.text}
        </div>
      )}
    </Section>
  )
}

// ─── Section: Database ──────────────────────────────────────────────

function Database() {
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([])
  const [brackets, setBrackets] = useState<Array<Record<string, unknown>>>([])
  // Defensive extract: Supabase REST occasionally returns an error
  // object ({code, message, ...}) instead of an array if the query
  // fails (RLS, bad column, etc.). Only commit the array shape so
  // the .length read in the eyebrow doesn't show 'undefined'.
  const asArray = (d: unknown): Array<Record<string, unknown>> => {
    const rows = (d as { rows?: unknown }).rows
    return Array.isArray(rows) ? rows : []
  }
  useEffect(() => {
    void adminGet('/admin/users').then((d) => setUsers(asArray(d)))
    void adminGet('/admin/brackets').then((d) => setBrackets(asArray(d)))
  }, [])
  // Derive columns from the first row instead of hardcoding — that way
  // we always show what's actually in the schema, even if the columns
  // change. Cap at 6 to keep the table readable.
  const columnsFor = (rows: Array<Record<string, unknown>>): string[] => {
    if (!rows.length) return []
    const keys = Object.keys(rows[0])
    // Push 'updated_at' to the right if present — it's metadata, not
    // the headline column.
    return keys.filter((k) => k !== 'updated_at').slice(0, 5).concat(keys.includes('updated_at') ? ['updated_at'] : [])
  }
  return (
    <>
      <Section title="Profiles" eyebrow={`${users.length} rows`}>
        <DataTable rows={users} columns={columnsFor(users)} />
      </Section>
      <Section title="Brackets" eyebrow={`${brackets.length} rows`}>
        <DataTable rows={brackets} columns={columnsFor(brackets)} />
      </Section>
    </>
  )
}

// ─── Section: Site health ───────────────────────────────────────────

function SiteHealth() {
  const [data, setData] = useState<{ espnOk?: boolean; espnMs?: number; kvOk?: boolean; kvReadOk?: boolean; kvWriteOk?: boolean; kvDetail?: string; serverTime?: string } | null>(null)
  useEffect(() => { void adminGet("/admin/site-health").then((d) => setData(d as any)) }, [])
  if (!data) return <Loading />
  // KV three-state derived from the read+write probes:
  //   reads + writes  → OK
  //   reads only      → READ-ONLY (free-tier daily put quota exhausted,
  //                     resets at midnight UTC — site keeps working
  //                     since the cron mostly reads)
  //   neither         → DOWN (KV unreachable, much rarer)
  const kvValue =
    data.kvReadOk && data.kvWriteOk ? 'OK'
    : data.kvReadOk ? 'READ-ONLY'
    : 'DOWN'
  const kvAccent: 'green' | 'gold' | 'red' =
    data.kvReadOk && data.kvWriteOk ? 'green'
    : data.kvReadOk ? 'gold'
    : 'red'
  return (
    <Section title="Site health" eyebrow="Live probes">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="ESPN API" value={data.espnOk ? `OK · ${data.espnMs}ms` : 'DOWN'} accent={data.espnOk ? 'green' : 'red'} />
        <KpiCard label="Cloudflare KV" value={kvValue} accent={kvAccent} />
        <KpiCard label="Server time UTC" value={data.serverTime?.slice(0, 19).replace('T', ' ') ?? '—'} mono />
        <KpiCard label="Worker" value="wc26-api" mono />
      </div>
      {kvValue === 'READ-ONLY' && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
          <strong className="font-semibold">KV writes paused for the day.</strong>{' '}
          The Cloudflare free tier caps puts at 1000/day. Reads still work,
          so the cron + most worker paths keep running — only new
          rate-limiter buckets, push-sentinels and other writes are
          skipped until midnight UTC. To remove the cap permanently,
          upgrade to Workers Paid ($5/mo, 100k+ puts/day).
          {data.kvDetail && (
            <div className="mt-1.5 font-mono text-[10px] text-amber-800 truncate">{data.kvDetail}</div>
          )}
        </div>
      )}
      {kvValue === 'DOWN' && data.kvDetail && (
        <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 leading-relaxed">
          <strong className="font-semibold">KV unreachable.</strong>{' '}
          <span className="font-mono text-[10px]">{data.kvDetail}</span>
        </div>
      )}
    </Section>
  )
}

// ─── Section: Quick actions ─────────────────────────────────────────

/**
 * Public site feature flags — persisted in Worker KV (site:settings) and
 * read by every visitor at boot. Each toggle saves immediately.
 */
function SiteSwitches() {
  type S = { wc26Visible: boolean; arabicArticles: boolean }
  const [s, setS] = useState<S | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    void adminGet('/admin/site/settings').then((d) => setS((d as { settings: S }).settings))
  }, [])
  async function toggle(key: keyof S, v: boolean) {
    if (!s) return
    const next = { ...s, [key]: v }
    setS(next)
    setMsg('Saving…')
    try {
      const r = await adminPost('/admin/site/settings', { settings: { [key]: v } }) as { settings?: S }
      if (r.settings) setS(r.settings)
      setMsg('✓ Saved — live for visitors within ~1 min (edge cache).')
    } catch (e) {
      setMsg('✗ ' + String(e))
    }
  }
  return (
    <Section title="Site switches" eyebrow="Visibility · Languages">
      {!s && <Loading />}
      {s && (
        <>
          <ToggleRow
            label="🏆 Show the WC26 archive on the site"
            sub="ON → nav entry “WC26 Archive”, mobile tab, home archive card, hero CTA and footer link are visible. OFF → all of them hidden. The /wc26, /team/*, /stadiums… URLs stay online and indexed either way — this only controls in-site visibility."
            checked={s.wc26Visible}
            onChange={(v) => toggle('wc26Visible', v)}
          />
          <div className="border-t border-slate-200 my-4" />
          <ToggleRow
            label="🇸🇦 Arabic articles (bilingual EN / AR)"
            sub="ON → every article you Approve is also translated to Modern Standard Arabic (gpt-oss-120b, sports-journalism register); the article page gets an EN / عربي toggle; the Facebook auto-post publishes TWO posts (English, then Arabic linking to ?lang=ar). Articles published while OFF stay EN-only — use “Translate → AR” in the News tab to add Arabic later."
            checked={s.arabicArticles}
            onChange={(v) => toggle('arabicArticles', v)}
          />
          {msg && (
            <div className={'mt-3 text-xs font-mono ' + (msg.startsWith('✓') ? 'text-emerald-700' : msg.startsWith('✗') ? 'text-rose-700' : 'text-slate-500')}>
              {msg}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

/**
 * Facebook automation ("l'usine") — worker/src/automation.ts. English
 * only. Master switch + per-output toggles, today's counters, the live
 * log and "run now" buttons for testing. Everything renders on the
 * Render studio and goes to Facebook through the Make webhooks.
 */
function AutomationPanel() {
  type S = {
    enabled: boolean; articles: boolean; articlesPerDay: number; matchday: boolean; morningHour: number
    ftPosts: boolean; ftPerDay: number; stories: boolean; storiesPerDay: number; reels: boolean
    goalAlerts: boolean; goalReelsPerDay: number; resultsReel: boolean; maxPostsPerDay?: number; barcaDaily?: boolean
    lineups?: boolean; barcaFtStyle?: 'poster' | 'reel'
    talesPerDay?: number; taleVariants?: number; taleVariantGapMin?: number; goalScope?: 'barca' | 'barca+morocco'
    goalAnim?: boolean; goalAnimPerDay?: number; goalAnimScope?: 'all' | 'barca'
    tiktok?: boolean; tiktokMode?: 'direct' | 'inbox'; tiktokPrivacy?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
    tales: boolean; taleDay: number; taleHour: number
    freeVoices: boolean
    taleLangs: { en: boolean; fr: boolean; ar: boolean }; taleGapMin: number
    taleAutoGen: boolean; taleOrder: string
    mainLang: 'ar' | 'en'; articleReels: boolean
  }
  type Status = {
    date: string; localTime: string
    counts: { article: number; ft: number; story: number; reel: number; post: number; goalreel?: number }
    config: { studio: boolean; studioUrl: string | null; studioHealth: { ok?: boolean; pending?: number; error?: unknown } | null; postWebhook: boolean; videoWebhook: boolean; pageToken: boolean }
    log: Array<{ t: string; job: string; ok: boolean; note: string }>
    tales?: Array<{ slug: string; title: string; done: boolean; custom: boolean; needsReview?: string; hold?: boolean }>
  }
  const [s, setS] = useState<S | null>(null)
  // Football Stories controls (Mehdi, 2026-09-10): pick a story, preview a language, publish now, generate a draft with AI.
  const [taleSlug, setTaleSlug] = useState('')
  const [taleLang, setTaleLang] = useState<'ar' | 'fr' | 'en'>('fr')
  const [taleSubject, setTaleSubject] = useState('')
  const [st, setSt] = useState<Status | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // Facebook token checker (Mehdi, 2026-09-08): validity + expiry + scopes,
  // link to the Graph API Explorer, and a field to paste a fresh token.
  type Tok = { ok: boolean; valid: boolean; source: string; note?: string; expiresAt: number | null; daysLeft: number | null; obtainedAt: number | null; scopes: string[]; missing: string[]; page: { id: string; name: string } | null; explorerUrl: string | null; error?: string; fbSaysNever?: boolean; dataAccessExpiresAt?: number | null }
  const [tok, setTok] = useState<Tok | null>(null)
  const [tokBusy, setTokBusy] = useState(false)
  const [tokInput, setTokInput] = useState('')
  // TikTok (2026-09-18): connection status + OAuth in a new tab; posting itself is a setting below.
  type TT = { ok: boolean; configured: boolean; connected: boolean; username?: string; nickname?: string; scope?: string; expiresAt?: number; refreshExpiresAt?: number; creator?: { privacy_level_options?: string[]; max_video_post_duration_sec?: number }; error?: string; redirectUri: string }
  const [tt, setTt] = useState<TT | null>(null)
  const [ttBusy, setTtBusy] = useState(false)
  const loadTikTok = useCallback(() => { void adminGet('/admin/tiktok/status').then((d) => setTt(d as TT)).catch(() => {}) }, [])
  async function connectTikTok() {
    setTtBusy(true)
    try { const r = await adminPost('/admin/tiktok/connect-url', {}) as { ok: boolean; url?: string; error?: string }; if (r.ok && r.url) window.open(r.url, '_blank', 'noopener'); else setMsg('✗ ' + (r.error ?? 'no url')) } catch (e) { setMsg('✗ ' + String(e)) }
    setTtBusy(false)
  }
  const checkToken = useCallback(() => {
    setTokBusy(true)
    void adminGet('/admin/automation/token').then((d) => setTok(d as Tok)).catch(() => {}).finally(() => setTokBusy(false))
  }, [])
  async function installToken() {
    const t = tokInput.trim()
    if (!t) return
    setTokBusy(true)
    setMsg('Installing the new token…')
    try {
      const r = await adminPost('/admin/automation/token', { token: t }) as Tok
      setTok(r)
      if (r.ok) { setTokInput(''); setMsg(`✓ Token installed · page ${r.page?.name ?? '?'}`) } else setMsg('✗ ' + (r.error ?? r.note ?? 'token rejected'))
    } catch (e) { setMsg('✗ ' + String(e)) }
    setTokBusy(false)
    refresh()
  }
  const refresh = useCallback(() => {
    void adminGet('/admin/automation/status').then((d) => setSt(d as Status)).catch(() => {})
  }, [])
  useEffect(() => {
    void adminGet('/admin/automation/settings').then((d) => setS((d as { settings: S }).settings))
    refresh()
    checkToken()
    loadTikTok()
    const id = window.setInterval(refresh, 60_000)
    return () => window.clearInterval(id)
  }, [refresh, checkToken])
  async function save(patch: Partial<S>) {
    if (!s) return
    setS({ ...s, ...patch })
    setMsg('Saving…')
    try {
      const r = await adminPost('/admin/automation/settings', { settings: patch }) as { settings?: S }
      if (r.settings) setS(r.settings)
      setMsg('✓ Saved')
    } catch (e) { setMsg('✗ ' + String(e)) }
  }
  async function run(job: string, extra: Record<string, unknown> = {}) {
    setBusy(job)
    setMsg(`Running ${job}…`)
    try {
      const r = await adminPost('/admin/automation/run', { job, ...extra }) as { ok: boolean; note: string }
      setMsg((r.ok ? '✓ ' : '✗ ') + r.note)
    } catch (e) { setMsg('✗ ' + String(e)) }
    setBusy(null)
    refresh()
  }
  const Num = ({ k, label }: { k: 'articlesPerDay' | 'ftPerDay' | 'storiesPerDay' | 'morningHour' | 'goalReelsPerDay' | 'taleDay' | 'taleHour' | 'taleGapMin' | 'maxPostsPerDay' | 'talesPerDay' | 'taleVariants' | 'taleVariantGapMin' | 'goalAnimPerDay'; label: string }) => (
    <label className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
      {label}
      <input
        type="number" min={0} max={k === 'morningHour' || k === 'taleHour' ? 23 : k === 'taleDay' ? 6 : k === 'goalReelsPerDay' ? 60 : k === 'taleGapMin' ? 600 : 30}
        value={s?.[k] ?? 0}
        onChange={(e) => save({ [k]: parseInt(e.target.value, 10) || 0 } as Partial<S>)}
        className="w-16 border border-slate-300 rounded px-2 py-1 text-slate-900 bg-white"
      />
    </label>
  )
  const Pill = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-mono ' + (ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>
      {ok ? '●' : '○'} {label}
    </span>
  )
  return (
    <Section title="Facebook automation" eyebrow="Usine · English only">
      {!s && <Loading />}
      {s && (
        <>
          <ToggleRow
            label="🤖 Master switch — automated publishing"
            sub="ON → the worker publishes on its own: morning match-day pack (post + stories + reel), full-time score posts, and articles without approval (English only, quality gates). OFF → nothing automatic; the manual studio keeps working as before."
            checked={s.enabled}
            onChange={(v) => save({ enabled: v })}
            accent="red"
          />
          <div className="border-t border-slate-200 my-4" />
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <ToggleRow label="📰 Articles — auto-publish" sub="Every 2 h the news cron produces one article; it goes live + FB post (split card) + story when it passes the gates (title, body ≥ 400 chars, image). Otherwise it stays a draft for you." checked={s.articles} onChange={(v) => save({ articles: v })} disabled={!s.enabled} />
              <Num k="articlesPerDay" label="max / day" />
            </div>
            <div className="space-y-3">
              <ToggleRow label="🌅 Morning match-day pack" sub="Post with today's big matches, story pages (6 matches each) and the reel with English voice + signature music." checked={s.matchday} onChange={(v) => save({ matchday: v })} disabled={!s.enabled} />
              <Num k="morningHour" label="at (Morocco time, h)" />
            </div>
            <div className="space-y-3">
              <ToggleRow label="⏱ Full-time score posts" sub="One post per finished big match (score card), at least 8 min apart." checked={s.ftPosts} onChange={(v) => save({ ftPosts: v })} disabled={!s.enabled} />
              <Num k="ftPerDay" label="max / day" />
            </div>
            <div className="space-y-3">
              <ToggleRow label="📱 Stories" sub="Match-day pages + one story per auto-published article (QR + “visit our profile”). Needs the FB_PAGE_TOKEN secret (Graph API) — Make has no story module." checked={s.stories} onChange={(v) => save({ stories: v })} disabled={!s.enabled} />
              <Num k="storiesPerDay" label="max / day" />
              <ToggleRow label="🎬 Match-day reel" sub="Rendered on the studio (ffmpeg), published through the Make video scenario (Reels API only as fallback — API reels do not render in the Facebook app). Link commented once Facebook has processed the video." checked={s.reels} onChange={(v) => save({ reels: v })} disabled={!s.enabled} />
              <ToggleRow label="⚽ Goal alerts (reels)" sub="Every minute the live score of the big competitions (big-5, Champions League, major cups) is compared with the previous one — each goal becomes an 8 s video (GOAL card, scorer, minute, music only — no voice) posted through Make, with the live link in a comment. Max 4 per match." checked={s.goalAlerts ?? true} onChange={(v) => save({ goalAlerts: v })} disabled={!s.enabled} />
              <Num k="goalReelsPerDay" label="max / day" />
              <Num k="maxPostsPerDay" label="· feed budget / day (posts + reels, anti-spam)" />
              <div className="flex items-center gap-3 text-[12px] text-slate-700 pl-1">
                <span className="font-semibold">🌍 Main language of posts &amp; voices</span>
                <select value={s.mainLang ?? 'ar'} onChange={(e) => save({ mainLang: e.target.value as 'ar' | 'en' })} disabled={!s.enabled} className="border border-slate-300 rounded px-2 py-1 text-slate-900 bg-white text-xs font-mono">
                  <option value="ar">🇲🇦 Arabic first (audience: 97 % Maghreb / Middle East)</option><option value="en">🇬🇧 English</option>
                </select>
              </div>
              <ToggleRow label="🎞 Article reels" sub="Digest reel every 2 published articles. Off after the 11 Sept audit: 2-3 s average play time, no engagement, Make operations wasted." checked={s.articleReels ?? false} onChange={(v) => save({ articleReels: v })} disabled={!s.enabled || !s.reels} />
              <ToggleRow label="🆓 Free production mode" sub="Switches every voice-over to the free engines: Orion (Workers AI) for English reels, MeloTTS for French stories, music + captions only for Arabic stories. No ElevenLabs credits spent while it is on. Turn it off to get Adam / Sarah / the Arabic narrator back." checked={s.freeVoices ?? false} onChange={(v) => save({ freeVoices: v })} disabled={!s.enabled} />
              <ToggleRow label="📖 Football Stories" sub="DAILY true-story reel (60–90 s, hook in the first 3 s, question in the comments) in Arabic, French and English, one language after the other, plus the article on the site (EN + AR). Hand-written bank first, then AI drafts from the verified subject bank." checked={s.tales ?? true} onChange={(v) => save({ tales: v })} disabled={!s.enabled} />
              <div className="flex gap-4 flex-wrap items-center"><Num k="taleHour" label="hour (Morocco)" /><Num k="taleGapMin" label="min between languages" />
                <label className="flex items-center gap-2 text-[11px] font-mono text-slate-500">order
                  <select value={s.taleOrder ?? 'en,ar,fr'} onChange={(e) => save({ taleOrder: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-slate-900 bg-white">
                    {['en,ar,fr', 'ar,en,fr', 'ar,fr,en', 'en,fr,ar', 'fr,en,ar', 'fr,ar,en'].map((o) => <option key={o} value={o}>{o.toUpperCase().replace(/,/g, ' → ')}</option>)}
                  </select>
                </label>
              </div>
              <ToggleRow label="🤖 Auto-generate stories" sub="Every morning at 09:00, when fewer than 2 unpublished stories remain, the next subject of the bank (23 verified fact sheets) is drafted by the AI: script in EN, fact-check pass against the fact sheet, then FR and AR. It shows up in the manual block with 🤖 so you can preview or delete it before 17:00." checked={s.taleAutoGen ?? true} onChange={(v) => save({ taleAutoGen: v })} disabled={!s.enabled || !s.tales} />
              <div className="flex gap-4 text-[12px] text-slate-700 pl-1">
                {(['ar', 'fr', 'en'] as const).map((l) => (
                  <label key={l} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={s.taleLangs?.[l] !== false} disabled={!s.enabled || !s.tales} onChange={(e) => save({ taleLangs: { en: s.taleLangs?.en !== false, fr: s.taleLangs?.fr !== false, ar: s.taleLangs?.ar !== false, [l]: e.target.checked } })} />
                    {l === 'ar' ? '🇲🇦 Arabic' : l === 'fr' ? '🇫🇷 French' : '🇬🇧 English'}
                  </label>
                ))}
              </div>
              <ToggleRow label="🔵🔴 Barça first" sub="The page's 5 150 followers came from a Barça fan page. Barça goals are always posted (only the global budget applies), the Barça match leads the matchday post/reel, a dedicated full-time reel replaces the score photo, one Barça article is fetched at 08:20 and the « برشلونة اليوم » digest reel (3 headlines, Arabic voice) goes out at 09:00. One Barça story a week in the Football Stories supply." checked={s.barcaDaily ?? true} onChange={(v) => save({ barcaDaily: v })} disabled={!s.enabled} />
              <div className="text-sm text-slate-700 py-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>📚 Football Stories:</span>
                <Num k="talesPerDay" label="stories / day (slots every 4 h from the story hour)" />
                <Num k="taleVariants" label="reels per story & language (same reel, different cover + caption)" />
                <Num k="taleVariantGapMin" label="min between variants" />
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-700 py-1">
                <span>⚽ Goal reels:</span>
                <select className="border border-slate-300 rounded px-2 py-1 text-sm" value={s.goalScope ?? 'barca'} onChange={(e) => save({ goalScope: e.target.value as 'barca' | 'barca+morocco' })} disabled={!s.enabled}>
                  <option value="barca">Barça matches only</option>
                  <option value="barca+morocco">Barça matches + Moroccan scorers</option>
                </select>
              </div>
              <ToggleRow label="🎬 « كيف جاء الهدف » goal recreations" sub="After each finished match of the pool: the best goal (ESPN shot coordinates) becomes a 60-70 s narrated schematic recreation — Arabic voice, broadcast-style overlays, six numbered steps, automatic layout + audio QA, follow-the-page ending. One render at a time (~30 min on the studio); not published when the audio QA reports a problem." checked={s.goalAnim ?? true} onChange={(v) => save({ goalAnim: v })} disabled={!s.enabled} />
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700 py-1">
                <span>🎬 Recreations:</span>
                <Num k="goalAnimPerDay" label="per day" />
                <select className="border border-slate-300 rounded px-2 py-1 text-sm" value={s.goalAnimScope ?? 'all'} onChange={(e) => save({ goalAnimScope: e.target.value as 'all' | 'barca' })} disabled={!s.enabled}>
                  <option value="all">every finished match of the day's pool</option>
                  <option value="barca">Barça matches only</option>
                </select>
              </div>
              <ToggleRow label="📋 Barça lineups (editorial)" sub="Predicted XI (the last confirmed XI) 6-3 h before kick-off, confirmed XI as soon as ESPN publishes it (~1 h before). Paper design, jerseys on the pitch." checked={s.lineups ?? true} onChange={(v) => save({ lineups: v })} disabled={!s.enabled} />
              <div className="flex items-center gap-3 text-sm text-slate-700 py-1">
                <span>⏱ Barça full time:</span>
                <select className="border border-slate-300 rounded px-2 py-1 text-sm" value={s.barcaFtStyle ?? 'poster'} onChange={(e) => save({ barcaFtStyle: e.target.value as 'poster' | 'reel' })} disabled={!s.enabled}>
                  <option value="poster">editorial poster (photo: score, scorers, player)</option>
                  <option value="reel">animated reel (confetti)</option>
                </select>
              </div>
              <ToggleRow label="⏱ Full-time results reel" sub="Once a day: every finished big match of the day (up to 10 slides, 3 s each, music only), posted when the last match is over or at 23:45 at the latest. Link in a comment." checked={s.resultsReel ?? true} onChange={(v) => save({ resultsReel: v })} disabled={!s.enabled} />
            </div>
          </div>
          <div className="border-t border-slate-200 my-4" />
          {st && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <Pill ok={st.config.studio && !!st.config.studioHealth?.ok} label={st.config.studio ? (st.config.studioHealth?.ok ? `studio up${st.config.studioHealth?.pending ? ` · ${st.config.studioHealth.pending} rendering` : ''}` : 'studio unreachable') : 'studio not configured'} />
                <Pill ok={st.config.postWebhook} label="Make · posts" />
                <Pill ok={st.config.videoWebhook} label="Make · videos (reels)" />
                <Pill ok={st.config.pageToken} label="Page token · stories + link comments" />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                {([['post', 'posts'], ['article', 'articles'], ['ft', 'FT'], ['story', 'stories'], ['reel', 'reels'], ['goalreel', 'goal reels']] as const).map(([k, l]) => (
                  <div key={k} className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-center">
                    <div className="font-display text-xl text-slate-900">{st.counts[k] ?? 0}</div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{l} today</div>
                  </div>
                ))}
              </div>
              {/* ── Facebook token ─────────────────────────────────── */}
              <div className={`rounded-xl border p-3 mb-3 ${tok ? (tok.ok && (tok.daysLeft === null || tok.daysLeft > 7) ? 'border-emerald-200 bg-emerald-50/50' : tok.ok ? 'border-amber-200 bg-amber-50/60' : 'border-rose-200 bg-rose-50/60') : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">🔑 Facebook access token</div>
                  <div className="flex gap-2">
                    <button type="button" disabled={tokBusy} onClick={checkToken} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 hover:bg-slate-50 disabled:opacity-50">{tokBusy ? '…' : '↻ Check now'}</button>
                    <a href={tok?.explorerUrl ?? 'https://developers.facebook.com/tools/explorer/'} target="_blank" rel="noreferrer" className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-mono text-blue-800 hover:bg-blue-100">↗ Graph API Explorer (new token)</a>
                  </div>
                </div>
                {tok ? (
                  <div className="mt-2 space-y-1.5 text-[12px] text-slate-700">
                    <div>
                      {tok.ok ? <span className="font-semibold text-emerald-700">✓ Valid</span> : tok.valid ? <span className="font-semibold text-amber-700">⚠ Valid but page not resolved</span> : <span className="font-semibold text-rose-700">✗ Invalid / expired</span>}
                      {tok.page && <span> · page <b>{tok.page.name}</b> ({tok.page.id})</span>}
                      <span className="text-slate-500"> · {tok.source}</span>
                    </div>
                    <div>
                      {tok.expiresAt === 0 || tok.expiresAt === null ? <span>Expiry: <b>{tok.valid ? 'never (long-lived Page token)' : 'unknown'}</b></span> : (
                        <span>Expires <b>{new Date(tok.expiresAt).toLocaleDateString('fr-FR')}</b> · <b className={tok.daysLeft !== null && tok.daysLeft <= 7 ? 'text-rose-700' : tok.daysLeft !== null && tok.daysLeft <= 15 ? 'text-amber-700' : 'text-emerald-700'}>{tok.daysLeft} days left</b> (auto-renewed by the worker when under 10 days{tok.fbSaysNever ? '; Facebook itself reports “never expires”' : ''})</span>
                      )}
                      {tok.dataAccessExpiresAt ? <span className="text-slate-500"> · data access until {new Date(tok.dataAccessExpiresAt).toLocaleDateString('fr-FR')}</span> : null}
                      {tok.obtainedAt ? <span className="text-slate-500"> · installed {new Date(tok.obtainedAt).toLocaleDateString('fr-FR')}</span> : null}
                    </div>
                    {tok.note && <div className="text-rose-700 break-words">{tok.note}</div>}
                    <div className="flex flex-wrap gap-1">
                      {tok.scopes.map((sc) => <span key={sc} className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-mono">{sc}</span>)}
                      {tok.missing.map((sc) => <span key={sc} className="rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 text-[10px] font-mono" title="required by the automation">missing: {sc}</span>)}
                    </div>
                  </div>
                ) : <div className="mt-2 text-[12px] text-slate-500">Checking…</div>}
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    type="password" autoComplete="off" spellCheck={false} placeholder="Paste a new User token from the Explorer (app “pressing 90 story”, all pages_* permissions) — it is exchanged for a 60-day token and stored server-side"
                    value={tokInput} onChange={(e) => setTokInput(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 bg-white"
                  />
                  <button type="button" disabled={tokBusy || tokInput.trim().length < 40} onClick={() => void installToken()} className="rounded-lg bg-slate-900 text-white px-4 py-2 text-xs font-mono hover:bg-slate-700 disabled:opacity-40">{tokBusy ? '…' : 'Install token'}</button>
                </div>
                <div className="mt-1 text-[10px] text-slate-500">In the Explorer: pick the app, User token → “Get User Access Token”, keep every pages_* permission + business_management, generate, copy, paste here. The value is never shown again. E-mail alerts to medplay.inc@gmail.com: ⚠️ at 14/10/7/5/3/2/1/0 days, 🚨 instantly when Facebook rejects the token, ✅ when the worker renews it.</div>
              </div>
              {/* ── TikTok (2026-09-18) ────────────────────────────── */}
              <div className={`rounded-xl border p-3 mb-3 ${tt?.connected ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/60'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">🎵 TikTok</div>
                  <div className="flex gap-2">
                    <button type="button" disabled={ttBusy || !tt?.configured} onClick={connectTikTok} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-700 hover:bg-slate-100 disabled:opacity-50">{tt?.connected ? '↻ Reconnect' : '🔗 Connect TikTok account'}</button>
                    <button type="button" onClick={loadTikTok} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-700 hover:bg-slate-100">Check</button>
                  </div>
                </div>
                <div className="mt-2 text-xs font-mono text-slate-600">
                  {!tt && 'checking…'}
                  {tt && !tt.configured && <>App not configured — set <code>TIKTOK_CLIENT_KEY</code> / <code>TIKTOK_CLIENT_SECRET</code> (wrangler secret put). Redirect URI to declare in the TikTok app: <code>{tt.redirectUri}</code></>}
                  {tt?.configured && !tt.connected && <>App configured, no account linked yet → Connect. Redirect URI: <code>{tt.redirectUri}</code></>}
                  {tt?.connected && <>Connected {tt.nickname ?? ''} {tt.username ? '@' + tt.username : ''} · scopes {tt.scope} · token renews itself (refresh valid until {tt.refreshExpiresAt ? new Date(tt.refreshExpiresAt).toLocaleDateString('fr-FR') : '?'}){tt.creator?.privacy_level_options ? <> · allowed privacy: {tt.creator.privacy_level_options.join(', ')} · max {tt.creator.max_video_post_duration_sec ?? '?'} s</> : null}{tt.error ? <span className="text-rose-600"> · {tt.error}</span> : null}</>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-700">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!s.tiktok} onChange={(e) => save({ tiktok: e.target.checked })} disabled={!s.enabled || !tt?.connected} /> post goal recreations to TikTok</label>
                  <select className="border border-slate-300 rounded px-2 py-1 text-sm" value={s.tiktokMode ?? 'direct'} onChange={(e) => save({ tiktokMode: e.target.value as 'direct' | 'inbox' })} disabled={!s.enabled}>
                    <option value="direct">direct post</option>
                    <option value="inbox">send to TikTok inbox (finish in the app)</option>
                  </select>
                  <select className="border border-slate-300 rounded px-2 py-1 text-sm" value={s.tiktokPrivacy ?? 'SELF_ONLY'} onChange={(e) => save({ tiktokPrivacy: e.target.value as NonNullable<S['tiktokPrivacy']> })} disabled={!s.enabled}>
                    <option value="SELF_ONLY">private (SELF_ONLY — unaudited app)</option>
                    <option value="FOLLOWER_OF_CREATOR">followers</option>
                    <option value="MUTUAL_FOLLOW_FRIENDS">friends</option>
                    <option value="PUBLIC_TO_EVERYONE">public (after TikTok audit)</option>
                  </select>
                </div>
              </div>
              {/* ── Football Stories: manual controls ─────────────────── */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-3 space-y-2">
                <div className="text-sm font-semibold text-slate-900">📖 Football Stories · manual</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select value={taleSlug} onChange={(e) => setTaleSlug(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono bg-white text-slate-900 max-w-full">
                    <option value="">next unpublished story</option>
                    {(st.tales ?? []).map((t) => <option key={t.slug} value={t.slug}>{t.done ? '✓ ' : ''}{t.custom ? '🤖 ' : ''}{t.needsReview ? '⚠️ ' : ''}{t.hold ? '⏸ ' : ''}{t.title}</option>)}
                  </select>
                  <select value={taleLang} onChange={(e) => setTaleLang(e.target.value as 'ar' | 'fr' | 'en')} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono bg-white text-slate-900">
                    <option value="ar">🇲🇦 Arabic</option><option value="fr">🇫🇷 French</option><option value="en">🇬🇧 English</option>
                  </select>
                  <button type="button" disabled={busy !== null} onClick={() => run('tale-preview', { slug: taleSlug || undefined, lang: taleLang, voice: true })} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 hover:bg-slate-50 disabled:opacity-50">👁 Preview (not published)</button>
                  <button type="button" disabled={busy !== null} onClick={() => { if (window.confirm('Publish this story now? Article on the site + reels in the enabled languages (posts to Facebook).')) void run('tale-next', { slug: taleSlug || undefined }) }} className="rounded-lg bg-slate-900 text-white px-3 py-1.5 text-xs font-mono hover:bg-slate-700 disabled:opacity-50">🚀 Publish now</button>
                  <button type="button" disabled={busy !== null || !taleSlug} title="Make this story the one published at the next daily slot (11:00)" onClick={() => void run('tale-pin', { slug: taleSlug })} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-mono text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">📌 Pin as next story</button>
                  {taleSlug && (st.tales ?? []).find((t) => t.slug === taleSlug)?.custom && (<>
                    <button type="button" disabled={busy !== null} onClick={() => { if (window.confirm('Delete this AI draft?')) void run('tale-delete', { slug: taleSlug }) }} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-mono text-rose-800 hover:bg-rose-100 disabled:opacity-50">🗑 Delete draft</button>
                    <button type="button" disabled={busy !== null} title="Re-run the Arabic editor pass on this AI draft (names, grammar, no Latin words)" onClick={() => void run('tale-polish', { slug: taleSlug })} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-mono text-amber-800 hover:bg-amber-100 disabled:opacity-50">✨ Re-polish Arabic</button>
                    <button type="button" disabled={busy !== null} title="Keep this draft for a later day (the daily run skips it) — click again to release it" onClick={() => void run('tale-hold', { slug: taleSlug, hold: !(st.tales ?? []).find((t) => t.slug === taleSlug)?.hold })} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-700 hover:bg-slate-100 disabled:opacity-50">{(st.tales ?? []).find((t) => t.slug === taleSlug)?.hold ? '▶ Release' : '⏸ Hold for later'}</button>
                  </>)}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={taleSubject} onChange={(e) => setTaleSubject(e.target.value)} placeholder="Generate a new story with AI — subject, e.g. “Ali Dia, the fake cousin of George Weah, Southampton 1996”" className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 bg-white" />
                  <button type="button" disabled={busy !== null || taleSubject.trim().length < 6} onClick={() => void run('tale-generate', { subject: taleSubject.trim() })} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-mono text-blue-800 hover:bg-blue-100 disabled:opacity-40">🤖 Generate draft (≈3 min)</button>
                </div>
                <div className="text-[10px] text-slate-500">The draft (EN → FR → AR, 10 beats, article, captions, question) appears in the list with 🤖 when the log says “DRAFT READY”. Verify the facts, preview it, then publish. The daily schedule keeps picking the next unpublished story.</div>
                {/* Previews rendered by the studio (render-only, never published): playable right here. */}
                {(() => {
                  const rows = (st.log ?? []).filter((e) => e.job.startsWith('preview')).slice(0, 6)
                  if (rows.length === 0) return null
                  return (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="text-[11px] font-mono text-slate-500 mb-1">Previews (not published) — a render takes 5 to 12 minutes; this list refreshes every minute</div>
                      <div className="flex flex-wrap gap-3">
                        {rows.map((e) => {
                          const m = e.note.match(/https:\/\/\S+\.mp4/)
                          const url = m ? m[0] : null
                          const label = `${e.job.replace('preview-', '')} · ${e.t.slice(11, 16)}Z`
                          return (
                            <div key={e.t + e.job} className="w-[150px]">
                              {url ? (
                                <video src={url} controls preload="metadata" className="w-[150px] rounded-lg bg-black aspect-[9/16]" />
                              ) : (
                                <div className="w-[150px] aspect-[9/16] rounded-lg bg-slate-200 flex items-center justify-center text-[11px] text-slate-600 text-center px-2">{e.ok ? 'rendering…' : 'failed'}</div>
                              )}
                              <div className="text-[10px] font-mono text-slate-600 mt-1 truncate">{label}</div>
                              {url && <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700 underline">open</a>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mb-2">{st.date} · {st.localTime} Morocco</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {([['test-image', '🖼 Test image'], ['test-voice', '🔊 Test voice'], ['test-story', '📱 Test story (posts to FB!)'], ['test-video', '🎬 Test video (posts to FB!)'], ['test-goal', '⚽ Test goal reel (preview only)'], ['results-preview', '⏱ Results reel (preview only)'], ['results', '⏱ Results reel now (posts to FB!)'], ['token-check', '🔑 Token check (mails if needed)'], ['token-mail-test', '✉️ Test token e-mail'], ['tales', '📖 Stories bank'], ['matchday', '🌅 Run match-day now'], ['ft', '⏱ FT pass now'], ['cleanup', '🧹 Cleanup media']] as const).map(([job, label]) => (
                  <button key={job} type="button" disabled={busy !== null} onClick={() => run(job)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                    {busy === job ? '…' : label}
                  </button>
                ))}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                {st.log.length === 0 && <div className="p-3 text-xs font-mono text-slate-400">No automation activity today.</div>}
                {st.log.map((e, i) => (
                  <div key={i} className="p-2 text-[11px] font-mono flex gap-2 items-start">
                    <span className={e.ok ? 'text-emerald-600' : 'text-rose-600'}>{e.ok ? '✓' : '✗'}</span>
                    <span className="text-slate-400 shrink-0">{new Date(e.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-slate-700 shrink-0">{e.job}</span>
                    <span className="text-slate-500 break-all">{/https?:\/\/\S+/.test(e.note) ? (
                      <>
                        {e.note.replace(/https?:\/\/\S+/, '')}
                        <a className="text-blue-600 underline" href={e.note.match(/https?:\/\/\S+/)![0]} target="_blank" rel="noreferrer">open</a>
                      </>
                    ) : e.note}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {msg && (
            <div className={'mt-3 text-xs font-mono break-all ' + (msg.startsWith('✓') ? 'text-emerald-700' : msg.startsWith('✗') ? 'text-rose-700' : 'text-slate-500')}>
              {/https?:\/\/\S+/.test(msg) ? <>{msg.replace(/https?:\/\/\S+/, '')} <a className="underline" href={msg.match(/https?:\/\/\S+/)![0]} target="_blank" rel="noreferrer">open</a></> : msg}
            </div>
          )}
        </>
      )}
    </Section>
  )
}

// ─── Facebook Insights (playbook / KPI guide, 2026-09-18) ─────────────────
type InsightReel = { id: string; when: string; title: string; views: number; length: number; completion: number | null; replays?: number; shares?: number; comments?: number; likes?: number; link?: string; kind: string; lang: 'ar' | 'en'; hour: number | null; action: string }
type InsightGroup = { by: 'length' | 'kind' | 'lang' | 'hour'; rows: Array<{ key: string; n: number; medViews: number; medCompletion: number | null; totalViews: number }> }
type InsightsData = {
  ok: boolean; error?: string; generatedAt: string; days: number; note?: string
  review: { count: number; reels: InsightReel[]; account: { medianViews: number | null; medianCompletion: number | null; medianShareRate: number | null; perDay: number; totalViews: number; totalComments: number; totalReplays: number; insights: boolean }; actions: string[]; recommendations: string[]; groups: InsightGroup[] }
  page: { series: Record<string, Array<{ date: string; value: number }>>; current: Record<string, number>; previous: Record<string, number> }
}
const KIND_FR: Record<string, string> = { goal: 'reel de but', analysis: 'analyse de but', matchday: 'matchs du jour', results: 'résultats', barca: 'برشلونة اليوم', articles: 'articles', story: 'histoire' }
const GROUP_FR: Record<InsightGroup['by'], string> = { length: 'Durée', kind: 'Format', lang: 'Langue', hour: 'Créneau' }
function delta(cur?: number, prev?: number): { text: string; accent?: 'green' | 'red' } {
  if (cur == null) return { text: '—' }
  if (!prev) return { text: cur.toLocaleString() }
  const p = (cur - prev) / prev
  return { text: `${cur.toLocaleString()} (${p >= 0 ? '+' : ''}${Math.round(p * 100)} %)`, accent: p >= 0 ? 'green' : 'red' }
}
function Insights() {
  const [days, setDays] = useState<7 | 14 | 30>(7)
  const [d, setD] = useState<InsightsData | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback((refresh: boolean) => {
    setBusy(true)
    void adminGet(`/admin/automation/insights?days=${days}&limit=${days > 7 ? 50 : 25}${refresh ? '&refresh=1' : ''}`).then((x) => setD(x as InsightsData)).catch(() => setD({ ok: false, error: 'network' } as InsightsData)).finally(() => setBusy(false))
  }, [days])
  useEffect(() => { load(false) }, [load])
  const r = d?.ok ? d.review : null
  const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)} %`)
  const reach = delta(d?.page?.current?.page_impressions_unique, d?.page?.previous?.page_impressions_unique)
  const vviews = delta(d?.page?.current?.page_video_views, d?.page?.previous?.page_video_views)
  const followsNow = d?.page?.current?.page_follows, followsPrev = d?.page?.previous?.page_follows
  const follows = followsNow != null && followsPrev != null ? `${followsNow - followsPrev >= 0 ? '+' : ''}${(followsNow - followsPrev).toLocaleString()} (${followsNow.toLocaleString()})` : (d?.page?.current?.page_daily_follows_net ?? '—')
  const series = d?.page?.series?.page_video_views ?? d?.page?.series?.page_impressions_unique ?? []
  const maxS = Math.max(1, ...series.map((v) => v.value))
  const sorted = r ? [...r.reels].sort((a, b) => (b.completion ?? -1) - (a.completion ?? -1) || b.views - a.views) : []
  return (
    <>
      <Section eyebrow="Facebook · playbook 2026" title="📊 Insights & recommandations">
        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
          {([7, 14, 30] as const).map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`px-3 py-1 rounded-full text-xs font-mono border ${days === n ? 'bg-ink-900 text-white border-ink-900' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`} style={days === n ? { color: '#fff' } : undefined}>{n} j</button>
          ))}
          <button onClick={() => load(true)} disabled={busy} className="px-3 py-1 rounded-full text-xs font-mono border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50">{busy ? '⏳ lecture Facebook…' : '↻ Actualiser (Graph API)'}</button>
          {d?.ok && <span className="text-xs text-slate-500 font-mono">généré {new Date(d.generatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · cache 6 h</span>}
        </div>
        {d && !d.ok && <ConfigBanner message={`Insights indisponibles : ${d.error ?? 'erreur'}`} />}
        {d?.note && <ConfigBanner message={d.note} />}
        {!d && <div className="text-sm text-slate-500">Chargement des statistiques de la page…</div>}
        {r && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <KpiCard label={`Reels · ${days} j`} value={r.count} />
              <KpiCard label="Vues médianes / reel" value={r.account.medianViews ?? '—'} />
              <KpiCard label="Complétion médiane" value={pct(r.account.medianCompletion)} accent={r.account.medianCompletion != null ? (r.account.medianCompletion >= 0.6 ? 'green' : r.account.medianCompletion < 0.35 ? 'red' : 'gold') : undefined} />
              <KpiCard label="Replays · commentaires" value={`${r.account.totalReplays} · ${r.account.totalComments}`} mono />
              <KpiCard label={`Portée page (${days} j vs préc.)`} value={reach.text} accent={reach.accent} mono />
              <KpiCard label={`Vues vidéo page (${days} j vs préc.)`} value={vviews.text} accent={vviews.accent} mono />
              <KpiCard label={`Abonnés net (${days} j) · total`} value={follows} mono />
              <KpiCard label="Reels / jour" value={r.account.perDay.toFixed(1)} accent={r.account.perDay > 5 ? 'red' : undefined} />
            </div>
            {series.length > 0 && (
              <div className="mb-5">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">Vues vidéo de la page par jour</div>
                <div className="flex items-end gap-1 h-20 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                  {series.map((v) => (
                    <div key={v.date} title={`${v.date}: ${v.value.toLocaleString()}`} className="flex-1 bg-ink-900/80 rounded-sm" style={{ height: `${Math.max(3, Math.round((v.value / maxS) * 100))}%` }} />
                  ))}
                </div>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="text-[10px] uppercase tracking-widest text-amber-700 font-mono mb-2">Recommandations pour améliorer les vues</div>
                {r.recommendations.length === 0 && <div className="text-sm text-slate-600">Pas assez de reels sur la période pour comparer.</div>}
                <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-800">{r.recommendations.map((x, i) => <li key={i}>{x}</li>)}</ol>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">Diagnostic du compte (guide KPIs)</div>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">{(r.actions.length ? r.actions : ['rien à signaler']).map((x, i) => <li key={i}>{x}</li>)}</ul>
                <div className="mt-3 text-xs text-slate-500">Ordre de lecture : complétion → replays → partages → commentaires → vues. Les abonnés mesurent la fidélité, pas la portée.</div>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {r.groups.map((g) => (
                <div key={g.by} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-2">{GROUP_FR[g.by]}</div>
                  <table className="w-full text-xs"><tbody>
                    {g.rows.map((row) => (
                      <tr key={row.key} className="border-t border-slate-100">
                        <td className="py-1 pr-2 text-slate-700">{g.by === 'kind' ? (KIND_FR[row.key] ?? row.key) : g.by === 'lang' ? (row.key === 'ar' ? 'arabe' : 'anglais') : row.key}</td>
                        <td className="py-1 pr-2 text-slate-400 font-mono">{row.n}</td>
                        <td className="py-1 pr-2 font-mono text-right">{row.medViews.toLocaleString()} v</td>
                        <td className="py-1 font-mono text-right text-slate-500">{pct(row.medCompletion)}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              ))}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">Reels, classés par complétion</div>
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-xs min-w-[720px]">
                <thead className="bg-slate-50 text-slate-500 font-mono text-[10px] uppercase sticky top-0"><tr>
                  <th className="text-left p-2">Quand</th><th className="text-left p-2">Reel</th><th className="text-right p-2">Durée</th><th className="text-right p-2">Vues</th><th className="text-right p-2">Complétion</th><th className="text-right p-2">Replays</th><th className="text-right p-2">Comm.</th><th className="text-left p-2">Action</th>
                </tr></thead>
                <tbody>
                  {sorted.map((x) => (
                    <tr key={x.id} className="border-t border-slate-100 align-top">
                      <td className="p-2 font-mono text-slate-400 whitespace-nowrap">{x.when ? new Date(x.when).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="p-2 text-slate-800">{x.link ? <a className="underline decoration-slate-300 hover:decoration-slate-700" href={x.link} target="_blank" rel="noreferrer">{x.title || x.id}</a> : (x.title || x.id)}<span className="ml-1 text-[10px] text-slate-400 font-mono">{KIND_FR[x.kind] ?? x.kind} · {x.lang}</span></td>
                      <td className="p-2 font-mono text-right text-slate-500">{Math.round(x.length)} s</td>
                      <td className="p-2 font-mono text-right">{x.views.toLocaleString()}</td>
                      <td className={`p-2 font-mono text-right ${x.completion == null ? 'text-slate-400' : x.completion >= 0.6 ? 'text-emerald-600' : x.completion < 0.35 ? 'text-rose-600' : 'text-amber-600'}`}>{pct(x.completion)}</td>
                      <td className="p-2 font-mono text-right text-slate-500">{x.replays ?? '—'}</td>
                      <td className="p-2 font-mono text-right text-slate-500">{x.comments ?? '—'}</td>
                      <td className="p-2 text-slate-600">{x.action}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && <tr><td colSpan={8} className="p-3 text-slate-400 font-mono">Aucun reel sur la période.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-slate-500">Complétion = temps moyen regardé ÷ durée (Facebook inclut les replays : &gt; 100 % possible). Revue automatique chaque lundi 09:05 dans le journal (« playbook-review »). Règles : <code>docs/playbook/</code>.</div>
          </>
        )}
      </Section>
    </>
  )
}

function QuickActions() {
  const [status, setStatus] = useState<string | null>(null)
  async function clearCache(prefix: string) {
    setStatus(`Clearing cache prefix '${prefix}'…`)
    const r = await adminPost('/admin/cache/clear', { prefix })
    setStatus(`Cleared ${(r as { deleted: number }).deleted} keys.`)
  }
  return (
    <>
    <SiteSwitches />
    <AutomationPanel />
    <Section title="Quick actions" eyebrow="Maintenance">
      <div className="grid sm:grid-cols-2 gap-3">
        <ActionButton title="Force ESPN cache refresh" onClick={() => clearCache('scoreboard')}>
          Clear KV keys with prefix <code>scoreboard</code> — next visit pulls fresh data from ESPN.
        </ActionButton>
        <ActionButton title="Clear team cache" onClick={() => clearCache('team:')}>
          Clear KV keys with prefix <code>team:</code> — useful when ESPN updates roster info.
        </ActionButton>
        <ActionButton title="Clear push kickoff alerts" onClick={() => clearCache('alert:kickoff:')}>
          Reset the kickoff-alert sentinels — allows re-broadcasting if a previous one was rolled back.
        </ActionButton>
        <ActionButton title="Clear rate limiter buckets" onClick={() => clearCache('rate:')}>
          Lift all per-IP rate-limit counters. Use sparingly.
        </ActionButton>
      </div>
      {status && <div className="mt-4 text-sm font-mono text-slate-600">{status}</div>}
    </Section>
    </>
  )
}

// ─── Reusable bits ─────────────────────────────────────────────────

function Section({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 sm:mb-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      {eyebrow && <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-mono mb-1">{eyebrow}</div>}
      <h2 className="font-display font-bold text-lg sm:text-xl text-slate-900 mb-3 sm:mb-4">{title}</h2>
      {children}
    </section>
  )
}

function KpiCard({ label, value, accent, mono }: { label: string; value: number | string; accent?: 'gold' | 'green' | 'red'; mono?: boolean }) {
  const accentClass =
    accent === 'gold' ? 'text-accent-gold'
    : accent === 'green' ? 'text-emerald-600'
    : accent === 'red' ? 'text-accent-red'
    : 'text-slate-900'
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">{label}</div>
      <div className={`font-display font-bold text-2xl ${accentClass} ${mono ? 'font-mono text-sm' : ''}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mt-3">
      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm"
      />
    </div>
  )
}

// URL = the relative path the user lands on when they tap the
// notification. A typo here is a wasted alert (404 page or wrong
// section), so the dropdown enforces consistency on the common
// destinations and a CUSTOM option still allows arbitrary deep links
// like /news/<slug> or /team/MAR.
const URL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '/',            label: '/ · Home' },
  { value: '/today',       label: '/today · Today\'s matches' },
  { value: '/wc26',        label: '/wc26 · WC26 hub' },
  { value: '/predictions', label: '/predictions · Bracket' },
  { value: '/board',       label: '/board · Leaderboard' },
  { value: '/news',        label: '/news · News index' },
  { value: '/stadiums',    label: '/stadiums · Stadiums' },
]
const URL_CUSTOM = '__custom__'

function UrlPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = URL_OPTIONS.find((o) => o.value === value)
  const isCustom = !known
  return (
    <div className="mt-3">
      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
        URL · where the tap lands
      </label>
      <select
        value={isCustom ? URL_CUSTOM : value}
        onChange={(e) => onChange(e.target.value === URL_CUSTOM ? '' : e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm"
      >
        {URL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        <option value={URL_CUSTOM}>Custom path…</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/news/some-slug or /team/MAR"
          className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm"
        />
      )}
      <div className="mt-1 text-[10px] text-slate-400 font-mono">
        Must start with <code>/</code>. Use slugs for articles
        (<code>/news/&lt;slug&gt;</code>), abbreviations for teams
        (<code>/team/MAR</code>).
      </div>
    </div>
  )
}

// TAG groups notifications — a newer one with the same tag REPLACES
// the previous in the iOS notification tray instead of stacking up.
// Examples: kickoff alerts for the same match share a tag so reading
// the latest one auto-clears the older. Free-form is allowed but we
// list the conventions the app already uses.
const TAG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',                  label: '— none (each notif stacks separately) —' },
  { value: 'manual',            label: 'manual · ad-hoc operator broadcast' },
  { value: 'match-upcoming',    label: 'match-upcoming · pre-kickoff hype' },
  { value: 'kickoff',           label: 'kickoff · match start' },
  { value: 'goal',              label: 'goal · score change' },
  { value: 'ft',                label: 'ft · full-time' },
  { value: 'article',           label: 'article · news drop' },
  { value: 'section-update',    label: 'section-update · in-app destination' },
  { value: 'test',              label: 'test · QA / debug' },
]
const TAG_CUSTOM = '__custom__'

function TagPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = TAG_OPTIONS.find((o) => o.value === value)
  const isCustom = !!value && !known
  return (
    <div className="mt-3">
      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
        Tag · groups notifications (newer replaces older)
      </label>
      <select
        value={isCustom ? TAG_CUSTOM : value}
        onChange={(e) => onChange(e.target.value === TAG_CUSTOM ? '' : e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm"
      >
        {TAG_OPTIONS.map((o) => (
          <option key={o.value || 'none'} value={o.value}>{o.label}</option>
        ))}
        <option value={TAG_CUSTOM}>Custom tag…</option>
      </select>
      {isCustom && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. match-upcoming-401702103"
          className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm"
        />
      )}
      <div className="mt-1 text-[10px] text-slate-400 font-mono">
        Match / article presets append the match id or slug for you,
        so each match's alerts are grouped together but distinct from
        another match.
      </div>
    </div>
  )
}

function ActionButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl border border-slate-200 bg-slate-50/60 p-4 hover:bg-slate-100 transition-colors">
      <div className="font-display font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-600">{children}</div>
    </button>
  )
}

function DataTable({ rows, columns }: { rows: Array<Record<string, unknown>>; columns: string[] }) {
  if (!rows.length) return <Empty>No rows.</Empty>
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="min-w-full text-xs font-mono">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-200">
            {columns.map((c) => <th key={c} className="px-2 py-1.5 uppercase tracking-widest text-[10px]">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((r, i) => (
            <tr key={i} className="border-b border-slate-100">
              {columns.map((c) => (
                <td key={c} className="px-2 py-1.5 align-top">
                  <span className="block max-w-[200px] truncate">{String((r[c] ?? '—') as React.ReactNode)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <div className="mt-2 text-[10px] font-mono text-slate-400">Showing first 50 of {rows.length} rows.</div>
      )}
    </div>
  )
}

function ConfigBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <strong className="font-semibold">Not configured — showing sample data.</strong>{' '}
      {message}
    </div>
  )
}

function Loading() { return <div className="text-sm font-mono text-slate-400">loading…</div> }
function Empty({ children }: { children: React.ReactNode }) { return <div className="text-sm text-slate-500">{children}</div> }

// ─── Helpers ─────────────────────────────────────────────────────────

function authHeader(): Record<string, string> {
  const t = getToken()
  return t ? { authorization: `Bearer ${t}` } : {}
}
async function adminGet(path: string): Promise<unknown> {
  const r = await fetch(`${API_BASE}${path}`, { headers: { ...authHeader() } })
  return r.json()
}
async function adminPost(path: string, body: unknown): Promise<unknown> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader() },
    body: JSON.stringify(body),
  })
  return r.json()
}

function setMeta(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!tag) { tag = document.createElement('meta'); tag.name = name; document.head.appendChild(tag) }
  tag.content = content
}

// Point the PWA manifest + iOS apple-* tags at the admin-only variant so
// iOS "Add to Home Screen" registers /admin-panel-1992 as the start_url,
// then revert on unmount. Without this, the saved icon opens the public
// site instead of the operator console.
//
// iOS Safari re-reads these head tags at the moment "Add to Home Screen"
// is tapped, so a runtime swap is enough — no SSR or static-HTML route
// is needed.
function swapPWAMetaForAdmin(): () => void {
  const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null
  const themeTag = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
  const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null
  const appleIcons = document.querySelectorAll('link[rel="apple-touch-icon"]')
  const origManifest = link?.getAttribute('href') ?? null
  const origTheme = themeTag?.getAttribute('content') ?? null
  const origTitle = appleTitle?.getAttribute('content') ?? null
  const origIcons = Array.from(appleIcons).map((el) => el.getAttribute('href'))
  // Only one canonical manifest now — the admin lives at
  // admin.pressing90.live/visca-barca and nowhere else. The legacy
  // path-based URL serves a honeypot, not this component.
  link?.setAttribute('href', '/admin-manifest.json')
  themeTag?.setAttribute('content', '#0a1a2e')
  appleTitle?.setAttribute('content', 'P90 Admin')
  // PNG, not SVG — iOS Safari falls back to the favicon when the
  // apple-touch-icon SVG can't be decoded reliably.
  appleIcons.forEach((el) => {
    const size = el.getAttribute('sizes')
    el.setAttribute('href', size === '180x180' ? '/admin-icon-180.png' : '/admin-icon-192.png')
  })
  return () => {
    if (origManifest !== null) link?.setAttribute('href', origManifest)
    if (origTheme !== null) themeTag?.setAttribute('content', origTheme)
    if (origTitle !== null) appleTitle?.setAttribute('content', origTitle)
    appleIcons.forEach((el, i) => {
      const o = origIcons[i]
      if (o !== null && o !== undefined) el.setAttribute('href', o)
    })
  }
}

// ─── News tab — manage AI-drafted articles ─────────────────────────
//
// Lists the 50 most recent drafts (default) and lets the editor:
//   • Approve  → status=published
//   • Reject   → status=archived
//   • Delete   → hard delete
//   • Preview body in an expand-on-click panel
//
// Has a status filter (draft / published / archived) and a "Trigger now"
// button to manually fire the cron pipeline for testing.

interface Article {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body: string
  image_url: string | null
  source_url: string
  source_name: string
  score: number | null
  status: 'draft' | 'published' | 'archived'
  /** When true, the home-page NewsTicker carousel shows this article
   *  in its first 2 pages. Toggled via the pin/unpin actions. */
  pinned_to_home?: boolean
  title_ar?: string | null
  created_at: string
  published_at: string | null
  archived_at: string | null
}

interface PolledCandidate {
  link: string
  title: string
  description: string
  source: string
  score: number
  pubDate: number
  imageUrl?: string
  redditScore?: number
}

const ALL_POLL_SOURCES = [
  'ESPN FC', 'BBC Sport', 'Goal', 'Sky Sports', 'The Guardian', 'FIFA', 'Footmercato',
] as const

function News() {
  const [status, setStatus] = useState<'draft' | 'published' | 'archived' | 'reels'>('draft')
  const [items, setItems] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // 10 candidate articles returned by /poll. The operator picks one
  // and we call /produce to AI-rewrite + save as draft.
  const [candidates, setCandidates] = useState<PolledCandidate[] | null>(null)
  // Story generator modal — opened from a published article's row.
  const [storyFor, setStoryFor] = useState<Article | null>(null)
  // Reel composer modal — opened from the 'reels' studio tab.
  const [reel, setReel] = useState<{ mode: 'article' | 'matchday'; article: Article | null } | null>(null)
  // Voiceless match-day story image(s) — third studio card.
  const [matchStory, setMatchStory] = useState(false)
  // Optional keyword to narrow the poll — empty = base poll (same as before).
  const [pollKeyword, setPollKeyword] = useState('')
  // Which sources to include in the next poll. All enabled by default.
  const [pollSources, setPollSources] = useState<Set<string>>(new Set(ALL_POLL_SOURCES))
  function togglePollSource(s: string) {
    setPollSources((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }
  // Sources dropdown (replaced the chip wall — it crowded the section,
  // especially on mobile). Closes on outside tap / Escape.
  const [srcOpen, setSrcOpen] = useState(false)
  const srcRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!srcOpen) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (srcRef.current && !srcRef.current.contains(e.target as Node)) setSrcOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setSrcOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [srcOpen])

  async function load() {
    // The 'reels' tab is a studio, not an article status — it still
    // needs the published list (for the article-reel picker).
    const listStatus = status === 'reels' ? 'published' : status
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/admin/news/list?status=${listStatus}`, {
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!r.ok) throw new Error(String(r.status))
      const data = await r.json() as { articles: Article[] }
      // Football Stories articles are produced by their own pipeline (Actions → Football Stories);
      // keep them out of the article-reel studio so nobody renders them as an article reel by mistake.
      setItems((data.articles ?? []).filter((x) => status !== 'reels' || !x.slug.startsWith('story-')))
    } catch (e) {
      setMsg('Load failed: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [status])

  async function act(id: string, action: 'approve' | 'reject' | 'delete' | 'unpublish' | 'republish' | 'pin' | 'unpin' | 'share-facebook' | 'translate-ar') {
    if (action === 'delete' && !confirm('Delete this article permanently?')) return
    setBusy(id + ':' + action)
    setMsg(null)
    // Branded FB post card: generated here in the browser (the worker
    // can't render canvases) and uploaded BEFORE the publish call so
    // the worker attaches it to the Facebook post(s). Silent failure =
    // the post falls back to the raw article image.
    if (action === 'approve' || action === 'share-facebook') {
      const art = items.find((x) => x.id === id)
      if (art) await uploadPostCards(art, getToken() ?? '')
    }
    try {
      const r = await fetch(`${API_BASE}/admin/news/${id}/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!r.ok) throw new Error(await r.text())
      // share-facebook doesn't change DB state, so skip the reload for it.
      setMsg(action === 'share-facebook' ? '✓ Publié sur Facebook' : action === 'translate-ar' ? '✓ Traduction arabe générée' : `✓ ${action}`)
      if (action !== 'share-facebook') await load()
    } catch (e) {
      setMsg('Error: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Poll = ask the worker for the top 10 candidates (filtered by dedup
   * against everything already in DB). Replaces the previous instant
   * 'trigger' flow with an explicit pick step.
   */
  async function poll(mode?: 'botola') {
    setBusy(mode === 'botola' ? 'poll-botola' : 'poll')
    setMsg(null)
    try {
      const kw = pollKeyword.trim()
      const params = new URLSearchParams()
      if (kw) params.set('keyword', kw)
      if (mode) params.set('mode', mode)
      if (!mode && pollSources.size < ALL_POLL_SOURCES.length) {
        params.set('sources', [...pollSources].join(','))
      }
      const qs = params.toString() ? '?' + params.toString() : ''
      const r = await fetch(`${API_BASE}/admin/news/poll${qs}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json() as { candidates: PolledCandidate[]; diagnostics: Record<string, unknown> }
      setCandidates(data.candidates)
      if (data.candidates.length === 0) {
        setMsg(mode === 'botola'
          ? 'No fresh Botola candidates — Moroccan outlets may be quiet right now, try again later.'
          : kw
          ? `No candidates match "${kw}" — try a broader term or another poll without the keyword.`
          : 'No fresh candidates — RSS feeds may be slow or all top items are already in DB. Try again later.')
      } else {
        setMsg(`✓ ${data.candidates.length}${mode === 'botola' ? ' Botola' : ''} candidates ready${kw ? ` for "${kw}"` : ''} — pick one to produce`)
      }
    } catch (e) {
      setMsg('Poll failed: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Reject = persist a "never show this again" marker. The worker
   * inserts a minimal articles row with status='archived', so the same
   * source_url stops showing up in future polls (the dedup pass at
   * fetchAllSourceUrls picks up archived rows too).
   */
  async function rejectCandidate(c: PolledCandidate) {
    setBusy('reject:' + c.link)
    setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/admin/news/reject-candidate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${getToken() ?? ''}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ candidate: { link: c.link, title: c.title, source: c.source } }),
      })
      if (!r.ok) throw new Error(await r.text())
      // Drop the rejected candidate locally; the dedup persists server-side.
      setCandidates((prev) => prev?.filter((x) => x.link !== c.link) ?? null)
      setMsg(`✓ Rejected — won't resurface in future polls`)
    } catch (e) {
      setMsg('Reject failed: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Produce = the operator chose candidate `i` from the polled list.
   * Worker AI-rewrites + inserts a draft + emails. Then we refresh
   * the drafts list and remove this candidate from the picker (so the
   * other 5 stay visible if the operator wants to produce more).
   */
  async function produce(candidate: PolledCandidate) {
    setBusy('produce:' + candidate.link)
    setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/admin/news/produce`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${getToken() ?? ''}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ candidate }),
      })
      const data = await r.json() as { ok: boolean; draft?: { title: string }; error?: string; ai_raw_preview?: string }
      if (!data.ok) {
        const preview = data.ai_raw_preview ? ' · AI raw: ' + data.ai_raw_preview.slice(0, 200) : ''
        setMsg('Produce failed: ' + (data.error ?? 'unknown') + preview)
        return
      }
      setMsg(`✓ Draft produced: "${data.draft?.title}" — check your email`)
      setCandidates((prev) => prev?.filter((c) => c.link !== candidate.link) ?? null)
      await load()
    } catch (e) {
      setMsg('Produce failed: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Row 1 — title + utility buttons */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900">📰 News pipeline</h2>
          <div className="text-xs text-slate-500 font-mono">
            Auto-drafted every 3h · {items.length} {status} articles
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={async () => {
              setBusy('backfill')
              setMsg(null)
              try {
                const r = await fetch(`${API_BASE}/admin/news/backfill-images`, {
                  method: 'POST',
                  headers: { authorization: `Bearer ${getToken() ?? ''}` },
                })
                const d = await r.json() as {
                  scanned?: number
                  patched?: number
                  details?: Array<{
                    title?: string
                    source_url?: string
                    espn_id_matched?: string | null
                    espn_api_status?: number | string
                    espn_shape?: string
                    final_image?: string | null
                  }>
                  error?: string
                }
                if (d.error) {
                  setMsg('Backfill failed: ' + d.error)
                } else {
                  const fails = (d.details ?? []).filter((x) => !x.final_image)
                  if (fails.length && d.patched === 0) {
                    const f = fails[0]
                    setMsg(
                      `✗ Backfill: scanned ${d.scanned}, patched 0. First fail — ${f.title} ` +
                      `· espn_id=${f.espn_id_matched ?? 'no-match'} ` +
                      `· api_status=${f.espn_api_status} ` +
                      `· shape=${f.espn_shape}`
                    )
                  } else {
                    setMsg(`✓ Backfill: scanned ${d.scanned}, patched ${d.patched} images`)
                  }
                }
                await load()
              } catch (e) { setMsg('Backfill error: ' + String(e)) }
              finally { setBusy(null) }
            }}
            disabled={busy === 'backfill'}
            className="px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 disabled:opacity-50"
            title="Fetch og:image for every published article whose image_url is null"
          >
            {busy === 'backfill' ? '…' : '🖼'}
          </button>
          <button
            onClick={load}
            className="px-2.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-mono"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Row 2 — status tabs + poll controls, wraps on mobile */}
      <div className="flex flex-wrap items-start gap-2">
        {/* Status tabs (+ the reels studio) */}
        <div className="flex bg-slate-100 rounded-full p-1 shrink-0">
          {(['draft', 'published', 'archived', 'reels'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                'px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest transition-colors ' +
                (status === s ? 'bg-ink-900 text-white' : 'text-slate-500')
              }
              style={status === s ? { color: '#fff' } : undefined}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Poll input + source chips — expands to fill remaining width.
            Hidden on the reels studio tab (polling is about articles). */}
        {status !== 'reels' && (
        <div className="flex-1 min-w-[240px] flex flex-col gap-1.5">
          <div className="flex items-stretch gap-0 rounded-full overflow-hidden border border-slate-200 bg-white">
            <input
              type="text"
              value={pollKeyword}
              onChange={(e) => setPollKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void poll() }}
              placeholder="optional keyword…"
              className="flex-1 min-w-0 px-3 py-1.5 text-xs font-mono focus:outline-none placeholder:text-slate-400"
              disabled={busy === 'poll'}
            />
            {pollKeyword && (
              <button
                onClick={() => setPollKeyword('')}
                disabled={busy === 'poll'}
                className="px-2 text-slate-400 hover:text-slate-700 text-xs"
                title="Clear keyword"
                type="button"
              >
                ✕
              </button>
            )}
            <button
              onClick={() => void poll()}
              disabled={busy === 'poll' || busy === 'poll-botola'}
              className="shrink-0 px-3 py-1.5 bg-accent-gold text-ink-900 text-xs font-bold hover:bg-yellow-300 disabled:opacity-50 border-l border-slate-200 whitespace-nowrap"
            >
              {busy === 'poll' ? 'Polling…' : pollKeyword ? `🎣 "${pollKeyword.slice(0,10)}${pollKeyword.length>10?'…':''}"` : '🎣 Poll 10'}
            </button>
          </div>

          {/* Second row — Botola poll + sources dropdown, compact */}
          <div className="flex items-center gap-1.5">
            {/* Dedicated Botola Pro poll: Moroccan outlets only (Le360
                Sport, Hespress, Al Mountakhab) via news search — the
                general RSS pool has zero Botola coverage. */}
            <button
              type="button"
              onClick={() => void poll('botola')}
              disabled={busy === 'poll' || busy === 'poll-botola'}
              className="px-3 py-1.5 rounded-full bg-accent-green/15 border border-accent-green/40 text-accent-green text-xs font-bold hover:bg-accent-green/25 disabled:opacity-50 whitespace-nowrap"
              title="Poll Botola Pro news — Le360 Sport · Hespress · Al Mountakhab"
            >
              {busy === 'poll-botola' ? 'Polling…' : '🇲🇦 Botola'}
            </button>

            <div className="relative" ref={srcRef}>
              <button
                type="button"
                onClick={() => setSrcOpen((v) => !v)}
                aria-expanded={srcOpen}
                className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-mono text-slate-600 hover:border-slate-400 inline-flex items-center gap-1.5"
              >
                Sources
                <span className="text-slate-400">{pollSources.size}/{ALL_POLL_SOURCES.length}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden className={'transition-transform ' + (srcOpen ? 'rotate-180' : '')}>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {srcOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-30 w-56 rounded-xl border border-slate-200 bg-white shadow-xl p-1.5">
                  {(ALL_POLL_SOURCES as readonly string[]).map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => togglePollSource(source)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs hover:bg-slate-100 text-left transition-colors"
                    >
                      <span className={pollSources.has(source) ? 'text-slate-900' : 'text-slate-400'}>
                        {source}
                      </span>
                      {pollSources.has(source) && <span className="text-accent-gold">✓</span>}
                    </button>
                  ))}
                  {pollSources.size < ALL_POLL_SOURCES.length && (
                    <>
                      <div className="my-1 border-t border-slate-200/70" />
                      <button
                        type="button"
                        onClick={() => setPollSources(new Set(ALL_POLL_SOURCES))}
                        className="w-full px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 text-left"
                      >
                        ↺ Reset all
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {msg && (
        <div className={'px-3 py-2 rounded text-xs font-mono ' + (msg.startsWith('Error') || msg.startsWith('Load') || msg.startsWith('Trigger failed') ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800')}>
          {msg}
        </div>
      )}

      {loading && <div className="text-slate-500 text-sm">Loading…</div>}

      {candidates && candidates.length > 0 && (
        <div className="rounded-xl border-2 border-accent-gold/30 bg-amber-50/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-display font-bold text-slate-900">
                🎯 Pick an article to produce
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                Top {candidates.length} from RSS + Reddit, already-processed ones excluded ·
                AI rewrite triggers when you click Produce
              </div>
            </div>
            <button
              onClick={() => setCandidates(null)}
              className="text-xs font-mono text-slate-500 hover:text-slate-900"
            >
              ✕ Clear
            </button>
          </div>
          <div className="space-y-2">
            {candidates.map((c, i) => (
              <CandidateRow
                key={c.link}
                candidate={c}
                rank={i + 1}
                busy={busy === 'produce:' + c.link}
                rejecting={busy === 'reject:' + c.link}
                anyBusy={busy?.startsWith('produce:') || busy?.startsWith('reject:') || false}
                onProduce={() => produce(c)}
                onReject={() => rejectCandidate(c)}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && items.length === 0 && !candidates && (
        <div className="text-center py-12 text-slate-500">
          <div className="text-4xl mb-2">📭</div>
          <div className="font-display font-bold">No {status} articles yet</div>
          <div className="text-xs font-mono mt-1">
            {status === 'draft' && "Click 'Poll 10 articles' to see fresh candidates from the news feeds."}
          </div>
        </div>
      )}

      {status === 'reels' ? (
        /* ── Reels studio — two reel types (Mehdi's spec) ─────────── */
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => setReel({ mode: 'matchday', article: null })}
              className="glass glass-hover rounded-2xl p-5 text-left"
            >
              <div className="text-3xl mb-2">📅</div>
              <div className="font-display font-bold text-slate-900">Reel · Matchs du jour</div>
              <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                Les affiches majeures d’aujourd’hui en diapositives (écussons,
                heure, compétition) + voix-off qui les annonce.
              </div>
            </button>
            <button
              onClick={() => setMatchStory(true)}
              className="glass glass-hover rounded-2xl p-5 text-left"
            >
              <div className="text-3xl mb-2">📸</div>
              <div className="font-display font-bold text-slate-900">Story · Matchs du jour</div>
              <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                Image(s) story sans voix : la liste des matchs du jour
                (2–3 images si la journée est chargée), QR + lien à copier.
              </div>
            </button>
            <div className="glass rounded-2xl p-5">
              <div className="text-3xl mb-2">📰</div>
              <div className="font-display font-bold text-slate-900">Reel · Article</div>
              <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                La carte de l’article animée + voix-off qui lit le titre et le
                résumé. Choisis un article publié ci-dessous.
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            {items.map((a) => (
              <button
                key={a.id}
                onClick={() => setReel({ mode: 'article', article: a })}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white hover:border-accent-gold/60 text-left transition-colors"
              >
                {a.image_url && <img src={a.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{a.title}</div>
                  <div className="text-[10px] font-mono text-slate-500">{a.source_name}{a.title_ar ? ' · عربي ✓' : ''}</div>
                </div>
                <span className="shrink-0 text-lg">🎬</span>
              </button>
            ))}
            {items.length === 0 && !loading && (
              <div className="text-xs text-slate-500 font-mono">Aucun article publié pour l’instant.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <ArticleRow
              key={a.id}
              article={a}
              expanded={expanded === a.id}
              onExpand={() => setExpanded(expanded === a.id ? null : a.id)}
              busy={busy}
              onAct={(action) => act(a.id, action)}
              onStory={() => setStoryFor(a)}
            />
          ))}
        </div>
      )}

      {storyFor && (
        <StoryComposer
          article={storyFor}
          onClose={() => setStoryFor(null)}
          onTranslate={async () => {
            // Generate the Arabic version, then refresh the modal's
            // article so the عربي toggle appears without reopening.
            await act(storyFor.id, 'translate-ar')
            const r = await fetch(`${API_BASE}/admin/news/list?status=published`, {
              headers: { authorization: `Bearer ${getToken() ?? ''}` },
            })
            const d = await r.json().catch(() => null) as { articles?: Article[] } | null
            const upd = d?.articles?.find((x) => x.id === storyFor.id)
            if (upd) setStoryFor(upd)
          }}
        />
      )}
      {matchStory && <MatchStoryComposer onClose={() => setMatchStory(false)} />}
      {reel && (
        <ReelComposer
          mode={reel.mode}
          article={reel.article}
          token={getToken() ?? ''}
          onClose={() => setReel(null)}
        />
      )}
    </div>
  )
}

interface SocialPost {
  id: string
  message: string
  link: string | null
  image_url: string | null
  status: 'draft' | 'scheduled' | 'published' | 'failed'
  scheduled_at: string | null
  published_at: string | null
  created_at: string
}

const SITE_URL = 'https://pressing90.live'

function Social() {
  const [topic, setTopic] = useState('')
  const [message, setMessage] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [link, setLink] = useState(SITE_URL)
  const [scheduledAt, setScheduledAt] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [posts, setPosts] = useState<SocialPost[]>([])

  async function api(path: string, init?: RequestInit) {
    const r = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${getToken() ?? ''}`, 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!r.ok) throw new Error(await r.text())
    return r.json()
  }

  async function loadPosts() {
    try {
      const d = await api('/admin/social/list') as { posts: SocialPost[] }
      setPosts(d.posts ?? [])
    } catch (e) { setMsg('Load failed: ' + String(e)) }
  }
  useEffect(() => { void loadPosts() }, [])

  async function generate() {
    if (!topic.trim()) return
    setBusy('generate'); setMsg(null)
    try {
      const d = await api('/admin/social/generate', { method: 'POST', body: JSON.stringify({ topic: topic.trim() }) }) as { message?: string }
      if (d.message) { setMessage(d.message); setMsg('✓ Post généré — relis, édite, puis publie ou planifie') }
    } catch (e) { setMsg('Génération échouée: ' + String(e)) }
    finally { setBusy(null) }
  }

  async function save(publishNow: boolean) {
    if (!message.trim()) { setMsg('Le message est vide'); return }
    setBusy(publishNow ? 'publish' : 'schedule'); setMsg(null)
    try {
      const created = await api('/admin/social/create', {
        method: 'POST',
        body: JSON.stringify({
          message: message.trim(),
          link: link.trim() || SITE_URL,
          image_url: imageUrl.trim() || null,
          scheduled_at: publishNow ? null : (scheduledAt ? new Date(scheduledAt).toISOString() : null),
        }),
      }) as { post?: SocialPost }
      if (publishNow && created.post?.id) {
        await api(`/admin/social/${created.post.id}/publish`, { method: 'POST' })
        setMsg('✓ Publié sur Facebook')
      } else if (scheduledAt) {
        setMsg('✓ Planifié pour ' + new Date(scheduledAt).toLocaleString())
      } else {
        setMsg('✓ Brouillon enregistré')
      }
      setMessage(''); setImageUrl(''); setScheduledAt(''); setTopic('')
      await loadPosts()
    } catch (e) { setMsg('Échec: ' + String(e)) }
    finally { setBusy(null) }
  }

  async function publishExisting(id: string) {
    setBusy('pub:' + id); setMsg(null)
    try { await api(`/admin/social/${id}/publish`, { method: 'POST' }); setMsg('✓ Publié'); await loadPosts() }
    catch (e) { setMsg('Échec: ' + String(e)) }
    finally { setBusy(null) }
  }
  async function deletePost(id: string) {
    if (!confirm('Supprimer ce post ?')) return
    setBusy('del:' + id)
    try { await api(`/admin/social/${id}/delete`, { method: 'POST' }); await loadPosts() }
    catch (e) { setMsg('Échec: ' + String(e)) }
    finally { setBusy(null) }
  }

  const badge = (s: SocialPost['status']) =>
    s === 'published' ? 'bg-emerald-100 text-emerald-700' :
    s === 'scheduled' ? 'bg-sky-100 text-sky-700' :
    s === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display font-bold text-xl sm:text-2xl text-slate-900">📣 Générateur & planning Facebook</h2>
        <div className="text-xs text-slate-500 font-mono">Génère un post promo, publie maintenant ou planifie-le sur la page Pressing 90.</div>
      </div>

      {msg && (
        <div className={'px-3 py-2 rounded text-xs font-mono ' + (msg.startsWith('Éch') || msg.startsWith('Load') || msg.includes('échou') ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800')}>{msg}</div>
      )}

      {/* Generator */}
      <div className="rounded-xl border-2 border-[#1877F2]/20 bg-[#1877F2]/5 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void generate() }}
            placeholder="Sujet du post (ex: Maroc en demi-finale, Mbappé blessé, bracket à jour…)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2]/30"
          />
          <button onClick={generate} disabled={busy === 'generate' || !topic.trim()} className="px-4 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-bold hover:bg-[#0f63d6] disabled:opacity-50 whitespace-nowrap">
            {busy === 'generate' ? 'Génération…' : '✨ Générer'}
          </button>
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Le texte du post apparaîtra ici — tu peux l'éditer librement."
          className="w-full px-3 py-2 rounded-lg border border-slate-300 font-sans text-sm h-36 focus:outline-none focus:ring-2 focus:ring-[#1877F2]/30"
        />

        <div className="grid sm:grid-cols-2 gap-2">
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="URL de l'image (optionnel)" className="px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#1877F2]/30" />
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Lien" className="px-3 py-2 rounded-lg border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[#1877F2]/30" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
          <label className="text-xs font-mono text-slate-500">Planifier&nbsp;:</label>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-xs" />
          <div className="flex gap-2 sm:ml-auto">
            <button onClick={() => save(false)} disabled={!!busy || !message.trim() || !scheduledAt} className="px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 disabled:opacity-50" title={!scheduledAt ? 'Choisis une date pour planifier' : ''}>
              {busy === 'schedule' ? '…' : '🗓 Planifier'}
            </button>
            <button onClick={() => save(true)} disabled={!!busy || !message.trim()} className="px-3 py-2 rounded-lg bg-[#1877F2] text-white text-xs font-bold hover:bg-[#0f63d6] disabled:opacity-50">
              {busy === 'publish' ? 'Publication…' : '📘 Publier maintenant'}
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-widest font-mono text-slate-500">Publications ({posts.length})</div>
        {posts.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">Aucune publication pour l'instant.</div>}
        {posts.map((p) => (
          <div key={p.id} className="border border-slate-200 rounded-xl bg-white p-3 flex items-start gap-3">
            {p.image_url && (
              // eslint-disable-next-line jsx-a11y/img-redundant-alt
              <img src={p.image_url} alt="" className="w-14 h-14 rounded-md object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={'text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-full ' + badge(p.status)}>{p.status}</span>
                {p.scheduled_at && p.status === 'scheduled' && <span className="text-[10px] text-slate-500 font-mono">🗓 {new Date(p.scheduled_at).toLocaleString()}</span>}
                {p.published_at && <span className="text-[10px] text-slate-400 font-mono">✓ {new Date(p.published_at).toLocaleString()}</span>}
              </div>
              <div className="text-xs text-slate-700 whitespace-pre-wrap line-clamp-4">{p.message}</div>
              <div className="flex gap-1.5 mt-2">
                {(p.status === 'scheduled' || p.status === 'draft' || p.status === 'failed') && (
                  <button disabled={busy === 'pub:' + p.id} onClick={() => publishExisting(p.id)} className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-[#1877F2] text-white hover:bg-[#0f63d6] disabled:opacity-50">
                    {busy === 'pub:' + p.id ? '…' : '📘 Publier'}
                  </button>
                )}
                <button disabled={busy === 'del:' + p.id} onClick={() => deletePost(p.id)} className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50">🗑</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ArticleRow({
  article,
  expanded,
  onExpand,
  busy,
  onAct,
  onStory,
}: {
  article: Article
  expanded: boolean
  onExpand: () => void
  busy: string | null
  onAct: (a: 'approve' | 'reject' | 'delete' | 'unpublish' | 'republish' | 'pin' | 'unpin' | 'share-facebook' | 'translate-ar') => void
  onStory: () => void
}) {
  const isBusy = busy?.startsWith(article.id + ':')
  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        {article.image_url && (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img src={article.image_url} alt="" className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        )}
        <div className="flex-1 min-w-0">
          {/* flex-wrap: on a 390px phone the timestamp used to push this
              row past the card edge. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
            <span className={
              'text-[9px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-full ' +
              (article.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
               article.status === 'archived' ? 'bg-slate-100 text-slate-500' :
               'bg-amber-100 text-amber-700')
            }>{article.status}</span>
            <span className="text-[10px] text-slate-400 font-mono">{article.source_name}</span>
            {article.score != null && (
              <span className="text-[10px] text-slate-400 font-mono">· score {article.score.toFixed(0)}</span>
            )}
            <span className="text-[10px] text-slate-400 font-mono ml-auto">
              {new Date(article.created_at).toLocaleString()}
            </span>
          </div>
          <button onClick={onExpand} className="text-left w-full">
            <div className="font-display font-bold text-slate-900 leading-tight">{article.title}</div>
            {article.excerpt && (
              <div className="text-xs text-slate-600 mt-1 line-clamp-2">{article.excerpt}</div>
            )}
          </button>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {article.status === 'draft' && (
              <>
                <button disabled={isBusy} onClick={() => onAct('approve')} className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
                  ✓ Approve
                </button>
                <button disabled={isBusy} onClick={() => onAct('reject')} className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-50">
                  ✗ Reject
                </button>
              </>
            )}
            {article.status === 'published' && (
              <>
                {/* Pin toggle — controls whether the home-page NewsTicker
                    carousel shows this article in its first 2 pages.
                    Unpinning drops it from home but leaves the article
                    fully readable at /news/<slug>. Default for new
                    publishes is pinned=true. */}
                <button
                  disabled={isBusy}
                  onClick={() => onAct(article.pinned_to_home ? 'unpin' : 'pin')}
                  className={
                    'px-2.5 py-1 text-[11px] font-bold rounded-full disabled:opacity-50 ' +
                    (article.pinned_to_home
                      ? 'bg-accent-gold text-ink-900 hover:bg-yellow-300'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }
                  title={article.pinned_to_home ? 'Pinned to home — click to unpin' : 'Not on home — click to pin'}
                >
                  {article.pinned_to_home ? '📌 Pinned' : '📌 Pin to home'}
                </button>
                <button disabled={isBusy} onClick={() => onAct('unpublish')} className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50">
                  Unpublish
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => onAct('share-facebook')}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-[#1877F2] text-white hover:bg-[#0f63d6] disabled:opacity-50"
                  title="Publier cet article sur la page Facebook Pressing 90"
                >
                  {busy === article.id + ':share-facebook' ? '…' : '📘 Publier sur FB'}
                </button>
                {/* Arabic translation — generates/regenerates title_ar,
                    excerpt_ar, body_ar via gpt-oss-120b. Badge shows
                    whether this article already carries Arabic. */}
                <button
                  disabled={isBusy}
                  onClick={() => onAct('translate-ar')}
                  className={
                    'px-2.5 py-1 text-[11px] font-bold rounded-full disabled:opacity-50 ' +
                    (article.title_ar
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                  }
                  title={article.title_ar ? 'Arabic version exists — click to regenerate' : 'Generate the Arabic version of this article'}
                >
                  {busy === article.id + ':translate-ar' ? '…' : article.title_ar ? 'عربي ✓' : 'Translate → AR'}
                </button>
                {/* Story generator — 1080×1920 card with QR, downloaded
                    then posted manually from the Meta Business app
                    (music + link sticker aren't available via API). */}
                <button
                  onClick={onStory}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-fuchsia-100 text-fuchsia-800 hover:bg-fuchsia-200"
                  title="Générer l'image story (QR + visite notre profil)"
                >
                  📱 Story
                </button>
              </>
            )}
            {article.status === 'archived' && (
              <button disabled={isBusy} onClick={() => onAct('republish')} className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50">
                Republish
              </button>
            )}
            <button disabled={isBusy} onClick={() => onAct('delete')} className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50">
              🗑 Delete
            </button>
            <a href={article.source_url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 text-[11px] font-mono rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100">
              ↗ Source
            </a>
            <button onClick={onExpand} className="px-2.5 py-1 text-[11px] font-mono rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100 ml-auto">
              {expanded ? 'Collapse' : 'Preview'}
            </button>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-slate-100 bg-slate-50">
          <div className="text-[10px] uppercase tracking-widest font-mono text-slate-500 mb-2">Rewritten body</div>
          <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">{article.body}</pre>
        </div>
      )}
    </div>
  )
}

function formatAge(pubDate: number): string {
  const totalMin = Math.round((Date.now() - pubDate) / 60_000)
  if (totalMin < 60) return `${totalMin}m ago`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h < 24) return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h ago`
}

function CandidateRow({
  candidate,
  rank,
  busy,
  anyBusy,
  rejecting,
  onProduce,
  onReject,
}: {
  candidate: PolledCandidate
  rank: number
  busy: boolean
  anyBusy: boolean
  rejecting: boolean
  onProduce: () => void
  onReject: () => void
}) {
  return (
    <div className="bg-white rounded-lg p-3 border border-amber-200/60 flex items-start gap-3">
      <div className="flex flex-col items-center flex-shrink-0 w-10">
        <div className="text-lg font-bold text-accent-gold font-mono">#{rank}</div>
        <div className="text-[9px] text-slate-400 font-mono">{candidate.score.toFixed(0)}</div>
      </div>
      {candidate.imageUrl && (
        // eslint-disable-next-line jsx-a11y/img-redundant-alt
        <img
          src={candidate.imageUrl}
          alt=""
          className="w-14 h-14 rounded-md object-cover flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
          <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500">
            {candidate.source}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">· {formatAge(candidate.pubDate)}</span>
          {candidate.redditScore != null && candidate.redditScore > 0 && (
            <span className="text-[10px] text-orange-600 font-mono">
              · 🔥 {candidate.redditScore} on Reddit
            </span>
          )}
        </div>
        <div className="font-display font-bold text-slate-900 text-sm leading-tight mb-1">
          {candidate.title}
        </div>
        <div className="text-xs text-slate-600 line-clamp-2 mb-2">
          {candidate.description}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onProduce}
            disabled={anyBusy}
            className="px-3 py-1.5 text-[11px] font-bold rounded-full bg-accent-gold text-ink-900 hover:bg-yellow-300 disabled:opacity-40"
          >
            {busy ? '✍️ Rewriting…' : '✍️ Produce this'}
          </button>
          <a
            href={candidate.link}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-[11px] font-mono rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100"
          >
            ↗ Read source
          </a>
          {/* Reject persists a 'never show this again' marker — the
              source_url is stored as an archived row so the dedup pass
              filters it out of every future poll. */}
          <button
            onClick={onReject}
            disabled={anyBusy}
            className="px-3 py-1.5 text-[11px] font-mono rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40"
            title="Hide this article forever — won't show up in future polls"
          >
            {rejecting ? 'Rejecting…' : '✕ Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Auto-push settings + diagnostic ───────────────────────────────
//
// Operator-facing controls for the worker's scheduled() push pipeline.
// State is persisted in the worker's KV (key 'push:settings') and read
// at the top of every 5-min cron tick. The diagnostic below shows what
// the LAST tick saw — useful when 'pushes aren't arriving' is reported.

interface PushSettingsShape {
  enabled: boolean
  kickoff: { enabled: boolean; leadMinutes: number[] }
  goal: { enabled: boolean }
  fullTime: { enabled: boolean }
  redCard: { enabled: boolean }
  yellowCard: { enabled: boolean }
  penalty: { enabled: boolean }
  halfTime: { enabled: boolean }
  articlePublished: { enabled: boolean }
  facebookAutoPost: { enabled: boolean }
}

interface PushDiagShape {
  lastCronAt: string
  lastCronEventsCount: number
  lastKickoffScheduledIds: string[]
  lastGoalAlertIds: string[]
  lastFtAlertIds: string[]
  lastCardAlertIds: string[]
  lastPenaltyAlertIds: string[]
  lastHalfTimeAlertIds: string[]
  lastSubsCount: number
  settings: PushSettingsShape
}

function AutoPushSettingsSection() {
  const [settings, setSettings] = useState<PushSettingsShape | null>(null)
  const [diag, setDiag] = useState<PushDiagShape | null | 'loading'>('loading')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void adminGet('/admin/push/settings').then((d) => {
      // Defensive merge: stale KV payloads can ship without newly-added
      // fields. Filling them in here means React never reads `.enabled`
      // off undefined and crashes the whole tab.
      const raw = (d as { settings: Partial<PushSettingsShape> }).settings ?? {}
      const safe: PushSettingsShape = {
        enabled: raw.enabled ?? true,
        kickoff: {
          enabled: raw.kickoff?.enabled ?? true,
          leadMinutes: Array.isArray(raw.kickoff?.leadMinutes)
            ? (raw.kickoff!.leadMinutes as number[])
            : typeof raw.kickoff?.leadMinutes === 'number'
              ? [raw.kickoff!.leadMinutes as unknown as number]
              : [60, 15],
        },
        goal: { enabled: raw.goal?.enabled ?? true },
        fullTime: { enabled: raw.fullTime?.enabled ?? true },
        redCard: { enabled: raw.redCard?.enabled ?? true },
        yellowCard: { enabled: raw.yellowCard?.enabled ?? false },
        penalty: { enabled: raw.penalty?.enabled ?? true },
        halfTime: { enabled: raw.halfTime?.enabled ?? true },
        articlePublished: { enabled: raw.articlePublished?.enabled ?? true },
        facebookAutoPost: { enabled: raw.facebookAutoPost?.enabled ?? true },
      }
      setSettings(safe)
    })
    void adminGet('/admin/push/diag').then((d) => setDiag((d as { diag: PushDiagShape | null }).diag))
  }, [])

  async function save() {
    if (!settings) return
    setSaving(true)
    setMsg(null)
    try {
      const r = await adminPost('/admin/push/settings', { settings })
      const data = r as { settings: PushSettingsShape }
      setSettings(data.settings)
      setMsg('✓ Settings saved — applied on next cron tick (within 5 min)')
    } catch (e) {
      setMsg('Save failed: ' + String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return <Section title="Auto alerts" eyebrow="Push"><Loading /></Section>

  return (
    <Section title="Auto alerts" eyebrow="Push · cron-driven">
      <div className="text-xs font-mono text-slate-500 mb-4 leading-relaxed">
        The worker polls ESPN every 5 minutes and broadcasts push notifications for the events you enable below.
        Manual broadcasts (Compose section) are NOT affected by these toggles — they always fire.
      </div>

      {/* Master toggle */}
      <ToggleRow
        label="Master switch"
        sub="If off, no automatic push is fired regardless of the toggles below."
        accent="red"
        checked={settings.enabled}
        onChange={(v) => setSettings({ ...settings, enabled: v })}
      />

      <div className="border-t border-slate-200 my-4" />

      {/* Kickoff */}
      <ToggleRow
        label="⚽ Kickoff alerts"
        sub="Fired before each match starts. Uses a Durable Object alarm so the delivery is precise to the second."
        checked={settings.kickoff.enabled}
        onChange={(v) => setSettings({ ...settings, kickoff: { ...settings.kickoff, enabled: v } })}
        disabled={!settings.enabled}
      />
      <div className="mt-3 pl-1">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">
          Lead times before kickoff
        </label>
        <KickoffLeadEditor
          values={settings.kickoff.leadMinutes}
          disabled={!settings.enabled || !settings.kickoff.enabled}
          onChange={(arr) => setSettings({ ...settings, kickoff: { ...settings.kickoff, leadMinutes: arr } })}
        />
        <div className="text-[10px] font-mono text-slate-400 mt-1">
          Each value fires a separate push (e.g. 60 + 15 = a heads-up an hour before kickoff and a final reminder 15 min before). Cron schedules every upcoming match the moment ESPN exposes it, so no fixture is missed even after a worker outage.
        </div>
      </div>

      <div className="border-t border-slate-200 my-4" />

      {/* Goal */}
      <ToggleRow
        label="🥅 Goal alerts"
        sub="Fired whenever the score increments on a live match. Latency bound: cron interval (≤5 min)."
        checked={settings.goal.enabled}
        onChange={(v) => setSettings({ ...settings, goal: { enabled: v } })}
        disabled={!settings.enabled}
      />

      <div className="border-t border-slate-200 my-4" />

      {/* FT */}
      <ToggleRow
        label="🏁 Full-time alerts"
        sub="Fired when a match transitions to 'post' (final whistle). One per match."
        checked={settings.fullTime.enabled}
        onChange={(v) => setSettings({ ...settings, fullTime: { enabled: v } })}
        disabled={!settings.enabled}
      />

      <div className="border-t border-slate-200 my-4" />

      <ToggleRow
        label="🟥 Red card alerts"
        sub="Fired when ESPN reports type id 93 in the match details. Player name + minute included."
        checked={settings.redCard.enabled}
        onChange={(v) => setSettings({ ...settings, redCard: { enabled: v } })}
        disabled={!settings.enabled}
      />

      <div className="border-t border-slate-200 my-4" />

      <ToggleRow
        label="🟨 Yellow card alerts"
        sub="High-volume — typical match has 4-8 bookings. Off by default; enable for full FootMercato-style coverage."
        checked={settings.yellowCard.enabled}
        onChange={(v) => setSettings({ ...settings, yellowCard: { enabled: v } })}
        disabled={!settings.enabled}
      />

      <div className="border-t border-slate-200 my-4" />

      <ToggleRow
        label="🎯 Penalty alerts"
        sub="Fires when a penalty is awarded (ESPN type id 95 or text 'penalty'). VAR overturns + offside/disallowed are skipped."
        checked={settings.penalty.enabled}
        onChange={(v) => setSettings({ ...settings, penalty: { enabled: v } })}
        disabled={!settings.enabled}
      />

      <div className="border-t border-slate-200 my-4" />

      <ToggleRow
        label="⏱ Half-time alerts"
        sub="Fired when a match transitions to second-half (period 2). One per match with current score."
        checked={settings.halfTime.enabled}
        onChange={(v) => setSettings({ ...settings, halfTime: { enabled: v } })}
        disabled={!settings.enabled}
      />

      <div className="border-t border-slate-200 my-4" />

      <ToggleRow
        label="📰 Article published alerts"
        sub="Fires once when you Approve a draft in the News tab — tap-to-read deep-links straight to /news/<slug>. Skip this if a briefing is too low-signal to interrupt subscribers."
        checked={settings.articlePublished.enabled}
        onChange={(v) => setSettings({ ...settings, articlePublished: { enabled: v } })}
        disabled={!settings.enabled}
      />

      <ToggleRow
        label="📘 Auto-post articles to Facebook"
        sub="When ON, approving a draft also publishes it to the Pressing 90 Facebook page (image + link). Independent of the push master switch — turn this off to publish silently without posting to Facebook. The manual “📘 Publier sur FB” button stays available either way."
        checked={settings.facebookAutoPost.enabled}
        onChange={(v) => setSettings({ ...settings, facebookAutoPost: { enabled: v } })}
      />

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {msg && (
          <div className={'text-xs font-mono ' + (msg.startsWith('✓') ? 'text-emerald-700' : 'text-rose-700')}>
            {msg}
          </div>
        )}
      </div>

      {/* Diagnostic — last cron tick. Shows why pushes aren't arriving:
          0 subs, 0 events, kickoff outside lookahead, settings disabled. */}
      <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4">
        <div className="font-display font-bold text-sm text-slate-900 mb-2">Last cron tick · diagnostic</div>
        {diag === 'loading' && <Loading />}
        {diag === null && (
          <div className="text-xs font-mono text-slate-500">
            No tick yet. The diagnostic is written by the worker on every */5 run. If this stays empty after 5+ minutes, the cron may not be running.
          </div>
        )}
        {diag && diag !== 'loading' && (
          <div className="text-xs font-mono text-slate-700 space-y-1 leading-relaxed">
            <div>· Last run: <span className="text-slate-900">{new Date(diag.lastCronAt).toLocaleString()}</span> ({Math.round((Date.now() - new Date(diag.lastCronAt).getTime()) / 60_000)} min ago)</div>
            <div>· ESPN events seen: <span className="text-slate-900">{diag.lastCronEventsCount}</span></div>
            <div>· Subscribers: <span className="text-slate-900">{diag.lastSubsCount}</span> {diag.lastSubsCount === 0 && <span className="text-rose-600">← no one to push to</span>}</div>
            <div>· Kickoffs scheduled this tick: <span className="text-slate-900">{diag.lastKickoffScheduledIds.length}</span> {diag.lastKickoffScheduledIds.length > 0 ? '(' + diag.lastKickoffScheduledIds.slice(0, 3).join(', ') + (diag.lastKickoffScheduledIds.length > 3 ? '…' : '') + ')' : ''}</div>
            <div>· Goal alerts fired: <span className="text-slate-900">{diag.lastGoalAlertIds.length}</span></div>
            <div>· FT alerts fired: <span className="text-slate-900">{diag.lastFtAlertIds.length}</span></div>
            <div>· Card alerts fired: <span className="text-slate-900">{diag.lastCardAlertIds.length}</span> · Penalty: <span className="text-slate-900">{diag.lastPenaltyAlertIds.length}</span> · HT: <span className="text-slate-900">{diag.lastHalfTimeAlertIds.length}</span></div>
            <div>· Settings: enabled={String(diag.settings.enabled)}, ko={String(diag.settings.kickoff.enabled)}@{(Array.isArray(diag.settings.kickoff.leadMinutes) ? diag.settings.kickoff.leadMinutes : [diag.settings.kickoff.leadMinutes as unknown as number]).map((m) => 'T-' + m).join('/')}, goal={String(diag.settings.goal.enabled)}, ft={String(diag.settings.fullTime.enabled)}, rc={String(diag.settings.redCard.enabled)}, yc={String(diag.settings.yellowCard.enabled)}, pen={String(diag.settings.penalty.enabled)}, ht={String(diag.settings.halfTime.enabled)}</div>
          </div>
        )}
      </div>
    </Section>
  )
}

function ToggleRow({
  label, sub, checked, onChange, accent, disabled,
}: {
  label: string
  sub?: string
  checked: boolean
  onChange: (v: boolean) => void
  accent?: 'red' | 'gold'
  disabled?: boolean
}) {
  return (
    <div className={'flex items-start gap-3 ' + (disabled ? 'opacity-50' : '')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={
          'flex-shrink-0 mt-0.5 inline-flex w-11 h-6 rounded-full border transition-colors items-center px-0.5 ' +
          (checked
            ? (accent === 'red' ? 'bg-rose-500 border-rose-600' : 'bg-accent-gold border-yellow-500')
            : 'bg-slate-200 border-slate-300')
        }
      >
        <span
          className={
            'inline-block w-5 h-5 bg-white rounded-full shadow transition-transform ' +
            (checked ? 'translate-x-5' : 'translate-x-0')
          }
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm text-slate-900">{label}</div>
        {sub && <div className="text-[11px] font-mono text-slate-500 mt-0.5 leading-relaxed">{sub}</div>}
      </div>
    </div>
  )
}

/**
 * Multi-lead-time editor — chips with a remove (×) per existing value
 * + numeric input + 'Add' button. Built so the worker can fire 1-N
 * kickoff push notifications per match.
 *
 * Caps at 4 chips, values clamped 1–240 min on save. Suggested presets
 * ([60, 30, 15, 5]) are surfaced as quick-add buttons for the common
 * cases — heads-up an hour out, 30 min for warm-up, 15 min final
 * reminder, 5 min last-call.
 */
function KickoffLeadEditor({
  values,
  disabled,
  onChange,
}: {
  values: number[]
  disabled: boolean
  onChange: (next: number[]) => void
}) {
  const [draft, setDraft] = useState<string>('')

  function add(n: number) {
    if (!Number.isFinite(n) || n < 1 || n > 240) return
    if (values.length >= 4) return
    if (values.includes(n)) return
    const next = [...values, n].sort((a, b) => b - a)
    onChange(next)
  }

  function remove(n: number) {
    const next = values.filter((v) => v !== n)
    onChange(next)
  }

  function commit() {
    const n = Math.round(Number(draft))
    if (Number.isFinite(n)) add(n)
    setDraft('')
  }

  const presets = [120, 60, 30, 15, 5].filter((p) => !values.includes(p))

  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {values.length === 0 && (
          <div className="text-xs font-mono text-slate-400">
            No reminders set — at least one is needed for kickoff alerts to fire.
          </div>
        )}
        {values.map((v) => (
          <span
            key={v}
            className={
              'inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full text-xs font-mono tabular-nums ' +
              (disabled ? 'bg-slate-100 text-slate-400' : 'bg-accent-gold/15 text-ink-900 border border-accent-gold/40')
            }
          >
            T-{v} min
            <button
              type="button"
              onClick={() => !disabled && remove(v)}
              disabled={disabled}
              aria-label={`Remove T-${v}`}
              className={
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] transition-colors ' +
                (disabled ? 'opacity-40' : 'hover:bg-slate-900/10')
              }
            >
              ✕
            </button>
          </span>
        ))}
        <input
          type="number"
          min={1}
          max={240}
          step={1}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
          disabled={disabled || values.length >= 4}
          placeholder="min"
          className="w-20 px-2 py-1 rounded-full border border-slate-300 text-xs font-mono text-center focus:outline-none focus:ring-2 focus:ring-accent-gold/40 disabled:opacity-40"
        />
        <button
          type="button"
          onClick={commit}
          disabled={disabled || !draft || values.length >= 4}
          className="px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-mono disabled:opacity-40"
        >
          + Add
        </button>
      </div>
      {presets.length > 0 && !disabled && values.length < 4 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] uppercase tracking-widest font-mono text-slate-400">Presets:</span>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => add(p)}
              className="px-2 py-0.5 rounded-full bg-slate-50 hover:bg-slate-100 text-[10px] font-mono text-slate-600 border border-slate-200"
            >
              + T-{p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
