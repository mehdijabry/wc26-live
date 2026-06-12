import { useEffect, useState } from 'react'
import { API_BASE } from '../../lib/api'

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
  | 'overview' | 'analytics' | 'push' | 'email' | 'database' | 'health' | 'actions' | 'news'

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
  useEffect(() => {
    document.title = 'Admin · Pressing 90'
    setMeta('robots', 'noindex,nofollow,noarchive')
    const tok = getToken()
    if (!tok) { setAuthed(false); return }
    void fetch(`${API_BASE}/admin/auth/session`, {
      headers: { authorization: `Bearer ${tok}` },
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setAuthed(true)
        else { setToken(null); setAuthed(false) }
      })
      .catch(() => setAuthed(false))
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <form onSubmit={onLogin} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-3">
            Pressing 90 · admin
          </div>
          <h1 className="font-display font-bold text-2xl text-ink-900 mb-6">
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
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Pressing 90 · admin
            </div>
            <div className="font-display font-bold text-ink-900">Operator console</div>
          </div>
          <button onClick={onLogout} className="text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-accent-red">
            Sign out
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-5 pb-2 flex gap-1 overflow-x-auto">
          {(['overview', 'analytics', 'news', 'push', 'email', 'database', 'health', 'actions'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-mono uppercase tracking-widest transition-colors ' +
                (tab === t
                  ? 'bg-ink-900 text-white font-semibold'
                  : 'text-slate-500 hover:bg-slate-100')
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

      <main className="max-w-6xl mx-auto px-5 py-8">
        {tab === 'overview' && <Overview />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'push' && <Push />}
        {tab === 'email' && <EmailPanel />}
        {tab === 'database' && <Database />}
        {tab === 'health' && <SiteHealth />}
        {tab === 'actions' && <QuickActions />}
        {tab === 'news' && <News />}
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
  const gscData = gsc as { configured?: boolean; message?: string; mock?: GscMock } | null

  // The worker now flattens both 'configured' AND 'mock' paths into
  // the same shape, so we just read .mock either way and the UI
  // renders identically. The bandeau only appears when configured=false.
  const cfShow = cfData?.mock
  const gscShow = gscData?.mock

  return (
    <>
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
        ) : (
          <div className="text-sm text-slate-600">No data yet — GSC needs a few days to index your site.</div>
        )}
      </Section>
    </>
  )
}

// ─── Section: Push ─────────────────────────────────────────────────

function Push() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/today')
  const [tag, setTag] = useState('')
  const [subs, setSubs] = useState<Array<{ provider: string; tail: string; fullEndpoint: string; ua?: string | null; lang?: string | null; created_at?: string | null }>>([])
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void adminGet('/admin/subscriptions').then((d) => setSubs((d as { rows: typeof subs }).rows ?? []))
  }, [])

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

  return (
    <>
      <AutoPushSettingsSection />
      <Section title="Compose notification" eyebrow="Push">
        <div className="grid sm:grid-cols-2 gap-3">
          <InputField label="Title" value={title} onChange={setTitle} placeholder="🇲🇦 Maroc 1-0 vs Brésil" />
          <InputField label="URL (relative)" value={url} onChange={setUrl} placeholder="/today" />
        </div>
        <div className="mt-3">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-mono">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Coup d'envoi dans 15 min — sam. 13 juin, 18:00"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm h-20"
          />
        </div>
        <InputField label="Tag (optional, groups notifications)" value={tag} onChange={setTag} placeholder="kickoff" />
        <div className="mt-4 flex gap-3 flex-wrap">
          <button onClick={broadcast} disabled={busy} className="px-5 py-2 rounded-full bg-accent-red text-white font-semibold text-sm hover:bg-red-600 disabled:opacity-40">
            Broadcast to everyone
          </button>
          <button
            onClick={sendSingle}
            disabled={busy || !selectedEndpoint}
            className="px-5 py-2 rounded-full bg-ink-900 font-semibold text-sm hover:bg-ink-800 disabled:opacity-40"
            // Inline color fallback — same Safari + backdrop-filter issue
            // that bit the active tab pill and the range selector.
            // text-cream / text-white classes don't always inherit when an
            // ancestor applies blur, so we set the color explicitly.
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
                  <div className="text-sm font-semibold">{s.provider} · <span className="font-mono text-slate-500">…{s.tail}</span></div>
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
  const [data, setData] = useState<{ espnOk?: boolean; espnMs?: number; kvOk?: boolean; serverTime?: string } | null>(null)
  useEffect(() => { void adminGet("/admin/site-health").then((d) => setData(d as any)) }, [])
  if (!data) return <Loading />
  return (
    <Section title="Site health" eyebrow="Live probes">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="ESPN API" value={data.espnOk ? `OK · ${data.espnMs}ms` : 'DOWN'} accent={data.espnOk ? 'green' : 'red'} />
        <KpiCard label="Cloudflare KV" value={data.kvOk ? 'OK' : 'DOWN'} accent={data.kvOk ? 'green' : 'red'} />
        <KpiCard label="Server time UTC" value={data.serverTime?.slice(0, 19).replace('T', ' ') ?? '—'} mono />
        <KpiCard label="Worker" value="wc26-api" mono />
      </div>
    </Section>
  )
}

// ─── Section: Quick actions ─────────────────────────────────────────

