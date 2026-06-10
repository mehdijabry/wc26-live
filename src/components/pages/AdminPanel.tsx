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
  | 'overview' | 'analytics' | 'push' | 'email' | 'database' | 'health' | 'actions'

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
          {(['overview', 'analytics', 'push', 'email', 'database', 'health', 'actions'] as Tab[]).map((t) => (
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

  type CfMock = { requests: number; pageViews: number; uniques: number; bandwidth: string; topCountries: Array<{ code: string; name: string; requests: number }> }
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
            {cfShow.topCountries.length > 0 && (
              <div className="mt-5">
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
          <button onClick={sendSingle} disabled={busy || !selectedEndpoint} className="px-5 py-2 rounded-full bg-ink-900 text-cream font-semibold text-sm hover:bg-ink-800 disabled:opacity-40">
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
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    if (!to || !subject || !text) { setStatus('to + subject + body required'); return }
    setBusy(true)
    setStatus(null)
    try {
      const r = await adminPost('/admin/email/send', { to, subject, text })
      setStatus('Sent. Response: ' + JSON.stringify(r))
    } catch (e) {
      setStatus(String(e))
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
      {status && <div className="mt-3 text-sm font-mono text-slate-600 whitespace-pre-wrap break-all">{status}</div>}
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