function QuickActions() {
  const [status, setStatus] = useState<string | null>(null)
  async function clearCache(prefix: string) {
    setStatus(`Clearing cache prefix '${prefix}'…`)
    const r = await adminPost('/admin/cache/clear', { prefix })
    setStatus(`Cleared ${(r as { deleted: number }).deleted} keys.`)
  }
  return (
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
  )
}

// ─── Reusable bits ─────────────────────────────────────────────────

function Section({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      {eyebrow && <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 font-mono mb-1">{eyebrow}</div>}
      <h2 className="font-display font-bold text-xl text-ink-900 mb-4">{title}</h2>
      {children}
    </section>
  )
}

function KpiCard({ label, value, accent, mono }: { label: string; value: number | string; accent?: 'gold' | 'green' | 'red'; mono?: boolean }) {
  const accentClass =
    accent === 'gold' ? 'text-accent-gold'
    : accent === 'green' ? 'text-emerald-600'
    : accent === 'red' ? 'text-accent-red'
    : 'text-ink-900'
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

function ActionButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl border border-slate-200 bg-slate-50/60 p-4 hover:bg-slate-100 transition-colors">
      <div className="font-display font-semibold text-ink-900">{title}</div>
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

function News() {
  const [status, setStatus] = useState<'draft' | 'published' | 'archived'>('draft')
  const [items, setItems] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // 6 candidate articles returned by /poll. The operator picks one
  // and we call /produce to AI-rewrite + save as draft.
  const [candidates, setCandidates] = useState<PolledCandidate[] | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`${API_BASE}/admin/news/list?status=${status}`, {
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!r.ok) throw new Error(String(r.status))
      const data = await r.json() as { articles: Article[] }
      setItems(data.articles ?? [])
    } catch (e) {
      setMsg('Load failed: ' + String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [status])

  async function act(id: string, action: 'approve' | 'reject' | 'delete' | 'unpublish' | 'republish' | 'pin' | 'unpin') {
    if (action === 'delete' && !confirm('Delete this article permanently?')) return
    setBusy(id + ':' + action)
    setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/admin/news/${id}/${action}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!r.ok) throw new Error(await r.text())
      setMsg(`✓ ${action}`)
      await load()
    } catch (e) {
      setMsg('Error: ' + String(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Poll = ask the worker for the top 6 candidates (filtered by dedup
   * against everything already in DB). Replaces the previous instant
   * 'trigger' flow with an explicit pick step.
   */
  async function poll() {
    setBusy('poll')
    setMsg(null)
    try {
      const r = await fetch(`${API_BASE}/admin/news/poll`, {
        method: 'POST',
        headers: { authorization: `Bearer ${getToken() ?? ''}` },
      })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json() as { candidates: PolledCandidate[]; diagnostics: Record<string, unknown> }
      setCandidates(data.candidates)
      if (data.candidates.length === 0) {
        setMsg('No fresh candidates — RSS feeds may be slow or all top items are already in DB. Try again later.')
      } else {
        setMsg(`✓ ${data.candidates.length} candidates ready — pick one to produce`)
      }
    } catch (e) {
      setMsg('Poll failed: ' + String(e))
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-2xl text-slate-900">📰 News pipeline</h2>
          <div className="text-xs text-slate-500 font-mono">
            Auto-drafted every 3 hours from RSS + Reddit · {items.length} {status} articles
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-full p-1">
            {(['draft', 'published', 'archived'] as const).map((s) => (
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
          <button
            onClick={poll}
            disabled={busy === 'poll'}
            className="px-3 py-1.5 rounded-full bg-accent-gold text-ink-900 text-xs font-bold hover:bg-yellow-300 disabled:opacity-50"
          >
            {busy === 'poll' ? 'Polling…' : '🎣 Poll 6 articles'}
          </button>
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
            className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 disabled:opacity-50"
            title="Fetch og:image for every published article whose image_url is null"
          >
            {busy === 'backfill' ? 'Backfilling…' : '🖼 Backfill images'}
          </button>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-mono"
          >
            ↻
          </button>
        </div>
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
                anyBusy={busy?.startsWith('produce:') ?? false}
                onProduce={() => produce(c)}
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
            {status === 'draft' && "Click 'Poll 6 articles' to see fresh candidates from the news feeds."}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((a) => (
          <ArticleRow
            key={a.id}
            article={a}
            expanded={expanded === a.id}
            onExpand={() => setExpanded(expanded === a.id ? null : a.id)}
            busy={busy}
            onAct={(action) => act(a.id, action)}
          />
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
}: {
  article: Article
  expanded: boolean
  onExpand: () => void
  busy: string | null
  onAct: (a: 'approve' | 'reject' | 'delete' | 'unpublish' | 'republish' | 'pin' | 'unpin') => void
}) {
  const isBusy = busy?.startsWith(article.id + ':')
  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        {article.image_url && (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img src={article.image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
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

function CandidateRow({
  candidate,
  rank,
  busy,
  anyBusy,
  onProduce,
}: {
  candidate: PolledCandidate
  rank: number
  busy: boolean
  anyBusy: boolean
  onProduce: () => void
}) {
  const ageH = Math.round((Date.now() - candidate.pubDate) / 3600_000 * 10) / 10
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
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500">
            {candidate.source}
          </span>
          <span className="text-[10px] text-slate-400 font-mono">· {ageH}h ago</span>
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
